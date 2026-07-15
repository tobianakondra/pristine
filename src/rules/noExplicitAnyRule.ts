import type { RuleViolation } from "../types.js";
import type { AnyKeywordUsage } from "../parser/reactComponentParser.js";

export function checkNoExplicitAny(
  componentName: string,
  anyKeywords: AnyKeywordUsage[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const usage of anyKeywords) {
    violations.push({
      ruleName: "no-explicit-any",
      severity: "warning",
      line: usage.line,
      message: `Explicit 'any' type used in component "${componentName}" at line ${usage.line}. Prefer a specific type or 'unknown' instead.`,
    });
  }

  return violations;
}
