import type { NextRequest } from "next/server";
import { parseSwift } from "@/lib/parser";
import { runRules } from "@/lib/rules/engine";
import { allRules } from "@/lib/rules/index";
import { buildTypeRegistry } from "@/lib/type-registry";

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
const MAX_FILE_SIZE = 100 * 1024;
const BATCH_SIZE = 12;
const SCAN_TIMEOUT_MS = 30_000;

function shouldSkipPath(path: string): boolean {
  const normalized = "/" + path;
  return SKIP_PATTERNS.some((pattern) => normalized.includes("/" + pattern));
}

function makeBadgeSvg(
  statusText: string,
  statusColor: string
): string {
  const label = "SwiftGuard";
  // Approximate character width (11px font, ~6.6px per char)
  const charWidth = 6.6;
  const padding = 20;
  const leftWidth = Math.round(label.length * charWidth + padding);
  const rightWidth = Math.round(statusText.length * charWidth + padding);
  const totalWidth = leftWidth + rightWidth;
  const leftTextX = Math.round(leftWidth / 2);
  const rightTextX = Math.round(leftWidth + rightWidth / 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="28" viewBox="0 0 ${totalWidth} 28">
  <!-- Left side: SwiftGuard -->
  <rect width="${leftWidth}" height="28" rx="6" fill="#1a1a2e"/>
  <!-- Right side: status -->
  <rect x="${leftWidth}" width="${rightWidth}" height="28" rx="6" fill="${statusColor}"/>
  <rect x="${leftWidth}" width="6" height="28" fill="${statusColor}"/>
  <!-- Overlay for clean left edges -->
  <rect width="${leftWidth}" height="28" rx="6" fill="#1a1a2e"/>

  <!-- Label text -->
  <text x="${leftTextX}" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#ffffff" text-anchor="middle">${label}</text>
  <!-- Status text -->
  <text x="${rightTextX}" y="18" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#ffffff" text-anchor="middle">${statusText}</text>
</svg>`;
}

function errorBadge(message: string): Response {
  const svg = makeBadgeSvg(message, "#6b7280");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/badge/[owner]/[repo]">
) {
  const { owner, repo } = await ctx.params;

  if (!owner || !repo) {
    return errorBadge("error");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SwiftGuard-Scanner",
    };
    if (process.env.GITHUB_TOKEN) {
      ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    // Resolve default branch
    const repoRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { signal: controller.signal, headers: ghHeaders }
    );
    if (!repoRes.ok) {
      return errorBadge("error");
    }
    const repoData = await repoRes.json();
    const branch = repoData.default_branch;

    // Fetch file tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${branch}?recursive=1`,
      { signal: controller.signal, headers: ghHeaders }
    );
    if (!treeRes.ok) {
      return errorBadge("error");
    }
    const treeData = await treeRes.json();

    // Filter Swift files
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
      const svg = makeBadgeSvg("\u2713 No Concurrency Issues", "#22c55e");
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (allFiles.length > MAX_SWIFT_FILES) {
      return errorBadge("repo too large");
    }

    // Fetch file contents in batches
    const fetchedFiles: { path: string; content: string }[] = [];
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) break;
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${branch}/${file.path}`;
          const res = await fetch(rawUrl, { signal: controller.signal });
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

    // Pass 1: Build type registry
    const typeRegistry = buildTypeRegistry(
      fetchedFiles.map((f) => ({ path: f.path, source: f.content }))
    );

    // Pass 2: Run rules
    const bySeverity: Record<string, number> = {};
    for (const file of fetchedFiles) {
      const tree = parseSwift(file.content);
      const issues = runRules(allRules, tree, file.content, typeRegistry);
      for (const issue of issues) {
        bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
      }
    }

    const errors = bySeverity["error"] || 0;
    const warnings = bySeverity["warning"] || 0;

    let statusText: string;
    let statusColor: string;

    if (errors === 0 && warnings === 0) {
      statusText = "\u2713 No Concurrency Issues";
      statusColor = "#22c55e";
    } else if (errors === 0) {
      statusText = `\u26A0 ${warnings} warning${warnings !== 1 ? "s" : ""}`;
      statusColor = "#f59e0b";
    } else {
      const parts = [`\u2717 ${errors} error${errors !== 1 ? "s" : ""}`];
      if (warnings > 0) {
        parts.push(`${warnings} warning${warnings !== 1 ? "s" : ""}`);
      }
      statusText = parts.join(", ");
      statusColor = "#ef4444";
    }

    const svg = makeBadgeSvg(statusText, statusColor);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return errorBadge("scanning...");
    }
    return errorBadge("error");
  } finally {
    clearTimeout(timeout);
  }
}
