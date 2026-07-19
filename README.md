# Pristine-MCP — Automated React AST Static Analysis Server

**Pristine-MCP** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that performs **static AST analysis** of React/TypeScript source files. It parses your components with Babel, walks the AST with a custom visitor-pattern engine, and enforces 9 maintainability rules — covering purity, hooks, component conventions, and code quality — all without running the code.

Designed for **AI agents** (Claude, opencode, Cursor, Kiro), Pristine-MCP plugs into the agent's tool ecosystem. After writing a `.tsx` file, the agent automatically calls `analyze_react_file`, receives a structured violation report, and **self-corrects** before presenting the result to you.

---

## Architecture & Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Agent (LLM Client)                        │
│  ┌─────────────┐    writes .tsx    ┌──────────────────────────────┐ │
│  │   Chat /     │ ────────────────▶ │   Temporary File (in memory) │ │
│  │   Prompt     │                   └──────────────┬───────────────┘ │
│  └──────┬──────┘                                   │                │
│         │ auto-invokes                             │                │
│         ▼                                          │                │
│  ┌─────────────┐                                   │                │
│  │   Tool Call  │                                   │                │
│  │  analyze_    │                                   │                │
│  │  react_file  │ ─── stdio JSON-RPC ───           │                │
│  └──────────────┘                     │           │                │
│         │                             ▼           │                │
└─────────┼─────────────────────────────────────────┘                │
          │                                                           │
          ▼                                                           │
┌────────────────────────────────────────────────────────────────┐   │
│                    Pristine-MCP Server                         │   │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │   │
│  │  readFileSync │───▶│ Babel Parser │───▶│  AST Visitor      │  │   │
│  │  (.tsx file)  │    │ (typescript+ │    │  Engine           │  │   │
│  │              │    │  jsx plugins)│    │  (traverseAST)    │  │   │
│  └──────────────┘    └──────────────┘    └────────┬──────────┘  │   │
│                                                   │              │   │
│                    ┌──────────────────────────────┼──────────┐   │   │
│                    │    9 Rule Registrations      │          │   │   │
│                    │  ┌────────────────────────┐  │          │   │   │
│                    │  │ rules-of-hooks         │  │          │   │   │
│                    │  │ naked-effect           │  │          │   │   │
│                    │  │ react-calls            │  │          │   │   │
│                    │  │ inline-fetching        │◀─┘          │   │   │
│                    │  │ inline-style-abuse     │             │   │   │
│                    │  │ state-fatness          │             │   │   │
│                    │  │ no-props-drilling      │             │   │   │
│                    │  │ react-purity (5 subs)  │             │   │   │
│                    │  │ component-length       │             │   │   │
│                    │  └────────────────────────┘             │   │   │
│                    └─────────────────────────────────────────┘   │   │
│                                                   │              │   │
│                                                   ▼              │   │
│                             ┌──────────────────────────┐         │   │
│                             │   AnalysisResult[]        │         │   │
│                             │   violations + metadata   │─── returns ───▶
│                             └──────────────────────────┘         │   │
└────────────────────────────────────────────────────────────────┘   │
                                                                     │
                              ◀── auto-corrige le fichier ──────────┘
```

---

## The 12 Golden Rules

| # | Rule | Severity | Description |
|---|------|----------|-------------|
| 1 | **rules-of-hooks** | `error` | No hooks inside conditionals, loops, or nested functions. Hooks must only be called from component or custom hook bodies. |
| 2 | **naked-effect** | `error` | `useEffect` called without a dependency array — guarantees infinite re-render loops. |
| 3 | **react-calls** | `error` | Components must use JSX syntax (`<Menu />`), never be called as plain functions (`Menu()`). Hooks must be invoked, not referenced as values. |
| 4 | **inline-fetching** | `warning` | Raw `fetch()` / `axios.*()` calls in the component body outside of `useEffect` or event handlers — indicates missing abstraction. |
| 5 | **inline-style-abuse** | `warning` | Inline `style={{...}}` with more than 3 CSS properties — should be extracted to a CSS class. |
| 6 | **state-fatness** | `warning` | More than 4 `useState` calls in a single component — extract state into custom hooks or sub-components. |
| 7 | **no-props-drilling** | `warning` | Props received but never used locally — every reference is a passthrough to a child. Use Context, composition, or custom hooks instead. |
| 8 | **react-purity** | `warning` | Zero side effects, mutations, or non-idempotent expressions in the render body (5 sub-detections: prop mutation, render side effects, non-idempotent, post-JSX mutation, out-of-scope mutation). |
| 9 | **component-length** | `warning` | Components exceeding 100 lines — extract sub-components or custom hooks. |
| 10 | **rsc-server-hooks** | `error` | React Hooks (`useState`, `useEffect`, etc.) called in a file without the `"use client"` directive — Server Components cannot use state or effects. |
| 11 | **rsc-browser-apis** | `error` | Browser APIs (`window`, `document`, `localStorage`) accessed in a Server Component — these globals do not exist on the server. |
| 12 | **rsc-serializable-props** | `error` | Event handlers (`onClick`, `onChange`, etc.) or inline functions passed as props from a Server Component — functions cannot cross the network boundary. |

---

## Prerequisites

- **Node.js** ≥ 20 (tested on v26)
- **npm** ≥ 10

## Installation

```bash
git clone https://github.com/tobianakondra/pristine.git
cd pristine
npm install
npm run build
```

## Running the Server

```bash
# Development (hot-reload via tsx)
npm run dev

# Production (compiled)
npm start

# Debug / visual testing with MCP Inspector
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

The server listens on **stdio** (stdin/stdout JSON-RPC) — the standard MCP transport.  

**`npm run dev`** / **`npm start`** run headless (for agents).  
**MCP Inspector** opens a web UI at `http://localhost:5173` to manually test tools, prompts, and inspect JSON-RPC exchanges — ideal for development and debugging.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run in development mode with `tsx` |
| `npm start` | Run compiled server in production |
| `npm run typecheck` | TypeScript type-check without emitting |
| `npm test` | Run all tests via Vitest |
| `npm run test:watch` | Run tests in watch mode |

---

## Connecting to AI Agents

### opencode

Add to `~/.config/opencode/opencode.jsonc` (global) or `.opencode/opencode.json` (project):

```json
{
  "mcp": {
    "pristine": {
      "type": "local",
      "command": ["node", "/path/to/pristine/dist/index.js"],
      "enabled": true
    }
  }
}
```

For automatic linting on every file write, add an instructions file:

```json
{
  "instructions": ["~/.config/opencode/instructions/pristine.md"]
}
```

Then restart opencode. The AI will call `analyze_react_file` after every `.tsx`/`.ts` edit and fix violations before responding.

### Kiro CLI

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "pristine": {
      "command": "node",
      "args": ["/path/to/pristine/dist/index.js"],
      "disabled": false
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pristine": {
      "command": "node",
      "args": ["/path/to/pristine/dist/index.js"]
    }
  }
}
```

Then restart Cursor. The `analyze_react_file`, `analyze_react_component`, and `analyze_project_folder` tools appear in the tool list. When you ask Cursor to write or fix a React component, it can call pristine to validate the result.

### Claude Code

Add to `~/.claude/settings.json` (global) or `.claude/settings.json` (project):

```json
{
  "mcpServers": {
    "pristine": {
      "command": "node",
      "args": ["/path/to/pristine/dist/index.js"]
    }
  }
}
```

Then restart Claude Code. The MCP tools are available for Claude to invoke during the conversation.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pristine": {
      "command": "node",
      "args": ["/path/to/pristine/dist/index.js"]
    }
  }
}
```

### Any MCP Client

Use the standard MCP configuration format, pointing `command` + `args` to the pristine server entry point (`dist/index.js` after build).

---

## MCP Tools & Prompts

### Tools

| Name | Arguments | Description |
|------|-----------|-------------|
| `analyze_react_file` | `filePath` (required) | Analyze a single `.tsx` file and return violations with instructions to fix |
| `analyze_react_component` | `filePath` (required) | Original single-file analyzer (legacy) |
| `analyze_project_folder` | `folderPath` (required) | Recursive directory scan with aggregate statistics and component tree map |

### Prompts

| Name | Arguments | Description |
|------|-----------|-------------|
| `brainstorm-react` | `feature` (required) | Apply Thinking in React methodology: decompose into components, filter minimal state (3 questions), localize state (common ancestor rule), detect anti-patterns — **before writing any code** |

---

## Brainstorm React — Planning Before Coding

The `/brainstorm-react` prompt guides the AI through the official **Thinking in React** methodology before a single line is written.

**Usage in chat** (opencode, Claude, etc.):

```
/brainstorm-react "a user profile page with editable avatar and notification preferences"
```

The AI walks through 4 phases, **without generating code**:

1. **Component decomposition** — Proposes a component tree, each node with single responsibility
2. **Minimal state filter** — Runs every data candidate through the 3 questions (inherited? derived? constant?)
3. **State localization** — Identifies the common ancestor that should own each state piece
4. **Anti-pattern watch** — Flags potential prop drilling, state-fat components, missing abstractions

The result is a validated design plan that the user approves before implementation begins.

---

## Testing

```bash
npm test
```

Tests use **Vitest** and run against isolated rule modules, parsing inline code strings with the same Babel parser used in production.

There are currently **72 tests** across 4 test files covering:
- `react-calls` — components called as functions, hooks referenced as values
- `rules-of-hooks` — conditional depth, function depth, full-program file-level scan
- React purity sub-rules — prop mutation, side effects, idempotency, immutability, out-of-scope mutation
- Server Component RSC rules — hooks (`useState`/`useEffect`), browser APIs (`window`/`document`/`localStorage`)

---

## Project Structure

```
pristine/
├── src/
│   ├── index.ts                       # McpServer entry point (tools + prompts registration)
│   ├── types.ts                       # Shared types: RuleViolation, AnalysisResult, RuleContext, ASTListener
│   ├── parser/
│   │   ├── astHelpers.ts              # Pure detection helpers (isHookCall, getComponentName, etc.)
│   │   ├── bodyExtractor.ts           # Generic AST walker: traverseAST(node, listeners) with enter/:exit
│   │   └── reactComponentParser.ts    # Orchestrator: parse → find components → merge rules → walk → return
│   ├── prompts/
│   │   └── thinkingInReact.ts         # brainstorm-react prompt registration
│   ├── rules/
│   │   ├── componentLengthRule.ts     # > 100 lines → warning
│   │   ├── inlineFetchingRule.ts      # fetch/axios in render → warning
│   │   ├── inlineStyleAbuseRule.ts    # style={{...}} with > 3 props → warning
│   │   ├── nakedEffectRule.ts         # useEffect without deps → error
│   │   ├── noExplicitAnyRule.ts       # TSAnyKeyword → warning
│   │   ├── noPropsDrillingRule.ts     # Props passed to children without local usage → warning
│   │   ├── rsc/                       # Server Component rules (rsc-server-hooks)
│   │   ├── reactCalls/                # Components as functions + hooks as values → error
│   │   ├── react-purity/              # 5 sub-detections → warning
│   │   └── rulesOfHooks/              # Conditional/context → error
│   ├── tools/
│   │   └── analyzer.ts                # analyze_react_file tool registration
│   └── utils/
│       └── fileFinder.ts              # Recursive .ts/.tsx file discovery
├── docs/
│   ├── architecture.md
│   ├── maintenance.md
│   ├── parser-fixes.md
│   ├── rules.md                       # Full rule reference with examples
│   ├── security.md
│   └── thinking-in-react.md
├── dist/                              # Compiled output (built)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Architecture Highlights

- **Visitor Pattern**: Each rule exports `registerListeners(context) → Record<string, ASTListener[]>`. The orchestrator merges all listeners into one table and calls `traverseAST` once. Rules are self-contained with their own state.
- **Depth Tracking**: Purity rules use a depth counter incremented on branching/function nodes. Violations are only reported at depth 0 (the top-level render body), correctly ignoring code inside `useEffect` or event handlers.
- **Multi-Component Files**: `parseReactComponent` returns `AnalysisResult[]` — every exported component in the file is analyzed, not just the first one found.
- **Full-Program Scan**: `rules-of-hooks` uses a skip-stack mechanism to walk the entire file AST once and catch hook calls in non-component utility functions without duplicating component-body violations.
- **Props Drilling Detection**: Compares total references of a destructured prop to references in JSX attributes. If 100% are passthrough → violation.
- **RSC Boundary Detection**: Scans `ast.program.directives` for `"use client"` at file level; if absent, every hook call (`use*`) in component bodies is flagged as a Server Component violation.

---

## Adding a New Rule

Each rule is a standalone file in `src/rules/`. To add one:

1. Create `src/rules/myRule.ts` exporting:
   ```ts
   export function registerListeners(
     context: RuleContext
   ): Record<string, ASTListener[]>
   ```
2. If the rule needs post-traversal logic, push a callback to `context.onComplete`.
3. If it needs to inspect function parameters, read `context.functionNode`.
4. Import and add the registration function to `RULE_REGISTRATIONS` in `src/parser/reactComponentParser.ts:41`.

No other file changes needed — the pipeline wires it in automatically.

---

## License

ISC
