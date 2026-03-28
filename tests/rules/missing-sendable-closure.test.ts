import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { missingSendableClosureRule } from "@/lib/rules/concurrency/missing-sendable-closure";

const check = (source: string) => {
  const tree = parseSwift(source);
  return missingSendableClosureRule.check(tree, source);
};

describe("missing-sendable-closure rule", () => {
  describe("true positives (should flag)", () => {
    it("flags actor method with non-@Sendable closure param", () => {
      const issues = check(`
actor DataStore {
    func fetch(completion: (Data) -> Void) { }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("missing-sendable-closure");
      expect(issues[0].severity).toBe("warning");
      expect(issues[0].confidence).toBe(0.85);
      expect(issues[0].message).toContain("completion");
      expect(issues[0].message).toContain("actor");
    });

    it("flags actor stored property with closure type", () => {
      const issues = check(`
actor EventBus {
    var onEvent: (String) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("onEvent");
      expect(issues[0].message).toContain("actor");
    });

    it("flags @unchecked Sendable class with closure property", () => {
      const issues = check(`
class Coordinator: @unchecked Sendable {
    var onComplete: () -> Void = { }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("onComplete");
      expect(issues[0].message).toContain("@unchecked Sendable");
    });

    it("flags typealias in actor that aliases a function type", () => {
      const issues = check(`
actor Processor {
    typealias Handler = (String) -> Void
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("Handler");
    });

    it("flags multiple closure params in actor method", () => {
      const issues = check(`
actor Worker {
    func run(onStart: () -> Void, onEnd: (Bool) -> Void) { }
}`);
      expect(issues).toHaveLength(2);
    });

    it("flags @unchecked Sendable class with typealias", () => {
      const issues = check(`
class NetworkManager: @unchecked Sendable {
    typealias Handler = (String) -> Void
    var callback: (Data) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(2);
    });

    it("flags actor with multiple closure properties", () => {
      const issues = check(`
actor MyActor {
    var handler: (String) -> Void = { _ in }
    var otherHandler: (Int) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(2);
    });
  });

  describe("true negatives (should not flag)", () => {
    it("does not flag already @Sendable closure in actor", () => {
      const issues = check(`
actor SafeStore {
    func fetch(completion: @Sendable (Data) -> Void) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag @Sendable property in actor", () => {
      const issues = check(`
actor SafeActor {
    var handler: @Sendable (String) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag regular class (not actor, not @unchecked Sendable)", () => {
      const issues = check(`
class ViewModel {
    var handler: (String) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag actor with non-closure params", () => {
      const issues = check(`
actor Counter {
    func increment(by amount: Int) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag regular struct with closure property", () => {
      const issues = check(`
struct Config {
    var onChange: (String) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag @Sendable closure in @unchecked Sendable class", () => {
      const issues = check(`
class Safe: @unchecked Sendable {
    var callback: @Sendable (Data) -> Void = { _ in }
}`);
      expect(issues).toHaveLength(0);
    });
  });
});
