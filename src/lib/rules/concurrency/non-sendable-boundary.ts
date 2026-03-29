import { getNodesByType, getNodeText, findAncestor } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

/**
 * Check if a class_declaration has the `final` modifier.
 */
function isFinalClass(node: Parser.SyntaxNode, source: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const mod = child.child(j)!;
        if (
          mod.type === "inheritance_modifier" &&
          getNodeText(mod, source) === "final"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if a class_declaration has Sendable in its inheritance clause
 * (but NOT @unchecked Sendable).
 */
function hasSendableConformance(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  const children: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    children.push(node.child(i)!);
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (
      child.type === "inheritance_specifier" &&
      getNodeText(child, source).includes("Sendable")
    ) {
      // Check that the previous sibling is NOT an @unchecked attribute
      const prev = children[i - 1];
      if (
        prev &&
        prev.type === "attribute" &&
        getNodeText(prev, source) === "@unchecked"
      ) {
        continue; // This is @unchecked Sendable, skip
      }
      return true;
    }
  }
  return false;
}

/**
 * Check if a class_declaration node is actually a class (not a struct, actor, or enum).
 */
function isClassDeclaration(node: Parser.SyntaxNode): boolean {
  // tree-sitter-swift uses class_declaration for class, struct, actor, enum
  // The first non-modifier child tells us which keyword was used
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "class") return true;
    if (child.type === "modifiers") continue;
    // If we hit something else first, it's not a class
    break;
  }
  return false;
}

/**
 * Pattern B: Detect non-final classes conforming to Sendable.
 */
function checkNonFinalSendableClasses(
  tree: Parser.Tree,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const declarations = getNodesByType(tree.rootNode, "class_declaration");

  for (const decl of declarations) {
    if (!isClassDeclaration(decl)) continue;
    if (isFinalClass(decl, source)) continue;
    if (!hasSendableConformance(decl, source)) continue;

    const nameNode = decl.childForFieldName("name");
    const name = nameNode ? getNodeText(nameNode, source) : "Unknown";
    const line = decl.startPosition.row + 1;
    const column = decl.startPosition.column + 1;

    issues.push({
      rule: ruleId,
      severity,
      message: `Non-final class '${name}' conforms to Sendable. Only final classes can safely conform to Sendable because subclasses could add mutable state.`,
      line,
      column,
      confidence: 0.95,
      suggestion:
        "Mark the class as 'final', convert to a struct, or use '@unchecked Sendable' with proper synchronization.",
      seProposal: "SE-0302",
      seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md",
    });
  }

  return issues;
}

/**
 * Check if a call_expression is a Task { } or Task.detached { } call.
 */
function isTaskCall(node: Parser.SyntaxNode, source: string): boolean {
  const first = node.child(0);
  if (!first) return false;

  // Task { ... }
  if (first.type === "simple_identifier" && getNodeText(first, source) === "Task") {
    return true;
  }

  // Task.detached { ... }
  if (first.type === "navigation_expression") {
    const target = first.childForFieldName("target");
    if (target && getNodeText(target, source) === "Task") {
      return true;
    }
  }

  return false;
}

/**
 * Collect variable names that are likely class instances from property_declarations.
 * A variable is "likely a class instance" if it's initialized with a call_expression
 * whose callee starts with an uppercase letter (ClassName() pattern).
 */
function getClassInstanceVarNames(
  statementsNode: Parser.SyntaxNode,
  source: string
): Set<string> {
  const names = new Set<string>();
  const props = getNodesByType(statementsNode, "property_declaration");

  for (const prop of props) {
    let varName: string | null = null;
    let isClassInit = false;

    for (let i = 0; i < prop.childCount; i++) {
      const child = prop.child(i)!;
      if (child.type === "pattern") {
        const boundId = child.childForFieldName("bound_identifier");
        if (boundId) {
          varName = getNodeText(boundId, source);
        }
      }
      if (child.type === "call_expression") {
        // Check if the callee is an uppercase identifier (class constructor)
        const callee = child.child(0);
        if (callee && callee.type === "simple_identifier") {
          const calleeName = getNodeText(callee, source);
          if (calleeName.length > 0 && calleeName[0] === calleeName[0].toUpperCase() && calleeName[0] !== calleeName[0].toLowerCase()) {
            isClassInit = true;
          }
        }
      }
    }

    if (varName && isClassInit) {
      names.add(varName);
    }
  }

  return names;
}

/**
 * Find identifiers used in a closure that match outer class-instance variables.
 */
function findCapturedClassInstances(
  lambda: Parser.SyntaxNode,
  classVars: Set<string>,
  source: string
): string[] {
  const captured: string[] = [];
  const identifiers = getNodesByType(lambda, "simple_identifier");

  for (const id of identifiers) {
    const name = getNodeText(id, source);
    if (classVars.has(name) && !captured.includes(name)) {
      captured.push(name);
    }
  }

  return captured;
}

/**
 * Pattern A: Detect class instances captured in Task/Task.detached closures.
 */
function checkTaskClosureCaptures(
  tree: Parser.Tree,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const callExprs = getNodesByType(tree.rootNode, "call_expression");

  for (const call of callExprs) {
    if (!isTaskCall(call, source)) continue;

    // Find the lambda_literal inside the call
    const callSuffix = call.children.find((c) => c.type === "call_suffix");
    if (!callSuffix) continue;

    const lambda = callSuffix.children.find(
      (c) => c.type === "lambda_literal"
    );
    if (!lambda) continue;

    // Find the enclosing function body or statements block to look for variable declarations
    const enclosingBody =
      findAncestor(call, "function_body") ??
      findAncestor(call, "class_body") ??
      findAncestor(call, "statements");
    if (!enclosingBody) continue;

    // Get class-instance variables declared in the enclosing scope
    const classVars = getClassInstanceVarNames(enclosingBody, source);
    if (classVars.size === 0) continue;

    // Check if any class-instance variables are captured in the closure
    const captured = findCapturedClassInstances(lambda, classVars, source);
    if (captured.length > 0) {
      const line = call.startPosition.row + 1;
      const column = call.startPosition.column + 1;

      issues.push({
        rule: ruleId,
        severity,
        message: `Non-Sendable class instance '${captured[0]}' is captured in a Task closure, crossing a concurrency boundary. This may cause data races.`,
        line,
        column,
        confidence: 0.8,
        suggestion:
          "Ensure the captured type conforms to Sendable, use an actor instead, or pass only value types across the boundary.",
        seProposal: "SE-0302",
        seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md",
      });
    }
  }

  return issues;
}

export const nonSendableBoundaryRule: Rule = {
  id: "non-sendable-boundary-crossing",
  name: "Non-Sendable Boundary Crossing",
  tier: "standard",
  severity: "warning",
  description:
    "Detects non-Sendable types crossing concurrency boundaries: non-final classes conforming to Sendable, and class instances captured in Task closures.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];

    // Pattern B: non-final class with Sendable conformance
    issues.push(
      ...checkNonFinalSendableClasses(tree, source, this.id, this.severity)
    );

    // Pattern A: class instances captured in Task closures
    issues.push(
      ...checkTaskClosureCaptures(tree, source, this.id, this.severity)
    );

    return issues;
  },
};
