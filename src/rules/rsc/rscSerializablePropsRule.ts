import type { RuleContext, ASTListener } from "../../types.js";

const FUNCTION_TYPES = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

function isFunctionExpression(expr: any): boolean {
  if (!expr) return false;
  return FUNCTION_TYPES.has(expr.type);
}

export function registerListeners(
  context: RuleContext,
  isClientComponent: boolean,
): Record<string, ASTListener[]> {
  const listeners: Record<string, ASTListener[]> = {};

  if (isClientComponent) return listeners;

  listeners["JSXAttribute"] = [
    (node: any) => {
      const attrName = node.name?.name;
      if (!attrName || typeof attrName !== "string") return;

      // Check 1: prop name starts with "on" (React event handler convention)
      if (attrName.startsWith("on")) {
        context.violations.push({
          ruleName: "rsc-serializable-props",
          severity: "error",
          line: node.loc?.start.line ?? 0,
          message: `RSC Violation: Non-serializable prop '${attrName}' passed from a Server Component. Functions or event handlers cannot cross the network boundary to Client Components.`,
        });
        return;
      }

      // Check 2: value is an inline function expression
      const value = node.value;
      if (value?.type === "JSXExpressionContainer" && isFunctionExpression(value.expression)) {
        context.violations.push({
          ruleName: "rsc-serializable-props",
          severity: "error",
          line: node.loc?.start.line ?? 0,
          message: `RSC Violation: Non-serializable prop '${attrName}' passed from a Server Component. Functions or event handlers cannot cross the network boundary to Client Components.`,
        });
      }
    },
  ];

  return listeners;
}
