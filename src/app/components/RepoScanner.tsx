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

const severityColors: Record<string, { text: string; bg: string; border: string; badgeBg: string }> = {
  error: { text: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "#ef4444", badgeBg: "rgba(239,68,68,0.2)" },
  warning: { text: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "#f59e0b", badgeBg: "rgba(245,158,11,0.2)" },
  info: { text: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "#6366f1", badgeBg: "rgba(99,102,241,0.2)" },
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
    <div
      style={{
        background: "#1a1a2e",
        border: "1px solid #30304a",
        borderRadius: 12,
        padding: 24,
      }}
    >
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
          disabled={loading}
          style={{
            flex: 1,
            background: "#0f0f23",
            border: "2px solid #30304a",
            borderRadius: 8,
            padding: "12px 16px",
            color: "white",
            fontFamily: "monospace",
            fontSize: 14,
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "#30304a")}
        />
        <button
          onClick={handleScan}
          disabled={loading || !url.trim()}
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white",
            fontWeight: 600,
            borderRadius: 8,
            padding: "12px 24px",
            border: "none",
            cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            opacity: loading || !url.trim() ? 0.4 : 1,
            fontSize: 14,
            whiteSpace: "nowrap",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!loading && url.trim()) e.currentTarget.style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = loading || !url.trim() ? "0.4" : "1";
          }}
        >
          {loading ? "Scanning..." : "Scan Repo"}
        </button>
      </div>

      <div className="mb-4" />

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-3" style={{ color: "#94a3b8", fontSize: 14 }}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#6366f1",
                animation: "pulse-dot 1.5s ease-in-out infinite",
              }}
            />
            <span>{statusText || "Scanning..."}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div
            className="flex flex-wrap items-center gap-3"
            style={{
              padding: 16,
              background: "#0f0f23",
              border: "1px solid #30304a",
              borderRadius: 8,
            }}
          >
            <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
              <span style={{ color: "#94a3b8" }}>Repo:</span>
              <span style={{ fontFamily: "monospace", color: "white" }}>{result.repo}</span>
            </div>
            <span style={{ color: "#30304a" }}>|</span>
            <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
              <span style={{ color: "#94a3b8" }}>Branch:</span>
              <span style={{ fontFamily: "monospace", color: "white" }}>{result.branch}</span>
            </div>
            <span style={{ color: "#30304a" }}>|</span>
            <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
              <span style={{ color: "#94a3b8" }}>Files:</span>
              <span style={{ color: "white" }}>{result.filesScanned}</span>
            </div>
            <span style={{ color: "#30304a" }}>|</span>
            <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
              <span style={{ color: "#94a3b8" }}>Time:</span>
              <span style={{ color: "white" }}>{(result.scanTimeMs / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {/* Severity badges */}
          <div className="flex flex-wrap gap-3 items-center">
            <div style={{ fontSize: 14, fontWeight: 600, color: "white" }}>
              {result.summary.total} issue{result.summary.total !== 1 ? "s" : ""} found
            </div>
            <div className="flex gap-2">
              {(["error", "warning", "info"] as const).map((sev) => {
                const count = result.summary.bySeverity[sev] || 0;
                if (count === 0) return null;
                const colors = severityColors[sev];
                return (
                  <span
                    key={sev}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: colors.badgeBg,
                      color: colors.text,
                    }}
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
              <h4
                className="mb-3"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                By Rule
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ruleEntries.map(([rule, count]) => (
                  <div
                    key={rule}
                    className="flex items-center justify-between px-3 py-2"
                    style={{
                      background: "#0f0f23",
                      border: "1px solid #30304a",
                      borderRadius: 8,
                    }}
                  >
                    <code style={{ fontSize: 12, fontFamily: "monospace", color: "#a5b4fc" }}>{rule}</code>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginLeft: 8 }}>
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
              <h4
                className="mb-3"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Top Files ({result.filesWithIssues} files with issues)
              </h4>
              <div className="space-y-2">
                {result.topFiles.slice(0, 5).map((fileGroup) => (
                  <div
                    key={fileGroup.file}
                    style={{
                      background: "#12122a",
                      border: "1px solid #30304a",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => toggleFile(fileGroup.file)}
                      className="w-full flex items-center justify-between px-4 py-3"
                      style={{
                        background: "#1a1a2e",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#222244")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#1a1a2e")}
                    >
                      <code
                        className="truncate mr-3"
                        style={{ fontSize: 12, fontFamily: "monospace", color: "#a5b4fc" }}
                      >
                        {truncatePath(fileGroup.file)}
                      </code>
                      <div className="flex items-center gap-2 shrink-0">
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
                          {fileGroup.issues} issue{fileGroup.issues !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>
                          {expandedFiles.has(fileGroup.file) ? "\u25B2" : "\u25BC"}
                        </span>
                      </div>
                    </button>
                    {expandedFiles.has(fileGroup.file) && (
                      <div
                        className="px-4 py-3 space-y-2"
                        style={{ borderTop: "1px solid #30304a" }}
                      >
                        {fileGroup.details.map((issue, i) => {
                          const colors = severityColors[issue.severity];
                          return (
                            <div
                              key={i}
                              style={{
                                padding: 12,
                                background: "#0f0f23",
                                borderLeft: `3px solid ${colors.border}`,
                                borderRadius: 4,
                              }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    color: colors.text,
                                  }}
                                >
                                  {issue.severity}
                                </span>
                                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
                                  L{issue.line}:{issue.column}
                                </span>
                              </div>
                              <p style={{ fontSize: 14, color: "white", marginBottom: 4 }}>{issue.message}</p>
                              <div className="flex items-center justify-between">
                                <code style={{ fontSize: 12, color: "#a5b4fc", fontFamily: "monospace" }}>
                                  {issue.rule}
                                </code>
                                <span style={{ fontSize: 12, color: "#64748b" }}>
                                  {Math.round(issue.confidence * 100)}% confidence
                                </span>
                              </div>
                              {issue.suggestion && (
                                <p
                                  className="mt-2 pt-2"
                                  style={{
                                    fontSize: 12,
                                    color: "#94a3b8",
                                    borderTop: "1px solid #30304a",
                                  }}
                                >
                                  {issue.suggestion}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {result.topFiles.length > 5 && (
                  <p className="text-center py-2" style={{ fontSize: 12, color: "#64748b" }}>
                    + {result.topFiles.length - 5} more files with issues
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No issues */}
          {result.summary.total === 0 && (
            <div className="py-8 text-center" style={{ color: "#22c55e", fontSize: 14 }}>
              No concurrency issues found. This repo looks clean!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
