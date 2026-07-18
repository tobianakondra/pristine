import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DOC_URL = new URL("../../docs/thinking-in-react.md", import.meta.url);

function readMethodology(): string {
  try {
    return readFileSync(DOC_URL, "utf-8");
  } catch {
    return `# Thinking in React — Reference

## 1. Component Decomposition (Single Responsibility)
Split the UI into a component hierarchy. Each component should do one thing.

## 2. The Minimal State Filter
Before adding useState, ask three questions:
1. Does it stay the same over time? → Not state (constant).
2. Is it computed from existing props or state? → Not state (derive it).
3. Is it passed from a parent via props? → Not state (belongs to parent).

## 3. State Localization (Common Ancestor Rule)
Find the closest common ancestor of all components that need the state.
Place state there, pass down via props, callbacks flow up.`;
  }
}

export function registerThinkingPrompt(server: McpServer): void {
  server.prompt(
    "brainstorm-react",
    "Applies Thinking in React methodology to plan a feature before writing any code",
    {
      feature: z
        .string()
        .min(1)
        .describe("The React feature or UI requirement to brainstorm"),
    },
    ({ feature }) => {
      const methodology = readMethodology();

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "You are a React architect. Your task is to brainstorm the following feature using the **Thinking in React** methodology.",
                "",
                "---",
                "## Reference Methodology",
                methodology,
                "---",
                "",
                `## Feature to analyze: "${feature}"`,
                "",
                "Walk through each step and produce a structured plan:",
                "",
                "1. **Component decomposition** — Propose a component hierarchy (draw a tree). Respect single-responsibility. If a component would do too much, split it.",
                "",
                "2. **State minimal filter** — List every piece of data the feature needs and run it through the three questions. Only the survivors become `useState`. Show your reasoning clearly.",
                "",
                "3. **State localization** — For each remaining state, identify the common ancestor that should own it. Show the data flow (props down, callbacks up).",
                "",
                "4. **Anti-pattern watch** — Point out potential issues: prop drilling, state-fat components, side effects in render, missing dependency arrays, etc.",
                "",
                "## Hard constraint",
                "",
                "**DO NOT generate any code.** No JSX, no useState, no useEffect, no function stubs. Keep the entire output at the design/concept level.",
                "",
                "Stop after the plan and ask for validation:",
                "",
                '> "This is the Thinking in React plan for **{feature}**. Do you validate this design before I write the code?"',
                "",
                "Wait for the user's approval before proceeding to implementation.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
