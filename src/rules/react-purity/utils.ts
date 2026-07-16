/**
 * Pure AST utility functions shared across react-purity sub-rules.
 */

/**
 * Extract the bound variable names from a function's destructured
 * parameters (React props idiom).
 *
 * Handles:
 *   { user }           → shorthand ObjectProperty
 *   { user: userName } → renamed property
 *   { user = "guest" } → AssignmentPattern default
 *   { ...rest }        → RestElement
 *   function Foo({...} = defaultProps) → outer AssignmentPattern
 *   function Foo(props) → undestructured Identifier
 */
export function extractPropNames(
  functionNode: Record<string, unknown> | undefined,
): string[] {
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
 *   props     →  "props"   (simple Identifier, not a MemberExpression)
 */
export function getMemberRoot(node: Record<string, unknown>): string | null {
  let current = node;
  while (current.type === "MemberExpression") {
    current = current.object as Record<string, unknown>;
  }
  return current.type === "Identifier" ? (current.name as string) : null;
}
