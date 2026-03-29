import RepoScanner from "./components/RepoScanner";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 pt-20 pb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-4">
          <span className="bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to bg-clip-text text-transparent">
            SwiftGuard
          </span>
        </h1>
        <p className="text-center text-text-muted mb-10">
          Paste your repo. Get a free concurrency audit.
        </p>
        <RepoScanner />
      </main>

      <footer className="py-6 text-center text-xs text-text-dim">
        <a href="https://twitter.com/Kilo_Loco" className="hover:text-text-muted transition-colors">Kilo Loco</a>
        {" · "}
        <a href="https://github.com/Kilo-Loco/swiftguard" className="hover:text-text-muted transition-colors">GitHub</a>
        {" · "}
        <a href="/docs" className="hover:text-text-muted transition-colors">API Docs</a>
      </footer>
    </div>
  );
}
