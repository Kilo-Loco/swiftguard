import RepoScanner from "./components/RepoScanner";

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <main style={{ maxWidth: 800, width: "100%", padding: "80px 24px 64px" }}>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 700, textAlign: "center", marginBottom: 12, letterSpacing: "-0.02em" }}>
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
        <p style={{ textAlign: "center", marginBottom: 40, color: "#94a3b8", fontSize: 16 }}>
          Paste your repo. Get a free concurrency audit.
        </p>
        <RepoScanner />
      </main>

      <footer style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: "#64748b" }}>
        <a href="https://twitter.com/Kilo_Loco" style={{ color: "#64748b", textDecoration: "none" }}>Kilo Loco</a>
        {" · "}
        <a href="https://github.com/Kilo-Loco/swiftguard" style={{ color: "#64748b", textDecoration: "none" }}>GitHub</a>
        {" · "}
        <a href="/docs" style={{ color: "#64748b", textDecoration: "none" }}>API Docs</a>
      </footer>
    </div>
  );
}
