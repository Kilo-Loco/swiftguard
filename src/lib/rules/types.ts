import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";

export type Severity = "error" | "warning" | "info";
export type Tier = "critical" | "standard" | "style";

export interface Rule {
  id: string;
  name: string;
  tier: Tier;
  severity: Severity;
  description: string;
  check(tree: Parser.Tree, source: string): Issue[];
}
