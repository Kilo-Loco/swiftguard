import { describe, it, expect } from "vitest";
import { parseSwift } from "@/lib/parser";
import { forceUnwrapRule } from "@/lib/rules/general/force-unwrap";

describe("force-unwrap rule", () => {
  it("detects force unwrap on an optional variable", () => {
    const source = `let name: String? = "hello"
let unwrapped = name!`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("force-unwrap");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].line).toBe(2);
    expect(issues[0].confidence).toBe(0.95);
  });

  it("detects multiple force unwraps", () => {
    const source = `let a: Int? = 1
let b: Int? = 2
let sum = a! + b!`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(2);
  });

  it("does not flag code without force unwraps", () => {
    const source = `let name: String? = "hello"
if let unwrapped = name {
    print(unwrapped)
}`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(0);
  });

  it("does not flag nil-coalescing operator", () => {
    const source = `let name: String? = nil
let value = name ?? "default"`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(0);
  });

  it("detects force unwrap in function calls", () => {
    const source = `func greet() {
    let dict: [String: String]? = ["key": "value"]
    print(dict!["key"]!)
}`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag explicit type unwrapping (as!)", () => {
    const source = `let x: Any = "hello"
let s = x as! String`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    // as! is a forced cast, not a force_unwrap_expression in tree-sitter
    expect(issues).toHaveLength(0);
  });

  it("lowers confidence for literal URL constructor force unwrap", () => {
    const source = `let url = URL(string: "https://example.com")!`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.5);
    expect(issues[0].severity).toBe("info");
  });

  it("lowers confidence for Int literal constructor force unwrap", () => {
    const source = `let n = Int("42")!`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.5);
    expect(issues[0].severity).toBe("info");
  });

  it("keeps high confidence for non-literal constructor force unwrap", () => {
    const source = `let url = URL(string: someVariable)!`;
    const tree = parseSwift(source);
    const issues = forceUnwrapRule.check(tree, source);

    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.95);
    expect(issues[0].severity).toBe("warning");
  });
});
