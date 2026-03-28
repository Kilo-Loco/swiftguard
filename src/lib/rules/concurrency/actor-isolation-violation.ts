import { getNodesByType, getNodeText, findAncestor } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

/**
 * Check if a class_declaration is an actor (not a class/struct).
 */
function isActorDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "actor";
}

/**
 * Check if a function_declaration has the `nonisolated` modifier.
 */
function hasNonisolatedModifier(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const mod = child.child(j)!;
        if (
          mod.type === "member_modifier" &&
          getNodeText(mod, source) === "nonisolated"
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Collect names of mutable stored properties (var, not computed) from an actor body.
 */
function getMutableStoredPropertyNames(
  body: Parser.SyntaxNode,
  source: string
): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i)!;
    if (child.type !== "property_declaration") continue;

    let isVar = false;
    let isComputed = false;
    let propName: string | null = null;

    for (let j = 0; j < child.childCount; j++) {
      const prop = child.child(j)!;
      if (
        prop.type === "value_binding_pattern" &&
        getNodeText(prop, source) === "var"
      ) {
        isVar = true;
      }
      if (prop.type === "computed_property") {
        isComputed = true;
      }
      if (prop.type === "pattern") {
        const boundId = prop.childForFieldName("bound_identifier");
        if (boundId) {
          propName = getNodeText(boundId, source);
        }
      }
    }

    if (isVar && !isComputed && propName) {
      names.add(propName);
    }
  }
  return names;
}

/**
 * Check if a call_expression is a Task.detached call.
 */
function isTaskDetachedCall(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  // Task.detached { ... } is a call_expression whose function is a navigation_expression
  // with target "Task" and suffix "detached"
  const firstChild = node.child(0);
  if (!firstChild || firstChild.type !== "navigation_expression") return false;

  const target = firstChild.childForFieldName("target");
  const suffix = firstChild.childForFieldName("suffix");
  if (!target || !suffix) return false;

  return (
    getNodeText(target, source) === "Task" &&
    getNodeText(suffix, source).includes("detached")
  );
}

/**
 * Check if a node's subtree contains self.property access patterns.
 */
function containsSelfPropertyAccess(node: Parser.SyntaxNode): boolean {
  const navExprs = getNodesByType(node, "navigation_expression");
  for (const nav of navExprs) {
    const target = nav.childForFieldName("target");
    if (target && target.type === "self_expression") {
      return true;
    }
  }
  return false;
}

/**
 * Check if a nonisolated function/property body references any mutable stored properties.
 */
function referencesProperties(
  body: Parser.SyntaxNode,
  source: string,
  mutableProps: Set<string>
): string[] {
  const referenced: string[] = [];
  const identifiers = getNodesByType(body, "simple_identifier");
  for (const id of identifiers) {
    const name = getNodeText(id, source);
    if (mutableProps.has(name)) {
      referenced.push(name);
    }
  }
  // Also check navigation_expression with self.propName
  const navExprs = getNodesByType(body, "navigation_expression");
  for (const nav of navExprs) {
    const target = nav.childForFieldName("target");
    const suffix = nav.childForFieldName("suffix");
    if (target && target.type === "self_expression" && suffix) {
      const suffixText = getNodeText(suffix, source).replace(/^\./, "");
      if (mutableProps.has(suffixText)) {
        if (!referenced.includes(suffixText)) {
          referenced.push(suffixText);
        }
      }
    }
  }
  return referenced;
}

/**
 * Pattern B: Find Task.detached closures inside actor methods that access self properties.
 */
function checkTaskDetachedViolations(
  actorDecl: Parser.SyntaxNode,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const body = actorDecl.childForFieldName("body");
  if (!body) return issues;

  const callExprs = getNodesByType(body, "call_expression");
  for (const call of callExprs) {
    if (!isTaskDetachedCall(call, source)) continue;

    // Find the lambda_literal inside the call
    const callSuffix = call.children.find((c) => c.type === "call_suffix");
    if (!callSuffix) continue;

    const lambda = callSuffix.children.find(
      (c) => c.type === "lambda_literal"
    );
    if (!lambda) continue;

    if (containsSelfPropertyAccess(lambda)) {
      const line = call.startPosition.row + 1;
      const column = call.startPosition.column + 1;
      issues.push({
        rule: ruleId,
        severity,
        message:
          "Actor-isolated state accessed in Task.detached closure. Detached tasks are non-isolated and cannot safely access actor state without 'await'.",
        line,
        column,
        confidence: 0.92,
        suggestion:
          "Use 'Task { }' instead of 'Task.detached { }' to inherit actor isolation, or access actor state with 'await'.",
      });
    }
  }

  return issues;
}

/**
 * Pattern C: Find nonisolated methods/properties that access mutable stored properties.
 */
function checkNonisolatedViolations(
  actorDecl: Parser.SyntaxNode,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const body = actorDecl.childForFieldName("body");
  if (!body) return issues;

  const mutableProps = getMutableStoredPropertyNames(body, source);
  if (mutableProps.size === 0) return issues;

  // Check function declarations
  const funcs = getNodesByType(body, "function_declaration");
  for (const func of funcs) {
    // Only check functions directly inside THIS actor's body
    const parentBody = func.parent;
    if (parentBody !== body) continue;

    if (!hasNonisolatedModifier(func, source)) continue;

    const funcBody = func.childForFieldName("body");
    if (!funcBody) continue;

    const refs = referencesProperties(funcBody, source, mutableProps);
    if (refs.length > 0) {
      const line = func.startPosition.row + 1;
      const column = func.startPosition.column + 1;
      issues.push({
        rule: ruleId,
        severity,
        message: `nonisolated method accesses actor-isolated mutable state '${refs[0]}'. nonisolated methods cannot access mutable stored properties.`,
        line,
        column,
        confidence: 0.95,
        suggestion:
          "Remove 'nonisolated' to keep actor isolation, or change the accessed property to 'let'.",
      });
    }
  }

  // Check nonisolated computed properties that reference mutable state
  const props = getNodesByType(body, "property_declaration");
  for (const prop of props) {
    if (prop.parent !== body) continue;
    if (!hasNonisolatedModifier(prop, source)) continue;

    // Check if it's a computed property accessing mutable state
    let hasComputed = false;
    for (let i = 0; i < prop.childCount; i++) {
      if (prop.child(i)!.type === "computed_property") {
        hasComputed = true;
        const computedBody = prop.child(i)!;
        const refs = referencesProperties(computedBody, source, mutableProps);
        if (refs.length > 0) {
          const line = prop.startPosition.row + 1;
          const column = prop.startPosition.column + 1;
          issues.push({
            rule: ruleId,
            severity,
            message: `nonisolated computed property accesses actor-isolated mutable state '${refs[0]}'. nonisolated members cannot access mutable stored properties.`,
            line,
            column,
            confidence: 0.95,
            suggestion:
              "Remove 'nonisolated' to keep actor isolation, or change the accessed property to 'let'.",
          });
        }
      }
    }

    // Skip non-computed nonisolated properties (they might be fine)
    if (!hasComputed) continue;
  }

  return issues;
}

/**
 * Pattern A: Non-async actor method accessing another actor instance's properties.
 */
function checkCrossActorViolations(
  actorDecl: Parser.SyntaxNode,
  source: string,
  actorName: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const body = actorDecl.childForFieldName("body");
  if (!body) return issues;

  const funcs = getNodesByType(body, "function_declaration");
  for (const func of funcs) {
    if (func.parent !== body) continue;

    // Check if function is async
    let isAsync = false;
    for (let i = 0; i < func.childCount; i++) {
      if (func.child(i)!.type === "async") {
        isAsync = true;
        break;
      }
    }
    if (isAsync) continue;

    // Collect parameter names that are of the same actor type
    const actorParams: string[] = [];
    for (let i = 0; i < func.childCount; i++) {
      const child = func.child(i)!;
      if (child.type === "parameter") {
        const paramName = child.childForFieldName("name");
        const paramType = child.children.find(
          (c) => c.type === "user_type" || c.type === "type_identifier"
        );
        if (paramName && paramType) {
          const typeName = getNodeText(paramType, source);
          if (typeName === actorName) {
            actorParams.push(getNodeText(paramName, source));
          }
        }
      }
    }

    if (actorParams.length === 0) continue;

    // Check if function body accesses properties on those parameters
    const funcBody = func.childForFieldName("body");
    if (!funcBody) continue;

    const navExprs = getNodesByType(funcBody, "navigation_expression");
    for (const nav of navExprs) {
      const target = nav.childForFieldName("target");
      if (!target) continue;
      const targetText = getNodeText(target, source);
      if (actorParams.includes(targetText)) {
        // This is accessing a property on another actor instance in a non-async method
        const line = nav.startPosition.row + 1;
        const column = nav.startPosition.column + 1;
        issues.push({
          rule: ruleId,
          severity,
          message: `Cross-actor property access '${getNodeText(nav, source)}' in non-async method. Cross-actor references require 'await' and an async context.`,
          line,
          column,
          confidence: 0.85,
          suggestion:
            "Mark the method as 'async' and use 'await' for cross-actor property access.",
        });
        break; // One issue per function is enough
      }
    }
  }

  return issues;
}

export const actorIsolationViolationRule: Rule = {
  id: "actor-isolation-violation",
  name: "Actor Isolation Violation",
  tier: "critical",
  severity: "error",
  description:
    "Detects actor isolation violations: accessing actor state in Task.detached closures, nonisolated methods accessing mutable state, and cross-actor property access without async/await.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];
    const declarations = getNodesByType(tree.rootNode, "class_declaration");

    for (const decl of declarations) {
      if (!isActorDeclaration(decl)) continue;

      const nameNode = decl.childForFieldName("name");
      const actorName = nameNode ? getNodeText(nameNode, source) : "";

      // Pattern B: Task.detached accessing self state
      issues.push(
        ...checkTaskDetachedViolations(decl, source, this.id, this.severity)
      );

      // Pattern C: nonisolated accessing mutable state
      issues.push(
        ...checkNonisolatedViolations(decl, source, this.id, this.severity)
      );

      // Pattern A: Cross-actor property access in non-async methods
      issues.push(
        ...checkCrossActorViolations(
          decl,
          source,
          actorName,
          this.id,
          this.severity
        )
      );
    }

    return issues;
  },
};
