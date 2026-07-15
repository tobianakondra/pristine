import type { RuleContext, ASTListener } from "../types.js";

const MAX_COMPONENT_LINES = 100;

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  if (context.componentTotalLines > MAX_COMPONENT_LINES) {
    context.violations.push({
      ruleName: "component-length",
      severity: "warning",
      line: 1,
      message: `Component "${context.componentName}" is ${context.componentTotalLines} lines long (max: ${MAX_COMPONENT_LINES}). Consider extracting parts into smaller components or custom hooks.`,
    });
  }
  return {};
}
