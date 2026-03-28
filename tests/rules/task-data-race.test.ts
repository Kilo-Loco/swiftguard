import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { taskDataRaceRule } from "@/lib/rules/concurrency/task-data-race";

const check = (source: string) => {
  const tree = parseSwift(source);
  return taskDataRaceRule.check(tree, source);
};

describe("task-data-race-risk rule", () => {
  describe("Pattern A: var mutated in Task (true positives)", () => {
    it("flags var mutated with append inside Task", () => {
      const issues = check(`
func fetchData() {
    var data: [String] = []
    Task {
        data.append("result")
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("task-data-race-risk");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].confidence).toBeCloseTo(0.9);
      expect(issues[0].message).toContain("data");
    });

    it("flags var reassigned inside Task", () => {
      const issues = check(`
func update() {
    var status = "idle"
    Task {
        status = "loading"
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("task-data-race-risk");
      expect(issues[0].message).toContain("status");
    });

    it("flags var with compound assignment in Task", () => {
      const issues = check(`
func count() {
    var total = 0
    Task {
        total += 1
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("total");
    });
  });

  describe("Pattern B: multiple Tasks sharing var (true positives)", () => {
    it("flags multiple Tasks mutating same var", () => {
      const issues = check(`
func parallel() {
    var count = 0
    Task {
        count += 1
    }
    Task {
        count += 1
    }
}`);
      expect(issues).toHaveLength(2);
      expect(issues[0].confidence).toBeCloseTo(0.92);
      expect(issues[0].message).toContain("Multiple Task closures");
      expect(issues[0].message).toContain("count");
    });
  });

  describe("Pattern C: class self-mutation in Task (true positives)", () => {
    it("flags class mutating self.property in Task", () => {
      const issues = check(`
class DataLoader {
    var items: [String] = []
    func load() {
        Task {
            self.items = ["loaded"]
        }
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("task-data-race-risk");
      expect(issues[0].confidence).toBeCloseTo(0.88);
      expect(issues[0].message).toContain("DataLoader");
      expect(issues[0].message).toContain("self.items");
    });

    it("flags class with multiple self mutations in Task", () => {
      const issues = check(`
class ViewModel {
    var isLoading = false
    var error: String? = nil
    func fetch() {
        Task {
            self.isLoading = true
        }
    }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("ViewModel");
      expect(issues[0].message).toContain("self.isLoading");
    });
  });

  describe("true negatives (should not flag)", () => {
    it("does not flag let captured in Task (immutable)", () => {
      const issues = check(`
func process() {
    let count = 42
    Task {
        print(count)
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag actor mutating self in Task (isolated)", () => {
      const issues = check(`
actor Store {
    var items: [String] = []
    func load() {
        Task {
            self.items.append("safe")
        }
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag @MainActor class mutating self in Task", () => {
      const issues = check(`
@MainActor
class ViewModel {
    var items: [String] = []
    func load() {
        Task {
            self.items = ["safe"]
        }
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag var only read (not mutated) in Task", () => {
      const issues = check(`
func display() {
    var message = "hello"
    message = "updated"
    Task {
        print(message)
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag Task with only local variables", () => {
      const issues = check(`
func compute() {
    Task {
        var local = 0
        local += 1
        print(local)
    }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag struct self mutation (value type)", () => {
      const issues = check(`
struct Calculator {
    var result = 0
    mutating func compute() {
    }
}`);
      expect(issues).toHaveLength(0);
    });
  });
});
