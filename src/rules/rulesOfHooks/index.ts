import type { RuleContext, ASTListener } from "../../types.js";
import { isHookCall, getCallName } from "../../parser/astHelpers.js";

const CONDITIONAL_TYPES = new Set([
  "IfStatement",
  "SwitchStatement",
  "ConditionalExpression",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "TryStatement",
  "CatchClause",
]);

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function getFunctionName(node: Record<string, unknown>): string {
  const id = node.id as Record<string, unknown> | undefined;
  if (id?.type === "Identifier") return id.name as string;
  return "(anonymous)";
}

function findNearestNamedFunction(stack: string[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const name = stack[i];
    if (name && name !== "(anonymous)") return name;
  }
  return null;
}

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let conditionalDepth = 0;
  let functionDepth = 0;
  const functionStack: string[] = [];
  const skipStack: boolean[] = [];
  const listeners: Record<string, ASTListener[]> = {};

  const isComponentWalk = !!context.functionNode;
  const fnNode = context.functionNode as Record<string, unknown> | undefined;
  if (fnNode) {
    functionStack.push(getFunctionName(fnNode));
  }

  for (const type of CONDITIONAL_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => conditionalDepth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => conditionalDepth--);
  }

  for (const type of FUNCTION_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push((node: Record<string, unknown>) => {
      functionDepth++;
      const name = getFunctionName(node);
      functionStack.push(name);
      if (!isComponentWalk) {
        const shouldSkip = /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
        skipStack.push(shouldSkip);
      }
    });
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => {
      functionDepth--;
      functionStack.pop();
      if (!isComponentWalk) {
        skipStack.pop();
      }
    });
  }

  listeners["CallExpression"] = [
    (node: any) => {
      const name = getCallName(node);
      if (!name || !isHookCall(name)) return;

      if (!isComponentWalk && skipStack.some(Boolean)) return;

      if (conditionalDepth > 0 || (isComponentWalk && functionDepth > 0)) {
        context.violations.push({
          ruleName: "rules-of-hooks-conditional",
          severity: "error",
          line: node.loc?.start.line ?? 0,
          message: `Hook "${name}" is called conditionally. React Hooks must be called at the top level of the component, not inside conditions, loops, or nested functions.`,
        });
        return;
      }

      const nearestFunction = findNearestNamedFunction(functionStack) ?? context.componentName;
      const isComponentOrHook = /^[A-Z]/.test(nearestFunction) || /^use[A-Z]/.test(nearestFunction);
      if (!isComponentOrHook) {
        context.violations.push({
          ruleName: "rules-of-hooks-context",
          severity: "error",
          line: node.loc?.start.line ?? 0,
          message: `Hook "${name}" is called inside "${nearestFunction}" which is not a React component or custom Hook. Hooks can only be called within a React component (uppercase name) or a custom Hook (use* prefix).`,
        });
      }
    },
  ];

  return listeners;
}
