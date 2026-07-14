import type { AnalysisResult, RuleViolation } from "../types.js";
import { parseReactComponent } from "../parser/reactComponentParser.js";
import { checkComponentLength } from "../rules/componentLengthRule.js";
import { checkHooksSeparation } from "../rules/hooksSeparationRule.js";
import { checkInlineFetching } from "../rules/inlineFetchingRule.js";

export interface AnalyzeReactComponentArgs {
  filePath: string;
}

function isAnalyzeReactComponentArgs(value: unknown): value is AnalyzeReactComponentArgs {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.filePath === "string" && candidate.filePath.length > 0;
}

export const analyzeReactComponentDefinition = {
  name: "analyze_react_component",
  description:
    "Analyzes a React component file (.tsx) to check if it complies with core maintainability rules: component length, hooks separation (hooks at top level), and no inline data fetching.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The absolute or relative path to the React component file.",
      },
    },
    required: ["filePath"],
  },
};

export async function handleAnalyzeReactComponent(
  args: unknown,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!isAnalyzeReactComponentArgs(args)) {
    return {
      content: [
        {
          type: "text",
          text: "Error: Invalid arguments. 'filePath' must be a non-empty string.",
        },
      ],
    };
  }

  const parsed = parseReactComponent(args.filePath);

  if (parsed === null) {
    return {
      content: [
        {
          type: "text",
          text: `Could not parse "${args.filePath}" as a React component. Ensure the file exists, is valid TypeScript/TSX, and exports a function component returning JSX.`,
        },
      ],
    };
  }

  const issues: RuleViolation[] = [
    ...checkComponentLength(parsed.name, parsed.totalLines),
    ...checkHooksSeparation(parsed.name, parsed.hooks),
    ...checkInlineFetching(parsed.name, parsed.fetchCalls),
  ];

  const result: AnalysisResult = {
    filePath: args.filePath,
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
