# Architecture Overview

This document explains the design principles and structure of the Pristine MCP server.

## Strict TypeScript Compliance

The codebase enforces strict TypeScript practices throughout:

- **No `any` type.** Every value has an explicit interface or type alias. Complex shapes like `RuleViolation`, `AnalysisResult`, `ParsedComponent`, and `HookCall` are defined as standalone interfaces rather than inlined or typed as `any`.
- **Strict null checks.** Every nullable value is validated before use. The tool handler (`handleAnalyzeReactComponent`) validates its input through a proper type guard (`isAnalyzeReactComponentArgs`) instead of casting with `as`.
- **Descriptive naming.** Functions are named for their intent (`checkComponentLength`, `checkHooksSeparation`, `parseReactComponent`), not abbreviated.

## Separation of Concerns

The source tree is split into three directories, each with a single responsibility:

```
src/
  index.ts              — Server bootstrap & tool declarations (McpServer + Zod)
  types.ts              — Shared type definitions (RuleViolation, AnalysisResult)
  parser/               — AST parsing & component extraction
    astHelpers.ts       — Pure Babel detection helpers & shared types (HookCall, FetchCall, EffectCall, ParsedComponent)
    bodyExtractor.ts    — Recursive walkBody that collects hooks, fetch calls, and effects from the AST
    reactComponentParser.ts — Orchestrator: reads file → parses with Babel → finds component → extracts metrics
  rules/                — Individual maintainability rules
    componentLengthRule.ts  — Component line-count limit (> 100 → warning)
    hooksSeparationRule.ts  — Hooks inside conditions/loops → error
    inlineFetchingRule.ts   — Raw fetch/axios calls in component body → warning
    nakedEffectRule.ts      — useEffect without dependency array → error
```

### `src/parser/` — Parsing Layer (3 files)

The parser layer is split into three files for clear separation of concerns:

- **`astHelpers.ts`** — Pure functions for Babel AST node detection (`hasJSXDeep`, `isReactComponentCandidate`, `getComponentName`, `isHookCall`, etc.) plus all exported types (`HookCall`, `FetchCall`, `EffectCall`, `ParsedComponent`). Contains no I/O and no orchestration logic.

- **`bodyExtractor.ts`** — The recursive `walkBody` function that traverses a component's AST subtree to collect hook calls (with nesting level), fetch/axios calls, and `useEffect` calls (with dependency array presence). Uses helpers from `astHelpers.ts`.

- **`reactComponentParser.ts`** — Thin orchestrator that reads the file, parses it with `@babel/parser`, iterates top-level statements to find a React component via `astHelpers`, delegates body extraction to `bodyExtractor`, and returns a `ParsedComponent`. Also re-exports all types for consumers.

This decomposion means each file stays under 200 lines and can be tested or modified independently.

### `src/rules/` — Business Rules Layer

Each file in this directory implements exactly one maintainability rule. Every rule exports a pure function that takes parsed component data and returns an array of `RuleViolation`:

| Rule | File | Severity | Threshold |
|------|------|----------|-----------|
| Component length | `componentLengthRule.ts` | warning | > 100 lines |
| Hooks separation | `hooksSeparationRule.ts` | error | hooks inside conditions/loops/nested functions |
| Inline fetching | `inlineFetchingRule.ts` | warning | `fetch()` or `axios.*()` in component body |
| Naked effect | `nakedEffectRule.ts` | error | `useEffect` without dependency array |

Adding a new rule (e.g. for Svelte or Vue) requires only creating a new file in `src/rules/` and wiring it into `src/index.ts` — no other layer needs to change.

### `src/index.ts` — Entry Point & Tool Definitions

Minimal bootstrap file that:
- Creates the MCP `McpServer` instance
- Declares the `analyze_react_component` tool inline via `server.tool(name, description, schema, handler)` with Zod schema validation
- Imports and runs all rules in the handler pipeline
- Connects to `StdioServerTransport`

No business logic lives here. Adding a new rule means importing its function and adding one line to the `issues` array. Adding a new tool means adding another `server.tool(...)` call.

## Data Flow

```
Client (LLM) → stdin/stdout → index.ts (McpServer)
                                    │
                           server.tool("analyze_react_component")
                                    │
                           parseReactComponent(filePath)
                              ┌─────┴─────┐
                              │           │
                       astHelpers    bodyExtractor
                       (detection)   (collection)
                              │           │
                              └─────┬─────┘
                                    │
                            ParsedComponent
                                    │
                    ┌───────┬───────┬──────┬────────┐
                    │       │       │      │         │
                   len   hooks   fetch  effect  (future)
                    │       │       │      │         │
                    └───────┴───────┴──────┴────────┘
                                    │
                             RuleViolation[]
                                    │
                           formatAnalysisResult
                                    │
                          { content: [{ type: "text", text }] }
```

## Extending

**To add a new rule** (e.g. "no direct DOM manipulation"):
1. Create `src/rules/noDirectDomRule.ts` exporting a check function
2. Import and call it in `src/index.ts` — add one spread to the `issues` array

**To add a new tool** (e.g. `analyze_svelte_component`):
1. Add a new `server.tool(...)` call in `src/index.ts`
2. Implement the required parser/rule logic in existing or new `src/parser/` and `src/rules/` files
