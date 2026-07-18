import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DOC_URL = new URL("../../docs/thinking-in-react.md", import.meta.url);

const METHODOLOGY = readFileSync(DOC_URL, "utf-8");

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
    ({ feature }) => ({
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
              METHODOLOGY,
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
    }),
  );
}
