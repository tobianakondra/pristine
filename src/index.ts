import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseReactComponent } from "./parser/reactComponentParser.js";
import type { AnalysisResult } from "./types.js";

const server = new McpServer({
  name: "pristine-mcp",
  version: "1.0.0",
});

server.tool(
  "analyze_react_component",
  "Analyzes a React component file (.tsx) to check if it complies with core maintainability rules: component length, hooks separation, no inline data fetching, no naked useEffect calls, no explicit any types, and no inline style abuse (> 3 CSS properties).",
  {
    filePath: z
      .string()
      .min(1)
      .describe("The absolute or relative path to the React component file."),
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
    return {
      content: [{ type: "text", text: formatted }],
    };
  },
);

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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pristine MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
