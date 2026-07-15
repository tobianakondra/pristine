import type { RuleContext, ASTListener } from "../types.js";

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  return {
    "JSXAttribute": [
      (node: any) => {
        if (
          node.name?.name === "style" &&
          node.value?.type === "JSXExpressionContainer" &&
          node.value.expression?.type === "ObjectExpression" &&
          node.value.expression.properties.length > 3
        ) {
          context.violations.push({
            ruleName: "inline-style-abuse",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Component "${context.componentName}" exhibits inline style abuse at line ${node.loc?.start.line ?? 0} (${node.value.expression.properties.length} properties). Consider refactoring redundant or complex inline styles into reusable utility classes like Tailwind CSS.`,
          });
        }
      },
    ],
  };
}
