import type { RuleViolation } from "../types.js";
import type { InlineStyleUsage } from "../parser/reactComponentParser.js";

const MAX_INLINE_STYLE_PROPERTIES = 3;

export function checkInlineStyleAbuse(
  componentName: string,
  inlineStyles: InlineStyleUsage[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const style of inlineStyles) {
    if (style.propertyCount > MAX_INLINE_STYLE_PROPERTIES) {
      violations.push({
        ruleName: "inline-style-abuse",
        severity: "warning",
        line: style.line,
        message: `Component "${componentName}" exhibits inline style abuse at line ${style.line} (${style.propertyCount} properties). Consider refactoring redundant or complex inline styles into reusable utility classes like Tailwind CSS.`,
      });
    }
  }

  return violations;
}
