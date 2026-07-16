import type { RuleContext, ASTListener } from "../../types.js";
import { BRANCHING_TYPES } from "../../parser/astHelpers.js";
import { getMemberRoot } from "./utils.js";

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

function collectPatternNames(node: Record<string, unknown> | null | undefined, vars: Set<string>): void {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      vars.add(node.name as string);
      break;
    case "ObjectPattern": {
      const props = node.properties as Record<string, unknown>[] | undefined;
      if (props) {
        for (const prop of props) {
          if (prop.type === "RestElement") {
            collectPatternNames(prop.argument as Record<string, unknown>, vars);
          } else {
            let value = prop.value as Record<string, unknown> | undefined;
            if (value?.type === "AssignmentPattern") {
              value = value.left as Record<string, unknown>;
            }
            collectPatternNames(value, vars);
          }
        }
      }
      break;
    }
    case "ArrayPattern": {
      const elements = node.elements as (Record<string, unknown> | null)[] | undefined;
      if (elements) {
        for (const el of elements) {
          collectPatternNames(el, vars);
        }
      }
      break;
    }
    case "AssignmentPattern":
      collectPatternNames(node.left as Record<string, unknown>, vars);
      break;
  }
}

function collectDeclarations(node: Record<string, unknown> | null | undefined, vars: Set<string>): void {
  if (!node) return;

  if (node.type === "BlockStatement") {
    const stmts = node.body as Record<string, unknown>[] | undefined;
    if (stmts) {
      for (const stmt of stmts) {
        collectDeclarations(stmt, vars);
      }
    }
    return;
  }

  if (node.type === "VariableDeclaration") {
    const decls = node.declarations as Record<string, unknown>[] | undefined;
    if (decls) {
      for (const decl of decls) {
        collectPatternNames(decl.id as Record<string, unknown>, vars);
      }
    }
    return;
  }

  if (node.type === "FunctionDeclaration") {
    const id = node.id as Record<string, unknown> | undefined;
    if (id?.type === "Identifier") {
      vars.add(id.name as string);
    }
    return;
  }

  if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    return;
  }

  if (node.type === "IfStatement") {
    collectDeclarations(node.consequent as Record<string, unknown>, vars);
    if (node.alternate) collectDeclarations(node.alternate as Record<string, unknown>, vars);
    return;
  }

  if (node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement" || node.type === "WhileStatement" || node.type === "DoWhileStatement") {
    collectDeclarations(node.body as Record<string, unknown>, vars);
    return;
  }

  if (node.type === "SwitchStatement") {
    const cases = node.cases as Record<string, unknown>[] | undefined;
    if (cases) {
      for (const caseClause of cases) {
        const conseq = caseClause.consequent as Record<string, unknown>[] | undefined;
        if (conseq) {
          for (const stmt of conseq) collectDeclarations(stmt, vars);
        }
      }
    }
    return;
  }

  if (node.type === "TryStatement") {
    collectDeclarations(node.block as Record<string, unknown>, vars);
    if (node.handler) collectDeclarations((node.handler as Record<string, unknown>).body as Record<string, unknown>, vars);
    if (node.finalizer) collectDeclarations(node.finalizer as Record<string, unknown>, vars);
    return;
  }

  if (node.type === "LabeledStatement") {
    collectDeclarations(node.body as Record<string, unknown>, vars);
    return;
  }

  if (node.type === "WithStatement") {
    collectDeclarations(node.body as Record<string, unknown>, vars);
    return;
  }
}

function collectLocalVariables(functionNode: Record<string, unknown> | undefined): Set<string> {
  const vars = new Set<string>();
  if (!functionNode) return vars;

  const params = functionNode.params as Record<string, unknown>[] | undefined;
  if (params) {
    for (const param of params) {
      collectPatternNames(param, vars);
    }
  }

  const body = functionNode.body as Record<string, unknown> | undefined;
  if (body?.type === "BlockStatement") {
    collectDeclarations(body, vars);
  }

  return vars;
}

export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  let depth = 0;
  const listeners: Record<string, ASTListener[]> = {};

  const localVariables = collectLocalVariables(context.functionNode as Record<string, unknown> | undefined);

  for (const type of BRANCHING_TYPES) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(() => depth++);
    const exitKey = `${type}:exit`;
    if (!listeners[exitKey]) listeners[exitKey] = [];
    listeners[exitKey].push(() => depth--);
  }

  listeners["AssignmentExpression"] = [
    (node: any) => {
      if (depth !== 0) return;

      const left = node.left;
      if (!left) return;

      let root: string | null = null;
      if (left.type === "Identifier") {
        root = left.name as string;
      } else if (left.type === "MemberExpression") {
        root = getMemberRoot(left);
      }

      if (root && !localVariables.has(root)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Out-of-scope mutation: variable '${root}' is not declared locally in this component.`,
        });
      }
    },
  ];

  listeners["UpdateExpression"] = [
    (node: any) => {
      if (depth !== 0) return;

      const argument = node.argument;
      if (!argument) return;

      let root: string | null = null;
      if (argument.type === "Identifier") {
        root = argument.name as string;
      } else if (argument.type === "MemberExpression") {
        root = getMemberRoot(argument);
      }

      if (root && !localVariables.has(root)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Out-of-scope mutation: variable '${root}' is not declared locally in this component.`,
        });
      }
    },
  ];

  const existingCall = listeners["CallExpression"];
  const callListeners: ASTListener[] = [
    (node: any) => {
      if (depth !== 0) return;

      const callee = node.callee;
      if (!callee || callee.type !== "MemberExpression") return;

      const methodName = callee.property?.name as string | undefined;
      if (!methodName || !MUTATION_METHODS.has(methodName)) return;

      const root = getMemberRoot(callee);
      if (root && !localVariables.has(root)) {
        context.violations.push({
          ruleName: "react-purity",
          severity: "warning",
          line: node.loc?.start.line ?? 0,
          message: `Out-of-scope mutation: variable '${root}' is not declared locally in this component.`,
        });
      }
    },
  ];

  listeners["CallExpression"] = existingCall
    ? [...existingCall, ...callListeners]
    : callListeners;

  return listeners;
}
