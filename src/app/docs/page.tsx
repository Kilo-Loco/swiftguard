export const metadata = {
  title: "API Documentation — SwiftGuard",
  description: "SwiftGuard API reference: authentication, endpoints, rules, and code examples.",
};

const RULES = [
  { id: "force-unwrap", severity: "warning", confidence: "0.50–0.95", description: "Detects force unwrap operator (!) usage that can cause runtime crashes" },
  { id: "unsafe-unchecked-sendable", severity: "warning", confidence: "0.85–0.90", description: "Flags @unchecked Sendable conformance on types with mutable stored properties" },
  { id: "actor-isolation-violation", severity: "error", confidence: "0.85–0.95", description: "Detects cross-isolation access to actor state from non-async or detached contexts" },
  { id: "non-sendable-boundary-crossing", severity: "warning", confidence: "0.80–0.95", description: "Non-Sendable types captured or passed across concurrency boundaries" },
  { id: "task-data-race-risk", severity: "error", confidence: "0.88–0.92", description: "Shared mutable state accessed or mutated inside Task closures" },
  { id: "missing-sendable-closure", severity: "warning", confidence: "0.85", description: "Closure/function types in actors or Sendable contexts missing @Sendable" },
  { id: "missing-sendable-conformance", severity: "info", confidence: "0.75", description: "Types used as actor method parameters without Sendable conformance" },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-sm font-mono text-zinc-400 leading-relaxed">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            SwiftGuard
          </a>
          <span className="text-sm text-zinc-400">API Documentation</span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Intro */}
        <h1 className="text-3xl font-bold mb-4">API Reference</h1>
        <p className="text-zinc-400 mb-12">
          SwiftGuard analyzes Swift source code for concurrency bugs, Sendable violations, and common
          pitfalls using AST parsing. All responses are JSON.
        </p>

        {/* Auth */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="authentication">Authentication</h2>
          <p className="text-zinc-400 mb-4 text-sm">
            Pass your API key in the <code className="text-blue-500 font-mono">Authorization</code> header.
            For testing, use the demo key.
          </p>
          <Code>{`Authorization: Bearer sg_demo_key_2026`}</Code>
          <p className="text-xs text-zinc-600 mt-3">
            The demo key is rate-limited to 100 requests/minute. Authentication is optional for the live demo on the landing page.
          </p>
        </section>

        {/* Endpoint */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="endpoint">Endpoint</h2>
          <div className="flex items-center gap-3 mb-6">
            <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-500">POST</span>
            <code className="font-mono text-sm">/api/v1/review</code>
          </div>

          <h3 className="font-semibold mb-3 text-sm">Request Body</h3>
          <Code>{`{
  "source": "let x: String? = nil\\nlet y = x!",
  "swiftVersion": "6.0",     // optional
  "platform": "ios"          // optional
}`}</Code>

          <div className="mt-4 text-sm text-zinc-400">
            <p className="mb-2"><strong className="text-zinc-100">source</strong> (required) — Swift source code as a string.</p>
            <p className="mb-2"><strong className="text-zinc-100">swiftVersion</strong> (optional) — Target Swift version. Default: latest.</p>
            <p><strong className="text-zinc-100">platform</strong> (optional) — Target platform (ios, macos, server). For future use.</p>
          </div>
        </section>

        {/* Response */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="response">Response Format</h2>
          <Code>{`{
  "issues": [
    {
      "rule": "force-unwrap",
      "severity": "warning",
      "message": "Force unwrap operator used. This will crash at runtime if the value is nil.",
      "line": 2,
      "column": 12,
      "confidence": 0.95,
      "suggestion": "Use optional binding (if let/guard let) or the nil-coalescing operator (??) instead."
    }
  ],
  "metadata": {
    "rulesApplied": 7,
    "parseTimeMs": 3,
    "astValid": true
  }
}`}</Code>

          <div className="mt-4 text-sm text-zinc-400 space-y-2">
            <p><strong className="text-zinc-100">issues[]</strong> — Array of detected problems.</p>
            <p><strong className="text-zinc-100">issues[].rule</strong> — Rule identifier.</p>
            <p><strong className="text-zinc-100">issues[].severity</strong> — <code className="font-mono">&quot;error&quot;</code> | <code className="font-mono">&quot;warning&quot;</code> | <code className="font-mono">&quot;info&quot;</code></p>
            <p><strong className="text-zinc-100">issues[].confidence</strong> — 0.0 to 1.0. Higher means more certain.</p>
            <p><strong className="text-zinc-100">issues[].suggestion</strong> — Recommended fix.</p>
            <p><strong className="text-zinc-100">metadata.rulesApplied</strong> — Number of rules evaluated.</p>
            <p><strong className="text-zinc-100">metadata.parseTimeMs</strong> — Parse time in milliseconds.</p>
            <p><strong className="text-zinc-100">metadata.astValid</strong> — Whether the AST parsed without errors.</p>
          </div>
        </section>

        {/* Rules */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="rules">Rules Reference</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-3 pr-4">Rule ID</th>
                  <th className="py-3 pr-4">Severity</th>
                  <th className="py-3 pr-4">Confidence</th>
                  <th className="py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((rule) => (
                  <tr key={rule.id} className="border-b border-zinc-800/50">
                    <td className="py-3 pr-4 font-mono text-xs">{rule.id}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-semibold ${
                        rule.severity === "error" ? "text-red-500" :
                        rule.severity === "warning" ? "text-amber-500" :
                        "text-blue-400"
                      }`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 font-mono text-xs">{rule.confidence}</td>
                    <td className="py-3 text-zinc-400">{rule.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Code Examples */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="examples">Code Examples</h2>

          <h3 className="font-semibold mb-3 text-sm">curl</h3>
          <Code>{`curl -X POST https://your-domain.com/api/v1/review \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sg_demo_key_2026" \\
  -d '{"source": "let x: String? = nil\\nlet y = x!"}'`}</Code>

          <h3 className="font-semibold mb-3 mt-8 text-sm">Swift (URLSession)</h3>
          <Code>{`import Foundation

let url = URL(string: "https://your-domain.com/api/v1/review")!
var request = URLRequest(url: url)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")
request.setValue("Bearer sg_demo_key_2026", forHTTPHeaderField: "Authorization")

let body: [String: Any] = [
    "source": "let x: String? = nil\\nlet y = x!",
    "swiftVersion": "6.0"
]
request.httpBody = try JSONSerialization.data(withJSONObject: body)

let (data, _) = try await URLSession.shared.data(for: request)
let result = try JSONDecoder().decode(ReviewResponse.self, from: data)
print("Found \\(result.issues.count) issues")`}</Code>

          <h3 className="font-semibold mb-3 mt-8 text-sm">Python (requests)</h3>
          <Code>{`import requests

response = requests.post(
    "https://your-domain.com/api/v1/review",
    headers={
        "Authorization": "Bearer sg_demo_key_2026",
        "Content-Type": "application/json",
    },
    json={
        "source": "let x: String? = nil\\nlet y = x!",
        "swiftVersion": "6.0",
    },
)

data = response.json()
for issue in data["issues"]:
    print(f"[{issue['severity']}] {issue['rule']}: {issue['message']}")`}</Code>
        </section>

        {/* Rate Limits */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="rate-limits">Rate Limits</h2>
          <p className="text-zinc-400 mb-4 text-sm">
            To keep the service reliable for everyone, the API is rate-limited to <strong className="text-zinc-100">100 requests per minute</strong>.
          </p>
          <p className="text-xs text-zinc-600">
            When rate limited, the API returns HTTP 429 with a JSON error body.
          </p>
        </section>

        {/* Error Codes */}
        <section className="mb-16">
          <h2 className="text-xl font-bold mb-4" id="errors">Error Responses</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono">400</td>
                  <td className="py-3 text-zinc-400">Invalid JSON body or missing source field</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono">401</td>
                  <td className="py-3 text-zinc-400">Invalid or malformed API key</td>
                </tr>
                <tr className="border-b border-zinc-800/50">
                  <td className="py-3 pr-4 font-mono">429</td>
                  <td className="py-3 text-zinc-400">Rate limit exceeded (100 req/min)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-600">
          <a href="/" className="hover:text-zinc-400 transition-colors">&larr; Back to SwiftGuard</a>
          <span>Built by <a href="https://twitter.com/Kilo_Loco" className="hover:text-blue-500 transition-colors">Kilo Loco</a> · <a href="https://github.com/Kilo-Loco/swiftguard" className="hover:text-blue-500 transition-colors">GitHub</a></span>
        </div>
      </footer>
    </div>
  );
}
