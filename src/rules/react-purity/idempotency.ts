import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { getMemberRoot } from "./utils.js";

/**
 * Non-idempotent (non-deterministic) patterns that produce different
 * results on every call and therefore break React render purity.
 */
const NON_IDEMPOTENT_CALLS = new Map<string, Set<string>>([
  ["Math", new Set(["random"])],
]);

const NON_IDEMPOTENT_NEW = new Set(["Date"]);

/**
 * Rule: idempotency
 *
 * Detects non-idempotent expressions (`new Date()`, `Math.random()`)
 * invoked directly in the render body (depth === 0). Calls at depth > 0
 * (inside useEffect callbacks, event handlers, or nested functions) are
 * correctly ignored.
 *
 * Why this matters:
 * React assumes the render phase is a pure computation. Expressions like
 * `new Date()` or `Math.random()` produce different values on every call,
 * which causes hydration mismatches in SSR and makes components
 * unpredictable. These should be moved into a `useEffect` or an event
 * handler.
 */
export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  // ── Depth tracking ──────────────────────────────────────────────────
  let depth = 0;
  const listeners: Record<string, ASTListener[]> = {};

  for (const type of BRANCHING_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => depth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => depth--);
  }

  // ── NewExpression:  new Date()  ────────────────────────────────────
  listeners["NewExpression"] = [
    (node: any) => {
      if (depth !== 0) return;

      const callee = node.callee;
      if (callee?.type === "Identifier" && NON_IDEMPOTENT_NEW.has(callee.name)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Non-idempotent expression 'new ${callee.name}()' detected directly in render body. Move this logic to a useEffect or an event handler.`,
        });
      }
    },
  ];

  // ── CallExpression:  Math.random()  ────────────────────────────────
  const existingCall = listeners["CallExpression"];
  const callListeners: ASTListener[] = [
    (node: any) => {
      if (depth !== 0) return;

      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      const root = getMemberRoot(callee);
      const method = callee.property
        ? (callee.property as Record<string, unknown>).name as string
        : "";
      if (!root || !method) return;

      const allowedMethods = NON_IDEMPOTENT_CALLS.get(root);
      if (allowedMethods?.has(method)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Non-idempotent expression '${root}.${method}()' detected directly in render body. Move this logic to a useEffect or an event handler.`,
        });
      }
    },
  ];

  listeners["CallExpression"] = existingCall
    ? [...existingCall, ...callListeners]
    : callListeners;

  return listeners;
}
