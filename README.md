# SwiftGuard

A Swift code review API that catches concurrency bugs, Sendable violations, and actor isolation issues using AST parsing (tree-sitter-swift) — not regex.

## Quick Start

```bash
npm install
npm run dev
```

The landing page with live demo runs at `http://localhost:3000`. API docs at `/docs`.

## API

### POST /api/v1/review

Analyze Swift source code for concurrency and safety issues.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer sg_demo_key_2026   # demo key for testing
```

**Request:**
```json
{
  "source": "let x: String? = nil\nlet y = x!",
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
      "line": 2,
      "column": 12,
      "confidence": 0.95,
      "suggestion": "Use optional binding (if let/guard let) or the nil-coalescing operator (??) instead."
    }
  ],
  "metadata": {
    "rulesApplied": 7,
    "parseTimeMs": 3,
    "astValid": true
  }
}
```

## Rules

| Rule | Severity | Confidence | Description |
|------|----------|------------|-------------|
| `force-unwrap` | warning | 50–95% | Force unwrap operator usage |
| `unsafe-unchecked-sendable` | warning | 85–90% | @unchecked Sendable with mutable state |
| `actor-isolation-violation` | error | 85–95% | Cross-isolation actor state access |
| `non-sendable-boundary-crossing` | warning | 80–95% | Non-Sendable types crossing concurrency boundaries |
| `task-data-race-risk` | error | 88–92% | Shared mutable state in Task closures |
| `missing-sendable-closure` | warning | 85% | Closures missing @Sendable annotation |
| `missing-sendable-conformance` | info | 75% | Types crossing actor boundaries without Sendable |

### Validation Stats

Tested against 15 top Swift repositories (Alamofire, Kingfisher, Vapor, swift-nio, etc.):
- **3,108 files** scanned
- **93–95% precision** on concurrency rules

## Self-Hosting

```bash
git clone https://github.com/Kilo-Loco/swiftguard.git
cd swiftguard
npm install
npm run build
npm start
```

Requires Node.js 20+ (tree-sitter uses native bindings).

### Environment Notes

- **tree-sitter-swift** uses native Node.js bindings. This works on most Linux/macOS environments.
- **Vercel serverless**: Native bindings may require `serverExternalPackages` config (already set in `next.config.ts`). If you encounter issues, consider Railway or Fly.io which support full Node.js runtimes.
- The API review function is configured with 512MB memory and 10s timeout via `vercel.json`.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page with live demo
│   ├── docs/page.tsx               # API documentation
│   ├── components/
│   │   ├── LiveDemo.tsx            # Interactive code analyzer
│   │   └── EmailSignup.tsx         # Email collection form
│   └── api/v1/
│       ├── review/route.ts         # Code review API endpoint
│       └── signup/route.ts         # Email signup endpoint
├── middleware.ts                    # API key auth + rate limiting
├── lib/
│   ├── parser.ts                   # tree-sitter-swift parser
│   └── rules/                      # 7 AST-powered lint rules
└── types/
    └── api.ts                      # TypeScript interfaces
```

## Testing

```bash
npm test                  # Unit tests
npm run test:pipeline     # Full validation pipeline
npm run validate          # Test against real Swift repos
```

## Deployment

```bash
npm run deploy            # Deploy to Vercel
```

## License

Built by Kilo Loco
