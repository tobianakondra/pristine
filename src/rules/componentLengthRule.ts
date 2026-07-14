import type { RuleViolation } from "../types.js";

const MAX_COMPONENT_LINES = 100;

export function checkComponentLength(
  componentName: string,
  totalLines: number,
): RuleViolation[] {
  if (totalLines > MAX_COMPONENT_LINES) {
    return [
      {
        ruleName: "component-length",
        severity: "warning",
        line: 1,
        message: `Component "${componentName}" is ${totalLines} lines long (max: ${MAX_COMPONENT_LINES}). Consider extracting parts into smaller components or custom hooks.`,
      },
    ];
  }
  return [];
}
