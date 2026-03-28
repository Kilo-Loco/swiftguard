import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

const SIGNUPS_FILE = path.join(process.cwd(), "signups.json");

export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  let signups: string[] = [];
  try {
    const data = await fs.readFile(SIGNUPS_FILE, "utf-8");
    signups = JSON.parse(data);
  } catch {
    // File doesn't exist yet
  }

  if (signups.includes(email)) {
    return NextResponse.json({ message: "Already registered" });
  }

  signups.push(email);
  await fs.writeFile(SIGNUPS_FILE, JSON.stringify(signups, null, 2));

  return NextResponse.json({ message: "Signed up successfully" });
}
