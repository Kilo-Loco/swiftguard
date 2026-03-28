import Parser from "tree-sitter";
import Swift from "tree-sitter-swift";

const parser = new Parser();
parser.setLanguage(Swift as unknown as Parser.Language);

export function parseSwift(source: string): Parser.Tree {
  return parser.parse(source);
}

export function getNodesByType(
  node: Parser.SyntaxNode,
  type: string
): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  const cursor = node.walk();

  function visit(): void {
    if (cursor.nodeType === type) {
      results.push(cursor.currentNode);
    }
    if (cursor.gotoFirstChild()) {
      do {
        visit();
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }

  visit();
  return results;
}

export function findAncestor(
  node: Parser.SyntaxNode,
  type: string
): Parser.SyntaxNode | null {
  let current = node.parent;
  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }
  return null;
}

export function getNodeText(
  node: Parser.SyntaxNode,
  source: string
): string {
  return source.slice(node.startIndex, node.endIndex);
}
