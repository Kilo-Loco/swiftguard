import { getNodesByType, getNodeText } from "@/lib/parser";
import type Parser from "tree-sitter";
import type { Issue } from "@/types/api";
import type { Rule } from "../types";

const SYNC_TYPES = new Set([
  "NSLock",
  "NSRecursiveLock",
  "OSAllocatedUnfairLock",
  "Mutex",
  "DispatchQueue",
  "DispatchSemaphore",
  "UnfairLock",
  "Lock",
  "pthread_mutex_t",
  "UnsafeAtomic",
  "ManagedAtomic",
  "ManagedBuffer",
  "UnsafeMutablePointer",
]);

const SYNC_METHOD_PATTERNS =
  /\b(lock|unlock|sync|withLock|withCriticalRegion|withUnsafe\w*|atomic\w*|compare\w*|exchange|CAS)\s*[\({]/;

// Case-insensitive substring patterns for property/type names
const SYNC_KEYWORD_PATTERNS =
  /(?:atomic|unfair|mutex|semaphore|lock|queue)/i;

// Import statements that indicate synchronization module usage
const SYNC_IMPORT_MODULES = [
  "Synchronization",
  "Atomics",
  "os.lock",
  "Darwin",
];

function hasUncheckedSendable(
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
      child.type === "attribute" &&
      getNodeText(child, source) === "@unchecked"
    ) {
      // The next sibling should be an inheritance_specifier with "Sendable"
      const next = children[i + 1];
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

function hasMutableStoredProperties(
  body: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i)!;
    if (child.type !== "property_declaration") continue;

    // Check if it's a `var` (not `let`)
    let isVar = false;
    let isComputed = false;
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
    }

    if (isVar && !isComputed) return true;
  }
  return false;
}

function hasSyncImports(
  root: Parser.SyntaxNode,
  source: string
): boolean {
  const imports = getNodesByType(root, "import_declaration");
  for (const imp of imports) {
    const impText = getNodeText(imp, source);
    for (const mod of SYNC_IMPORT_MODULES) {
      if (impText.includes(mod)) return true;
    }
  }
  return false;
}

function hasSynchronizationEvidence(
  body: Parser.SyntaxNode,
  source: string,
  root: Parser.SyntaxNode
): boolean {
  const bodyText = getNodeText(body, source);

  // Check for sync method call patterns in the body text
  if (SYNC_METHOD_PATTERNS.test(bodyText)) return true;

  // Check property types and initializer calls for sync primitives
  const properties = getNodesByType(body, "property_declaration");
  for (const prop of properties) {
    const propText = getNodeText(prop, source);
    for (const syncType of SYNC_TYPES) {
      if (propText.includes(syncType)) return true;
    }
    // Check property names and types for sync keyword patterns
    if (SYNC_KEYWORD_PATTERNS.test(propText)) return true;
  }

  // Check imports for known synchronization modules
  if (hasSyncImports(root, source)) return true;

  return false;
}

function hasComplexInheritance(
  decl: Parser.SyntaxNode,
  source: string
): boolean {
  // Check if the class inherits from another class (not just protocols)
  // by looking for inheritance_specifier nodes that are NOT the Sendable conformance
  for (let i = 0; i < decl.childCount; i++) {
    const child = decl.child(i)!;
    if (child.type === "inheritance_specifier") {
      const text = getNodeText(child, source);
      if (!text.includes("Sendable")) {
        return true;
      }
    }
  }
  return false;
}

export const unsafeUncheckedSendableRule: Rule = {
  id: "unsafe-unchecked-sendable",
  name: "Unsafe @unchecked Sendable",
  tier: "critical",
  severity: "warning",
  description:
    "Detects classes or structs conforming to @unchecked Sendable with mutable stored properties but no visible synchronization.",

  check(tree, source): Issue[] {
    const issues: Issue[] = [];
    const declarations = getNodesByType(tree.rootNode, "class_declaration");

    for (const decl of declarations) {
      if (!hasUncheckedSendable(decl, source)) continue;

      const body = decl.childForFieldName("body");
      if (!body) continue;

      if (!hasMutableStoredProperties(body, source)) continue;
      if (hasSynchronizationEvidence(body, source, tree.rootNode)) continue;

      const nameNode = decl.childForFieldName("name");
      const name = nameNode ? getNodeText(nameNode, source) : "Unknown";
      const line = decl.startPosition.row + 1;
      const column = decl.startPosition.column + 1;

      // Lower confidence for classes with complex inheritance (parent may provide sync)
      const confidence = hasComplexInheritance(decl, source) ? 0.85 : 0.9;

      issues.push({
        rule: this.id,
        severity: this.severity,
        message: `'${name}' conforms to @unchecked Sendable with mutable stored properties but has no visible synchronization. This is likely a thread-safety bug.`,
        line,
        column,
        confidence,
        suggestion:
          "Add synchronization (NSLock, DispatchQueue, OSAllocatedUnfairLock, etc.), make properties immutable (let), or convert to an actor.",
      });
    }

    return issues;
  },
};
