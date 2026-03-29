import { NextRequest, NextResponse } from "next/server";
import { parseSwift } from "@/lib/parser";
import { runRules } from "@/lib/rules/engine";
import { allRules } from "@/lib/rules/index";
import { buildTypeRegistry } from "@/lib/type-registry";
import type { Issue } from "@/types/api";

const SKIP_PATTERNS = [
  "Tests/",
  "Test/",
  "Specs/",
  "__tests__/",
  "Fixtures/",
  "Mock/",
  "Pods/",
  ".build/",
  "DerivedData/",
];

const MAX_SWIFT_FILES = 500;
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const BATCH_SIZE = 12;
const SCAN_TIMEOUT_MS = 30_000;

interface RepoScanRequest {
  repoUrl: string;
  branch?: string;
}

interface CodeSnippetLine {
  num: number;
  text: string;
  highlighted?: boolean;
}

interface CodeSnippet {
  startLine: number;
  lines: CodeSnippetLine[];
}

interface ScanIssue extends Issue {
  file: string;
  codeSnippet?: CodeSnippet;
}

function extractSnippet(source: string, line: number, before = 3, after = 2): CodeSnippet {
  const lines = source.split("\n");
  const start = Math.max(0, line - 1 - before);
  const end = Math.min(lines.length, line - 1 + after + 1);
  return {
    startLine: start + 1,
    lines: lines.slice(start, end).map((text, i) => ({
      num: start + 1 + i,
      text,
      highlighted: start + 1 + i === line,
    })),
  };
}

interface FileIssueGroup {
  file: string;
  issues: number;
  details: ScanIssue[];
}

interface ScanResponse {
  repo: string;
  branch: string;
  filesScanned: number;
  filesWithIssues: number;
  scanTimeMs: number;
  summary: {
    total: number;
    byRule: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  topFiles: FileIssueGroup[];
  issues: ScanIssue[];
}

function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\/+$/, "");

  // Try: https://github.com/owner/repo or github.com/owner/repo
  const urlMatch = cleaned.match(
    /(?:https?:\/\/)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  }

  // Try: owner/repo
  const shortMatch = cleaned.match(
    /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/
  );
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2].replace(/\.git$/, "") };
  }

  return null;
}

function shouldSkipPath(path: string): boolean {
  // Normalize: check both the raw path and with a leading "/" so patterns
  // match at the start of the path (GitHub tree API omits leading slash)
  const normalized = "/" + path;
  return SKIP_PATTERNS.some(
    (pattern) => normalized.includes("/" + pattern)
  );
}

async function fetchWithTimeout(
  url: string,
  signal: AbortSignal,
  headers?: Record<string, string>
): Promise<Response> {
  return fetch(url, { signal, headers });
}

export async function POST(request: NextRequest) {
  let body: RepoScanRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.repoUrl || typeof body.repoUrl !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'repoUrl' field" },
      { status: 400 }
    );
  }

  const parsed = parseRepoUrl(body.repoUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Invalid repo URL. Use formats like: https://github.com/owner/repo, github.com/owner/repo, or owner/repo",
      },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;
  const branch = body.branch || "HEAD";
  const startTime = performance.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    // Step 1: Fetch file tree via GitHub API
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SwiftGuard-Scanner",
    };
    if (process.env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Resolve default branch if needed
    let treeBranch = branch;
    if (treeBranch === "HEAD") {
      const repoRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}`,
        controller.signal,
        ghHeaders
      );
      if (repoRes.status === 404) {
        return NextResponse.json(
          { error: "Repository not found. Make sure it's a public GitHub repo." },
          { status: 404 }
        );
      }
      if (repoRes.status === 403) {
        return NextResponse.json(
          { error: "GitHub API rate limit exceeded. Try again later or set a GITHUB_TOKEN." },
          { status: 429 }
        );
      }
      if (!repoRes.ok) {
        return NextResponse.json(
          { error: `GitHub API error: ${repoRes.status}` },
          { status: 502 }
        );
      }
      const repoData = await repoRes.json();
      treeBranch = repoData.default_branch;
    }

    const treeRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeBranch}?recursive=1`,
      controller.signal,
      ghHeaders
    );

    if (treeRes.status === 404) {
      return NextResponse.json(
        { error: `Branch '${treeBranch}' not found in ${owner}/${repo}.` },
        { status: 404 }
      );
    }
    if (treeRes.status === 403) {
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }
    if (!treeRes.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${treeRes.status}` },
        { status: 502 }
      );
    }

    const treeData = await treeRes.json();
    if (treeData.truncated) {
      // Tree is too large, but we'll work with what we have
    }

    // Step 2: Filter Swift files
    const allFiles: { path: string; size: number }[] = (treeData.tree || [])
      .filter(
        (entry: { type: string; path: string; size?: number }) =>
          entry.type === "blob" &&
          entry.path.endsWith(".swift") &&
          !shouldSkipPath(entry.path) &&
          (entry.size === undefined || entry.size <= MAX_FILE_SIZE)
      )
      .map((entry: { path: string; size?: number }) => ({
        path: entry.path,
        size: entry.size || 0,
      }));

    if (allFiles.length === 0) {
      return NextResponse.json({
        repo: `${owner}/${repo}`,
        branch: treeBranch,
        filesScanned: 0,
        filesWithIssues: 0,
        scanTimeMs: Math.round(performance.now() - startTime),
        summary: { total: 0, byRule: {}, bySeverity: {} },
        topFiles: [],
        issues: [],
      });
    }

    if (allFiles.length > MAX_SWIFT_FILES) {
      return NextResponse.json(
        {
          error: `Repository has ${allFiles.length} Swift files (max ${MAX_SWIFT_FILES}). Use the API directly for large repos.`,
        },
        { status: 400 }
      );
    }

    // Step 3: Fetch file contents in batches
    const fetchedFiles: { path: string; content: string }[] = [];

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) break;

      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${treeBranch}/${file.path}`;
          const res = await fetchWithTimeout(rawUrl, controller.signal);
          if (!res.ok) return null;

          const content = await res.text();
          if (content.length > MAX_FILE_SIZE) return null;

          return { path: file.path, content };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          fetchedFiles.push(result.value);
        }
      }
    }

    // Pass 1: Build type registry from all fetched files
    const typeRegistry = buildTypeRegistry(
      fetchedFiles.map((f) => ({ path: f.path, source: f.content }))
    );

    // Pass 2: Run rules with cross-file type context
    const allIssues: ScanIssue[] = [];
    let filesScanned = 0;

    for (const file of fetchedFiles) {
      const tree = parseSwift(file.content);
      const issues = runRules(allRules, tree, file.content, typeRegistry);
      filesScanned++;

      for (const issue of issues) {
        allIssues.push({
          ...issue,
          file: file.path,
          codeSnippet: extractSnippet(file.content, issue.line),
        });
      }
    }

    // Step 4: Build report
    const byRule: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const fileIssueMap = new Map<string, ScanIssue[]>();

    for (const issue of allIssues) {
      byRule[issue.rule] = (byRule[issue.rule] || 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;

      if (!fileIssueMap.has(issue.file)) {
        fileIssueMap.set(issue.file, []);
      }
      fileIssueMap.get(issue.file)!.push(issue);
    }

    const topFiles: FileIssueGroup[] = Array.from(fileIssueMap.entries())
      .map(([file, issues]) => ({ file, issues: issues.length, details: issues }))
      .sort((a, b) => b.issues - a.issues)
      .slice(0, 10);

    const response: ScanResponse = {
      repo: `${owner}/${repo}`,
      branch: treeBranch,
      filesScanned,
      filesWithIssues: fileIssueMap.size,
      scanTimeMs: Math.round(performance.now() - startTime),
      summary: {
        total: allIssues.length,
        byRule,
        bySeverity,
      },
      topFiles,
      issues: allIssues,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Scan timed out. The repository may be too large." },
        { status: 408 }
      );
    }
    return NextResponse.json(
      { error: "Internal scan error. Please try again." },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
