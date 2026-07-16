# Architecture Overview

This document explains the design principles and structure of the Pristine MCP server.

## Strict TypeScript Compliance

The codebase enforces strict TypeScript practices throughout:

- **No `any` type.** Every value has an explicit interface or type alias. Complex shapes like `RuleViolation`, `AnalysisResult`, and `RuleContext` are defined as standalone interfaces rather than inlined or typed as `any`.
- **Strict null checks.** Every nullable value is validated before use.
- **Descriptive naming.** Functions are named for their intent (`traverseAST`, `registerListeners`, `parseReactComponent`), not abbreviated.

## Separation of Concerns

The source tree is split into three directories, each with a single responsibility:

```
src/
  index.ts              — Server bootstrap, tool declarations (McpServer + Zod) & component tree builder
  types.ts              — Shared type definitions (RuleViolation, AnalysisResult, ASTListener, RuleContext)
  utils/                — Filesystem utilities
    fileFinder.ts       — Recursive findTsFiles(dirPath): walks a directory tree, ignores node_modules/.git/dist/build/.next
  parser/               — AST parsing, generic traversal & orchestration
    astHelpers.ts       — Pure Babel detection helpers (isHookCall, isReactComponentCandidate, getComponentName, etc.)
    bodyExtractor.ts    — Generic traverseAST(node, listeners): recursive walker with enter/exit support
    reactComponentParser.ts — Orchestrator: reads file → parses with Babel → finds component →
                              creates RuleContext → merges rule listeners → traverseAST →
                              returns AnalysisResult[] (one per component, with JSX dependencies)
  rules/                — Individual maintainability rules
    componentLengthRule.ts  — Component line-count limit (> 100 → warning)
    hooksSeparationRule.ts  — Hooks inside conditions/loops → error
    inlineFetchingRule.ts   — Raw fetch/axios calls in component body → warning
    nakedEffectRule.ts      — useEffect without dependency array → error
    noExplicitAnyRule.ts    — Explicit `any` type usage → warning
    inlineStyleAbuseRule.ts — Inline styles with > 3 properties → warning
    stateFatnessRule.ts     — Components with > 4 useState → warning
```

### `src/parser/` — Parsing Layer (3 files)

The parser layer is split into three files for clear separation of concerns:

- **`astHelpers.ts`** — Pure functions for Babel AST node detection (`hasJSXDeep`, `isReactComponentCandidate`, `getComponentName`, `isHookCall`, `getCallName`, `getCallObject`, etc.). Contains no I/O, no orchestration, and no rule-specific logic. All functions are stateless and reusable across rules.

- **`bodyExtractor.ts`** — A single generic function `traverseAST(node, listeners)` that recursively walks any Babel AST subtree. For every node it calls the node-type listeners on enter (before children), then all children, then the `type:exit` listeners (after children). This is the ESLint-inspired "Visitor Pattern": the walker knows nothing about React, hooks, or CSS — it just provides the traversal mechanism.

- **`reactComponentParser.ts`** — Orchestrator that reads the file, parses it with `@babel/parser`, finds the React component, creates a `RuleContext` (with a shared `violations[]` array), calls each rule's `registerListeners(context)` to collect their AST event listeners, merges them into a single registry, runs `traverseAST` on the component body, then returns the complete `AnalysisResult`. During the AST walk, an **inline listener on `JSXOpeningElement`** captures every capitalized JSX tag name (e.g. `<ProfileForm />`) and records it as a **dependency** of the current component. These dependencies are returned in the `dependencies: string[]` field of `AnalysisResult` and power the **Component Tree Map** in the project-scan report. The function returns `AnalysisResult[]` (one entry per component in the file) instead of a single result, so multi-component files are fully analysed without silent skipping.

This decomposition means each file stays under 200 lines and can be tested or modified independently.

### `src/rules/` — Business Rules Layer (Visitor Pattern)

Each file in this directory implements exactly one maintainability rule. Every rule exports a function `registerListeners(context: RuleContext): Record<string, ASTListener[]>` that registers callbacks for the AST node types it cares about:

| Rule | File | Severity | Listens to |
|------|------|----------|-----------|
| Component length | `componentLengthRule.ts` | warning | _(no AST — fires during registration if totalLines > 100)_ |
| Hooks separation | `hooksSeparationRule.ts` | error | `IfStatement`, `ForStatement`, etc. (enter/exit for depth) + `CallExpression` |
| Inline fetching | `inlineFetchingRule.ts` | warning | `CallExpression` (filters `fetch` / `axios.*`) |
| Naked effect | `nakedEffectRule.ts` | error | `CallExpression` (filters `useEffect` without deps) |
| No explicit any | `noExplicitAnyRule.ts` | warning | `TSAnyKeyword` |
| Inline style abuse | `inlineStyleAbuseRule.ts` | warning | `JSXAttribute` (filters `name === "style"` with > 3 props) |
| State fatness | `stateFatnessRule.ts` | warning | `CallExpression` (filters `useState`); reports via `context.onComplete` |
| No props drilling | `noPropsDrillingRule.ts` | warning | `Identifier` + `JSXAttribute` (via `functionNode` params); reports via `context.onComplete` |

Each rule:
- Receives a shared `RuleContext` containing `componentName`, `componentTotalLines`, `violations[]`, and `onComplete[]`.
- Returns a map of `{ "NodeType": [listenerFn, ...] }`.
- Listener functions close over per-rule state (e.g. `depth` counters in `hooksSeparationRule`) and push violations into `context.violations`.
- Rules that need enter/exit semantics (like `hooksSeparationRule`) register both `"IfStatement"` and `"IfStatement:exit"` pairs.
- Rules that need to act after the full traversal (e.g. `stateFatnessRule` must finish counting `useState` calls before deciding) push a callback to `context.onComplete`. The orchestrator invokes these callbacks after `traverseAST` returns.

This is directly inspired by ESLint's rule API: each rule declares what AST events it wants, and the orchestrator dispatches them.

### `src/index.ts` — Entry Point & Tool Definitions

Bootstrap file that:
- Creates the MCP `McpServer` instance
- Declares the `analyze_react_component` tool via `server.tool(...)`
- Declares the `analyze_project_folder` tool that recursively scans a directory tree using `findTsFiles`, analyses every component, then produces a summary report including a **Component Tree Map**
- Contains `buildComponentTree()` which builds a textual Unicode tree from the dependency graph (roots are entry-point components, children are their JSX dependencies, with path-based cycle detection)
- Connects to `StdioServerTransport`

No business logic and no per-rule imports live here. Adding a new rule requires only creating the rule file and adding it to the `RULE_REGISTRATIONS` array in `reactComponentParser.ts`.

## Data Flow

```
Client (LLM) → stdin/stdout → index.ts (McpServer)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
          "analyze_react_component"      "analyze_project_folder"
                    │                               │
          parseReactComponent(file)        findTsFiles(folder)
                    │                               │
               ┌────┴────┐                   parseReactComponent (×N)
               │         │                         │
         astHelpers  reactComponentParser    allResults[]
         (utilities)  (orchestrator)               │
               │         │                   buildComponentTree()
               │    ┌────┴──────┐                  │
               │    │           │            Component Tree Map
               │  RuleContext  RULE_REGISTRATIONS  │
               │    │       (+ inline deps         │
               │    │        listener on            + stats + violations
               │    │     JSXOpeningElement)        │
               │    └──────┬──────┘           formatted report
               │           │
               │    masterListeners
               │           │
               │    traverseAST(componentBody, listeners)
               │      ┌─────┴──────┐
               │      │  node.type  │  JSXOpeningElement
               │      │  matching   │  → collect dependency
               │      │  callbacks  │
               │      └─────┬──────┘
               │           │
               │    context.violations[]
               │    dependencies[]
               │           │
               └─────┬─────┘
                     │
              AnalysisResult[]
                     │
            formatAnalysisResult / report builder
                     │
           { content: [{ type: "text", text }] }
```

## Extending

**To add a new rule** (e.g. "no direct DOM manipulation"):
1. Create `src/rules/noDirectDomRule.ts`
2. Export `registerListeners(context: RuleContext): Record<string, ASTListener[]>` that listens to the relevant node types
3. Import and add it to the `RULE_REGISTRATIONS` array in `src/parser/reactComponentParser.ts`

No other file needs to change — the rule is automatically wired into the pipeline.

**To add a new tool** (e.g. `analyze_svelte_component`):
1. Add a new `server.tool(...)` call in `src/index.ts`
2. Implement the required parser/rule logic in existing or new `src/parser/` and `src/rules/` files

### Rule lifecycle

1. `registerListeners(context)` is called with a fresh `RuleContext` per component
2. The rule may push a violation immediately (e.g. `componentLengthRule` checks `totalLines` during registration) and/or return listener registrations
3. `traverseAST` dispatches nodes to registered listeners, which may push more violations
4. After traversal, the orchestrator returns the completed `RuleViolation[]` as part of `AnalysisResult`
