# Pristine MCP — Maintenance Guide

This Model Context Protocol (MCP) server analyzes React (`.tsx`) files to check compliance with core code maintainability rules.

---

## Project Structure

```text
├── src/
│   ├── index.ts                 # Entry point, McpServer instance, tool declarations
│   ├── types.ts                 # Shared types for analysis and violations
│   ├── parser/
│   │   ├── astHelpers.ts        # Pure Babel detection helpers + shared types (HookCall, FetchCall, EffectCall, ParsedComponent)
│   │   ├── bodyExtractor.ts     # Recursive AST walk to collect hooks, fetches, and effects
│   │   └── reactComponentParser.ts  # Orchestrator: reads file, parses, detects component, returns ParsedComponent
│   └── rules/                   # Individual validation rules
│       ├── componentLengthRule.ts   # Component line-count limit (> 100 lines → warning)
│       ├── hooksSeparationRule.ts   # Hooks inside conditions/loops → error
│       ├── inlineFetchingRule.ts    # Raw fetch/axios calls in component body → warning
│       └── nakedEffectRule.ts       # useEffect without dependency array → error
├── package.json
└── tsconfig.json
```

---

## Technical Architecture

### 1. MCP Server & Validation (`src/index.ts`)

The server uses the modern **`McpServer`** class from the MCP SDK.

- **Input validation:** Handled robustly by **Zod** directly in the tool declaration.
- **Tool declaration:** Tools are registered via `server.tool(...)`. No more verbose JSON schemas or separate routing files.

### 2. AST Parser (`src/parser/` — 3 files)

The parser layer was split into three files to keep each under 200 lines and independently maintainable:

| File | Role |
|------|------|
| `astHelpers.ts` | Pure Babel AST detection functions (`hasJSXDeep`, `isReactComponentCandidate`, `getComponentName`, `isHookCall`) + exported types (`HookCall`, `FetchCall`, `EffectCall`, `ParsedComponent`). Contains no I/O. |
| `bodyExtractor.ts` | Recursive `walkBody` that traverses a component's AST subtree to collect hook calls (with nesting level), API calls (`fetch`/`axios`), and `useEffect` calls (with or without dependency array). |
| `reactComponentParser.ts` | Thin orchestrator: reads the file, parses it with `@babel/parser`, uses `astHelpers` to find a React component, delegates body extraction to `bodyExtractor`, and returns a `ParsedComponent`. Re-exports all types for consumers. |

- **JSX detection:** Uses a deep recursive search (`hasJSXDeep`) in `astHelpers.ts` to determine whether a function returns JSX, avoiding false negatives from conditional structures (`if/else`), ternary expressions, or intermediate variables.
- **Tree walk (`walkBody`):** In `bodyExtractor.ts`, recursively analyzes the component body to catalog hooks (with their nesting level), API calls (fetch/axios), and effects (with dependency array status).

---

## Maintenance Guide: How to Evolve the Project

### How to Add a New MCP Tool

Declare it directly in `src/index.ts` using `server.tool`:

```typescript
import { z } from "zod";

server.tool(
  "my_new_tool",
  "Clear description of what the tool does.",
  {
    myParameter: z.string().describe("Description of the parameter."),
  },
  async ({ myParameter }) => {
    // Business logic here...
    return {
      content: [{ type: "text", text: "Result" }],
    };
  }
);
```

### How to Add a New Component Analysis Rule

1. **Extend the parser** (if the rule needs new data):
   - Add a new interface in `src/parser/astHelpers.ts`
   - Add a new array to `ParsedComponent`
   - Collect the data in `src/parser/bodyExtractor.ts` during the `walkBody` traversal

2. **Create the rule:** Add a new file in `src/rules/myNewRuleRule.ts`. Your function should accept parsed component data and return an array of `RuleViolation`.

3. **Wire it up:** Import your function in `src/index.ts` and add its results to the `issues` array when the analysis tool executes.

---

## Local Debugging

To test the server locally during development, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```
