import type { RuleContext, ASTListener } from "../../types.js";

const HOOK_PATTERN = /^use[A-Z]/;

const NATIVE_CONSTRUCTORS = new Set([
  "Array",
  "BigInt",
  "Boolean",
  "Date",
  "Error",
  "Function",
  "Map",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "WeakMap",
  "WeakSet",
]);

function isComponentCall(name: string): boolean {
  return /^[A-Z]/.test(name) && !NATIVE_CONSTRUCTORS.has(name);
}

function isHookName(name: string): boolean {
  return name.length > 3 && HOOK_PATTERN.test(name);
}

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let pendingHookCallee = false;
  const listeners: Record<string, ASTListener[]> = {};

  listeners["CallExpression"] = [
    (node: any) => {
      const callee = node.callee;
      if (!callee) return;

      if (callee.type === "Identifier") {
        const name = callee.name as string;

        if (isComponentCall(name)) {
          context.violations.push({
            ruleName: "react-calls",
            severity: "error",
            line: node.loc?.start.line ?? 0,
            message: `React component '${name}' is called as a function. Use JSX syntax '<${name} />' instead.`,
          });
        }

        if (isHookName(name)) {
          pendingHookCallee = true;
        }
      }

      if (callee.type === "MemberExpression") {
        const prop = callee.property as Record<string, unknown> | undefined;
        if (prop?.type === "Identifier" && isHookName(prop.name as string)) {
          pendingHookCallee = true;
        }
      }
    },
  ];

  listeners["Identifier"] = [
    (node: any) => {
      const name = node.name as string;
      if (!isHookName(name)) return;

      if (pendingHookCallee) {
        pendingHookCallee = false;
        return;
      }

      context.violations.push({
        ruleName: "react-calls",
        severity: "error",
        line: node.loc?.start.line ?? 0,
        message: `Hook '${name}' is referenced as a value but not called. Hooks must be called directly, e.g. '${name}()'.`,
      });
    },
  ];

  return listeners;
}
