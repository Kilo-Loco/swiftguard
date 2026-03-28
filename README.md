# SwiftGuard

A Swift code review API that catches Swift-specific bugs using AST parsing (tree-sitter-swift), not regex.

## Quick Start

```bash
npm install
npm run dev
```

## API

### POST /api/v1/review

Analyze Swift source code for issues.

**Request:**

```json
{
  "source": "let value = optional!",
  "swiftVersion": "6.0",
  "platform": "ios"
}
```

**Response:**

```json
{
  "issues": [
    {
      "rule": "force-unwrap",
      "severity": "warning",
      "message": "Force unwrap operator used. This will crash at runtime if the value is nil.",
      "line": 1,
      "column": 21,
      "confidence": 0.95,
      "suggestion": "Use optional binding (if let/guard let) or the nil-coalescing operator (??) instead."
    }
  ],
  "metadata": {
    "rulesApplied": 1,
    "parseTimeMs": 2,
    "astValid": true
  }
}
```

## Testing

```bash
npm test
```

## Project Structure

```
src/
├── app/api/v1/review/route.ts   # API endpoint
├── lib/
│   ├── parser.ts                # tree-sitter-swift parser + helpers
│   └── rules/
│       ├── types.ts             # Rule interface
│       ├── engine.ts            # Rule runner
│       ├── index.ts             # Rule registry
│       └── general/
│           └── force-unwrap.ts  # Force unwrap detector
└── types/
    └── api.ts                   # API request/response types
```
