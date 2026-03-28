import { getNodesByType, getNodeText } from "@/lib/parser";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

const LITERAL_TYPES = new Set([
  "line_string_literal",
  "integer_literal",
  "real_literal",
  "boolean_literal",
]);

/**
 * Check if a bang node is applied to a literal constructor call like URL(string: "...")!
 * Returns true if all arguments are literals.
 */
function isLiteralConstructorBang(
  bangNode: import("tree-sitter").SyntaxNode,
  source: string
): boolean {
  const parent = bangNode.parent;
  if (!parent || parent.type !== "postfix_expression") return false;

  // Find the call_expression sibling
  let callExpr: import("tree-sitter").SyntaxNode | null = null;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)!;
    if (child.type === "call_expression") {
      callExpr = child;
      break;
    }
  }
  if (!callExpr) return false;

  // Get all value_argument nodes
  const args = getNodesByType(callExpr, "value_argument");
  if (args.length === 0) return false;

  // Check that every argument value is a literal
  for (const arg of args) {
    let hasLiteral = false;
    for (let i = 0; i < arg.childCount; i++) {
      const child = arg.child(i)!;
      if (LITERAL_TYPES.has(child.type)) {
        hasLiteral = true;
      }
    }
    if (!hasLiteral) return false;
  }

  return true;
}

export const forceUnwrapRule: Rule = {
  id: "force-unwrap",
  name: "Force Unwrap Detected",
  tier: "critical",
  severity: "warning",
  description:
    "Detects force unwrap operators (!) which can cause runtime crashes if the value is nil.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];
    const nodes = getNodesByType(tree.rootNode, "bang");

    for (const node of nodes) {
      const line = node.startPosition.row + 1;
      const column = node.startPosition.column + 1;

      // Check if this is a force unwrap on a literal constructor call
      if (isLiteralConstructorBang(node, source)) {
        issues.push({
          rule: this.id,
          severity: "info",
          message: `Force unwrap on literal constructor call. This is likely safe but consider using a guard for consistency.`,
          line,
          column,
          confidence: 0.5,
          suggestion:
            "This force unwrap is on a literal value and is unlikely to fail. Consider keeping it or using a static constant.",
        });
        continue;
      }

      issues.push({
        rule: this.id,
        severity: this.severity,
        message: `Force unwrap operator used. This will crash at runtime if the value is nil.`,
        line,
        column,
        confidence: 0.95,
        suggestion:
          "Use optional binding (if let/guard let) or the nil-coalescing operator (??) instead.",
      });
    }

    return issues;
  },
};
