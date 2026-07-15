import type { RuleContext, ASTListener } from "../types.js";
import { getCallName } from "../parser/astHelpers.js";

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  return {
    "CallExpression": [
      (node: any) => {
        if (getCallName(node) === "useEffect" && (node.arguments?.length ?? 0) < 2) {
          context.violations.push({
            ruleName: "naked-effect",
            severity: "error",
            line: node.loc?.start.line ?? 0,
            message: `useEffect is missing a dependency array at line ${node.loc?.start.line ?? 0}. This causes the effect to run on every single render, which can lead to infinite loops.`,
          });
        }
      },
    ],
  };
}
