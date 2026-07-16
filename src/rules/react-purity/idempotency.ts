import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { getMemberRoot } from "./utils.js";

/**
 * Global-object methods that are non-idempotent.
 * Map: root object name → Set of method names.
 *
 * Each call produces a different value on every invocation and
 * therefore breaks React render purity.
 */
const NON_IDEMPOTENT_MEMBER_CALLS = new Map<string, Set<string>>([
  ["Math", new Set(["random"])],
  ["Date", new Set(["now"])],
  ["performance", new Set(["now"])],
  ["crypto", new Set(["randomUUID", "getRandomValues"])],
]);

/**
 * Standalone function names (identifiers) that are non-idempotent.
 * These are typically imported from libraries like `uuid` or `nanoid`.
 */
const NON_IDEMPOTENT_IDENTIFIER_CALLS = new Set<string>([
  "uuid",
  "uuidv4",
  "nanoid",
]);

/**
 * Constructor calls that produce non-idempotent values.
 */
const NON_IDEMPOTENT_NEW = new Set<string>(["Date"]);

/**
 * Rule: idempotency
 *
 * Detects non-idempotent expressions invoked directly in the render
 * body (depth === 0). Calls at depth > 0 (inside useEffect callbacks,
 * event handlers, or nested functions) are correctly ignored.
 *
 * Detected patterns:
 *
 *   MemberExpression calls:
 *     Math.random()   |   Date.now()   |   performance.now()
 *     crypto.randomUUID()   |   crypto.getRandomValues()
 *
 *   Identifier calls:
 *     uuid()  |  uuidv4()  |  nanoid()
 *
 *   Constructor calls:
 *     new Date()
 *
 * Why this matters:
 * React assumes the render phase is a pure computation. Non-idempotent
 * expressions produce different values on every call, which causes
 * hydration mismatches in SSR and makes components unpredictable.
 * They should be moved into a useEffect or an event handler.
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

  // ── CallExpression ─────────────────────────────────────────────────
  //    MemberExpression:  Math.random()  |  Date.now()  |  crypto.randomUUID()
  //    Identifier:        uuid()  |  nanoid()
  // ────────────────────────────────────────────────────────────────────
  const existingCall = listeners["CallExpression"];
  const callListeners: ASTListener[] = [
    (node: any) => {
      if (depth !== 0) return;

      const callee = node.callee;
      if (!callee) return;

      // ── Case A: Identifier call (e.g. uuid(), nanoid()) ────────────
      if (callee.type === "Identifier") {
        if (NON_IDEMPOTENT_IDENTIFIER_CALLS.has(callee.name)) {
          context.violations.push({
            ruleName: "react-purity",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Non-idempotent expression '${callee.name}()' detected directly in render body. Move this logic to a useEffect or an event handler.`,
          });
        }
        return;
      }

      // ── Case B: MemberExpression call (e.g. Math.random()) ─────────
      if (callee.type === "MemberExpression") {
        const root = getMemberRoot(callee);
        const method = callee.property
          ? (callee.property as Record<string, unknown>).name as string
          : "";
        if (!root || !method) return;

        const allowedMethods = NON_IDEMPOTENT_MEMBER_CALLS.get(root);
        if (allowedMethods?.has(method)) {
          context.violations.push({
            ruleName: "react-purity",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Non-idempotent expression '${root}.${method}()' detected directly in render body. Move this logic to a useEffect or an event handler.`,
          });
        }
      }
    },
  ];

  listeners["CallExpression"] = existingCall
    ? [...existingCall, ...callListeners]
    : callListeners;

  return listeners;
}
