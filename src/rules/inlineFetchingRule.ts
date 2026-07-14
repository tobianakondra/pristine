import type { RuleViolation } from "../types.js";
import type { FetchCall } from "../parser/reactComponentParser.js";

export function checkInlineFetching(
  componentName: string,
  fetchCalls: FetchCall[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const call of fetchCalls) {
    violations.push({
      ruleName: "inline-fetching",
      severity: "warning",
      line: call.line,
      message: `Inline ${call.method} call detected in component "${componentName}" at line ${call.line}. Consider extracting data fetching logic into a custom hook or a separate service layer.`,
    });
  }

  return violations;
}
