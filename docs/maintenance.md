# Pristine MCP — Maintenance Guide

This Model Context Protocol (MCP) server analyzes React (`.tsx`) files to check compliance with core code maintainability rules.

---

## Project Structure

```text
├── src/
│   ├── index.ts                 # Entry point, McpServer instance, tool declarations
│   ├── types.ts                 # Shared types for analysis and violations
│   ├── parser/
│   │   └── reactComponentParser.ts  # Babel AST-based TSX file parser
│   └── rules/                   # Individual validation rules
│       ├── componentLengthRule.ts   # Component line-count limit
│       ├── hooksSeparationRule.ts   # Hooks top-level check
│       └── inlineFetchingRule.ts    # Inline fetch/axios call detection
├── package.json
└── tsconfig.json
```

---

## Technical Architecture

### 1. MCP Server & Validation (`src/index.ts`)

The server uses the modern **`McpServer`** class from the MCP SDK.

- **Input validation:** Handled robustly by **Zod** directly in the tool declaration.
- **Tool declaration:** Tools are registered via `server.tool(...)`. No more verbose JSON schemas or separate routing files.

### 2. AST Parser (`src/parser/reactComponentParser.ts`)

The parser reads source code and produces an abstract syntax tree (AST) via Babel.

- **JSX detection:** Uses a deep recursive search (`hasJSXDeep`) to determine whether a function returns JSX, avoiding false negatives from conditional structures (`if/else`), ternary expressions, or intermediate variables.
- **Tree walk (`walkBody`):** Recursively analyzes the component body to catalog hooks (with their nesting level) and API calls (fetch/axios).

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

1. **Create the rule:** Add a new file in `src/rules/myNewRuleRule.ts`.
2. **Implement the logic:** Your function should accept parsed component data and return an array of `RuleViolation`.
3. **Wire it up:** Import your function in `src/index.ts` and add its results to the `issues` array when the analysis tool executes.

---

## Local Debugging

To test the server locally during development, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```
