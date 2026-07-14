import type { RuleViolation } from "../types.js";
import type { HookCall } from "../parser/reactComponentParser.js";

export function checkHooksSeparation(
  componentName: string,
  hooks: HookCall[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const hook of hooks) {
    if (!hook.isTopLevel) {
      violations.push({
        ruleName: "hooks-separation",
        severity: "error",
        line: hook.line,
        message: `Hook "${hook.name}" is called conditionally inside "${componentName}" at line ${hook.line}. React hooks must be called at the top level of the component, not inside conditions, loops, or nested functions.`,
      });
    }
  }

  return violations;
}
