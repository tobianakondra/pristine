import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { registerListeners as registerStateFatness } from "./stateFatness.js";

// ── Constants ────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract the bound variable names from a function's destructured
 * parameters.
 */
function extractPropNames(functionNode: Record<string, unknown> | undefined): string[] {
  if (!functionNode?.params) return [];
  const names: string[] = [];
  const params = functionNode.params as Record<string, unknown>[];

  for (let param of params) {
    if (param.type === "AssignmentPattern") {
      param = param.left as Record<string, unknown>;
    }

    if (param.type !== "ObjectPattern" && param.type !== "Identifier") continue;

    if (param.type === "Identifier") {
      names.push(param.name as string);
      continue;
    }

    const properties = param.properties as Record<string, unknown>[] | undefined;
    if (!properties) continue;

    for (const prop of properties) {
      if (prop.type === "RestElement") {
        const arg = prop.argument as Record<string, unknown> | undefined;
        if (arg?.type === "Identifier") names.push(arg.name as string);
        continue;
      }

      let valueNode = prop.value as Record<string, unknown> | undefined;
      if (valueNode?.type === "AssignmentPattern") {
        valueNode = valueNode.left as Record<string, unknown> | undefined;
      }
      if (valueNode?.type === "Identifier") {
        names.push(valueNode.name as string);
      }
    }
  }

  return names;
}

/**
 * Walk up nested MemberExpression chains to find the root identifier.
 *
 *   a.b.c     →  "a"
 *   foo.bar   →  "foo"
 */
function getMemberRoot(node: Record<string, unknown>): string | null {
  let current = node;
  while (current.type === "MemberExpression") {
    current = current.object as Record<string, unknown>;
  }
  return current.type === "Identifier" ? (current.name as string) : null;
}

/**
 * Check whether the left-hand side of an AssignmentExpression is a
 * mutation of a prop variable.  Returns the prop name if so, else null.
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
    if (root === "props" && hasPropsParam) return left.property
      ? (left.property as Record<string, unknown>).name as string
      : "props";
  }

  return null;
}

/**
 * Check whether a MemberExpression callee is a side-effect call.
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
 */
function isSideEffectAssignment(left: Record<string, unknown>): boolean {
  if (left.type !== "MemberExpression") return false;
  const root = getMemberRoot(left);

  if (!root) return false;

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

// ── Merge helper ─────────────────────────────────────────────────────────

function mergeListeners(
  target: Record<string, ASTListener[]>,
  source: Record<string, ASTListener[]>,
): void {
  for (const [nodeType, callbacks] of Object.entries(source)) {
    if (!target[nodeType]) target[nodeType] = [];
    target[nodeType].push(...callbacks);
  }
}

// ── Rule entry point ─────────────────────────────────────────────────────

/**
 * Rule: react-purity
 *
 * Combines multiple sub-detections that enforce React's purity contract:
 *
 * 1. **State fatness** (sub-rule) — warns when a component uses > 4 `useState`
 * 2. **No prop mutation** — flags any AssignmentExpression or mutation method
 *    call (push, splice, etc.) that modifies a prop variable.
 * 3. **No render side effects** — flags side-effect operations (localStorage,
 *    document.title, window.location, history.pushState, console.log, etc.)
 *    invoked directly in the component body outside useEffect/event handlers.
 *
 * Depth tracking is used to determine whether a CallExpression or
 * AssignmentExpression sits at the top level of the render body
 * (depth === 0) or inside a branching / function construct where
 * side effects are acceptable (depth > 0).
 */
export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  // ── Merge sub-rule listeners ─────────────────────────────────────────
  const listeners: Record<string, ASTListener[]> = {};

  // 1. State fatness: counts useState calls, reports via onComplete
  mergeListeners(listeners, registerStateFatness(context));

  // ── Setup for prop mutation + render side effects ────────────────────
  const functionNode = context.functionNode as Record<string, unknown> | undefined;
  const rawNames = extractPropNames(functionNode);

  const hasPropsParam = (functionNode?.params as Record<string, unknown>[] | undefined)
    ?.some((p) => p.type === "Identifier" && p.name === "props") ?? false;

  const propNames = new Set(rawNames);

  // ── Depth tracking ──────────────────────────────────────────────────
  let depth = 0;

  for (const type of BRANCHING_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => depth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => depth--);
  }

  // ── AssignmentExpression listener ──────────────────────────────────
  const existingAssignment = listeners["AssignmentExpression"] || [];
  listeners["AssignmentExpression"] = [
    ...existingAssignment,
    (node: any) => {
      const left = node.left;
      if (!left) return;

      // 1. Prop mutation detection (any depth)
      const mutated = checkPropMutation(left, propNames, hasPropsParam);
      if (mutated) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Component attempts to mutate prop '${mutated}' directly. Props in React must be read-only.`,
        });
        return;
      }

      // 2. Render side effect: global property assignment at depth 0
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

  // ── CallExpression listener ────────────────────────────────────────
  const existingCall = listeners["CallExpression"] || [];
  listeners["CallExpression"] = [
    ...existingCall,
    (node: any) => {
      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      const methodName = callee.property?.name as string | undefined;
      if (!methodName) return;

      // 1. Prop mutation via method call (e.g. props.items.push(...))
      if (MUTATION_METHODS.has(methodName)) {
        const root = getMemberRoot(callee);
        if ((root === "props" && hasPropsParam) || (root && propNames.has(root))) {
          context.violations.push({
            ruleName: "react-purity",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Component attempts to mutate prop '${root}' via '${methodName}()'. Props in React must be read-only.`,
          });
          return;
        }
      }

      // 2. Render side effect call at depth 0
      if (depth === 0 && isSideEffectCall(callee)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: "Side effect detected directly in render body. Move this logic to a useEffect or an event handler.",
        });
      }
    },
  ];

  return listeners;
}
