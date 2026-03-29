import { parseSwift, getNodesByType, getNodeText } from "./parser";
import type Parser from "tree-sitter";

export interface TypeInfo {
  name: string;
  kind: "class" | "struct" | "enum" | "actor" | "protocol";
  isFinal: boolean;
  conformsToSendable: boolean;
  isUncheckedSendable: boolean;
  isMainActor: boolean;
  file: string;
}

export type TypeRegistry = Map<string, TypeInfo>;

/**
 * Types from the Swift standard library, Foundation, SwiftUI, and common
 * frameworks that are known to be Sendable. This lets us skip flagging
 * well-known value/frozen types even when we have no source for them.
 */
export const KNOWN_SENDABLE_TYPES = new Set([
  // Swift Standard Library — value types
  "Int", "String", "Bool", "Double", "Float",
  "UInt", "Int8", "Int16", "Int32", "Int64",
  "UInt8", "UInt16", "UInt32", "UInt64",
  "Character", "Unicode",
  "Optional", "Result",

  // Foundation — value types
  "URL", "UUID", "Data", "Date", "Decimal", "IndexPath",
  "Locale", "TimeZone", "Calendar", "DateComponents", "DateInterval",
  "Measurement", "URLRequest", "URLResponse", "HTTPURLResponse",
  "JSONEncoder", "JSONDecoder",
  "PropertyListEncoder", "PropertyListDecoder",
  "Notification", "AttributedString",

  // Foundation — reference types that are Sendable
  "Encoder", "Decoder",
  "NSRegularExpression",
  "ProcessInfo",
  "Bundle",
  "FileManager",
  "UserDefaults",
  "NotificationCenter",
  "URLSession",
  "Timer",
  "RunLoop",

  // Collections — value types
  "Array", "Dictionary", "Set", "Range", "ClosedRange",

  // Concurrency primitives
  "Task", "TaskGroup", "ThrowingTaskGroup",
  "AsyncStream", "AsyncThrowingStream",
  "CheckedContinuation", "UnsafeContinuation",
  "MainActor",

  // Synchronization primitives (always Sendable)
  "ManagedAtomic", "UnsafeAtomic",
  "ManagedAtomicLazyReference", "UnsafeAtomicLazyReference",
  "OSAllocatedUnfairLock", "Mutex", "ManagedBuffer",
  "NIOLoopBound", "NIOLoopBoundBox",

  // SwiftUI — value types
  "Color", "Font", "Image", "Text", "EdgeInsets",
  "CGFloat", "CGPoint", "CGSize", "CGRect",
  "Alignment", "Edge", "UnitPoint", "Angle", "Animation",

  // SwiftUI — property wrappers and additional types
  "Binding", "State", "Environment", "EnvironmentObject",
  "ObservedObject", "StateObject",
  "NavigationPath", "DismissAction", "OpenURLAction",
  "ScenePhase", "ColorScheme",
  "AnyTransition", "Transaction",

  // Combine
  "PassthroughSubject", "CurrentValueSubject",
  "AnyCancellable", "AnyPublisher",

  // Common patterns
  "Void", "Never", "StaticString", "CodingKey",
  "DispatchQueue", "OperationQueue",

  // os / system
  "Logger", "OSLog",

  // Error protocol itself is Sendable
  "Error",
]);

/**
 * Determine the keyword-kind for a class_declaration node.
 * tree-sitter-swift re-uses class_declaration for class, struct, actor, enum.
 */
function resolveKind(
  node: Parser.SyntaxNode,
  source: string
): TypeInfo["kind"] | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    switch (child.type) {
      case "class":
        return "class";
      case "struct":
        return "struct";
      case "enum":
        return "enum";
      case "actor":
        return "actor";
      case "protocol":
        return "protocol";
      case "modifiers":
        continue;
      default:
        // Also check text for keywords the grammar may expose as generic tokens
        {
          const text = getNodeText(child, source);
          if (text === "struct") return "struct";
          if (text === "enum") return "enum";
          if (text === "actor") return "actor";
          if (text === "protocol") return "protocol";
        }
        return null;
    }
  }
  return null;
}

/** Check for `final` in the modifiers of a declaration node. */
function hasFinalModifier(node: Parser.SyntaxNode, source: string): boolean {
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

/** Check for @MainActor attribute on a declaration. */
function hasMainActorAttribute(
  node: Parser.SyntaxNode,
  source: string
): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)!;
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const mod = child.child(j)!;
        if (
          mod.type === "attribute" &&
          getNodeText(mod, source).includes("MainActor")
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Inspect the inheritance clause of a type declaration.
 * Returns { sendable, unchecked } flags.
 */
function parseSendableConformance(
  node: Parser.SyntaxNode,
  source: string
): { sendable: boolean; unchecked: boolean } {
  let sendable = false;
  let unchecked = false;

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
      const prev = children[i - 1];
      if (
        prev &&
        prev.type === "attribute" &&
        getNodeText(prev, source) === "@unchecked"
      ) {
        unchecked = true;
      } else {
        sendable = true;
      }
    }
  }

  return { sendable, unchecked };
}

/**
 * Process a single type declaration node and register it.
 */
function registerTypeDeclaration(
  node: Parser.SyntaxNode,
  source: string,
  file: string,
  registry: TypeRegistry
): void {
  const kind = resolveKind(node, source);
  if (!kind) return;

  const nameNode = node.childForFieldName("name");
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  if (!name) return;

  const { sendable, unchecked } = parseSendableConformance(node, source);

  const info: TypeInfo = {
    name,
    kind,
    isFinal: hasFinalModifier(node, source),
    conformsToSendable: sendable || kind === "actor", // actors are implicitly Sendable
    isUncheckedSendable: unchecked,
    isMainActor: hasMainActorAttribute(node, source),
    file,
  };

  // If we already have this type registered, merge — a later extension
  // adding Sendable should mark it as conforming.
  const existing = registry.get(name);
  if (existing) {
    existing.conformsToSendable =
      existing.conformsToSendable || info.conformsToSendable;
    existing.isUncheckedSendable =
      existing.isUncheckedSendable || info.isUncheckedSendable;
    existing.isMainActor = existing.isMainActor || info.isMainActor;
  } else {
    registry.set(name, info);
  }
}

/**
 * Process `extension TypeName: Sendable {}` — adds conformance to an
 * already-registered type or creates a stub entry.
 */
function registerExtension(
  node: Parser.SyntaxNode,
  source: string,
  file: string,
  registry: TypeRegistry
): void {
  // extension nodes: first child after "extension" keyword is the type name,
  // then optionally inheritance_specifier children
  let typeName: string | null = null;
  const children: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    children.push(node.child(i)!);
  }

  // Find the type identifier in the extension
  for (const child of children) {
    if (
      child.type === "user_type" ||
      child.type === "type_identifier" ||
      child.type === "simple_identifier"
    ) {
      typeName = getNodeText(child, source);
      break;
    }
  }

  if (!typeName) return;

  const { sendable, unchecked } = parseSendableConformance(node, source);
  if (!sendable && !unchecked) return; // extension doesn't add Sendable

  const mainActor = hasMainActorAttribute(node, source);

  const existing = registry.get(typeName);
  if (existing) {
    existing.conformsToSendable = existing.conformsToSendable || sendable;
    existing.isUncheckedSendable = existing.isUncheckedSendable || unchecked;
    existing.isMainActor = existing.isMainActor || mainActor;
  } else {
    // Create a stub — we know it's Sendable but don't know the full kind
    registry.set(typeName, {
      name: typeName,
      kind: "struct", // best guess for stub
      isFinal: false,
      conformsToSendable: sendable,
      isUncheckedSendable: unchecked,
      isMainActor: mainActor,
      file,
    });
  }
}

/**
 * Build a TypeRegistry from a collection of Swift source files.
 * This is the "first pass" — it walks every file's AST looking only
 * for type declarations and extensions that add Sendable conformance.
 */
export function buildTypeRegistry(
  files: { path: string; source: string }[]
): TypeRegistry {
  const registry: TypeRegistry = new Map();

  for (const file of files) {
    const tree = parseSwift(file.source);
    const root = tree.rootNode;

    // Type declarations (class, struct, enum, actor, protocol)
    const declarations = getNodesByType(root, "class_declaration");
    for (const decl of declarations) {
      registerTypeDeclaration(decl, file.source, file.path, registry);
    }

    // Extensions that may add Sendable conformance
    const extensions = getNodesByType(root, "class_declaration").length
      ? [] // already scanned
      : [];
    // tree-sitter-swift doesn't always have a distinct node type for extensions.
    // Check for "extension" nodes directly:
    const extNodes: Parser.SyntaxNode[] = [];
    const cursor = root.walk();
    function walkForExtensions(): void {
      const node = cursor.currentNode;
      if (node.type === "class_declaration") {
        // Check if this is actually an extension
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)!;
          if (child.type === "extension") {
            extNodes.push(node);
            break;
          }
          if (child.type === "modifiers") continue;
          break;
        }
      }
      if (cursor.gotoFirstChild()) {
        do {
          walkForExtensions();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    }
    walkForExtensions();

    for (const ext of extNodes) {
      registerExtension(ext, file.source, file.path, registry);
    }
  }

  return registry;
}

/**
 * Check whether a type name is known to be Sendable — either from the
 * registry (project types) or from the hardcoded standard-library list.
 *
 * If the type exists in the registry, the registry is authoritative —
 * a project-local `Logger` class shadows the system `Logger` in
 * KNOWN_SENDABLE_TYPES.
 */
export function isTypeSendable(
  typeName: string,
  registry?: TypeRegistry
): boolean {
  // 1. Check the project type registry first — it is authoritative
  if (registry) {
    const info = registry.get(typeName);
    if (info) {
      return (
        info.conformsToSendable ||
        info.isUncheckedSendable ||
        info.isMainActor ||
        info.kind === "actor"
      );
    }
  }

  // 2. Fall back to known standard-library / framework types
  if (KNOWN_SENDABLE_TYPES.has(typeName)) return true;

  // 3. Heuristic: types starting with "Managed" or "Unsafe" followed by "Atomic"
  //    are very likely Sendable synchronization primitives.
  if (
    (typeName.startsWith("Managed") || typeName.startsWith("Unsafe")) &&
    typeName.includes("Atomic")
  ) {
    return true;
  }

  return false;
}

/**
 * Heuristic: type names ending in "Error" are very likely enums
 * conforming to Swift.Error (which is Sendable).
 */
export function isLikelyErrorType(typeName: string): boolean {
  return typeName.endsWith("Error") && typeName.length > 5;
}
