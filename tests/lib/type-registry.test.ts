import { describe, it, expect } from "vitest";
import {
  buildTypeRegistry,
  isTypeSendable,
  isLikelyErrorType,
  KNOWN_SENDABLE_TYPES,
} from "@/lib/type-registry";

describe("type-registry", () => {
  describe("buildTypeRegistry", () => {
    it("registers a struct declaration", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "struct Point { let x: Int; let y: Int }" },
      ]);
      const info = registry.get("Point");
      expect(info).toBeDefined();
      expect(info!.kind).toBe("struct");
      expect(info!.conformsToSendable).toBe(false);
    });

    it("registers a class with Sendable conformance", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "final class Config: Sendable { let key: String }",
        },
      ]);
      const info = registry.get("Config");
      expect(info).toBeDefined();
      expect(info!.kind).toBe("class");
      expect(info!.isFinal).toBe(true);
      expect(info!.conformsToSendable).toBe(true);
    });

    it("registers an actor as implicitly Sendable", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "actor Counter { var count = 0 }" },
      ]);
      const info = registry.get("Counter");
      expect(info).toBeDefined();
      expect(info!.kind).toBe("actor");
      expect(info!.conformsToSendable).toBe(true);
    });

    it("detects @unchecked Sendable", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source:
            "class ThreadSafe: @unchecked Sendable { var data: [Int] = [] }",
        },
      ]);
      const info = registry.get("ThreadSafe");
      expect(info).toBeDefined();
      expect(info!.isUncheckedSendable).toBe(true);
      expect(info!.conformsToSendable).toBe(false);
    });

    it("registers a class without Sendable", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "class Cache { var items: [String] = [] }" },
      ]);
      const info = registry.get("Cache");
      expect(info).toBeDefined();
      expect(info!.kind).toBe("class");
      expect(info!.conformsToSendable).toBe(false);
    });

    it("handles multiple files", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "struct Foo: Sendable { let x: Int }" },
        { path: "b.swift", source: "class Bar { var y: String }" },
      ]);
      expect(registry.get("Foo")!.conformsToSendable).toBe(true);
      expect(registry.get("Bar")!.conformsToSendable).toBe(false);
    });

    it("detects @MainActor attribute", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "@MainActor class ViewModel { var state = 0 }",
        },
      ]);
      const info = registry.get("ViewModel");
      expect(info).toBeDefined();
      expect(info!.isMainActor).toBe(true);
    });

    it("registers enum declaration", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "enum Direction: Sendable { case north, south, east, west }",
        },
      ]);
      const info = registry.get("Direction");
      expect(info).toBeDefined();
      expect(info!.kind).toBe("enum");
      expect(info!.conformsToSendable).toBe(true);
    });
  });

  describe("isTypeSendable", () => {
    it("returns true for known standard-library types", () => {
      expect(isTypeSendable("Int")).toBe(true);
      expect(isTypeSendable("String")).toBe(true);
      expect(isTypeSendable("URL")).toBe(true);
      expect(isTypeSendable("UUID")).toBe(true);
      expect(isTypeSendable("Array")).toBe(true);
    });

    it("returns false for unknown types without registry", () => {
      expect(isTypeSendable("MyCustomClass")).toBe(false);
    });

    it("returns true for types in registry with Sendable conformance", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "struct InstanceSocialClient: Sendable { let base: URL }",
        },
      ]);
      expect(isTypeSendable("InstanceSocialClient", registry)).toBe(true);
    });

    it("returns true for actors in registry", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "actor NetworkManager { var url: URL? }" },
      ]);
      expect(isTypeSendable("NetworkManager", registry)).toBe(true);
    });

    it("returns true for @unchecked Sendable in registry", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "class Pool: @unchecked Sendable { var items: [Int] = [] }",
        },
      ]);
      expect(isTypeSendable("Pool", registry)).toBe(true);
    });

    it("returns true for @MainActor types in registry", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "@MainActor class ViewModel { var state = 0 }",
        },
      ]);
      expect(isTypeSendable("ViewModel", registry)).toBe(true);
    });

    it("returns false for non-Sendable class in registry", () => {
      const registry = buildTypeRegistry([
        { path: "a.swift", source: "class Cache { var items: [String] = [] }" },
      ]);
      expect(isTypeSendable("Cache", registry)).toBe(false);
    });

    it("registry shadows known-Sendable list for local types", () => {
      // A local Logger class should NOT be treated as Sendable
      // even though os.Logger is in KNOWN_SENDABLE_TYPES
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "class Logger { var entries: [String] = [] }",
        },
      ]);
      expect(KNOWN_SENDABLE_TYPES.has("Logger")).toBe(true);
      expect(isTypeSendable("Logger", registry)).toBe(false);
    });
  });

  describe("isLikelyErrorType", () => {
    it("returns true for types ending in Error", () => {
      expect(isLikelyErrorType("NetworkError")).toBe(true);
      expect(isLikelyErrorType("ValidationError")).toBe(true);
    });

    it("returns false for short names", () => {
      expect(isLikelyErrorType("Error")).toBe(false);
    });

    it("returns false for non-Error types", () => {
      expect(isLikelyErrorType("Cache")).toBe(false);
      expect(isLikelyErrorType("Logger")).toBe(false);
    });
  });
});
