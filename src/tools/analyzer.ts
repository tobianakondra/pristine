import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseReactComponent } from "../parser/reactComponentParser.js";
import type { AnalysisResult } from "../types.js";

export function registerAnalyzerTool(server: McpServer): void {
  server.tool(
    "analyze_react_file",
    "Analyzes a React component file (.tsx) to check compliance with core maintainability rules: component length, hooks separation, no inline data fetching, no naked useEffect calls, no explicit any types, no inline style abuse (> 3 CSS properties), no props drilling, rules of hooks, and React calls purity.",
    {
      filePath: z
        .string()
        .min(1)
        .describe("The absolute or relative path to the React component file to analyze."),
    },
    async ({ filePath }) => {
      const results = parseReactComponent(filePath);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Could not parse "${filePath}" as a React component. Ensure the file exists, is valid TypeScript/TSX, and exports at least one function component returning JSX.`,
            },
          ],
        };
      }

      const formatted = results.map(formatAnalysisResult).join("\n");

      const hasViolations = results.some((r) => !r.passed);

      let responseText = formatted;
      if (hasViolations) {
        responseText +=
          `\n\n⚠️ AST analysis detected violations. You must fix the file to eliminate these errors before proceeding.`;
      }

      return {
        content: [{ type: "text", text: responseText }],
      };
    },
  );
}

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
      lines.push(
        `  [${issue.severity.toUpperCase()}] ${issue.ruleName} (line ${issue.line})`,
      );
      lines.push(`       ${issue.message}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
