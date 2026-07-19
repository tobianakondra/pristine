# 🛡️ Release Notes v1.0.0 - Pristine-MCP: The Ultimate AI Guardrail

We are incredibly proud to announce the formal **v1.0.0 Stable Production Release** of **Pristine-MCP**! This milestone marks the completion of our advanced architectural isolation framework, turning your local repository into an impenetrable fortress against AI-generated "spaghetti code", broken abstraction layers, and React Server Component (RSC) boundary leaks.

Pristine-MCP is a **Stdio-based Model Context Protocol (MCP) Server** that leverages high-precision Babel AST static analysis. It provides immediate, zero-runtime-overhead guardrails directly inside AI-native development workflows (including **Cursor**, **Claude Code**, and localized LLM agents using Ollama/Qwen).

---

## ⚡ Key Highlights & Architecture

- **True Multi-Agent Alignment:** Designed specifically to be called as an automated tool by LLMs. It intercepts faulty design choices at the typing and structural levels before code enters your Git staging environment.
- **Babel-Powered AST Parsing:** Bypasses superficial regex linting in favor of deep syntactic tree inspection, matching accurate syntax configurations across hybrid React and Next.js projects.
- **English-Standardized Localization:** All architectural violation diagnostics, tokens, and contextual hints are normalized in crisp, professional English to guarantee universal understanding by AI coding agents.
- **Production-Tested Stability:** Backed by an extensive suite of **72+ automated unit and integration tests** ensuring absolute deterministic parsing with zero false positives across complex edge cases.

---

## 🛡️ Complete Rules Engine (12 Production-Ready Rules)

Pristine-MCP enforces a dual-layer architectural policy matrix comprising exactly **12 strict validation rules**:

### 📦 Layer 1: Core React & Code Quality Baseline (9 Rules)
1. **No Explicit Any (`no-explicit-any`):** Eliminates loose type declarations across components to protect TypeScript boundaries.
2. **Anti-Prop Drilling (`anti-prop-drilling`):** Flags extreme prop distribution depths to keep state management centralized or modular.
3. **Inline Style Restrictions (`no-inline-styles`):** Blocks unmanageable, bloated inline CSS configurations in favor of modular patterns or Tailwind CSS.
4. *Plus 6 additional core rules managing hooks dependencies, layout purity, conditional rendering constraints, and component structural ergonomics.*

### ⚡ Layer 2: Next.js React Server Components (RSC) Isolation (3 Rules)
- **Rule 10 (`rsc-server-hooks`):** Automatically blocks the deployment of client-side reactivity paradigms (`useState`, `useEffect`, or custom interactive hooks) within native Server Components unless a clear `"use client"` boundary directive is present.
- **Rule 11 (`rsc-browser-apis`):** Intercepts and mitigates server-side rendering crashes by blocking premature calls to client-exclusive browser objects (`window`, `document`, `localStorage`).
- **Rule 12 (`rsc-serializable-props`):** Guarantees flawless network wire serialization. It blocks non-serializable elements—such as inline arrow functions, closures, or custom DOM event handlers like `onClick` and `onChange`—from crossing from server modules into downstream Client Components.

---

## 🛠️ Multi-Agent Integration Configurations

To activate Pristine-MCP immediately within your preferred environment, use the following configurations:

### 1. Claude Code Setup (`~/.config/claude/project.json` or local workspace)
```json
{
  "mcpServers": {
    "pristine-mcp": {
      "command": "node",
      "args": ["/path/to/pristine/dist/index.js"]
    }
  }
}
```
