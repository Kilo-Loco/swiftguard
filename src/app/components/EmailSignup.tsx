"use client";

import { useState } from "react";

export default function EmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/v1/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="text-success text-sm font-medium">
        You&apos;re on the list! We&apos;ll send your API key soon.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        className="flex-1 px-4 py-2.5 rounded-lg bg-bg-card border border-border text-text text-sm placeholder:text-text-dim focus:outline-none focus:border-accent-blue/50 transition-colors"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent-gradient-from to-accent-gradient-to hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
      >
        {status === "loading" ? "..." : "Get API Key"}
      </button>
      {status === "error" && (
        <span className="text-severity-error text-xs self-center">Failed. Try again.</span>
      )}
    </form>
  );
}
