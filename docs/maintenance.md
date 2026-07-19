# Pristine MCP — Maintenance Guide

## Project Structure

```
pristine/
├── src/
│   ├── index.ts                       # McpServer entry point, tool/prompt wiring
│   ├── types.ts                       # RuleViolation, AnalysisResult, ASTListener, RuleContext
│   ├── parser/
│   │   ├── astHelpers.ts              # Pure Babel detection helpers (isHookCall, getComponentName, etc.)
│   │   ├── bodyExtractor.ts           # Generic traverseAST(node, listeners) with enter/:exit
│   │   └── reactComponentParser.ts    # Orchestrator: parse → components → rules → walk → AnalysisResult[]
│   ├── prompts/
│   │   └── thinkingInReact.ts         # brainstorm-react prompt
│   ├── tools/
│   │   └── analyzer.ts                # analyze_react_file tool
│   ├── rules/
│   │   ├── componentLengthRule.ts     # > 100 lines → warning
│   │   ├── inlineFetchingRule.ts      # fetch/axios in render → warning
│   │   ├── inlineStyleAbuseRule.ts    # style={{...}} with > 3 props → warning
│   │   ├── nakedEffectRule.ts         # useEffect without deps → error
│   │   ├── noExplicitAnyRule.ts       # TSAnyKeyword → warning
│   │   ├── noPropsDrillingRule.ts     # Props passthrough → warning
│   │   ├── reactCalls/                # Components as functions + hooks as values → error
│   │   ├── react-purity/              # 5 sub-detections → warning
│   │   ├── rsc/                       # rsc-server-hooks → error
│   │   └── rulesOfHooks/              # Conditional + context → error
│   └── utils/
│       └── fileFinder.ts              # findTsFiles() recursive walker
├── docs/
│   ├── architecture.md
│   ├── maintenance.md
│   ├── parser-fixes.md
│   ├── rules.md
│   ├── security.md
│   └── thinking-in-react.md
├── package.json
├── tsconfig.json
└── README.md
```

## Technical Architecture

### 1. MCP Server (`src/index.ts`)

- Uses `McpServer` from `@modelcontextprotocol/sdk`
- Declares tools via `server.tool()` (inline or from `src/tools/` modules)
- Declares prompts via `server.prompt()` (from `src/prompts/` modules)
- Connects via `StdioServerTransport` (JSON-RPC over stdin/stdout)
- Input validation via **Zod** schemas

### 2. AST Parser (`src/parser/` — 3 files)

| File | Role |
|------|------|
| `astHelpers.ts` | Pure Babel AST detection functions — no I/O, no orchestration, stateless |
| `bodyExtractor.ts` | `traverseAST(node, listeners)`: generic recursive walker with enter/`:exit` support |
| `reactComponentParser.ts` | Orchestrator: reads file, parses with Babel (typescript + jsx plugins), detects `"use client"` directive, iterates components, merges rule listeners, walks AST, runs file-level pass, returns `AnalysisResult[]` |

### 3. Rules Engine (`src/rules/`)

- Each rule exports `registerListeners(context: RuleContext): Record<string, ASTListener[]>`
- Rules with sub-detections live in subdirectories (e.g. `react-purity/index.ts` merges 5 sub-rules)
- Most rules are auto-wired via `RULE_REGISTRATIONS` array in `reactComponentParser.ts`
- The RSC rule (`rsc/rscServerHooksRule.ts`) has a different signature (`registerListeners(context, isClientComponent)`) and is wired manually alongside it

### 4. MCP Tools (`src/tools/`)

Dedicated modules for tool registration, keeping `src/index.ts` clean. Each exports a `register*Tool(server: McpServer)` function.

### 5. MCP Prompts (`src/prompts/`)

Same pattern as tools — each exports a `register*Prompt(server: McpServer)` function.

## How to Add a New Rule

1. Create `src/rules/myRule.ts` exporting:
   ```ts
   export function registerListeners(
     context: RuleContext
   ): Record<string, ASTListener[]>
   ```
2. If the rule needs post-traversal logic, push callbacks to `context.onComplete`.
3. If the rule needs to inspect function parameters, read `context.functionNode`.
4. Import and add the registration function to `RULE_REGISTRATIONS` in `src/parser/reactComponentParser.ts:42`.

**If the rule needs file-level context** (like `isClientComponent`):
- Accept a second parameter in `registerListeners`
- Wire it manually in `reactComponentParser.ts` (see `registerRscServerHooks` for the pattern)
- Do NOT add it to `RULE_REGISTRATIONS`

## How to Add a New MCP Tool

1. Create `src/tools/myTool.ts`:
   ```ts
   import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { z } from "zod";

   export function registerMyTool(server: McpServer): void {
     server.tool("my_tool", "Description", {
       param: z.string().describe("..."),
     }, async ({ param }) => {
       // Logic
       return { content: [{ type: "text", text: "result" }] };
     });
   }
   ```
2. Import and call `registerMyTool(server)` in `src/index.ts`.

## How to Add a New MCP Prompt

1. Create `src/prompts/myPrompt.ts`:
   ```ts
   import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { z } from "zod";

   export function registerMyPrompt(server: McpServer): void {
     server.prompt("my-prompt", "Description", {
       arg: z.string().describe("..."),
     }, ({ arg }) => ({
       messages: [{ role: "user", content: { type: "text", text: "..." } }],
     }));
   }
   ```
2. Import and call `registerMyPrompt(server)` in `src/index.ts`.

## Local Debugging

```bash
# Inspector web UI (http://localhost:5173) — test tools and prompts manually
npx @modelcontextprotocol/inspector npx tsx src/index.ts

# Headless (for agent integration)
npm run dev
```

## Key Conventions

- **TypeScript strict mode** + `verbatimModuleSyntax` + `noUncheckedIndexedAccess`
- **ESM** — all local imports use `.js` extensions, `import type` for type-only imports
- **No `any`** — use proper interfaces from `src/types.ts` or `@babel/types`
- **Self-contained rules** — each rule owns its state via closure inside `registerListeners`
- **Visitor pattern** — rules declare AST events, orchestrator dispatches
- **Multi-component support** — `parseReactComponent` returns `AnalysisResult[]`, not a single result
- **File-level pass** — full-program AST walk for `rulesOfHooks` with cycle-safe `skipStack`
- **Auto-lint instructions** — `~/.config/opencode/instructions/pristine.md` forces AI to call `analyze_react_file` after every `.tsx` edit
