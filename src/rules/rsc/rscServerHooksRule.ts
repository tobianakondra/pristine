import type { RuleContext, ASTListener } from "../../types.js";
import { isHookCall, getCallName } from "../../parser/astHelpers.js";

export function registerListeners(
  context: RuleContext,
  isClientComponent: boolean,
): Record<string, ASTListener[]> {
  const listeners: Record<string, ASTListener[]> = {};

  if (isClientComponent) return listeners;

  listeners["CallExpression"] = [
    (node: any) => {
      const name = getCallName(node);
      if (!name || !isHookCall(name)) return;

      context.violations.push({
        ruleName: "rsc-server-hooks",
        severity: "error",
        line: node.loc?.start.line ?? 0,
        message: `RSC Violation: The Hook '${name}' cannot be used in a Server Component. Add the 'use client' directive at the top of the file if this component requires state.`,
      });
    },
  ];

  return listeners;
}
