import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { getMemberRoot } from "./utils.js";

/**
 * Global objects whose method calls are considered side effects when
 * invoked directly in the render body (not inside useEffect, event
 * handlers, or nested functions).
 */
const SIDE_EFFECT_GLOBALS = new Map<string, Set<string>>([
  ["localStorage", new Set(["setItem", "removeItem", "clear"])],
  ["sessionStorage", new Set(["setItem", "removeItem", "clear"])],
  ["history", new Set(["pushState", "replaceState"])],
  ["window", new Set(["alert", "confirm", "prompt", "open", "close"])],
  ["console", new Set(["log", "warn", "error", "info", "debug"])],
]);

/**
 * Global property assignments that constitute side effects when written
 * directly in the render body.
 * Map: globalObject → Set of property paths (e.g. "title" or "location.href").
 */
const SIDE_EFFECT_ASSIGNMENTS = new Map<string, Set<string>>([
  ["document", new Set(["title"])],
  ["window", new Set(["location", "location.href"])],
]);

/**
 * Check whether a MemberExpression callee is a side-effect call.
 *
 * Matches:
 *   localStorage.setItem(...)
 *   history.pushState(...)
 *   window.alert(...)
 *   console.log(...)
 */
function isSideEffectCall(callee: Record<string, unknown>): boolean {
  if (callee.type !== "MemberExpression") return false;
  const root = getMemberRoot(callee);
  const method = callee.property
    ? (callee.property as Record<string, unknown>).name as string
    : "";
  if (!root || !method) return false;

  const allowedMethods = SIDE_EFFECT_GLOBALS.get(root);
  return allowedMethods !== undefined && allowedMethods.has(method);
}

/**
 * Check whether the left-hand side of an AssignmentExpression is a
 * side-effect write to a global object property.
 *
 * Matches:
 *   document.title = ...
 *   window.location = ...
 *   window.location.href = ...
 */
function isSideEffectAssignment(left: Record<string, unknown>): boolean {
  if (left.type !== "MemberExpression") return false;
  const root = getMemberRoot(left);
  if (!root) return false;

  // Build the property path (e.g. "title", "location", "location.href")
  const parts: string[] = [];
  let current: Record<string, unknown> = left;
  while (current.type === "MemberExpression") {
    const propName = current.property
      ? (current.property as Record<string, unknown>).name as string
      : "";
    if (propName) parts.unshift(propName);
    current = current.object as Record<string, unknown>;
  }
  const propPath = parts.join(".");

  const allowedProps = SIDE_EFFECT_ASSIGNMENTS.get(root);
  return allowedProps !== undefined && allowedProps.has(propPath);
}

/**
 * Register listeners that detect side-effect operations invoked directly
 * in the render body (depth === 0), outside useEffect, event handlers,
 * or nested functions.
 *
 * Depth is tracked via BRANCHING_TYPES enter/exit callbacks so that
 * side effects inside useEffect callbacks or onClick handlers are
 * correctly ignored (depth > 0).
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

  // ── CallExpression:  localStorage.setItem(...) | history.pushState(...) ──
  const callListeners: ASTListener[] = [
    (node: any) => {
      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      if (isSideEffectCall(callee) && depth === 0) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: "Side effect detected directly in render body. Move this logic to a useEffect or an event handler.",
        });
      }
    },
  ];

  // ── AssignmentExpression:  document.title = ...  |  window.location = ... ──
  const assignListeners: ASTListener[] = [
    (node: any) => {
      const left = node.left;
      if (!left) return;

      if (depth === 0 && isSideEffectAssignment(left)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: "Side effect detected directly in render body. Move this logic to a useEffect or an event handler.",
        });
      }
    },
  ];

  // Merge with any existing listeners from other sub-rules for the
  // same node types (e.g. propMutation may already have registered).
  const existingCall = listeners["CallExpression"];
  listeners["CallExpression"] = existingCall
    ? [...existingCall, ...callListeners]
    : callListeners;

  const existingAssign = listeners["AssignmentExpression"];
  listeners["AssignmentExpression"] = existingAssign
    ? [...existingAssign, ...assignListeners]
    : assignListeners;

  return listeners;
}
