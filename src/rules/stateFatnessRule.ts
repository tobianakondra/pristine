import type { RuleContext, ASTListener } from "../types.js";

const MAX_LOCAL_STATES = 4;

function isUseStateCall(node: any): boolean {
  return (
    (node.callee?.type === "Identifier" && node.callee.name === "useState") ||
    (node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "useState")
  );
}

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let stateCount = 0;

  context.onComplete.push(() => {
    if (stateCount > MAX_LOCAL_STATES) {
      context.violations.push({
        ruleName: "state-fatness",
        severity: "warning",
        line: 1,
        message: `Component "${context.componentName}" is managing too much local state (${stateCount} useStates). According to 'Thinking in React' principles, consider splitting this component into smaller sub-components or moving complex state logic into a custom hook.`,
      });
    }
  });

  return {
    "CallExpression": [
      (node: any) => {
        if (isUseStateCall(node)) {
          stateCount++;
        }
      },
    ],
  };
}
