import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { actorIsolationViolationRule } from "@/lib/rules/concurrency/actor-isolation-violation";

const check = (source: string) => {
  const tree = parseSwift(source);
  return actorIsolationViolationRule.check(tree, source);
};

describe("actor-isolation-violation rule", () => {
  describe("Pattern B: Task.detached accessing actor state", () => {
    it("flags Task.detached accessing self.cache", () => {
      const issues = check(`
actor ImageCache {
    var cache: [String: Data] = [:]
    func preload(url: String) {
        Task.detached {
            self.cache[url] = Data()
        }
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("actor-isolation-violation");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].confidence).toBe(0.92);
      expect(issues[0].message).toContain("Task.detached");
    });

    it("flags Task.detached mutating self.value", () => {
      const issues = check(`
actor Counter {
    var value: Int = 0
    func incrementInBackground() {
        Task.detached {
            self.value += 1
        }
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("Task.detached");
    });

    it("flags Task.detached calling self method", () => {
      const issues = check(`
actor DataStore {
    var items: [String] = []
    func process() {
        Task.detached {
            self.items.append("new")
        }
    }
}`);
      expect(issues).toHaveLength(1);
    });
  });

  describe("Pattern C: nonisolated accessing mutable state", () => {
    it("flags nonisolated func accessing mutable var", () => {
      const issues = check(`
actor UserSession {
    var token: String = ""
    nonisolated func currentToken() -> String {
        return token
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("actor-isolation-violation");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].confidence).toBe(0.95);
      expect(issues[0].message).toContain("nonisolated");
      expect(issues[0].message).toContain("token");
    });

    it("flags nonisolated func accessing self.logs", () => {
      const issues = check(`
actor Logger {
    var logs: [String] = []
    nonisolated func getLogCount() -> Int {
        return logs.count
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("logs");
    });
  });

  describe("Pattern A: Cross-actor property access without async", () => {
    it("flags synchronous access to another actor instance property", () => {
      const issues = check(`
actor Counter {
    var count: Int = 0
    func steal(from other: Counter) {
        count += other.count
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].confidence).toBe(0.85);
      expect(issues[0].message).toContain("Cross-actor");
      expect(issues[0].message).toContain("other.count");
    });
  });

  describe("True negatives (should NOT flag)", () => {
    it("does not flag proper async cross-actor access", () => {
      const issues = check(`
actor BankAccount {
    var balance: Double = 0
    func transfer(to other: BankAccount) async {
        await other.deposit(amount: 100)
    }
    func deposit(amount: Double) {
        balance += amount
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag regular Task (inherits actor isolation)", () => {
      const issues = check(`
actor Fetcher {
    var results: [String] = []
    func fetch() {
        Task {
            self.results.append("data")
        }
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag nonisolated accessing only let properties", () => {
      const issues = check(`
actor Config {
    let id: String = "abc"
    nonisolated func getId() -> String {
        return id
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag nonisolated computed property not accessing mutable state", () => {
      const issues = check(`
actor MyActor {
    nonisolated var description: String {
        return "MyActor instance"
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag regular class (not an actor)", () => {
      const issues = check(`
class NotAnActor {
    var value: Int = 0
    nonisolated func getValue() -> Int {
        return value
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag actor method accessing own state normally", () => {
      const issues = check(`
actor Store {
    var items: [String] = []
    func addItem(_ item: String) {
        items.append(item)
    }
}`);
      expect(issues).toHaveLength(0);
    });
  });
});
