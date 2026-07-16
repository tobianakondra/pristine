import type { RuleContext, ASTListener } from "../types.js";

/**
 * Extract the bound variable names from a function's destructured
 * parameters (React props idiom).
 *
 * Handles these Babel AST patterns:
 *   { user }           → shorthand ObjectProperty, value = Identifier("user")
 *   { user: userName } → non-shorthand, value = Identifier("userName")
 *   { user = "guest" } → value = AssignmentPattern{ left: Identifier("user") }
 *   { ...rest }        → RestElement{ argument: Identifier("rest") }
 *   function Foo({...} = defaultProps) → outer AssignmentPattern
 *
 * @param params - The function's `.params` array from the Babel AST.
 * @returns Flat list of variable names bound from destructuring.
 */
function extractPropNames(params: readonly unknown[] | undefined): string[] {
  if (!params) return [];
  const names: string[] = [];

  for (let param of params) {
    const rec = param as Record<string, unknown>;

    // Handle the `function Foo({...} = defaultProps)` case: the outer
    // node is an AssignmentPattern wrapping the ObjectPattern.
    if (rec.type === "AssignmentPattern") {
      param = (rec as Record<string, unknown>).left;
    }

    const inner = param as Record<string, unknown>;
    if (inner.type !== "ObjectPattern") continue;

    const properties = inner.properties as Record<string, unknown>[] | undefined;
    if (!properties) continue;

    for (const prop of properties) {
      // RestElement inside an ObjectPattern:   { ...rest }
      if (prop.type === "RestElement") {
        const arg = prop.argument as Record<string, unknown> | undefined;
        if (arg?.type === "Identifier") {
          names.push(arg.name as string);
        }
        continue;
      }

      // Standard ObjectProperty (shorthand or renamed).
      //   { user }          → shorthand: true,  value = Identifier("user")
      //   { user: userName } → shorthand: false, value = Identifier("userName")
      let valueNode = prop.value as Record<string, unknown> | undefined;

      // Handle default values:  { user = "guest" }
      // The value is an AssignmentPattern whose .left is the real Identifier.
      if (valueNode?.type === "AssignmentPattern") {
        valueNode = valueNode.left as Record<string, unknown> | undefined;
      }

      if (valueNode?.type === "Identifier") {
        names.push(valueNode.name as string);
      }
      // Nested destructuring ({ user: { name } }) is intentionally
      // skipped — those are rarely top-level props and would require
      // a recursive descent that adds complexity without much benefit.
    }
  }

  return names;
}

/**
 * Rule: no-props-drilling
 *
 * Detects props that a component receives but never uses locally —
 * it only passes them down to child components (props drilling).
 *
 * How it works:
 *   1. During `registerListeners`, we inspect the function's `.params`
 *      via the `functionNode` reference on RuleContext to learn which
 *      prop variable names are bound.
 *   2. We register an Identifier listener that counts every reference
 *      to each prop variable, and a JSXAttribute listener that counts
 *      how many times a prop variable appears as a JSX expression value
 *      (i.e. being passed to a child:  <Child prop={var} />).
 *   3. After traversal (`onComplete`), a prop is flagged as *drilled*
 *      if every single reference to it is a passthrough to a child —
 *      none of the references are local expressions, hooks, or JSX text.
 *
 * Limitation: variable shadowing (const user = ... inside the component)
 * cannot be distinguished from the prop at the AST level without a full
 * scope analysis. If a local variable shadows a prop name, references
 * to the local will be counted as references to the prop, potentially
 * masking a drilling violation. This is an accepted simplification.
 */
export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  const functionNode = context.functionNode as Record<string, unknown> | undefined;
  const params = functionNode?.params as readonly unknown[] | undefined;
  const propNames = extractPropNames(params);

  // No destructured props → nothing to check.
  if (propNames.length === 0) return {};

  // ── Tracking state ───────────────────────────────────────────────
  // totalRefs: how many times each prop name appears as an Identifier
  //            anywhere in the component body (including in JSX attrs).
  // drillingRefs: subset of totalRefs — only the occurrences where the
  //               variable appears as a JSX attribute expression value.
  const totalRefs = new Map<string, number>();
  const drillingRefs = new Map<string, number>();

  for (const name of propNames) {
    totalRefs.set(name, 0);
    drillingRefs.set(name, 0);
  }

  // ── Register listeners ───────────────────────────────────────────
  const listeners: Record<string, ASTListener[]> = {};

  // Count every Identifier occurrence that matches a prop name.
  listeners["Identifier"] = [
    (node: any) => {
      if (propNames.includes(node.name)) {
        totalRefs.set(node.name, (totalRefs.get(node.name) ?? 0) + 1);
      }
    },
  ];

  // Count occurrences inside JSX attribute expressions.
  //   <Child user={propName} />   →  JSXAttribute
  //                                  └─ JSXExpressionContainer
  //                                     └─ Identifier("propName")
  listeners["JSXAttribute"] = [
    (node: any) => {
      if (
        node.value?.type === "JSXExpressionContainer" &&
        node.value.expression?.type === "Identifier" &&
        propNames.includes(node.value.expression.name)
      ) {
        drillingRefs.set(
          node.value.expression.name,
          (drillingRefs.get(node.value.expression.name) ?? 0) + 1,
        );
      }
    },
  ];

  // ── Post-traversal evaluation ────────────────────────────────────
  // A prop is "drilled" if every identifier reference to that variable
  // is inside a JSX attribute — it is never read, computed, or displayed
  // anywhere else in the component.
  context.onComplete.push(() => {
    for (const name of propNames) {
      const total = totalRefs.get(name) ?? 0;
      const drilled = drillingRefs.get(name) ?? 0;

      // total > 0 ensures the prop is actually referenced somewhere.
      // total === drilled means every reference is a passthrough.
      if (total > 0 && total === drilled) {
        context.violations.push({
          ruleName: "no-props-drilling",
          severity: "warning",
          line: 1,
          message: `Prop '${name}' is being drilled through component '${context.componentName}' without being used locally.`,
        });
      }
    }
  });

  return listeners;
}
