export const metadata = {
  title: "API Documentation — SwiftGuard",
  description: "SwiftGuard API reference: endpoints, rules, and code examples for Swift concurrency analysis.",
};

const SE_PROPOSALS: Record<string, string> = {
  "SE-0302": "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md",
  "SE-0304": "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0304-structured-concurrency.md",
  "SE-0306": "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0306-actors.md",
};

const RULES = [
  { id: "unsafe-unchecked-sendable", severity: "warning", confidence: "0.85–0.90", se: "SE-0302", description: "@unchecked Sendable with mutable state and no visible synchronization. The compiler skips these by design." },
  { id: "actor-isolation-violation", severity: "error", confidence: "0.85–0.95", se: "SE-0306", description: "Actor state accessed from Task.detached, nonisolated methods, or cross-actor without async." },
  { id: "non-sendable-boundary-crossing", severity: "warning", confidence: "0.80–0.95", se: "SE-0302", description: "Non-Sendable types captured in Task closures or crossing concurrency boundaries." },
  { id: "task-data-race-risk", severity: "error", confidence: "0.88–0.92", se: "SE-0304", description: "Mutable variables captured and mutated inside Task closures." },
  { id: "missing-sendable-closure", severity: "warning", confidence: "0.85", se: "SE-0302", description: "Closure types in actors or @unchecked Sendable classes missing @Sendable annotation." },
  { id: "missing-sendable-conformance", severity: "info", confidence: "0.75", se: "SE-0302", description: "Types used as actor method parameters without Sendable conformance." },
];

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#0f0f23",
        border: "1px solid #30304a",
        borderRadius: 8,
        padding: 16,
        overflowX: "auto",
        fontSize: 13,
        fontFamily: "monospace",
        color: "#94a3b8",
        lineHeight: 1.6,
      }}
    >
      {children}
    </pre>
  );
}

function SectionCard({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      style={{
        background: "#1a1a2e",
        border: "1px solid #30304a",
        borderRadius: 12,
        padding: 32,
        marginBottom: 32,
      }}
    >
      {children}
    </section>
  );
}

function MethodBadge({ method, color }: { method: string; color: string }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        background: `${color}22`,
        color,
      }}
    >
      {method}
    </span>
  );
}

export default function DocsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a1a", color: "white" }}>
      {/* Nav */}
      <nav
        style={{
          borderBottom: "1px solid #30304a",
          position: "sticky",
          top: 0,
          background: "rgba(10, 10, 26, 0.85)",
          backdropFilter: "blur(8px)",
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a
            href="/"
            style={{
              fontSize: 18,
              fontWeight: 700,
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textDecoration: "none",
            }}
          >
            SwiftGuard
          </a>
          <span style={{ fontSize: 14, color: "#64748b" }}>API Documentation</span>
        </div>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>API Documentation</h1>
          <p style={{ color: "#94a3b8", fontSize: 16, lineHeight: 1.7 }}>
            SwiftGuard scans Swift source code for concurrency issues using tree-sitter AST parsing.
            It previews what Swift 6 strict concurrency would flag, plus catches <code style={{ fontFamily: "monospace", color: "#6366f1" }}>@unchecked Sendable</code> misuse
            that the compiler explicitly skips.
          </p>
        </div>

        {/* ── Endpoint 1: POST /api/v1/review ── */}
        <SectionCard id="review">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <MethodBadge method="POST" color="#6366f1" />
            <code style={{ fontFamily: "monospace", fontSize: 15, color: "white" }}>/api/v1/review</code>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 20 }}>
            Analyze a single Swift source string. Returns concurrency issues with line numbers, confidence scores, and fix suggestions.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "white" }}>Authentication</h3>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
            Pass your API key via the <code style={{ fontFamily: "monospace", color: "#6366f1" }}>Authorization</code> header.
            Demo key: <code style={{ fontFamily: "monospace", color: "#6366f1" }}>sg_demo_key_2026</code> (rate-limited to 100 req/min).
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "white" }}>Request Body</h3>
          <Code>{`{
  "source": "actor Counter { var count = 0 }\\nfunc inc(c: Counter) { c.count += 1 }",
  "swiftVersion": "6.0",     // optional
  "platform": "ios"          // optional
}`}</Code>

          <div style={{ marginTop: 16, fontSize: 13, color: "#94a3b8" }}>
            <p style={{ marginBottom: 6 }}><strong style={{ color: "white" }}>source</strong> (required) — Swift source code as a string.</p>
            <p style={{ marginBottom: 6 }}><strong style={{ color: "white" }}>swiftVersion</strong> (optional) — Target Swift version. Default: latest.</p>
            <p><strong style={{ color: "white" }}>platform</strong> (optional) — Target platform (ios, macos, server). For future use.</p>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 24, color: "white" }}>Response</h3>
          <Code>{`{
  "issues": [
    {
      "rule": "actor-isolation-violation",
      "severity": "error",
      "message": "Direct access to actor-isolated property 'count' from non-isolated context.",
      "line": 2,
      "column": 34,
      "confidence": 0.90,
      "suggestion": "Use 'await' to access actor-isolated state asynchronously.",
      "seProposal": "SE-0306"
    }
  ],
  "metadata": {
    "rulesApplied": 6,
    "parseTimeMs": 3,
    "astValid": true
  }
}`}</Code>
        </SectionCard>

        {/* ── Endpoint 2: POST /api/v1/scan-repo ── */}
        <SectionCard id="scan-repo">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <MethodBadge method="POST" color="#6366f1" />
            <code style={{ fontFamily: "monospace", fontSize: 15, color: "white" }}>/api/v1/scan-repo</code>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 20 }}>
            Scan an entire GitHub repository for concurrency issues. No authentication required.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "white" }}>Request Body</h3>
          <Code>{`{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main"     // optional, defaults to default branch
}`}</Code>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 24, color: "white" }}>Response</h3>
          <Code>{`{
  "repo": "owner/repo",
  "branch": "main",
  "filesScanned": 42,
  "filesWithIssues": 8,
  "scanTimeMs": 1250,
  "summary": { "errors": 3, "warnings": 12, "info": 5 },
  "topFiles": [
    { "path": "Sources/NetworkManager.swift", "issues": 4 }
  ],
  "issues": [ ... ]
}`}</Code>

          <div style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
            <p>Limits: 500 files max per scan. Test files are skipped. 30-second timeout.</p>
          </div>
        </SectionCard>

        {/* ── Endpoint 3: GET /badge ── */}
        <SectionCard id="badge">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <MethodBadge method="GET" color="#22c55e" />
            <code style={{ fontFamily: "monospace", fontSize: 15, color: "white" }}>/badge/[owner]/[repo]</code>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 20 }}>
            Returns a live SVG badge showing your repo{"'"}s concurrency health. Green (clean), amber (warnings), red (errors). Cached for 1 hour.
          </p>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "white" }}>Usage</h3>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>Add this to your README:</p>
          <Code>{`![SwiftGuard](https://swiftguard.kiloloco.com/badge/owner/repo)`}</Code>

          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 12 }}>Or in HTML:</p>
          <Code>{`<a href="https://swiftguard.kiloloco.com">
  <img src="https://swiftguard.kiloloco.com/badge/owner/repo" alt="SwiftGuard Badge" />
</a>`}</Code>
        </SectionCard>

        {/* ── Rules Reference ── */}
        <SectionCard id="rules">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Rules Reference</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 20 }}>
            SwiftGuard runs 6 concurrency-focused rules against each file.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #30304a", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "12px 12px 12px 0" }}>Rule ID</th>
                  <th style={{ padding: 12 }}>Severity</th>
                  <th style={{ padding: 12 }}>Confidence</th>
                  <th style={{ padding: 12 }}>SE Proposal</th>
                  <th style={{ padding: "12px 0 12px 12px" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: "1px solid rgba(48, 48, 74, 0.5)" }}>
                    <td style={{ padding: "12px 12px 12px 0", fontFamily: "monospace", fontSize: 12 }}>{rule.id}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: rule.severity === "error" ? "#ef4444" : rule.severity === "warning" ? "#f59e0b" : "#60a5fa",
                        }}
                      >
                        {rule.severity}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{rule.confidence}</td>
                    <td style={{ padding: 12 }}>
                      <a
                        href={SE_PROPOSALS[rule.se]}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#6366f1", textDecoration: "none", fontSize: 12, fontFamily: "monospace" }}
                      >
                        {rule.se}
                      </a>
                    </td>
                    <td style={{ padding: "12px 0 12px 12px", color: "#94a3b8" }}>{rule.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Code Examples ── */}
        <SectionCard id="examples">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Code Examples</h2>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "white" }}>Single file review (curl)</h3>
          <Code>{`curl -X POST https://swiftguard.kiloloco.com/api/v1/review \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sg_demo_key_2026" \\
  -d '{"source": "actor Counter { var count = 0 }\\nfunc inc(c: Counter) { c.count += 1 }"}'`}</Code>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 24, color: "white" }}>Repo scan (curl)</h3>
          <Code>{`curl -X POST https://swiftguard.kiloloco.com/api/v1/scan-repo \\
  -H "Content-Type: application/json" \\
  -d '{"repoUrl": "https://github.com/owner/repo"}'`}</Code>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 24, color: "white" }}>Badge (Markdown)</h3>
          <Code>{`![SwiftGuard](https://swiftguard.kiloloco.com/badge/owner/repo)`}</Code>
        </SectionCard>

        {/* ── How It Works ── */}
        <SectionCard id="how-it-works">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>How It Works</h2>
          <ol style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
            <li>Files are parsed into ASTs using <strong style={{ color: "white" }}>tree-sitter-swift</strong>.</li>
            <li>A first pass builds a <strong style={{ color: "white" }}>TypeRegistry</strong> for cross-file Sendable resolution.</li>
            <li>A second pass runs <strong style={{ color: "white" }}>6 concurrency rules</strong> against each AST.</li>
            <li>Issues include code snippets and <strong style={{ color: "white" }}>SE proposal references</strong>.</li>
          </ol>
        </SectionCard>

        {/* ── What it catches that the compiler does not ── */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))",
            border: "1px solid #6366f1",
            borderRadius: 12,
            padding: 32,
            marginBottom: 32,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>What it catches that the compiler does not</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7 }}>
            <code style={{ fontFamily: "monospace", color: "#6366f1" }}>@unchecked Sendable</code> is an explicit opt-out from the compiler.
            When a type is marked <code style={{ fontFamily: "monospace", color: "#6366f1" }}>@unchecked Sendable</code>, the compiler performs
            zero concurrency checks on it. SwiftGuard audits these escape hatches — flagging mutable state
            without visible synchronization, even when the compiler looks the other way.
          </p>
        </div>

        {/* ── Limitations ── */}
        <SectionCard id="limitations">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Limitations</h2>
          <ul style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
            <li>Most rules preview what Swift 6 strict concurrency mode would catch. Enable strict concurrency in your project for authoritative results.</li>
            <li>Cross-file type resolution works within the scanned repo but cannot resolve types from external SPM packages.</li>
            <li>500 file limit for web scans.</li>
          </ul>
        </SectionCard>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #30304a", padding: "24px 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
          <a href="/" style={{ color: "#64748b", textDecoration: "none" }}>&larr; Back to SwiftGuard</a>
          <span>
            Built by{" "}
            <a href="https://twitter.com/Kilo_Loco" style={{ color: "#6366f1", textDecoration: "none" }}>Kilo Loco</a>
            {" · "}
            <a href="https://github.com/Kilo-Loco/swiftguard" style={{ color: "#6366f1", textDecoration: "none" }}>GitHub</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
