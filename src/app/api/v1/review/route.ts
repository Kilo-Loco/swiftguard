import { NextRequest, NextResponse } from "next/server";
import { parseSwift } from "@/lib/parser";
import { runRules } from "@/lib/rules/engine";
import { allRules } from "@/lib/rules/index";
import type { ReviewRequest, ReviewResponse } from "@/types/api";

export async function POST(request: NextRequest) {
  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.source || typeof body.source !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'source' field" },
      { status: 400 }
    );
  }

  const start = performance.now();
  const tree = parseSwift(body.source);
  const parseTimeMs = Math.round(performance.now() - start);

  const issues = runRules(allRules, tree, body.source);

  const response: ReviewResponse = {
    issues,
    metadata: {
      rulesApplied: allRules.length,
      parseTimeMs,
      astValid: tree.rootNode.hasError === false,
    },
  };

  return NextResponse.json(response);
}
