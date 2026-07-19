# Architecture Overview

This document explains the design principles and structure of the Pristine MCP server.

## Strict TypeScript Compliance

- **No `any` type.** Every value has an explicit interface or type alias (`RuleViolation`, `AnalysisResult`, `RuleContext`, `ASTListener`).
- **Strict null checks.** Every nullable value is validated before use.
- **ESM + verbatimModuleSyntax.** All imports use `.js` extensions; type-only imports use `import type`.

## Separation of Concerns

```
src/
  index.ts                   — Server bootstrap, tool/prompt declarations, component tree builder
  types.ts                   — Shared type definitions (RuleViolation, AnalysisResult, ASTListener, RuleContext)
  utils/
    fileFinder.ts            — Recursive findTsFiles(dirPath), skips node_modules/.git/dist/build/.next
  parser/
    astHelpers.ts            — Pure Babel detection helpers (isHookCall, isReactComponentCandidate, etc.)
    bodyExtractor.ts         — Generic traverseAST(node, listeners): recursive walker with enter/:exit
    reactComponentParser.ts  — Orchestrator: reads file → parses with Babel → finds components →
                               creates RuleContext → merges rule listeners → traverseAST →
                               returns AnalysisResult[] (one per component, with JSX dependencies)
  prompts/
    thinkingInReact.ts        — "brainstorm-react" prompt registration
  tools/
    analyzer.ts               — "analyze_react_file" tool registration
  rules/
    componentLengthRule.ts    — Component line-count limit (> 100 → warning)
    inlineFetchingRule.ts     — Raw fetch/axios calls in component body → warning
    inlineStyleAbuseRule.ts   — Inline styles with > 3 properties → warning
    nakedEffectRule.ts        — useEffect without dependency array → error
    noExplicitAnyRule.ts      — Explicit `any` type usage → warning
    noPropsDrillingRule.ts    — Props passed to children without local usage → warning
    reactCalls/               — Components called as functions + hooks as values → error
    react-purity/             — 5 sub-detections (prop mutation, side effects, idempotency,
                                post-JSX mutation, out-of-scope mutation) → warning
    rulesOfHooks/             — Conditional/context rules of hooks → error
    rsc/                      — Server Component rules → error
```

### `src/parser/` — Parsing Layer (3 files)

- **`astHelpers.ts`** — Pure functions for Babel AST node detection (`hasJSXDeep`, `isReactComponentCandidate`, `getComponentName`, `isHookCall`, `getCallName`, `getCallObject`). No I/O, no orchestration, stateless.

- **`bodyExtractor.ts`** — A single generic function `traverseAST(node, listeners)` that recursively walks any Babel AST subtree. For every node it calls the node-type listeners on enter (before children), then all children, then the `type:exit` listeners (after children). ESLint-inspired visitor pattern.

- **`reactComponentParser.ts`** — Orchestrator that:
  1. Reads file with `readFileSync`
  2. Parses with `@babel/parser` (plugins: `typescript`, `jsx`)
  3. Detects `"use client"` directive at file level (`isClientComponent`)
  4. Iterates over program body to find all React component candidates
  5. For each component: creates `RuleContext`, calls all `RULE_REGISTRATIONS` (9 rules) + RSC rule + inline JSX dependency collector, runs `traverseAST` on the component body
  6. Runs a **file-level pass** with `rulesOfHooks` to catch hooks in non-component functions (uses `skipStack` to avoid duplicating component-body violations)
  7. Returns `AnalysisResult[]` — one entry per component (+ file-level if violations found)

### `src/rules/` — Business Rules Layer

Each rule exports `registerListeners(context: RuleContext): Record<string, ASTListener[]>`.

| Rule | Type | Severity | Sub-detections |
|------|------|----------|----------------|
| `componentLengthRule.ts` | flat | warning | — |
| `inlineFetchingRule.ts` | flat | warning | — |
| `inlineStyleAbuseRule.ts` | flat | warning | — |
| `nakedEffectRule.ts` | flat | error | — |
| `noExplicitAnyRule.ts` | flat | warning | — |
| `noPropsDrillingRule.ts` | flat | warning | — |
| `reactCalls/index.ts` | modular | error | 2 (components-as-functions, hooks-as-values) |
| `react-purity/index.ts` | modular | warning | 5 (propMutation, sideEffects, idempotency, stateFatness, immutabilityPostJsx, outOfScopeMutation) |
| `rulesOfHooks/index.ts` | modular | error | 2 (conditional, context) |
| `rsc/rscServerHooksRule.ts` | flat | error | — |

Architecture patterns:
- **Self-contained state:** Each rule creates per-file closure state (counters, depth trackers) inside `registerListeners`.
- **Enter/exit pairs:** Rules that track nesting (conditional depth, function depth) register both `"NodeType"` and `"NodeType:exit"`.
- **Post-traversal hooks:** Rules that need to act after the walk (e.g. `stateFatness`, `noPropsDrilling`) push callbacks to `context.onComplete[]`.
- **File-level pass:** `rulesOfHooks` runs a full-program AST walk with `skipStack` to avoid duplicating violations already caught in component bodies.
- **RSC rules:** The RSC rule receives `isClientComponent` as a second parameter (file-level context). It is wired manually (not via `RULE_REGISTRATIONS`) because its signature differs.

### `src/prompts/` — MCP Prompts

- `thinkingInReact.ts` — Registers the `brainstorm-react` prompt that applies the Thinking in React methodology (component decomposition → minimal state filter → state localization → anti-pattern watch) before any code is written.

### `src/tools/` — Dedicated MCP Tools

- `analyzer.ts` — Registers the `analyze_react_file` tool. Calls `parseReactComponent(filePath)`, formats the `AnalysisResult[]`, and appends a violation warning message instructing the agent to fix errors.

### `src/index.ts` — Entry Point

- Creates `McpServer` instance
- Declares `analyze_react_component` (legacy inline tool)
- Declares `analyze_project_folder` (inline tool, recursive directory scan)
- Calls `registerAnalyzerTool(server)` for the `analyze_react_file` tool
- Calls `registerThinkingPrompt(server)` for the `brainstorm-react` prompt
- Contains `buildComponentTree()` — builds a Unicode dependency graph from `AnalysisResult[].dependencies`
- Connects to `StdioServerTransport`

## Data Flow

```
Client (LLM) → stdin/stdout → index.ts (McpServer)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
          "analyze_react_   "analyze_react_  "analyze_project_
           component"        file" (tool)     folder"
                    │               │               │
                    └───────┬───────┘               │
                            │                       │
                    parseReactComponent(file)  findTsFiles(folder)
                            │                       │
                      ┌─────┴─────┐          parseReactComponent (×N)
                      │           │                │
                astHelpers  reactComponentParser  allResults[]
                (utilities)  (orchestrator)         │
                      │           │           buildComponentTree()
                      │     ┌─────┴──────┐         │
                      │     │            │   Component Tree Map
                      │  isClient    RULE_          │
                      │  Component  REGISTRATIONS   + stats
                      │     │     (+ rsc rule      + violations
                      │     │      + inline deps    │
                      │     │      listener)   formatted report
                      │     └──────┬──────┘
                      │            │
                      │     masterListeners
                      │            │
                      │     traverseAST(walkRoot, listeners)
                      │      ┌──────┴──────┐
                      │      │  node.type   │  JSXOpeningElement
                      │      │  matching    │  → collect dependency
                      │      │  callbacks   │
                      │      └──────┬──────┘
                      │            │
                      │     context.violations[]
                      │     dependencies[]
                      │     context.onComplete[]
                      │            │
                      └──────┬─────┘
                             │
                      AnalysisResult[]
                             │
                    formatAnalysisResult / report builder
                             │
               { content: [{ type: "text", text }] }
```

## Extending

**To add a new rule:**
1. Create `src/rules/myRule.ts` (or `src/rules/myRule/index.ts` for modular rules)
2. Export `registerListeners(context: RuleContext): Record<string, ASTListener[]>`
3. If the rule needs file-level context (e.g. `isClientComponent`), use a second parameter and wire it manually in `reactComponentParser.ts`
4. Otherwise, add the registration function to `RULE_REGISTRATIONS` in `reactComponentParser.ts:42`

No other file needs to change.

**To add a new tool:**
1. Create `src/tools/myTool.ts` exporting `registerMyTool(server: McpServer): void`
2. Call `registerMyTool(server)` in `src/index.ts`

**To add a new prompt:**
1. Create `src/prompts/myPrompt.ts`
2. Call `server.prompt(...)` inside a registration function
3. Wire it in `src/index.ts`

### Rule lifecycle

1. `registerListeners(context)` is called with a fresh `RuleContext` per component
2. The rule may push a violation immediately (e.g. `componentLengthRule` checks `totalLines` during registration) and/or return listener registrations
3. `traverseAST` dispatches nodes to registered listeners, which may push more violations
4. After traversal, `context.onComplete` callbacks are invoked
5. The completed `RuleViolation[]` is returned as part of `AnalysisResult`
