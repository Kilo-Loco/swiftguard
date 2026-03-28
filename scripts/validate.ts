import * as fs from "fs";
import * as path from "path";
import { parseSwift } from "@/lib/parser";
import { allRules } from "@/lib/rules/index";
import { runRules } from "@/lib/rules/engine";
import type { Issue } from "@/types/api";

// --- Types ---

interface FileResult {
  file: string;
  issues: Issue[];
}

interface RuleSummary {
  total: number;
  byRepo: Record<string, number>;
}

interface RepoSummary {
  total: number;
  byRule: Record<string, number>;
}

interface Report {
  timestamp: string;
  repos: number;
  filesScanned: number;
  results: FileResult[];
  summary: {
    byRule: Record<string, RuleSummary>;
    byRepo: Record<string, RepoSummary>;
  };
}

// --- Config ---

const TEST_DIR_PATTERNS = ["/Tests/", "/Test/", "/Specs/", "/__tests__/"];
const FILE_TIMEOUT_MS = 5000;
const REPOS_DIR = path.resolve(__dirname, "../validation/repos");
const RESULTS_PATH = path.resolve(__dirname, "../validation/results.json");

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

// --- Main ---

function main() {
  if (!fs.existsSync(REPOS_DIR)) {
    console.error(`Repos directory not found: ${REPOS_DIR}`);
    console.error("Run 'npm run validate:clone' first.");
    process.exit(1);
  }

  const repoDirs = fs
    .readdirSync(REPOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log(`Found ${repoDirs.length} repos`);

  const allSwiftFiles = findSwiftFiles(REPOS_DIR);
  const nonTestFiles = allSwiftFiles.filter((f) => !isTestPath(f));

  console.log(
    `Found ${allSwiftFiles.length} .swift files (${nonTestFiles.length} non-test)`
  );

  const startTime = Date.now();
  const results: FileResult[] = [];
  let filesWithIssues = 0;
  let skippedFiles = 0;

  for (let i = 0; i < nonTestFiles.length; i++) {
    const filePath = nonTestFiles[i];
    const relPath = path.relative(REPOS_DIR, filePath);

    if ((i + 1) % 200 === 0 || i === 0) {
      console.log(
        `  Processing ${i + 1}/${nonTestFiles.length}: ${relPath.slice(0, 60)}`
      );
    }

    let source: string;
    try {
      source = fs.readFileSync(filePath, "utf-8");
    } catch {
      skippedFiles++;
      continue;
    }

    // Skip very large files (> 500KB)
    if (source.length > 500_000) {
      skippedFiles++;
      continue;
    }

    const result = runWithTimeout(() => {
      const tree = parseSwift(source);
      return runRules(allRules, tree, source);
    }, FILE_TIMEOUT_MS);

    if (result === null) {
      skippedFiles++;
      continue;
    }

    if (result.length > 0) {
      filesWithIssues++;
      results.push({
        file: path.relative(path.resolve(REPOS_DIR, ".."), filePath),
        issues: result,
      });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // --- Build summary ---

  const byRule: Record<string, RuleSummary> = {};
  const byRepo: Record<string, RepoSummary> = {};

  for (const r of results) {
    const repo = getRepoName(
      path.resolve(REPOS_DIR, "..", r.file)
    );

    if (!byRepo[repo]) byRepo[repo] = { total: 0, byRule: {} };

    for (const issue of r.issues) {
      // byRule
      if (!byRule[issue.rule]) byRule[issue.rule] = { total: 0, byRepo: {} };
      byRule[issue.rule].total++;
      byRule[issue.rule].byRepo[repo] =
        (byRule[issue.rule].byRepo[repo] || 0) + 1;

      // byRepo
      byRepo[repo].total++;
      byRepo[repo].byRule[issue.rule] =
        (byRepo[repo].byRule[issue.rule] || 0) + 1;
    }
  }

  // --- Write JSON report ---

  const report: Report = {
    timestamp: new Date().toISOString(),
    repos: repoDirs.length,
    filesScanned: nonTestFiles.length,
    results,
    summary: { byRule, byRepo },
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2));

  // --- Print text report ---

  console.log("\n=== SwiftGuard Validation Report ===");
  console.log(`Repos scanned: ${repoDirs.length}`);
  console.log(`Files scanned: ${nonTestFiles.length}`);
  console.log(`Files skipped: ${skippedFiles}`);
  console.log(`Files with issues: ${filesWithIssues}`);
  console.log(`Time: ${elapsed}s`);

  console.log("\n--- Per-Rule Summary ---");
  for (const [ruleId, summary] of Object.entries(byRule).sort(
    (a, b) => b[1].total - a[1].total
  )) {
    console.log(`\n${ruleId}:`);
    console.log(`  Total issues: ${summary.total}`);

    const repoEntries = Object.entries(summary.byRepo)
      .sort((a, b) => b[1] - a[1])
      .map(([repo, count]) => `${repo}(${count})`)
      .join(", ");
    console.log(`  By repo: ${repoEntries}`);

    // Sample issues (first 5)
    const sampleIssues = results
      .flatMap((r) =>
        r.issues
          .filter((i) => i.rule === ruleId)
          .map((i) => ({ file: r.file, ...i }))
      )
      .slice(0, 5);

    if (sampleIssues.length > 0) {
      console.log("  Sample issues:");
      for (const s of sampleIssues) {
        console.log(`    - ${s.file}:${s.line} - ${s.message}`);
      }
    }
  }

  console.log("\n--- Top 10 Flagged Files ---");
  const topFiles = results
    .map((r) => ({ file: r.file, count: r.issues.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  topFiles.forEach((f, i) => {
    console.log(`${i + 1}. ${f.file} - ${f.count} issues`);
  });

  console.log(`\nFull results written to: ${RESULTS_PATH}`);
}

main();
