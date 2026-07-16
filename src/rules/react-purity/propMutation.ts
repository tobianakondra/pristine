import type { RuleContext, ASTListener } from "../../types.js";
import { extractPropNames, getMemberRoot } from "./utils.js";

/**
 * Object mutation methods that indicate a prop is being mutated in-place
 * (e.g. `props.items.push(x)` or `list.splice(0, 1)`).
 */
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

/**
 * Check whether the left-hand side of an AssignmentExpression is a
 * mutation of a prop variable.  Returns the prop name if so, else null.
 *
 * Matches:
 *   name = value             (direct destructured prop)
 *   props.name = value       (undestructured props)
 *   user.name = value        (nested member on a destructured prop)
 */
function checkPropMutation(
  left: Record<string, unknown>,
  propNames: Set<string>,
  hasPropsParam: boolean,
): string | null {
  if (left.type === "Identifier" && propNames.has(left.name as string)) {
    return left.name as string;
  }

  if (left.type === "MemberExpression") {
    const root = getMemberRoot(left);
    if (root && propNames.has(root)) return root;
    if (root === "props" && hasPropsParam) {
      return left.property
        ? (left.property as Record<string, unknown>).name as string
        : "props";
    }
  }

  return null;
}

/**
 * Register listeners that detect prop mutations via direct assignment
 * (`props.name = value`) and via mutation method calls (`items.push(x)`).
 */
export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  const functionNode = context.functionNode as Record<string, unknown> | undefined;
  const rawNames = extractPropNames(functionNode);

  const hasPropsParam = (functionNode?.params as Record<string, unknown>[] | undefined)
    ?.some((p) => p.type === "Identifier" && p.name === "props") ?? false;

  const propNames = new Set(rawNames);

  if (propNames.size === 0 && !hasPropsParam) {
    // No props to check — nothing to detect.
    return {};
  }

  const listeners: Record<string, ASTListener[]> = {};

  // ── AssignmentExpression:  prop = value  |  props.name = value  ──
  listeners["AssignmentExpression"] = [
    (node: any) => {
      const left = node.left;
      if (!left) return;

      const mutated = checkPropMutation(left, propNames, hasPropsParam);
      if (mutated) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Component attempts to mutate prop '${mutated}' directly. Props in React must be read-only.`,
        });
      }
    },
  ];

  // ── CallExpression:  props.items.push(...)  ──────────────────────
  listeners["CallExpression"] = [
    (node: any) => {
      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      const methodName = callee.property?.name as string | undefined;
      if (!methodName || !MUTATION_METHODS.has(methodName)) return;

      const root = getMemberRoot(callee);
      if ((root === "props" && hasPropsParam) || (root && propNames.has(root))) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Component attempts to mutate prop '${root}' via '${methodName}()'. Props in React must be read-only.`,
        });
      }
    },
  ];

  return listeners;
}
