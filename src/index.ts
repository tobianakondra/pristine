import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseReactComponent } from "./parser/reactComponentParser.js";
import { findTsFiles } from "./utils/fileFinder.js";
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
    // parseReactComponent returns an array (one entry per component
    // found in the file). In most cases there will be one, but the
    // API supports multi-component files without silent skipping.
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

    // Join reports for every component, separated by a blank line.
    const formatted = results.map(formatAnalysisResult).join("\n");
    return {
      content: [{ type: "text", text: formatted }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool 2 — analyze_project_folder
// ---------------------------------------------------------------------------
// Scans an entire directory tree, analyses every React component found,
// and returns aggregate statistics plus per-component violation details.
// ---------------------------------------------------------------------------

server.tool(
  "analyze_project_folder",
  "Scans a project folder recursively and analyses every React component found. Returns aggregate statistics and detailed violation reports.",
  {
    folderPath: z
      .string()
      .min(1)
      .describe("The absolute or relative path to the project folder to scan."),
  },
  async ({ folderPath }) => {
    // 1. Discover all TypeScript files in the directory tree.
    //    findTsFiles skips node_modules, .git, dist, build, and .next.
    const tsFiles = findTsFiles(folderPath);

    if (tsFiles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No TypeScript files found in "${folderPath}". Ensure the path exists and contains .ts or .tsx files.`,
          },
        ],
      };
    }

    // 2. Analyse every file and accumulate all component results.
    //    Each file yields zero, one, or multiple AnalysisResult entries
    //    (one per exported component found in the file).
    const allResults: AnalysisResult[] = [];
    const failedFiles: string[] = [];

    for (const filePath of tsFiles) {
      const componentResults = parseReactComponent(filePath);
      for (const result of componentResults) {
        allResults.push(result);
        if (!result.passed && !failedFiles.includes(filePath)) {
          // Track unique file paths that contain at least one failing component.
          failedFiles.push(filePath);
        }
      }
    }

    // 3. Compute aggregate statistics.
    const totalComponents = allResults.length;
    const failedComponents = allResults.filter((r) => !r.passed).length;
    const totalErrors = allResults.reduce(
      (sum, r) => sum + r.issues.filter((i) => i.severity === "error").length,
      0,
    );
    const totalWarnings = allResults.reduce(
      (sum, r) => sum + r.issues.filter((i) => i.severity === "warning").length,
      0,
    );

    // 4. Build the report.
    const lines: string[] = [];

    // 4a. Summary header.
    lines.push("=".repeat(56));
    lines.push("  Pristine-MCP — Project Scan Report");
    lines.push("=".repeat(56));
    lines.push("");
    lines.push(`  Folder     : ${folderPath}`);
    lines.push(`  TS files   : ${tsFiles.length}`);
    lines.push(`  Components : ${totalComponents}`);
    lines.push(`  Failed     : ${failedComponents}`);
    lines.push(`  Errors     : ${totalErrors}`);
    lines.push(`  Warnings   : ${totalWarnings}`);
    lines.push("");

    // 4b. Detailed violations for every failed component.
    const failedResults = allResults.filter((r) => !r.passed);

    if (failedResults.length === 0) {
      lines.push("  All components PASSED. No violations found.");
      lines.push("");
    } else {
      lines.push(`  Failed components (${failedResults.length}):`);
      lines.push("");

      for (const result of failedResults) {
        // Component header.
        lines.push(`  ── ${result.componentName} (${result.filePath}) ──`);

        for (const issue of result.issues) {
          lines.push(
            `    [${issue.severity.toUpperCase()}] ${issue.ruleName} (line ${issue.line})`,
          );
          lines.push(`         ${issue.message}`);
        }
        lines.push("");
      }
    }

    lines.push("=".repeat(56));

    return {
      content: [{ type: "text", text: lines.join("\n") }],
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
