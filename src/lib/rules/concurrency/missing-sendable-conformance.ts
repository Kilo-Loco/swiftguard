import { getNodesByType, getNodeText } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

// Built-in types that are already Sendable
const BUILTIN_SENDABLE_TYPES = new Set([
  "String",
  "Int",
  "Double",
  "Float",
  "Bool",
  "UInt",
  "Int8",
  "Int16",
  "Int32",
  "Int64",
  "UInt8",
  "UInt16",
  "UInt32",
  "UInt64",
  "Character",
  "Data",
  "Date",
  "URL",
  "UUID",
  "Void",
  "Error",
  "Never",
  "Any",
  "AnyObject",
  "Optional",
  "Array",
  "Dictionary",
  "Set",
]);

/**
 * Checks if a class_declaration is an actor.
 */
function isActorDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "actor";
}

/**
 * Checks if a class_declaration is a struct.
 */
function isStructDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "struct";
}

/**
 * Checks if a class_declaration is an enum.
 */
function isEnumDeclaration(node: Parser.SyntaxNode): boolean {
  const first = node.child(0);
  return first !== null && first.type === "enum";
}

/**
 * Gets the name of a class_declaration (struct, enum, class, actor).
 */
function getDeclName(
  node: Parser.SyntaxNode,
  source: string
): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "type_identifier") {
      return getNodeText(child, source);
    }
  }
  return null;
}

/**
 * Checks if a declaration conforms to Sendable (including @unchecked Sendable).
 */
function hasSendableConformance(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "inheritance_specifier") {
      const text = getNodeText(child, source);
      if (text.includes("Sendable")) return true;
    }
  }
  return false;
}

/**
 * Collects all user-defined type names referenced as parameter types
 * in actor methods.
 */
function getActorMethodParamTypes(
  actorDecl: Parser.SyntaxNode,
  source: string
): Set<string> {
  const types = new Set<string>();
  const functions = getNodesByType(actorDecl, "function_declaration");

  for (const fn of functions) {
    const params = getNodesByType(fn, "parameter");
    for (const param of params) {
      // Look for user_type > type_identifier as the parameter type
      for (let i = 0; i < param.childCount; i++) {
        const child = param.child(i)!;
        if (child.type === "user_type") {
          const typeId = child.child(0);
          if (typeId && typeId.type === "type_identifier") {
            const typeName = getNodeText(typeId, source);
            if (!BUILTIN_SENDABLE_TYPES.has(typeName)) {
              types.add(typeName);
            }
          }
        }
      }
    }
  }

  return types;
}

export const missingSendableConformanceRule: Rule = {
  id: "missing-sendable-conformance",
  name: "Missing Sendable Conformance",
  tier: "standard",
  severity: "info",
  description:
    "Detects structs and enums used as actor method parameters that don't conform to Sendable.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];
    const declarations = getNodesByType(tree.rootNode, "class_declaration");

    // Collect all struct/enum declarations in the file (non-actor, non-class)
    const typeDecls = new Map<
      string,
      { node: Parser.SyntaxNode; kind: "struct" | "enum" }
    >();

    for (const decl of declarations) {
      if (isStructDeclaration(decl)) {
        const name = getDeclName(decl, source);
        if (name && !hasSendableConformance(decl, source)) {
          typeDecls.set(name, { node: decl, kind: "struct" });
        }
      } else if (isEnumDeclaration(decl)) {
        const name = getDeclName(decl, source);
        if (name && !hasSendableConformance(decl, source)) {
          typeDecls.set(name, { node: decl, kind: "enum" });
        }
      }
    }

    if (typeDecls.size === 0) return issues;

    // Find all actor declarations and collect their parameter types
    const referencedTypes = new Set<string>();

    for (const decl of declarations) {
      if (!isActorDeclaration(decl)) continue;
      const paramTypes = getActorMethodParamTypes(decl, source);
      for (const t of paramTypes) {
        referencedTypes.add(t);
      }
    }

    // Flag struct/enum types that are used in actor methods but lack Sendable
    for (const typeName of referencedTypes) {
      const entry = typeDecls.get(typeName);
      if (!entry) continue;

      const { node, kind } = entry;
      const line = node.startPosition.row + 1;
      const column = node.startPosition.column + 1;

      issues.push({
        rule: this.id,
        severity: this.severity,
        message: `${kind === "struct" ? "Struct" : "Enum"} '${typeName}' is used as an actor method parameter but does not conform to Sendable. Types crossing actor boundaries should be Sendable.`,
        line,
        column,
        confidence: 0.75,
        suggestion: `Add Sendable conformance: ${kind} ${typeName}: Sendable { ... }`,
        seProposal: "SE-0302",
        seProposalUrl: "https://github.com/swiftlang/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md",
      });
    }

    return issues;
  },
};
