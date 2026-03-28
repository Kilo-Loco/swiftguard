import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "./types";

export function runRules(
  rules: Rule[],
  tree: Parser.Tree,
  source: string
): Issue[] {
  const issues: Issue[] = [];
  for (const rule of rules) {
    issues.push(...rule.check(tree, source));
  }
  return issues;
}
