import RepoScanner from "./components/RepoScanner";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 pt-20 pb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center mb-4">
          <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            SwiftGuard
          </span>
        </h1>
        <p className="text-center text-zinc-400 mb-10">
          Paste your repo. Get a free concurrency audit.
        </p>
        <RepoScanner />
      </main>

      <footer className="py-6 text-center text-xs text-zinc-600">
        <a href="https://twitter.com/Kilo_Loco" className="hover:text-zinc-400 transition-colors">Kilo Loco</a>
        {" · "}
        <a href="https://github.com/Kilo-Loco/swiftguard" className="hover:text-zinc-400 transition-colors">GitHub</a>
        {" · "}
        <a href="/docs" className="hover:text-zinc-400 transition-colors">API Docs</a>
      </footer>
    </div>
  );
}
