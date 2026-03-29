"use client";

import { useState } from "react";

interface ScanIssue {
  file: string;
  rule: string;
  severity: "error" | "warning" | "info";
  line: number;
  column: number;
  confidence: number;
  message: string;
  suggestion: string;
}

interface FileIssueGroup {
  file: string;
  issues: number;
  details: ScanIssue[];
}

interface ScanResult {
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

const severityColor: Record<string, string> = {
  error: "text-severity-error",
  warning: "text-severity-warning",
  info: "text-severity-info",
};

const severityBg: Record<string, string> = {
  error: "bg-severity-error/15",
  warning: "bg-severity-warning/15",
  info: "bg-severity-info/15",
};

const severityBadge: Record<string, string> = {
  error: "bg-severity-error/20 text-severity-error",
  warning: "bg-severity-warning/20 text-severity-warning",
  info: "bg-severity-info/20 text-severity-info",
};

function truncatePath(path: string, maxLen = 60): string {
  if (path.length <= maxLen) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return "..." + path.slice(-maxLen + 3);
  return parts[0] + "/.../" + parts.slice(-2).join("/");
}

export default function RepoScanner() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  async function handleScan() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setExpandedFiles(new Set());
    setStatusText("Connecting to GitHub...");

    try {
      const res = await fetch("/api/v1/scan-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Scan failed: ${res.status}`);
        return;
      }

      setResult(data);
      setStatusText("");
      setUrl("");
    } catch {
      setError("Failed to connect to API. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleFile(file: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  const ruleEntries = result
    ? Object.entries(result.summary.byRule).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="bg-bg-card border border-border rounded-xl p-6">
      {/* Input */}
      <div className="flex gap-3 mb-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) handleScan();
          }}
          placeholder="https://github.com/owner/repo"
          className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text font-mono placeholder:text-text-dim focus:outline-none focus:border-accent-blue/50 transition-colors"
          disabled={loading}
        />
        <button
          onClick={handleScan}
          disabled={loading || !url.trim()}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          {loading ? "Scanning..." : "Scan Repo"}
        </button>
      </div>

      <div className="mb-4" />

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-3 text-text-muted text-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-blue"></span>
            </span>
            <span>{statusText || "Scanning..."}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-severity-error/10 text-severity-error text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-bg rounded-lg border border-border">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">Repo:</span>
              <span className="font-mono text-text">{result.repo}</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">Branch:</span>
              <span className="font-mono text-text">{result.branch}</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">Files:</span>
              <span className="text-text">{result.filesScanned}</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">Time:</span>
              <span className="text-text">{(result.scanTimeMs / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {/* Severity badges */}
          <div className="flex flex-wrap gap-3">
            <div className="text-sm font-semibold text-text">
              {result.summary.total} issue{result.summary.total !== 1 ? "s" : ""} found
            </div>
            <div className="flex gap-2">
              {(["error", "warning", "info"] as const).map((sev) => {
                const count = result.summary.bySeverity[sev] || 0;
                if (count === 0) return null;
                return (
                  <span
                    key={sev}
                    className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${severityBadge[sev]}`}
                  >
                    {count} {sev}{count !== 1 ? "s" : ""}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Rule breakdown */}
          {ruleEntries.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                By Rule
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ruleEntries.map(([rule, count]) => (
                  <div
                    key={rule}
                    className="flex items-center justify-between bg-bg rounded-lg border border-border px-3 py-2"
                  >
                    <code className="text-xs font-mono text-text">{rule}</code>
                    <span className="text-xs font-semibold text-text-muted ml-2">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top files */}
          {result.topFiles.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Top Files ({result.filesWithIssues} files with issues)
              </h4>
              <div className="space-y-2">
                {result.topFiles.slice(0, 5).map((fileGroup) => (
                  <div key={fileGroup.file} className="bg-bg rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => toggleFile(fileGroup.file)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-border/20 transition-colors cursor-pointer text-left"
                    >
                      <code className="text-xs font-mono text-text truncate mr-3">
                        {truncatePath(fileGroup.file)}
                      </code>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-text-muted">
                          {fileGroup.issues} issue{fileGroup.issues !== 1 ? "s" : ""}
                        </span>
                        <span className="text-text-dim text-xs">
                          {expandedFiles.has(fileGroup.file) ? "\u25B2" : "\u25BC"}
                        </span>
                      </div>
                    </button>
                    {expandedFiles.has(fileGroup.file) && (
                      <div className="border-t border-border px-4 py-3 space-y-2">
                        {fileGroup.details.map((issue, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-lg border border-border ${severityBg[issue.severity]}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span
                                className={`text-xs font-semibold uppercase ${severityColor[issue.severity]}`}
                              >
                                {issue.severity}
                              </span>
                              <span className="text-xs text-text-dim font-mono">
                                L{issue.line}:{issue.column}
                              </span>
                            </div>
                            <p className="text-sm text-text mb-1">{issue.message}</p>
                            <div className="flex items-center justify-between">
                              <code className="text-xs text-text-muted font-mono">
                                {issue.rule}
                              </code>
                              <span className="text-xs text-text-dim">
                                {Math.round(issue.confidence * 100)}% confidence
                              </span>
                            </div>
                            {issue.suggestion && (
                              <p className="text-xs text-text-muted mt-2 pt-2 border-t border-border">
                                {issue.suggestion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {result.topFiles.length > 5 && (
                  <p className="text-xs text-text-dim text-center py-2">
                    + {result.topFiles.length - 5} more files with issues
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No issues */}
          {result.summary.total === 0 && (
            <div className="py-8 text-center text-success text-sm">
              No concurrency issues found. This repo looks clean!
            </div>
          )}


        </div>
      )}
    </div>
  );
}
