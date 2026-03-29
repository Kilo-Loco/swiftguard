import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwiftGuard — Swift Code Review API",
  description:
    "Catch concurrency bugs, Sendable violations, and actor isolation issues before they crash in production. AST-powered Swift analysis API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
