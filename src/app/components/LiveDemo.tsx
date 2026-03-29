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
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-400",
};

const severityBg: Record<string, string> = {
  error: "bg-red-500/15",
  warning: "bg-amber-500/15",
  info: "bg-blue-400/15",
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
          <label className="text-sm font-medium text-zinc-400">Swift Source Code</label>
          <button
            onClick={handleAnalyze}
            disabled={loading || !code.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing..." : "Analyze Code"}
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="w-full h-[420px] bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm text-zinc-100 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
          placeholder="Paste Swift code here..."
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-400">Results</span>
          {result && (
            <span className="text-xs text-zinc-600">
              {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} &middot;{" "}
              {result.metadata.rulesApplied} rules &middot; {result.metadata.parseTimeMs}ms
            </span>
          )}
        </div>
        <div className="w-full h-[420px] bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-y-auto">
          {!result && !error && !loading && (
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
              Click &quot;Analyze Code&quot; to see results
            </div>
          )}
          {loading && (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
              <span className="animate-pulse">Analyzing...</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}
          {result && result.issues.length === 0 && (
            <div className="h-full flex items-center justify-center text-green-500 text-sm">
              No issues found
            </div>
          )}
          {result && result.issues.length > 0 && (
            <div className="flex flex-col gap-3">
              {result.issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded-lg border border-zinc-800 ${severityBg[issue.severity]}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase ${severityColor[issue.severity]}`}>
                      {issue.severity}
                    </span>
                    <span className="text-xs text-zinc-600 font-mono">
                      L{issue.line}:{issue.column}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-100 mb-1">{issue.message}</p>
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-zinc-400 font-mono">{issue.rule}</code>
                    <span className="text-xs text-zinc-600">
                      {Math.round(issue.confidence * 100)}% confidence
                    </span>
                  </div>
                  {issue.suggestion && (
                    <p className="text-xs text-zinc-400 mt-2 pt-2 border-t border-zinc-800">
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
