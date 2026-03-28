import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { unsafeUncheckedSendableRule } from "@/lib/rules/concurrency/unsafe-unchecked-sendable";

const check = (source: string) => {
  const tree = parseSwift(source);
  return unsafeUncheckedSendableRule.check(tree, source);
};

describe("unsafe-unchecked-sendable rule", () => {
  describe("true positives (should flag)", () => {
    it("flags basic class with @unchecked Sendable and var properties", () => {
      const issues = check(`
class UserCache: @unchecked Sendable {
    var users: [String] = []
    var lastUpdate: Date?
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("unsafe-unchecked-sendable");
      expect(issues[0].severity).toBe("warning");
      expect(issues[0].confidence).toBe(0.9);
      expect(issues[0].message).toContain("UserCache");
    });

    it("flags struct with @unchecked Sendable and var properties", () => {
      const issues = check(`
struct Config: @unchecked Sendable {
    var apiKey: String
    var timeout: Int
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("Config");
    });

    it("flags class inheriting from another class with @unchecked Sendable (lower confidence)", () => {
      const issues = check(`
class NetworkManager: BaseManager, @unchecked Sendable {
    var session: URLSession?
    var retryCount: Int = 3
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("NetworkManager");
      expect(issues[0].confidence).toBe(0.85);
    });
  });

  describe("true negatives (should not flag)", () => {
    it("does not flag class with @unchecked Sendable that has NSLock", () => {
      const issues = check(`
class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    var items: [String: Any] = [:]
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with @unchecked Sendable and only let properties", () => {
      const issues = check(`
class ImmutableConfig: @unchecked Sendable {
    let apiKey: String
    let baseURL: URL
    init(apiKey: String, baseURL: URL) {
        self.apiKey = apiKey
        self.baseURL = baseURL
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with @unchecked Sendable and DispatchQueue", () => {
      const issues = check(`
class SafeStore: @unchecked Sendable {
    private let queue = DispatchQueue(label: "safe")
    var data: [Int] = []
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with @unchecked Sendable and OSAllocatedUnfairLock", () => {
      const issues = check(`
class ModernSync: @unchecked Sendable {
    private let lock = OSAllocatedUnfairLock(initialState: 0)
    var count: Int = 0
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag regular class without @unchecked Sendable", () => {
      const issues = check(`
class NormalClass {
    var name: String = ""
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag actor", () => {
      const issues = check(`
actor SafeActor {
    var count: Int = 0
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with proper Sendable conformance (no @unchecked)", () => {
      const issues = check(`
final class ProperSendable: Sendable {
    let value: Int = 42
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with @unchecked Sendable using withLock", () => {
      const issues = check(`
class WithLockExample: @unchecked Sendable {
    private let lock = NSLock()
    var value: Int = 0
    func update() {
        lock.withLock {
            value += 1
        }
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with @unchecked Sendable and Mutex", () => {
      const issues = check(`
class MutexExample: @unchecked Sendable {
    private let mutex = Mutex(0)
    var state: Int = 0
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class using C-level atomics (AtomicInt pattern)", () => {
      const issues = check(`
class AtomicCounter: @unchecked Sendable {
    private var _atomicValue: Int = 0
    var count: Int = 0
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class with AllocatedUnfairLock wrapper", () => {
      const issues = check(`
class RealmLikeWrapper: @unchecked Sendable {
    private let unfairLock = AllocatedUnfairLock()
    var data: [String] = []
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag class when Synchronization module is imported", () => {
      const issues = check(`
import Synchronization

class SyncModuleUser: @unchecked Sendable {
    var value: Int = 0
}`);
      expect(issues).toHaveLength(0);
    });
  });
});
