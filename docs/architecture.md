# Architecture Overview

This document explains the design principles and structure of the Pristine MCP server.

## Strict TypeScript Compliance

The codebase enforces strict TypeScript practices throughout:

- **No `any` type.** Every value has an explicit interface or type alias. Complex shapes like `RuleViolation`, `AnalysisResult`, `ParsedComponent`, and `HookCall` are defined as standalone interfaces rather than inlined or typed as `any`.
- **Strict null checks.** Every nullable value is validated before use. The tool handler (`handleAnalyzeReactComponent`) validates its input through a proper type guard (`isAnalyzeReactComponentArgs`) instead of casting with `as`.
- **Descriptive naming.** Functions are named for their intent (`checkComponentLength`, `checkHooksSeparation`, `parseReactComponent`), not abbreviated.

## Separation of Concerns

The source tree is split into four directories, each with a single responsibility:

```
src/
  index.ts          — Server bootstrap (transport, request routing)
  types.ts           — Shared type definitions
  parser/            — AST parsing & component extraction
    reactComponentParser.ts
  rules/             — Individual maintainability rules
    componentLengthRule.ts
    hooksSeparationRule.ts
    inlineFetchingRule.ts
  tools/             — MCP tool definitions & handlers
    analyzeReactComponent.ts
```

### `src/parser/` — Parsing Layer

Responsible for reading a `.tsx` file, parsing it into an AST, and extracting structured information about React components. It uses `@babel/parser` with the TypeScript and JSX plugins.

The parser returns a `ParsedComponent` object containing:
- Component name
- Line ranges
- Hook call sites (with top-level tracking)
- Fetch/axios call sites

This layer has no knowledge of MCP protocols or business rules.

### `src/rules/` — Business Rules Layer

Each file in this directory implements exactly one maintainability rule. Every rule exports a pure function that takes parsed component data and returns an array of `RuleViolation`:

| Rule | File | Severity | Threshold |
|------|------|----------|-----------|
| Component length | `componentLengthRule.ts` | warning | > 100 lines |
| Hooks separation | `hooksSeparationRule.ts` | error | hooks inside conditions/loops/nested functions |
| Inline fetching | `inlineFetchingRule.ts` | warning | `fetch()` or `axios.*()` in component body |

Adding a new rule (e.g. for Svelte or Vue) requires only creating a new file in `src/rules/` and wiring it into the tool handler — no other layer needs to change.

### `src/tools/` — MCP Tool Definitions

Contains the schema definition and handler for each MCP tool. The `analyzeReactComponent.ts` file:

1. Defines the tool's name, description, and JSON Schema input
2. Validates incoming arguments with a type guard
3. Orchestrates the parser and rules
4. Formats the result as a human-readable string

### `src/index.ts` — Entry Point

Minimal bootstrap file that:
- Creates the MCP `Server` instance
- Registers `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
- Connects to `StdioServerTransport`
- Delegates all logic to the tool layer

No business logic lives here. Adding a new tool means importing its definition and handler, then adding a branch to the `CallToolRequestSchema` handler.

## Data Flow

```
Client (LLM) → stdin/stdout → Server (index.ts)
                                   │
                          CallToolRequestSchema
                                   │
                    ┌──────────────┴──────────────┐
                    ️    analyzeReactComponent     │
                    │        (tools/)              │
                    │         │                    │
                    │   parseReactComponent        │
                    │     (parser/)                │
                    │         │                    │
                    │   ┌─────┼─────┐             │
                    │   │     │     │              │
                    │  len   hooks fetch           │
                    │   │     │     │              │
                    │   └─────┼─────┘             │
                    │    RuleViolation[]           │
                    │         │                    │
                    │   formatAnalysisResult       │
                    └─────────┬──────────────────┘
                              │
                    { content: [{ type: "text", text }] }
```

## Extending

**To add a new rule** (e.g. "no direct DOM manipulation"):
1. Create `src/rules/noDirectDomRule.ts` exporting a check function
2. Import and call it in `src/tools/analyzeReactComponent.ts`

**To add a new tool** (e.g. `analyze_svelte_component`):
1. Create `src/tools/analyzeSvelteComponent.ts` with definition + handler
2. Import and register it in `src/index.ts`
