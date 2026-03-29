import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "./types";
import type { TypeRegistry } from "@/lib/type-registry";

export function runRules(
  rules: Rule[],
  tree: Parser.Tree,
  source: string,
  typeRegistry?: TypeRegistry
): Issue[] {
  const issues: Issue[] = [];
  for (const rule of rules) {
    issues.push(...rule.check(tree, source, typeRegistry));
  }
  return issues;
}
