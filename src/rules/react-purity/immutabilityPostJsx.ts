import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { getMemberRoot } from "./utils.js";

const MUTATION_METHODS = new Set([
  "push",
  "pop",
  "splice",
  "shift",
  "unshift",
  "reverse",
  "sort",
  "fill",
  "copyWithin",
]);

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let depth = 0;
  const listeners: Record<string, ASTListener[]> = {};
  const jsxVariables = new Map<string, number>();

  for (const type of BRANCHING_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => depth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => depth--);
  }

  listeners["JSXAttribute"] = [
    (node: any) => {
      const value = node.value;
      if (!value || value.type !== "JSXExpressionContainer") return;

      const expr = value.expression;
      if (!expr) return;

      let root: string | null = null;
      if (expr.type === "Identifier") {
        root = expr.name as string;
      } else if (expr.type === "MemberExpression") {
        root = getMemberRoot(expr);
      }

      if (root && !jsxVariables.has(root)) {
        jsxVariables.set(root, node.loc?.start.line ?? 0);
      }
    },
  ];

  listeners["AssignmentExpression"] = [
    (node: any) => {
      if (depth !== 0) return;

      const left = node.left;
      if (!left) return;

      let root: string | null = null;
      if (left.type === "Identifier") {
        root = left.name as string;
      } else if (left.type === "MemberExpression") {
        root = getMemberRoot(left);
      }

      if (!root) return;

      const jsxLine = jsxVariables.get(root);
      if (jsxLine !== undefined && (node.loc?.start.line ?? 0) > jsxLine) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Variable '${root}' was already passed to JSX at line ${jsxLine} and should not be mutated afterwards.`,
        });
      }
    },
  ];

  const existingCall = listeners["CallExpression"];
  const callListeners: ASTListener[] = [
    (node: any) => {
      if (depth !== 0) return;

      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      const methodName = callee.property?.name as string | undefined;
      if (!methodName || !MUTATION_METHODS.has(methodName)) return;

      const root = getMemberRoot(callee);
      if (!root) return;

      const jsxLine = jsxVariables.get(root);
      if (jsxLine !== undefined && (node.loc?.start.line ?? 0) > jsxLine) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Variable '${root}' was already passed to JSX at line ${jsxLine} and should not be mutated via '${methodName}()' afterwards.`,
        });
      }
    },
  ];

  listeners["CallExpression"] = existingCall
    ? [...existingCall, ...callListeners]
    : callListeners;

  return listeners;
}
