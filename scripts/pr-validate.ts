import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parseSwift } from "@/lib/parser";
import { allRules } from "@/lib/rules/index";
import { runRules } from "@/lib/rules/engine";
import type { Issue } from "@/types/api";

// --- Types ---

interface PRTest {
  name: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  files: string[];
}

interface PRResult {
  name: string;
  repo: string;
  prNumber: number;
  filesTested: number;
  before: { total: number; issues: LocatedIssue[] };
  after: { total: number; issues: LocatedIssue[] };
  resolved: LocatedIssue[];
  introduced: LocatedIssue[];
}

interface LocatedIssue extends Issue {
  file: string;
}

// --- PR Definitions ---

const prs: PRTest[] = [
  {
    name: "Alamofire #3880: Swift 6 Native Builds",
    repo: "Alamofire",
    prNumber: 3880,
    baseSha: "57162788f5dc388b5c3692611bcfa179ee8c2067",
    files: [
      "Source/Core/Protected.swift",
      "Source/Core/Request.swift",
      "Source/Core/SessionDelegate.swift",
      "Source/Core/DataRequest.swift",
      "Source/Core/DownloadRequest.swift",
      "Source/Core/DataStreamRequest.swift",
      "Source/Core/Session.swift",
    ],
  },
  {
    name: "Vapor #3054: Add Sendable Conformances",
    repo: "vapor",
    prNumber: 3054,
    baseSha: "fe973db5f48f7bb2bcf394b5932afa9884b6e589",
    files: [
      "Sources/Vapor/Application.swift",
      "Sources/Vapor/Authentication/AuthenticationCache.swift",
      "Sources/Vapor/Authentication/BasicAuthorization.swift",
      "Sources/Vapor/Authentication/RedirectMiddleware.swift",
      "Sources/Vapor/Cache/Application+Cache.swift",
      "Sources/Vapor/Cache/CacheExpirationTime.swift",
      "Sources/Vapor/Cache/MemoryCache.swift",
      "Sources/Vapor/Client/Application+Clients.swift",
      "Sources/Vapor/Client/Client.swift",
      "Sources/Vapor/Client/ClientRequest.swift",
      "Sources/Vapor/Client/ClientResponse.swift",
      "Sources/Vapor/Commands/ServeCommand.swift",
      "Sources/Vapor/Concurrency/AsyncBasicResponder.swift",
      "Sources/Vapor/Authentication/BearerAuthorization.swift",
      "Sources/Development/routes.swift",
    ],
  },
  {
    name: "Kingfisher #2488: Avoid non-Sendable RetryDecision capture",
    repo: "Kingfisher",
    prNumber: 2488,
    baseSha: "86eec3252deb8eea41e0585dc4970984379b22f8",
    files: ["Sources/Networking/ImagePrefetcher.swift"],
  },
];

// --- Config ---

const REPOS_DIR = path.resolve(__dirname, "../validation/repos");
const RESULTS_PATH = path.resolve(__dirname, "../validation/pr-results.json");
const FILE_TIMEOUT_MS = 5000;

// --- Helpers ---

function git(repoDir: string, cmd: string): string {
  try {
    return execSync(`git ${cmd}`, {
      cwd: repoDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string };
    console.error(`  git ${cmd} failed: ${err.stderr || e}`);
    return "";
  }
}

function scanFile(filePath: string): Issue[] | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  if (source.length > 500_000) return null;

  const start = Date.now();
  try {
    const tree = parseSwift(source);
    const issues = runRules(allRules, tree, source);
    if (Date.now() - start > FILE_TIMEOUT_MS) return null;
    return issues;
  } catch {
    return null;
  }
}

function issueKey(file: string, issue: Issue): string {
  return `${file}:${issue.rule}:${issue.line}:${issue.message}`;
}

// --- Main ---

function main() {
  if (!fs.existsSync(REPOS_DIR)) {
    console.error(`Repos directory not found: ${REPOS_DIR}`);
    console.error("Run 'npm run validate:clone' first.");
    process.exit(1);
  }

  console.log("=== SwiftGuard PR Before/After Validation ===\n");

  const results: PRResult[] = [];

  for (const pr of prs) {
    const repoDir = path.join(REPOS_DIR, pr.repo);
    if (!fs.existsSync(repoDir)) {
      console.log(`Skipping ${pr.name}: repo not cloned at ${repoDir}`);
      continue;
    }

    console.log(`--- ${pr.name} ---`);

    // Save current branch/ref to restore later
    const originalRef = git(repoDir, "rev-parse HEAD");

    // Ensure base SHA is available (fetch if needed)
    const hasBase = git(repoDir, `cat-file -t ${pr.baseSha}`);
    if (hasBase !== "commit") {
      console.log(`  Fetching base SHA ${pr.baseSha.slice(0, 8)}...`);
      git(repoDir, `fetch origin ${pr.baseSha}`);
    }

    // --- BEFORE: checkout base commit ---
    console.log(`  Checking out BEFORE state (${pr.baseSha.slice(0, 8)})...`);
    git(repoDir, `checkout ${pr.baseSha} --quiet`);

    const beforeIssues: LocatedIssue[] = [];
    let filesTested = 0;

    for (const file of pr.files) {
      const fullPath = path.join(repoDir, file);
      const issues = scanFile(fullPath);
      if (issues === null) continue;
      filesTested++;
      for (const issue of issues) {
        beforeIssues.push({ ...issue, file });
      }
    }

    console.log(`  BEFORE: ${beforeIssues.length} issues in ${filesTested} files`);

    // --- AFTER: checkout latest (original HEAD) ---
    console.log(`  Checking out AFTER state (HEAD)...`);
    git(repoDir, `checkout ${originalRef} --quiet`);

    const afterIssues: LocatedIssue[] = [];
    let afterFilesTested = 0;

    for (const file of pr.files) {
      const fullPath = path.join(repoDir, file);
      const issues = scanFile(fullPath);
      if (issues === null) continue;
      afterFilesTested++;
      for (const issue of issues) {
        afterIssues.push({ ...issue, file });
      }
    }

    console.log(`  AFTER:  ${afterIssues.length} issues in ${afterFilesTested} files`);

    // --- Compute delta ---
    // "Resolved" = issues present BEFORE but not AFTER (by rule+file, fuzzy match)
    const beforeKeys = new Map<string, LocatedIssue>();
    for (const issue of beforeIssues) {
      beforeKeys.set(issueKey(issue.file, issue), issue);
    }
    const afterKeys = new Set<string>();
    for (const issue of afterIssues) {
      afterKeys.add(issueKey(issue.file, issue));
    }

    const resolved: LocatedIssue[] = [];
    for (const [key, issue] of beforeKeys) {
      if (!afterKeys.has(key)) {
        resolved.push(issue);
      }
    }

    const introduced: LocatedIssue[] = [];
    const beforeKeySet = new Set(beforeKeys.keys());
    for (const issue of afterIssues) {
      if (!beforeKeySet.has(issueKey(issue.file, issue))) {
        introduced.push(issue);
      }
    }

    console.log(`  RESOLVED by PR: ${resolved.length} issues ✅`);
    if (introduced.length > 0) {
      console.log(`  INTRODUCED by PR: ${introduced.length} issues`);
    }
    console.log();

    results.push({
      name: pr.name,
      repo: pr.repo,
      prNumber: pr.prNumber,
      filesTested,
      before: { total: beforeIssues.length, issues: beforeIssues },
      after: { total: afterIssues.length, issues: afterIssues },
      resolved,
      introduced,
    });

    // Restore repo to default branch
    const defaultBranch = git(repoDir, "symbolic-ref refs/remotes/origin/HEAD")
      .replace("refs/remotes/origin/", "");
    if (defaultBranch) {
      git(repoDir, `checkout ${defaultBranch} --quiet`);
    } else {
      git(repoDir, `checkout ${originalRef} --quiet`);
    }
  }

  // --- Print final report ---

  console.log("=== PR Validation Report ===\n");

  let totalResolved = 0;
  let totalBefore = 0;

  for (const r of results) {
    console.log(`--- ${r.name} ---`);
    console.log(`Files tested: ${r.filesTested}`);
    console.log(`BEFORE (base commit): ${r.before.total} issues found`);

    for (const issue of r.before.issues) {
      const tag = r.resolved.some(
        (res) => issueKey(res.file, res) === issueKey(issue.file, issue)
      )
        ? " ← RESOLVED"
        : "";
      console.log(
        `  ${issue.rule}: ${issue.file}:${issue.line} — ${issue.message}${tag}`
      );
    }

    console.log(`AFTER (current): ${r.after.total} issues found`);
    for (const issue of r.after.issues) {
      console.log(
        `  ${issue.rule}: ${issue.file}:${issue.line} — ${issue.message}`
      );
    }

    console.log(`DELTA: ${r.resolved.length} issues RESOLVED by PR ✅`);
    if (r.introduced.length > 0) {
      console.log(`NEW: ${r.introduced.length} issues introduced by PR`);
    }
    console.log(
      `WOULD HAVE CAUGHT: ${r.resolved.length}/${r.before.total} issues that the PR addressed`
    );
    console.log();

    totalResolved += r.resolved.length;
    totalBefore += r.before.total;
  }

  console.log("=== Summary ===");
  console.log(`PRs tested: ${results.length}`);
  console.log(`Total issues found BEFORE: ${totalBefore}`);
  console.log(`Total issues RESOLVED by PRs: ${totalResolved}`);
  console.log(
    `Overall catch rate: ${totalBefore > 0 ? ((totalResolved / totalBefore) * 100).toFixed(0) : 0}%`
  );

  // --- Write JSON ---

  const jsonReport = {
    timestamp: new Date().toISOString(),
    prsValidated: results.length,
    totalBeforeIssues: totalBefore,
    totalResolvedByPRs: totalResolved,
    results: results.map((r) => ({
      name: r.name,
      repo: r.repo,
      prNumber: r.prNumber,
      filesTested: r.filesTested,
      beforeCount: r.before.total,
      afterCount: r.after.total,
      resolvedCount: r.resolved.length,
      introducedCount: r.introduced.length,
      before: r.before.issues.map((i) => ({
        rule: i.rule,
        file: i.file,
        line: i.line,
        message: i.message,
        severity: i.severity,
        confidence: i.confidence,
      })),
      after: r.after.issues.map((i) => ({
        rule: i.rule,
        file: i.file,
        line: i.line,
        message: i.message,
        severity: i.severity,
        confidence: i.confidence,
      })),
      resolved: r.resolved.map((i) => ({
        rule: i.rule,
        file: i.file,
        line: i.line,
        message: i.message,
        severity: i.severity,
        confidence: i.confidence,
      })),
    })),
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(jsonReport, null, 2));
  console.log(`\nResults written to: ${RESULTS_PATH}`);
}

main();
