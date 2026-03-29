import RepoScanner from "./components/RepoScanner";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 pt-20 pb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-4">
          <span
            style={{
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SwiftGuard
          </span>
        </h1>
        <p className="text-center mb-10" style={{ color: "#94a3b8" }}>
          Paste your repo. Get a free concurrency audit.
        </p>
        <RepoScanner />
      </main>

      <footer className="py-6 text-center text-xs" style={{ color: "#64748b" }}>
        <a href="https://twitter.com/Kilo_Loco" style={{ color: "#64748b", textDecoration: "none" }}>Kilo Loco</a>
        {" · "}
        <a href="https://github.com/Kilo-Loco/swiftguard" style={{ color: "#64748b", textDecoration: "none" }}>GitHub</a>
        {" · "}
        <a href="/docs" style={{ color: "#64748b", textDecoration: "none" }}>API Docs</a>
      </footer>
    </div>
  );
}
