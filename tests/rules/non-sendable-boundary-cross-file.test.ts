import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { nonSendableBoundaryRule } from "@/lib/rules/concurrency/non-sendable-boundary";
import { buildTypeRegistry } from "@/lib/type-registry";
import type { TypeRegistry } from "@/lib/type-registry";

/**
 * Helper: check a single file with a pre-built TypeRegistry.
 */
const checkWithRegistry = (source: string, registry: TypeRegistry) => {
  const tree = parseSwift(source);
  return nonSendableBoundaryRule.check(tree, source, registry);
};

describe("non-sendable-boundary-crossing with TypeRegistry", () => {
  describe("cross-file Sendable resolution", () => {
    it("skips struct with Sendable conformance declared in another file", () => {
      // File A declares the struct as Sendable
      // File B uses it in a Task closure — should NOT flag
      const registry = buildTypeRegistry([
        {
          path: "Models/Client.swift",
          source: "struct InstanceSocialClient: Sendable { let base: URL }",
        },
        {
          path: "Views/Timeline.swift",
          source: `
func loadTimeline() {
    let client = InstanceSocialClient()
    Task {
        client.fetch()
    }
}`,
        },
      ]);

      const issues = checkWithRegistry(
        `
func loadTimeline() {
    let client = InstanceSocialClient()
    Task {
        client.fetch()
    }
}`,
        registry
      );
      expect(issues).toHaveLength(0);
    });

    it("skips final class with Sendable conformance from another file", () => {
      const registry = buildTypeRegistry([
        {
          path: "Network/MastodonClient.swift",
          source: "final class MastodonClient: Sendable { let url: URL }",
        },
        {
          path: "Views/Feed.swift",
          source: `
func fetchFeed() {
    let client = MastodonClient()
    Task {
        client.load()
    }
}`,
        },
      ]);

      const issues = checkWithRegistry(
        `
func fetchFeed() {
    let client = MastodonClient()
    Task {
        client.load()
    }
}`,
        registry
      );
      expect(issues).toHaveLength(0);
    });

    it("skips actor instances captured in Task closures", () => {
      const registry = buildTypeRegistry([
        {
          path: "Services/Store.swift",
          source: "actor DataStore { var items: [String] = [] }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func save() {
    let store = DataStore()
    Task {
        await store.add("item")
    }
}`,
        registry
      );
      expect(issues).toHaveLength(0);
    });

    it("skips @MainActor class instances", () => {
      const registry = buildTypeRegistry([
        {
          path: "ViewModels/VM.swift",
          source: "@MainActor class SettingsViewModel { var count = 0 }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func update() {
    let vm = SettingsViewModel()
    Task {
        vm.refresh()
    }
}`,
        registry
      );
      expect(issues).toHaveLength(0);
    });

    it("skips @unchecked Sendable class instances", () => {
      const registry = buildTypeRegistry([
        {
          path: "Utils/Pool.swift",
          source:
            "class ConnectionPool: @unchecked Sendable { var connections: [Int] = [] }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func connect() {
    let pool = ConnectionPool()
    Task {
        pool.acquire()
    }
}`,
        registry
      );
      expect(issues).toHaveLength(0);
    });

    it("still flags non-Sendable class from another file", () => {
      const registry = buildTypeRegistry([
        {
          path: "Models/Cache.swift",
          source: "class Cache { var items: [String] = [] }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func loadData() {
    let cache = Cache()
    Task {
        cache.items.append("data")
    }
}`,
        registry
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("cache");
    });

    it("local class shadows known-Sendable type (Logger)", () => {
      // Project defines its own Logger class — should still flag
      const registry = buildTypeRegistry([
        {
          path: "Utils/Logger.swift",
          source: "class Logger { var entries: [String] = [] }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func log() {
    let logger = Logger()
    Task {
        logger.entries.append("log")
    }
}`,
        registry
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("logger");
    });

    it("lowers confidence for Error-like types", () => {
      const registry = buildTypeRegistry([
        {
          path: "Errors/NetworkError.swift",
          source:
            "class NetworkError { var message: String = '' }",
        },
      ]);

      const issues = checkWithRegistry(
        `
func handle() {
    let err = NetworkError()
    Task {
        print(err)
    }
}`,
        registry
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].confidence).toBe(0.5);
    });
  });

  describe("Pattern B still works with registry", () => {
    it("still flags non-final Sendable class even with registry", () => {
      const registry = buildTypeRegistry([
        {
          path: "a.swift",
          source: "class SharedState: Sendable { let value: Int = 42 }",
        },
      ]);

      const issues = checkWithRegistry(
        `class SharedState: Sendable { let value: Int = 42 }`,
        registry
      );
      expect(issues).toHaveLength(1);
      expect(issues[0].confidence).toBe(0.95);
    });
  });
});
