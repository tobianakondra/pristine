import type { RuleContext, ASTListener } from "../../types.js";

const BROWSER_API_NAMES = new Set(["window", "document", "localStorage"]);

export function registerListeners(
  context: RuleContext,
  isClientComponent: boolean,
): Record<string, ASTListener[]> {
  const listeners: Record<string, ASTListener[]> = {};

  if (isClientComponent) return listeners;

  // Track Identifier start positions already flagged by MemberExpression
  const memberExprObjectStarts = new Set<number>();

  listeners["MemberExpression"] = [
    (node: any) => {
      if (node.object?.type !== "Identifier") return;
      const name = node.object.name;
      if (!BROWSER_API_NAMES.has(name)) return;

      memberExprObjectStarts.add(node.object.start);

      context.violations.push({
        ruleName: "rsc-browser-apis",
        severity: "error",
        line: node.loc?.start.line ?? 0,
        message: `RSC Violation: Browser API '${name}' is not accessible in a Server Component. Move this logic to a Client Component or guard it properly.`,
      });
    },
  ];

  listeners["Identifier"] = [
    (node: any) => {
      if (!BROWSER_API_NAMES.has(node.name)) return;
      // Skip if this identifier was already flagged as a MemberExpression object
      if (memberExprObjectStarts.has(node.start)) return;

      context.violations.push({
        ruleName: "rsc-browser-apis",
        severity: "error",
        line: node.loc?.start.line ?? 0,
        message: `RSC Violation: Browser API '${node.name}' is not accessible in a Server Component. Move this logic to a Client Component or guard it properly.`,
      });
    },
  ];

  return listeners;
}
