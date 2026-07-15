import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseReactComponent } from "./parser/reactComponentParser.js";
import { checkComponentLength } from "./rules/componentLengthRule.js";
import { checkHooksSeparation } from "./rules/hooksSeparationRule.js";
import { checkInlineFetching } from "./rules/inlineFetchingRule.js";
import { checkNakedEffect } from "./rules/nakedEffectRule.js";
import { checkNoExplicitAny } from "./rules/noExplicitAnyRule.js";
import { checkInlineStyleAbuse } from "./rules/inlineStyleAbuseRule.js";
import type { AnalysisResult, RuleViolation } from "./types.js";

// 1. Initialisation du serveur avec le nouveau McpServer (adieu les warnings !)
const server = new McpServer({
  name: "pristine-mcp",
  version: "1.0.0",
});

// 2. Enregistrement direct et typé de ton outil d'analyse
server.tool(
  "analyze_react_component",
  "Analyzes a React component file (.tsx) to check if it complies with core maintainability rules: component length, hooks separation, no inline data fetching, no naked useEffect calls, no explicit any types, and no inline style abuse (> 3 CSS properties).",
  {
    // Zod valide automatiquement que filePath est bien une chaîne non vide
    filePath: z
      .string()
      .min(1)
      .describe("The absolute or relative path to the React component file."),
  },
  async ({ filePath }) => {
    // Appel du parser récursif corrigé
    const parsed = parseReactComponent(filePath);

    if (parsed === null) {
      return {
        content: [
          {
            type: "text",
            text: `Could not parse "${filePath}" as a React component. Ensure the file exists, is valid TypeScript/TSX, and exports a function component returning JSX.`,
          },
        ],
      };
    }

    // Exécution des règles de validation
    const issues: RuleViolation[] = [
      ...checkComponentLength(parsed.name, parsed.totalLines),
      ...checkHooksSeparation(parsed.name, parsed.hooks),
      ...checkInlineFetching(parsed.name, parsed.fetchCalls),
      ...checkNakedEffect(parsed.name, parsed.effectCalls),
      ...checkNoExplicitAny(parsed.name, parsed.anyKeywords),
      ...checkInlineStyleAbuse(parsed.name, parsed.inlineStyles),
    ];

    const result: AnalysisResult = {
      filePath,
      componentName: parsed.name,
      totalLines: parsed.totalLines,
      issues,
      passed: issues.length === 0,
    };

    const formatted = formatAnalysisResult(result);
    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

/**
 * Formate le résultat de l'analyse sous forme textuelle pour l'utilisateur
 */
function formatAnalysisResult(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`Analysis for component: ${result.componentName}`);
  lines.push(`File: ${result.filePath}`);
  lines.push(`Total lines: ${result.totalLines}`);
  lines.push(`Status: ${result.passed ? "PASSED" : "FAILED"}`);
  lines.push("");

  if (result.issues.length === 0) {
    lines.push("No issues found. The component complies with all rules.");
  } else {
    lines.push(`Found ${result.issues.length} issue(s):`);
    lines.push("");
    for (const issue of result.issues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.ruleName} (line ${issue.line})`);
      lines.push(`       ${issue.message}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Point d'entrée principal du serveur MCP utilisant le transport standard STDIO
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pristine MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});