import type { RuleContext, ASTListener } from "../types.js";

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  return {
    "TSAnyKeyword": [
      (node: any) => {
        context.violations.push({
          ruleName: "no-explicit-any",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Explicit 'any' type used in component "${context.componentName}" at line ${node.loc?.start.line ?? 0}. Prefer a specific type or 'unknown' instead.`,
        });
      },
    ],
  };
}
