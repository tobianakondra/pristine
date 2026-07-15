import type { RuleContext, ASTListener } from "../types.js";
import { isHookCall, getCallName } from "../parser/astHelpers.js";

const BRANCHING_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "ConditionalExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
  "TryStatement",
  "CatchClause",
]);

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let depth = 0;
  const listeners: Record<string, ASTListener[]> = {};

  for (const type of BRANCHING_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => depth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => depth--);
  }

  listeners["CallExpression"] = [
    (node: any) => {
      if (depth > 0) {
        const name = getCallName(node);
        if (name && isHookCall(name)) {
          context.violations.push({
            ruleName: "hooks-separation",
            severity: "error",
            line: node.loc?.start.line ?? 0,
            message: `Hook "${name}" is called conditionally inside "${context.componentName}" at line ${node.loc?.start.line ?? 0}. React hooks must be called at the top level of the component, not inside conditions, loops, or nested functions.`,
          });
        }
      }
    },
  ];

  return listeners;
}
