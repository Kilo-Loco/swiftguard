import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { parseSwift } from "@/lib/parser";
import { allRules } from "@/lib/rules/index";
import { runRules } from "@/lib/rules/engine";
import type { Issue } from "@/types/api";

// --- Types ---

interface PRTestEntry {
  name: string;
  repo: string;
  repoUrl: string;
  prNumber: number;
  baseSha: string;
  files: string[];
  expectedCatches: string[];
}

interface LocatedIssue extends Issue {
  file: string;
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
  expectedCatches: string[];
  caughtExpected: string[];
}

interface RuleSummary {
  total: number;
  byRepo: Record<string, number>;
}

interface BaselineData {
  timestamp: string;
  rules: Record<string, { totalIssues: number; byRepo: Record<string, number> }>;
  prs: Record<string, { beforeCount: number; afterCount: number; resolvedCount: number }>;
}

interface PipelineReport {
  unitTests: { passed: number; total: number; success: boolean } | null;
  repoScan: { filesScanned: number; issuesByRule: Record<string, RuleSummary> } | null;
  prRegression: { prsRun: number; results: PRResult[] } | null;
  baseline: { comparison: BaselineComparison | null; saved: boolean };
}

interface BaselineComparison {
  newCatches: number;
  regressions: number;
  falsePositives: number;
  details: string[];
}

// --- Config ---

const ROOT_DIR = path.resolve(__dirname, "..");
const REPOS_DIR = path.resolve(ROOT_DIR, "validation/repos");
const BASELINE_PATH = path.resolve(ROOT_DIR, "validation/baseline.json");
const PR_TESTS_PATH = path.resolve(ROOT_DIR, "validation/pr-tests.json");
const RESULTS_PATH = path.resolve(ROOT_DIR, "validation/results.json");
const PR_RESULTS_PATH = path.resolve(ROOT_DIR, "validation/pr-results.json");
const TEST_DIR_PATTERNS = ["/Tests/", "/Test/", "/Specs/", "/__tests__/"];
const FILE_TIMEOUT_MS = 5000;

// --- CLI args ---

const args = process.argv.slice(2);
const mode = {
  unit: args.includes("--unit") || args.includes("--full"),
  repos: args.includes("--repos") || args.includes("--full"),
  prs: args.includes("--prs") || args.includes("--full"),
  baseline: args.includes("--baseline"),
  compare: args.includes("--compare") || args.includes("--full"),
};

// Default: if no flags, run --full
if (!args.length) {
  mode.unit = true;
  mode.repos = true;
  mode.prs = true;
  mode.compare = true;
}

// --- Helpers ---

function isTestPath(filePath: string): boolean {
  return TEST_DIR_PATTERNS.some((p) => filePath.includes(p));
}

function findSwiftFiles(dir: string): string[] {
  const results: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".swift")) {
        results.push(full);
      }
    }
  }
  return results;
}

function getRepoName(filePath: string): string {
  const rel = path.relative(REPOS_DIR, filePath);
  return rel.split(path.sep)[0];
}

function runWithTimeout<T>(fn: () => T, timeoutMs: number): T | null {
  const start = Date.now();
  try {
    const result = fn();
    if (Date.now() - start > timeoutMs) return null;
    return result;
  } catch {
    return null;
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
  return runWithTimeout(() => {
    const tree = parseSwift(source);
    return runRules(allRules, tree, source);
  }, FILE_TIMEOUT_MS);
}

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

function issueKey(file: string, issue: Issue): string {
  return `${file}:${issue.rule}:${issue.line}:${issue.message}`;
}

// --- Pipeline Steps ---

function runUnitTests(): { passed: number; total: number; success: boolean } {
  console.log("\n>>> Running Unit Tests...\n");
  try {
    const output = execSync("npx vitest run --reporter=json 2>/dev/null", {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      timeout: 120000,
    });

    const json = JSON.parse(output);
    const passed = json.numPassedTests ?? 0;
    const total = json.numTotalTests ?? 0;
    const success = json.success ?? false;
    return { passed, total, success };
  } catch (e: unknown) {
    // vitest exits non-zero on failure but still produces output
    const err = e as { stdout?: string };
    try {
      const json = JSON.parse(err.stdout || "{}");
      return {
        passed: json.numPassedTests ?? 0,
        total: json.numTotalTests ?? 0,
        success: json.success ?? false,
      };
    } catch {
      // Fallback: try running without JSON reporter
      try {
        execSync("npx vitest run", {
          cwd: ROOT_DIR,
          encoding: "utf-8",
          timeout: 120000,
          stdio: "inherit",
        });
        return { passed: -1, total: -1, success: true };
      } catch {
        return { passed: 0, total: 0, success: false };
      }
    }
  }
}

function runRepoScan(): { filesScanned: number; issuesByRule: Record<string, RuleSummary> } {
  console.log("\n>>> Running Repo Validation...\n");

  if (!fs.existsSync(REPOS_DIR)) {
    console.error("  Repos directory not found. Run 'npm run validate:clone' first.");
    return { filesScanned: 0, issuesByRule: {} };
  }

  const allSwiftFiles = findSwiftFiles(REPOS_DIR);
  const nonTestFiles = allSwiftFiles.filter((f) => !isTestPath(f));
  console.log(`  Found ${nonTestFiles.length} non-test Swift files`);

  const issuesByRule: Record<string, RuleSummary> = {};
  let skipped = 0;

  for (let i = 0; i < nonTestFiles.length; i++) {
    if ((i + 1) % 500 === 0) {
      console.log(`  Processing ${i + 1}/${nonTestFiles.length}...`);
    }

    const filePath = nonTestFiles[i];
    const result = scanFile(filePath);
    if (result === null) {
      skipped++;
      continue;
    }

    const repo = getRepoName(filePath);
    for (const issue of result) {
      if (!issuesByRule[issue.rule]) {
        issuesByRule[issue.rule] = { total: 0, byRepo: {} };
      }
      issuesByRule[issue.rule].total++;
      issuesByRule[issue.rule].byRepo[repo] =
        (issuesByRule[issue.rule].byRepo[repo] || 0) + 1;
    }
  }

  console.log(`  Scanned: ${nonTestFiles.length - skipped}, Skipped: ${skipped}`);
  return { filesScanned: nonTestFiles.length - skipped, issuesByRule };
}

function runPRRegression(): { prsRun: number; results: PRResult[] } {
  console.log("\n>>> Running PR Regression Tests...\n");

  if (!fs.existsSync(PR_TESTS_PATH)) {
    console.error("  PR test registry not found at", PR_TESTS_PATH);
    return { prsRun: 0, results: [] };
  }

  const prTests: PRTestEntry[] = JSON.parse(fs.readFileSync(PR_TESTS_PATH, "utf-8"));
  const results: PRResult[] = [];

  for (const pr of prTests) {
    const repoDir = path.join(REPOS_DIR, pr.repo);
    if (!fs.existsSync(repoDir)) {
      console.log(`  Skipping ${pr.name}: repo not cloned`);
      continue;
    }

    console.log(`  --- ${pr.name} ---`);

    const originalRef = git(repoDir, "rev-parse HEAD");

    // Ensure base SHA is available
    const hasBase = git(repoDir, `cat-file -t ${pr.baseSha}`);
    if (hasBase !== "commit") {
      console.log(`  Fetching base SHA ${pr.baseSha.slice(0, 8)}...`);
      git(repoDir, `fetch origin ${pr.baseSha}`);
    }

    // BEFORE: checkout base
    git(repoDir, `checkout ${pr.baseSha} --quiet`);

    const beforeIssues: LocatedIssue[] = [];
    let filesTested = 0;

    for (const file of pr.files) {
      const issues = scanFile(path.join(repoDir, file));
      if (issues === null) continue;
      filesTested++;
      for (const issue of issues) {
        beforeIssues.push({ ...issue, file });
      }
    }

    // AFTER: checkout original HEAD
    git(repoDir, `checkout ${originalRef} --quiet`);

    const afterIssues: LocatedIssue[] = [];
    for (const file of pr.files) {
      const issues = scanFile(path.join(repoDir, file));
      if (issues === null) continue;
      for (const issue of issues) {
        afterIssues.push({ ...issue, file });
      }
    }

    // Compute delta
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
      if (!afterKeys.has(key)) resolved.push(issue);
    }

    const introduced: LocatedIssue[] = [];
    const beforeKeySet = new Set(beforeKeys.keys());
    for (const issue of afterIssues) {
      if (!beforeKeySet.has(issueKey(issue.file, issue))) {
        introduced.push(issue);
      }
    }

    // Check which expected rules were caught
    const caughtRules = new Set(resolved.map((i) => i.rule));
    const caughtExpected = pr.expectedCatches.filter((r) => caughtRules.has(r));

    console.log(`    Before: ${beforeIssues.length}, After: ${afterIssues.length}, Resolved: ${resolved.length}`);
    console.log(`    Expected catches: [${pr.expectedCatches.join(", ")}]`);
    console.log(`    Caught: [${caughtExpected.join(", ")}]`);

    results.push({
      name: pr.name,
      repo: pr.repo,
      prNumber: pr.prNumber,
      filesTested,
      before: { total: beforeIssues.length, issues: beforeIssues },
      after: { total: afterIssues.length, issues: afterIssues },
      resolved,
      introduced,
      expectedCatches: pr.expectedCatches,
      caughtExpected,
    });

    // Restore repo
    const defaultBranch = git(repoDir, "symbolic-ref refs/remotes/origin/HEAD")
      .replace("refs/remotes/origin/", "");
    if (defaultBranch) {
      git(repoDir, `checkout ${defaultBranch} --quiet`);
    } else {
      git(repoDir, `checkout ${originalRef} --quiet`);
    }
  }

  return { prsRun: results.length, results };
}

function saveBaseline(repoScan: PipelineReport["repoScan"], prRegression: PipelineReport["prRegression"]): void {
  const baseline: BaselineData = {
    timestamp: new Date().toISOString(),
    rules: {},
    prs: {},
  };

  if (repoScan) {
    for (const [ruleId, summary] of Object.entries(repoScan.issuesByRule)) {
      baseline.rules[ruleId] = {
        totalIssues: summary.total,
        byRepo: summary.byRepo,
      };
    }
  }

  if (prRegression) {
    for (const pr of prRegression.results) {
      baseline.prs[pr.name] = {
        beforeCount: pr.before.total,
        afterCount: pr.after.total,
        resolvedCount: pr.resolved.length,
      };
    }
  }

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`\n  Baseline saved to ${BASELINE_PATH}`);
}

function compareBaseline(
  repoScan: PipelineReport["repoScan"],
  prRegression: PipelineReport["prRegression"]
): BaselineComparison | null {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.log("  No baseline found. Run with --baseline first.");
    return null;
  }

  const baseline: BaselineData = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
  const details: string[] = [];
  let newCatches = 0;
  let regressions = 0;
  let falsePositives = 0;

  if (repoScan) {
    for (const [ruleId, summary] of Object.entries(repoScan.issuesByRule)) {
      const prev = baseline.rules[ruleId]?.totalIssues ?? 0;
      const curr = summary.total;
      const diff = curr - prev;

      if (diff > 0) {
        // More issues found — could be new catches or false positives
        // If rule is new (not in baseline), count as new catches
        if (prev === 0) {
          newCatches += curr;
          details.push(`  +${curr} new catches from ${ruleId} (new rule)`);
        } else {
          falsePositives += diff;
          details.push(`  +${diff} additional issues from ${ruleId} (possible false positives)`);
        }
      } else if (diff < 0) {
        regressions += Math.abs(diff);
        details.push(`  ${diff} fewer issues from ${ruleId} (regression?)`);
      }
    }

    // Check for rules in baseline that no longer produce results
    for (const ruleId of Object.keys(baseline.rules)) {
      if (!repoScan.issuesByRule[ruleId]) {
        regressions += baseline.rules[ruleId].totalIssues;
        details.push(`  ${ruleId} no longer produces any issues (regression)`);
      }
    }
  }

  if (prRegression) {
    for (const pr of prRegression.results) {
      const prev = baseline.prs[pr.name];
      if (!prev) {
        details.push(`  New PR test: ${pr.name} (${pr.resolved.length} resolved)`);
        continue;
      }
      const resolvedDiff = pr.resolved.length - prev.resolvedCount;
      if (resolvedDiff > 0) {
        newCatches += resolvedDiff;
        details.push(`  +${resolvedDiff} more catches in ${pr.name}`);
      } else if (resolvedDiff < 0) {
        regressions += Math.abs(resolvedDiff);
        details.push(`  ${resolvedDiff} fewer catches in ${pr.name} (regression)`);
      }
    }
  }

  return { newCatches, regressions, falsePositives, details };
}

// --- Report ---

function printReport(report: PipelineReport): void {
  const unitStatus = report.unitTests
    ? report.unitTests.success
      ? `${report.unitTests.passed}/${report.unitTests.total} PASSED ✅`
      : `${report.unitTests.passed}/${report.unitTests.total} FAILED ❌`
    : "SKIPPED";

  const repoStatus = report.repoScan
    ? `${report.repoScan.filesScanned.toLocaleString()} files`
    : "SKIPPED";

  const prStatus = report.prRegression
    ? `${report.prRegression.prsRun}/${report.prRegression.prsRun} PRs tested`
    : "SKIPPED";

  const comparison = report.baseline.comparison;

  console.log("\n");
  console.log("╔══════════════════════════════════════╗");
  console.log("║     SwiftGuard Test Pipeline          ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║ Unit Tests:     ${unitStatus.padEnd(20)}║`);
  console.log(`║ Repo Scan:      ${repoStatus.padEnd(20)}║`);
  console.log(`║ PR Regression:  ${prStatus.padEnd(20)}║`);

  if (comparison) {
    console.log("╠══════════════════════════════════════╣");
    console.log("║ Baseline Comparison:                 ║");
    console.log(`║   New catches:     +${String(comparison.newCatches).padEnd(3)} ✅             ║`);
    console.log(`║   Regressions:      ${String(comparison.regressions).padEnd(3)} ${comparison.regressions === 0 ? "✅" : "❌"}             ║`);
    console.log(`║   False positives:  ${String(comparison.falsePositives).padEnd(3)} ${comparison.falsePositives === 0 ? "✅" : "⚠️"}             ║`);
  }

  console.log("╚══════════════════════════════════════╝");

  // Detailed rule breakdown
  if (report.repoScan) {
    console.log("\n--- Rule Breakdown ---");
    const sorted = Object.entries(report.repoScan.issuesByRule).sort(
      (a, b) => b[1].total - a[1].total
    );
    for (const [ruleId, summary] of sorted) {
      const repoList = Object.entries(summary.byRepo)
        .sort((a, b) => b[1] - a[1])
        .map(([repo, count]) => `${repo}(${count})`)
        .join(", ");
      console.log(`  ${ruleId}: ${summary.total} issues — ${repoList}`);
    }
  }

  // PR detail
  if (report.prRegression) {
    console.log("\n--- PR Regression Detail ---");
    for (const pr of report.prRegression.results) {
      const status = pr.caughtExpected.length > 0 ? "✅" : "⚠️";
      console.log(`  ${status} ${pr.name}`);
      console.log(`    Before: ${pr.before.total} → After: ${pr.after.total} (Resolved: ${pr.resolved.length})`);
      if (pr.resolved.length > 0) {
        console.log(`    Resolved rules: ${[...new Set(pr.resolved.map((i) => i.rule))].join(", ")}`);
      }
    }

    // Catch rate
    const totalResolved = report.prRegression.results.reduce((s, r) => s + r.resolved.length, 0);
    const totalBefore = report.prRegression.results.reduce((s, r) => s + r.before.total, 0);
    const catchRate = totalBefore > 0 ? ((totalResolved / totalBefore) * 100).toFixed(0) : "0";
    console.log(`\n  Overall PR catch rate: ${catchRate}% (${totalResolved}/${totalBefore})`);
  }

  // Baseline comparison details
  if (comparison && comparison.details.length > 0) {
    console.log("\n--- Baseline Comparison Details ---");
    for (const detail of comparison.details) {
      console.log(detail);
    }
  }
}

// --- Main ---

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     SwiftGuard Test Pipeline          ║");
  console.log("║     Starting...                       ║");
  console.log("╚══════════════════════════════════════╝");

  const report: PipelineReport = {
    unitTests: null,
    repoScan: null,
    prRegression: null,
    baseline: { comparison: null, saved: false },
  };

  // Step 1: Unit tests
  if (mode.unit) {
    report.unitTests = runUnitTests();
  }

  // Step 2: Repo validation
  if (mode.repos) {
    report.repoScan = runRepoScan();
  }

  // Step 3: PR regression
  if (mode.prs) {
    report.prRegression = runPRRegression();
  }

  // Step 4: Baseline
  if (mode.baseline) {
    saveBaseline(report.repoScan, report.prRegression);
    report.baseline.saved = true;
  }

  // Step 5: Compare
  if (mode.compare) {
    report.baseline.comparison = compareBaseline(report.repoScan, report.prRegression);
  }

  // Print report
  printReport(report);

  // Write results
  const resultsDir = path.resolve(ROOT_DIR, "validation");
  fs.writeFileSync(
    path.join(resultsDir, "pipeline-results.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        unitTests: report.unitTests,
        repoScan: report.repoScan
          ? { filesScanned: report.repoScan.filesScanned, issuesByRule: report.repoScan.issuesByRule }
          : null,
        prRegression: report.prRegression
          ? {
              prsRun: report.prRegression.prsRun,
              results: report.prRegression.results.map((r) => ({
                name: r.name,
                repo: r.repo,
                prNumber: r.prNumber,
                filesTested: r.filesTested,
                beforeCount: r.before.total,
                afterCount: r.after.total,
                resolvedCount: r.resolved.length,
                introducedCount: r.introduced.length,
                expectedCatches: r.expectedCatches,
                caughtExpected: r.caughtExpected,
              })),
            }
          : null,
        baselineComparison: report.baseline.comparison,
      },
      null,
      2
    )
  );

  // Exit with error if unit tests failed
  if (report.unitTests && !report.unitTests.success) {
    process.exit(1);
  }
}

main();
