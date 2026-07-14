import type { RuleViolation } from "../types.js";
import type { EffectCall } from "../parser/reactComponentParser.js";

export function checkNakedEffect(
  componentName: string,
  effectCalls: EffectCall[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const effect of effectCalls) {
    if (!effect.hasDependencyArray) {
      violations.push({
        ruleName: "naked-effect",
        severity: "error",
        line: effect.line,
        message: `useEffect is missing a dependency array at line ${effect.line}. This causes the effect to run on every single render, which can lead to infinite loops.`,
      });
    }
  }

  return violations;
}
