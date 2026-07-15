import type { RuleContext, ASTListener } from "../types.js";
import { getCallName, getCallObject, AXIOS_PROPERTY_METHODS } from "../parser/astHelpers.js";

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  return {
    "CallExpression": [
      (node: any) => {
        const name = getCallName(node);
        if (!name) return;

        if (name === "fetch" && !getCallObject(node)) {
          context.violations.push({
            ruleName: "inline-fetching",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Inline fetch() call detected in component "${context.componentName}" at line ${node.loc?.start.line ?? 0}. Consider extracting data fetching logic into a custom hook or a separate service layer.`,
          });
          return;
        }

        if (getCallObject(node) === "axios" && AXIOS_PROPERTY_METHODS.has(name)) {
          context.violations.push({
            ruleName: "inline-fetching",
            severity: "warning",
            line: node.loc?.start.line ?? 0,
            message: `Inline axios.${name}() call detected in component "${context.componentName}" at line ${node.loc?.start.line ?? 0}. Consider extracting data fetching logic into a custom hook or a separate service layer.`,
          });
        }
      },
    ],
  };
}
