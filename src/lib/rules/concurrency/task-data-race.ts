import { getNodesByType, getNodeText, findAncestor } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

/**
 * Check if a call_expression is a Task { } or Task.detached { } call.
 */
function isTaskCall(node: Parser.SyntaxNode, source: string): boolean {
  const first = node.child(0);
  if (!first) return false;

  if (first.type === "simple_identifier" && getNodeText(first, source) === "Task") {
    return true;
  }

  if (first.type === "navigation_expression") {
    const target = first.childForFieldName("target");
    if (target && getNodeText(target, source) === "Task") {
      return true;
    }
  }

  return false;
}

/**
 * Get the lambda_literal from a Task call expression.
 */
function getTaskLambda(call: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const callSuffix = call.children.find((c) => c.type === "call_suffix");
  if (!callSuffix) return null;
  return callSuffix.children.find((c) => c.type === "lambda_literal") ?? null;
}

/**
 * Check if a class_declaration node is actually a class (not struct, actor, enum).
 */
function isClassDeclaration(node: Parser.SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "class") return true;
    if (child.type === "modifiers") continue;
    break;
  }
  return false;
}

/**
 * Check if a class_declaration has @MainActor attribute.
 */
function hasMainActorAttribute(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const mod = child.child(j)!;
        if (mod.type === "attribute") {
          const text = getNodeText(mod, source);
          if (text === "@MainActor") return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if a class_declaration is an actor.
 */
function isActorDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "actor";
}

/**
 * Collect var declaration names from a statements/function body scope.
 * Only collects vars at the direct children level (not nested).
 */
function getVarNamesInScope(
  scopeNode: Parser.SyntaxNode,
  source: string
): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < scopeNode.childCount; i++) {
    const child = scopeNode.child(i)!;
    if (child.type !== "property_declaration") continue;

    let isVar = false;
    let varName: string | null = null;

    for (let j = 0; j < child.childCount; j++) {
      const prop = child.child(j)!;
      if (
        prop.type === "value_binding_pattern" &&
        getNodeText(prop, source) === "var"
      ) {
        isVar = true;
      }
      if (prop.type === "pattern") {
        const boundId = prop.childForFieldName("bound_identifier");
        if (boundId) {
          varName = getNodeText(boundId, source);
        }
      }
    }

    if (isVar && varName) {
      names.add(varName);
    }
  }
  return names;
}

/**
 * Check if a lambda body mutates a given variable name.
 * Looks for assignment (=, +=, -=) and mutating method calls (.append, .remove, .insert).
 */
function lambdaMutatesVar(
  lambda: Parser.SyntaxNode,
  varName: string,
  source: string
): boolean {
  // Check assignments (=, +=, -=, etc.)
  const assignments = getNodesByType(lambda, "assignment");
  for (const assign of assignments) {
    // Make sure this assignment is directly inside THIS lambda, not a nested one
    const parentLambda = findAncestor(assign, "lambda_literal");
    if (parentLambda !== lambda) continue;

    const lhs = assign.child(0);
    if (!lhs) continue;
    const lhsText = getNodeText(lhs, source);
    if (lhsText === varName || lhsText.startsWith(varName + ".") || lhsText.startsWith(varName + "[")) {
      return true;
    }
  }

  // Check mutating method calls (.append, .remove, .insert)
  const callExprs = getNodesByType(lambda, "call_expression");
  for (const call of callExprs) {
    const parentLambda = findAncestor(call, "lambda_literal");
    if (parentLambda !== lambda) continue;

    const first = call.child(0);
    if (!first || first.type !== "navigation_expression") continue;

    const target = first.childForFieldName("target");
    const suffix = first.childForFieldName("suffix");
    if (!target || !suffix) continue;

    const targetText = getNodeText(target, source);
    const suffixText = getNodeText(suffix, source).replace(/^\./, "");

    if (
      targetText === varName &&
      (suffixText === "append" || suffixText === "remove" || suffixText === "insert" || suffixText === "removeAll")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a lambda body mutates self.property (assignment to self.X).
 */
function lambdaMutatesSelfProperty(
  lambda: Parser.SyntaxNode,
  source: string
): string | null {
  const assignments = getNodesByType(lambda, "assignment");
  for (const assign of assignments) {
    const parentLambda = findAncestor(assign, "lambda_literal");
    if (parentLambda !== lambda) continue;

    const lhs = assign.child(0);
    if (!lhs) continue;

    // Check for self.property pattern in LHS
    const navExprs = getNodesByType(lhs, "navigation_expression");
    for (const nav of navExprs) {
      const target = nav.childForFieldName("target");
      if (target && target.type === "self_expression") {
        const suffix = nav.childForFieldName("suffix");
        if (suffix) {
          return getNodeText(suffix, source).replace(/^\./, "");
        }
      }
    }
    // Also check if lhs itself is a navigation_expression with self
    if (lhs.type === "directly_assignable_expression") {
      const innerNavs = getNodesByType(lhs, "navigation_expression");
      for (const nav of innerNavs) {
        const target = nav.childForFieldName("target");
        if (target && target.type === "self_expression") {
          const suffix = nav.childForFieldName("suffix");
          if (suffix) {
            return getNodeText(suffix, source).replace(/^\./, "");
          }
        }
      }
    }
  }

  // Check mutating method calls on self.property
  const callExprs = getNodesByType(lambda, "call_expression");
  for (const call of callExprs) {
    const parentLambda = findAncestor(call, "lambda_literal");
    if (parentLambda !== lambda) continue;

    const first = call.child(0);
    if (!first || first.type !== "navigation_expression") continue;

    const target = first.childForFieldName("target");
    if (!target || target.type !== "navigation_expression") continue;

    const innerTarget = target.childForFieldName("target");
    if (innerTarget && innerTarget.type === "self_expression") {
      const suffix = first.childForFieldName("suffix");
      if (suffix) {
        const methodName = getNodeText(suffix, source).replace(/^\./, "");
        if (["append", "remove", "insert", "removeAll"].includes(methodName)) {
          const propSuffix = target.childForFieldName("suffix");
          if (propSuffix) {
            return getNodeText(propSuffix, source).replace(/^\./, "");
          }
        }
      }
    }
  }

  return null;
}

/**
 * Pattern A & B: var mutated inside Task closures.
 */
function checkVarMutationInTasks(
  tree: Parser.Tree,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const callExprs = getNodesByType(tree.rootNode, "call_expression");

  for (const call of callExprs) {
    if (!isTaskCall(call, source)) continue;

    const lambda = getTaskLambda(call);
    if (!lambda) continue;

    // Find the enclosing scope to look for var declarations
    const enclosingBody =
      findAncestor(call, "function_body") ??
      findAncestor(call, "statements");
    if (!enclosingBody) continue;

    // function_body contains a statements child; we need to scan that
    let scopeNode = enclosingBody;
    if (enclosingBody.type === "function_body") {
      const stmts = enclosingBody.children.find((c) => c.type === "statements");
      if (stmts) scopeNode = stmts;
    }

    const varNames = getVarNamesInScope(scopeNode, source);
    if (varNames.size === 0) continue;

    // Check if any var is mutated inside this Task lambda
    for (const varName of varNames) {
      if (lambdaMutatesVar(lambda, varName, source)) {
        // Check if multiple Task calls in the same scope mutate the same var (Pattern B)
        let multipleTasksMutate = false;
        let taskCount = 0;
        for (const otherCall of callExprs) {
          if (!isTaskCall(otherCall, source)) continue;
          const otherLambda = getTaskLambda(otherCall);
          if (!otherLambda) continue;

          // Check same enclosing scope
          const otherEnclosing =
            findAncestor(otherCall, "function_body") ??
            findAncestor(otherCall, "statements");
          if (otherEnclosing !== enclosingBody && otherEnclosing !== scopeNode) continue;

          if (lambdaMutatesVar(otherLambda, varName, source)) {
            taskCount++;
          }
        }
        if (taskCount >= 2) {
          multipleTasksMutate = true;
        }

        const line = call.startPosition.row + 1;
        const column = call.startPosition.column + 1;

        if (multipleTasksMutate) {
          issues.push({
            rule: ruleId,
            severity,
            message: `Multiple Task closures mutate shared variable '${varName}', creating a data race. Concurrent tasks have no ordering guarantees.`,
            line,
            column,
            confidence: 0.92,
            suggestion:
              "Protect shared state with an actor, use a serial DispatchQueue, or restructure to avoid shared mutable state.",
            seProposal: "SE-0304",
            seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0304-structured-concurrency.md",
          });
        } else {
          issues.push({
            rule: ruleId,
            severity,
            message: `Mutable variable '${varName}' is captured and mutated inside a Task closure, risking a data race with the enclosing scope.`,
            line,
            column,
            confidence: 0.9,
            suggestion:
              "Move the variable into the Task, protect it with an actor, or use a thread-safe container.",
            seProposal: "SE-0304",
            seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0304-structured-concurrency.md",
          });
        }
        break; // One issue per Task call is enough
      }
    }
  }

  return issues;
}

/**
 * Pattern C: class (not actor, not @MainActor) mutating self in Task.
 */
function checkClassSelfMutationInTask(
  tree: Parser.Tree,
  source: string,
  ruleId: string,
  severity: "error" | "warning" | "info"
): Issue[] {
  const issues: Issue[] = [];
  const declarations = getNodesByType(tree.rootNode, "class_declaration");

  for (const decl of declarations) {
    // Skip actors and non-classes
    if (isActorDeclaration(decl)) continue;
    if (!isClassDeclaration(decl)) continue;
    // Skip @MainActor classes
    if (hasMainActorAttribute(decl, source)) continue;

    const body = decl.childForFieldName("body");
    if (!body) continue;

    // Find Task calls inside methods of this class
    const callExprs = getNodesByType(body, "call_expression");
    for (const call of callExprs) {
      if (!isTaskCall(call, source)) continue;

      const lambda = getTaskLambda(call);
      if (!lambda) continue;

      const mutatedProp = lambdaMutatesSelfProperty(lambda, source);
      if (mutatedProp) {
        const line = call.startPosition.row + 1;
        const column = call.startPosition.column + 1;

        const nameNode = decl.childForFieldName("name");
        const className = nameNode ? getNodeText(nameNode, source) : "class";

        issues.push({
          rule: ruleId,
          severity,
          message: `Non-isolated class '${className}' mutates 'self.${mutatedProp}' inside a Task closure. Without actor isolation, this is a data race.`,
          line,
          column,
          confidence: 0.88,
          suggestion:
            "Make the class an actor, add @MainActor, or protect the property with a lock or other synchronization mechanism.",
          seProposal: "SE-0304",
          seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0304-structured-concurrency.md",
        });
      }
    }
  }

  return issues;
}

export const taskDataRaceRule: Rule = {
  id: "task-data-race-risk",
  name: "Task Data Race Risk",
  tier: "critical",
  severity: "error",
  description:
    "Detects data race risks from mutable state shared across Task boundaries: var mutations inside Task closures, multiple Tasks sharing mutable state, and non-isolated class self-mutation in Tasks.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];

    // Pattern A & B: var mutated inside Task closures
    issues.push(
      ...checkVarMutationInTasks(tree, source, this.id, this.severity)
    );

    // Pattern C: class self-mutation in Task
    issues.push(
      ...checkClassSelfMutationInTask(tree, source, this.id, this.severity)
    );

    return issues;
  },
};
