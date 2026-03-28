import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { missingSendableConformanceRule } from "@/lib/rules/concurrency/missing-sendable-conformance";

const check = (source: string) => {
  const tree = parseSwift(source);
  return missingSendableConformanceRule.check(tree, source);
};

describe("missing-sendable-conformance rule", () => {
  describe("true positives (should flag)", () => {
    it("flags struct used in actor method without Sendable", () => {
      const issues = check(`
struct UserData {
    let name: String
    let age: Int
}

actor UserStore {
    func save(user: UserData) { }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("missing-sendable-conformance");
      expect(issues[0].severity).toBe("info");
      expect(issues[0].confidence).toBe(0.75);
      expect(issues[0].message).toContain("UserData");
      expect(issues[0].message).toContain("Struct");
    });

    it("flags enum used in actor method without Sendable", () => {
      const issues = check(`
enum Status {
    case active
    case inactive
}

actor StatusTracker {
    func update(status: Status) { }
}`);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("Status");
      expect(issues[0].message).toContain("Enum");
    });

    it("flags struct used across multiple actor methods", () => {
      const issues = check(`
struct Message {
    let text: String
}

actor ChatRoom {
    func send(message: Message) { }
    func receive(message: Message) { }
}`);
      // Should only flag the struct once even if used multiple times
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("Message");
    });

    it("flags multiple types used in actor methods", () => {
      const issues = check(`
struct Request {
    let url: String
}

struct Response {
    let data: String
}

actor NetworkActor {
    func send(request: Request) { }
    func handle(response: Response) { }
}`);
      expect(issues).toHaveLength(2);
    });
  });

  describe("true negatives (should not flag)", () => {
    it("does not flag struct with Sendable conformance", () => {
      const issues = check(`
struct Config: Sendable {
    let key: String
}

actor ConfigStore {
    func load(config: Config) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag struct not used in actor context", () => {
      const issues = check(`
struct Point {
    let x: Double
    let y: Double
}

func draw(point: Point) { }
`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag built-in types used in actor", () => {
      const issues = check(`
actor Counter {
    func set(value: Int) { }
    func update(name: String) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag struct with @unchecked Sendable conformance", () => {
      const issues = check(`
struct Wrapper: @unchecked Sendable {
    var value: Int
}

actor Store {
    func save(wrapper: Wrapper) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag enum with Sendable conformance", () => {
      const issues = check(`
enum Priority: Sendable {
    case low
    case high
}

actor TaskQueue {
    func enqueue(priority: Priority) { }
}`);
      expect(issues).toHaveLength(0);
    });

    it("does not flag actor with no parameters", () => {
      const issues = check(`
struct Orphan {
    let value: Int
}

actor EmptyActor {
    func doWork() { }
}`);
      expect(issues).toHaveLength(0);
    });
  });
});
