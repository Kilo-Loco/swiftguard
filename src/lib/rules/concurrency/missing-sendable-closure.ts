import { getNodesByType, getNodeText, findAncestor } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

/**
 * Checks if a class_declaration node is an actor (first child is "actor" keyword).
 */
function isActorDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "actor";
}

/**
 * Checks if a class_declaration has @unchecked Sendable conformance.
 */
function hasUncheckedSendable(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (
      child.type === "attribute" &&
      getNodeText(child, source) === "@unchecked"
    ) {
      const next = node.child(i + 1);
      if (
        next &&
        next.type === "inheritance_specifier" &&
        getNodeText(next, source).includes("Sendable")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a function_type node has a @Sendable modifier.
 * In the AST, @Sendable appears as a type_modifiers sibling BEFORE the function_type.
 */
function hasSendableModifier(
  functionTypeNode: Parser.SyntaxNode,
  source: string
): boolean {
  const parent = functionTypeNode.parent;
  if (!parent) return false;

  // Look at siblings before this function_type
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)!;
    if (child.id === functionTypeNode.id) break;

    if (child.type === "type_modifiers") {
      const modText = getNodeText(child, source);
      if (modText.includes("@Sendable")) return true;
    }
  }

  return false;
}

/**
 * Gets the name of the containing declaration (property, parameter, typealias).
 */
function getContextName(
  functionTypeNode: Parser.SyntaxNode,
  source: string
): string {
  // Walk up to find property_declaration, parameter, or typealias_declaration
  let current = functionTypeNode.parent;
  while (current) {
    if (current.type === "property_declaration") {
      const pattern = current.childForFieldName("name");
      if (!pattern) {
        // Search for pattern node
        for (let i = 0; i < current.childCount; i++) {
          const child = current.child(i)!;
          if (child.type === "pattern") {
            return getNodeText(child, source);
          }
        }
      }
      return pattern ? getNodeText(pattern, source) : "property";
    }
    if (current.type === "parameter") {
      const nameNode = current.child(0);
      return nameNode ? getNodeText(nameNode, source) : "parameter";
    }
    if (current.type === "typealias_declaration") {
      for (let i = 0; i < current.childCount; i++) {
        const child = current.child(i)!;
        if (child.type === "type_identifier") {
          return getNodeText(child, source);
        }
      }
      return "typealias";
    }
    current = current.parent;
  }
  return "closure";
}

export const missingSendableClosureRule: Rule = {
  id: "missing-sendable-closure",
  name: "Missing @Sendable on Closure",
  tier: "standard",
  severity: "warning",
  description:
    "Detects closure/function type parameters and properties that are missing @Sendable in actor or @unchecked Sendable contexts.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];
    const declarations = getNodesByType(tree.rootNode, "class_declaration");

    for (const decl of declarations) {
      const isActor = isActorDeclaration(decl);
      const isUncheckedSendable = hasUncheckedSendable(decl, source);

      if (!isActor && !isUncheckedSendable) continue;

      const context = isActor ? "actor" : "@unchecked Sendable class";

      // Find all function_type nodes within this declaration
      const functionTypes = getNodesByType(decl, "function_type");

      for (const ft of functionTypes) {
        if (hasSendableModifier(ft, source)) continue;

        // Skip function_type nodes that are part of the method's own return type
        // or the method signature itself (not a closure parameter/property)
        const ancestor = ft.parent;
        if (!ancestor) continue;

        // We want function_type nodes inside:
        // - type_annotation (property type)
        // - parameter (function parameter - no type_annotation wrapper)
        // - typealias_declaration (aliased function type)
        const inTypeAnnotation = findAncestor(ft, "type_annotation") !== null;
        const inParameter = findAncestor(ft, "parameter") !== null;
        const inTypealias =
          findAncestor(ft, "typealias_declaration") !== null;

        if (!inTypeAnnotation && !inParameter && !inTypealias) continue;

        // If inside a type_annotation, make sure it's a property declaration,
        // not a function return type annotation
        if (inTypeAnnotation && !inParameter) {
          const typeAnnotation = findAncestor(ft, "type_annotation")!;
          const taParent = typeAnnotation.parent;
          if (!taParent) continue;

          if (taParent.type !== "property_declaration") {
            continue;
          }
        }

        const name = getContextName(ft, source);
        const line = ft.startPosition.row + 1;
        const column = ft.startPosition.column + 1;

        issues.push({
          rule: this.id,
          severity: this.severity,
          message: `Closure type for '${name}' in ${context} is missing @Sendable. Closures that cross concurrency boundaries must be @Sendable.`,
          line,
          column,
          confidence: 0.85,
          suggestion: `Add @Sendable before the closure type: @Sendable ${getNodeText(ft, source)}`,
        });
      }
    }

    return issues;
  },
};
