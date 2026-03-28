import LiveDemo from "./components/LiveDemo";
import RepoScanner from "./components/RepoScanner";
import EmailSignup from "./components/EmailSignup";

const CONCURRENCY_RULES = [
  {
    id: "unsafe-unchecked-sendable",
    desc: "@unchecked Sendable with mutable state",
    severity: "warning" as const,
    confidence: "85-90%",
  },
  {
    id: "actor-isolation-violation",
    desc: "Cross-isolation actor state access",
    severity: "error" as const,
    confidence: "85-95%",
  },
  {
    id: "non-sendable-boundary-crossing",
    desc: "Non-Sendable types crossing actor boundaries",
    severity: "warning" as const,
    confidence: "80-95%",
  },
  {
    id: "task-data-race-risk",
    desc: "Shared mutable state in Task closures",
    severity: "error" as const,
    confidence: "88-92%",
  },
  {
    id: "missing-sendable-closure",
    desc: "Closures missing @Sendable annotation",
    severity: "warning" as const,
    confidence: "85%",
  },
  {
    id: "missing-sendable-conformance",
    desc: "Types crossing actor boundaries without Sendable",
    severity: "info" as const,
    confidence: "75%",
  },
];

const GENERAL_RULES = [
  {
    id: "force-unwrap",
    desc: "Force unwrap operator usage",
    severity: "warning" as const,
    confidence: "95%",
  },
];

const STEPS = [
  { num: "1", title: "Send Swift Code", desc: "POST your source to /api/v1/review" },
  { num: "2", title: "AST Analysis", desc: "tree-sitter parses into a full syntax tree" },
  { num: "3", title: "Get Structured Issues", desc: "JSON response with confidence scores" },
];

const sevBadge: Record<string, string> = {
  error: "bg-severity-error/20 text-severity-error",
  warning: "bg-severity-warning/20 text-severity-warning",
  info: "bg-severity-info/20 text-severity-info",
};

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-border sticky top-0 bg-bg/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
            SwiftGuard
          </span>
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <a href="#demo" className="hover:text-text transition-colors">Demo</a>
            <a href="#rules" className="hover:text-text transition-colors">Rules</a>
            <a href="/docs" className="hover:text-text transition-colors">Docs</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-accent-purple/15 text-accent-purple border border-accent-purple/20 mb-6">
          AST-powered Swift analysis
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          <span className="bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
            Paste your repo.
          </span>
          <br />
          <span className="text-text">Get a free concurrency audit.</span>
        </h1>
        <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
          Catch concurrency bugs, Sendable violations, and actor isolation issues before
          they crash in production. AST-powered, not regex.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="#demo"
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to hover:opacity-90 transition-opacity"
          >
            Try Live Demo
          </a>
          <a
            href="/docs"
            className="px-6 py-3 rounded-lg text-sm font-semibold text-text-muted border border-border hover:border-border-accent hover:text-text transition-colors"
          >
            Read the Docs
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div key={step.num} className="bg-bg-card border border-border rounded-xl p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to flex items-center justify-center text-white font-bold text-sm mx-auto mb-4">
                {step.num}
              </div>
              <h3 className="font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-text-muted">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Repo Scanner */}
      <section id="demo" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-3">Scan a GitHub repo</h2>
        <p className="text-text-muted text-center mb-10 text-sm">
          Paste a public GitHub repo URL and get a full concurrency audit. No signup required.
        </p>
        <RepoScanner />
      </section>

      {/* Paste code demo */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-3">Or paste Swift code directly</h2>
        <p className="text-text-muted text-center mb-10 text-sm">
          Drop in a snippet and hit Analyze for instant feedback.
        </p>
        <LiveDemo />
      </section>

      {/* Rules */}
      <section id="rules" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-3">What it catches</h2>
        <p className="text-text-muted text-center mb-10 text-sm">
          7 rules covering Swift concurrency safety and common pitfalls
        </p>

        <div className="mb-8">
          <h3 className="text-sm font-semibold text-accent-purple uppercase tracking-wider mb-4">
            Concurrency &middot; Tier 1
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CONCURRENCY_RULES.map((rule) => (
              <div key={rule.id} className="bg-bg-card border border-border rounded-lg p-4 flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${sevBadge[rule.severity]}`}>
                  {rule.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="text-sm font-mono text-text">{rule.id}</code>
                  <p className="text-xs text-text-muted mt-1">{rule.desc}</p>
                </div>
                <span className="text-xs text-text-dim whitespace-nowrap">{rule.confidence}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-accent-blue uppercase tracking-wider mb-4">
            General
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {GENERAL_RULES.map((rule) => (
              <div key={rule.id} className="bg-bg-card border border-border rounded-lg p-4 flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${sevBadge[rule.severity]}`}>
                  {rule.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="text-sm font-mono text-text">{rule.id}</code>
                  <p className="text-xs text-text-muted mt-1">{rule.desc}</p>
                </div>
                <span className="text-xs text-text-dim whitespace-nowrap">{rule.confidence}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Validated stats */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Validated against real-world code</h2>
          <p className="text-text-muted mb-8 max-w-xl mx-auto text-sm">
            Tested against 15 top Swift repos including Alamofire, Kingfisher, Vapor, and swift-nio.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
                3,108
              </div>
              <div className="text-xs text-text-muted mt-1">Files scanned</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
                93-95%
              </div>
              <div className="text-xs text-text-muted mt-1">Precision on concurrency rules</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
                15
              </div>
              <div className="text-xs text-text-muted mt-1">Swift repos tested</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
                7
              </div>
              <div className="text-xs text-text-muted mt-1">AST-powered rules</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stay Updated */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold mb-3">Stay updated</h2>
        <p className="text-text-muted mb-8 text-sm">
          Get notified when we add new rules and updates.
        </p>
        <div className="flex justify-center">
          <EmailSignup />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-text-dim">
          <span>Built by <a href="https://twitter.com/Kilo_Loco" className="hover:text-accent-blue transition-colors">Kilo Loco</a></span>
          <div className="flex gap-6">
            <a href="/docs" className="hover:text-text-muted transition-colors">Docs</a>
            <a href="#demo" className="hover:text-text-muted transition-colors">Demo</a>
            <a href="https://github.com/Kilo-Loco/swiftguard" className="hover:text-text-muted transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
