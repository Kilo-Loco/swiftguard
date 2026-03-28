"use client";

import { useState } from "react";

const DEFAULT_CODE = `actor BankAccount {
  var balance: Double = 0.0

  func deposit(_ amount: Double) {
    balance += amount
  }
}

class TransferService {
  let account = BankAccount()

  func transferMoney() {
    // Data race: accessing actor state from non-isolated context
    Task.detached {
      self.account.balance += 100.0
    }

    // Force unwrap risk
    let config: String? = nil
    let value = config!
  }
}

struct UserData {
  var name: String
  var scores: [Int]
}

func processAsync(data: UserData) async {
  let actor = BankAccount()
  // Passing non-Sendable type across boundary
  await actor.deposit(Double(data.scores.first!))
}`;

interface Issue {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  column: number;
  confidence: number;
  suggestion: string;
}

interface ReviewResponse {
  issues: Issue[];
  metadata: {
    rulesApplied: number;
    parseTimeMs: number;
    astValid: boolean;
  };
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

export default function LiveDemo() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/v1/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: code }),
      });
      if (!res.ok) {
        setError(`API error: ${res.status}`);
        return;
      }
      const data: ReviewResponse = await res.json();
      setResult(data);
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-muted">Swift Source Code</label>
          <button
            onClick={handleAnalyze}
            disabled={loading || !code.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing..." : "Analyze Code"}
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full h-[420px] bg-bg-card border border-border rounded-lg p-4 font-mono text-sm text-text resize-none focus:outline-none focus:border-accent-blue/50 transition-colors"
          placeholder="Paste Swift code here..."
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-muted">Results</span>
          {result && (
            <span className="text-xs text-text-dim">
              {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} &middot;{" "}
              {result.metadata.rulesApplied} rules &middot; {result.metadata.parseTimeMs}ms
            </span>
          )}
        </div>
        <div className="w-full h-[420px] bg-bg-card border border-border rounded-lg p-4 overflow-y-auto">
          {!result && !error && !loading && (
            <div className="h-full flex items-center justify-center text-text-dim text-sm">
              Click &quot;Analyze Code&quot; to see results
            </div>
          )}
          {loading && (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              <span className="animate-pulse">Analyzing...</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-severity-error/10 text-severity-error text-sm">
              {error}
            </div>
          )}
          {result && result.issues.length === 0 && (
            <div className="h-full flex items-center justify-center text-success text-sm">
              No issues found
            </div>
          )}
          {result && result.issues.length > 0 && (
            <div className="flex flex-col gap-3">
              {result.issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded-lg border border-border ${severityBg[issue.severity]}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase ${severityColor[issue.severity]}`}>
                      {issue.severity}
                    </span>
                    <span className="text-xs text-text-dim font-mono">
                      L{issue.line}:{issue.column}
                    </span>
                  </div>
                  <p className="text-sm text-text mb-1">{issue.message}</p>
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-text-muted font-mono">{issue.rule}</code>
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
      </div>
    </div>
  );
}
