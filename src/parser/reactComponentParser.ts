import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import type { Node, BlockStatement, CallExpression, Expression, File } from "@babel/types";
import {
  isIdentifier,
  isMemberExpression,
  isJSXElement,
  isJSXFragment,
  isBlockStatement,
  isReturnStatement,
  isCallExpression,
  isIfStatement,
  isForStatement,
  isWhileStatement,
  isDoWhileStatement,
  isSwitchStatement,
  isConditionalExpression,
  isTryStatement,
  isCatchClause,
  isFunctionDeclaration,
  isFunctionExpression,
  isArrowFunctionExpression,
  isVariableDeclaration,
  isExportDefaultDeclaration,
} from "@babel/types";

export interface HookCall {
  name: string;
  line: number;
  isTopLevel: boolean;
}

export interface FetchCall {
  line: number;
  method: string;
}

export interface ParsedComponent {
  name: string;
  bodyStartLine: number;
  bodyEndLine: number;
  totalLines: number;
  hooks: HookCall[];
  fetchCalls: FetchCall[];
}

const HOOK_REGEX = /^use[A-Z]/;

const AXIOS_PROPERTY_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "request",
]);

function isHookCall(name: string): boolean {
  return name.length > 3 && HOOK_REGEX.test(name);
}

function getCallName(node: CallExpression): string | undefined {
  if (isIdentifier(node.callee)) {
    return node.callee.name;
  }
  if (isMemberExpression(node.callee) && isIdentifier(node.callee.property)) {
    return node.callee.property.name;
  }
  return undefined;
}

function getCallObject(node: CallExpression): string | undefined {
  if (isMemberExpression(node.callee) && isIdentifier(node.callee.object)) {
    return node.callee.object.name;
  }
  return undefined;
}

function isJSXReturningFunction(
  node: Node,
): BlockStatement | Expression | undefined {
  if (isFunctionDeclaration(node) && node.body) {
    if (returnsJSX(node.body)) {
      return node.body;
    }
  }
  if (isFunctionExpression(node) || isArrowFunctionExpression(node)) {
    if (isBlockStatement(node.body) && returnsJSX(node.body)) {
      return node.body;
    }
    if (!isBlockStatement(node.body) && isJSXElementOrFragment(node.body)) {
      return node.body;
    }
  }
  return undefined;
}

function isJSXElementOrFragment(node: Node): boolean {
  return isJSXElement(node) || isJSXFragment(node);
}

function returnsJSX(body: BlockStatement): boolean {
  return body.body.some(
    (stmt) =>
      isReturnStatement(stmt) &&
      stmt.argument !== null &&
      stmt.argument !== undefined &&
      isJSXElementOrFragment(stmt.argument),
  );
}

function getComponentName(
  node: Node,
  exportDefaultDecl?: Node,
): string {
  if (isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }
  if (isFunctionExpression(node) && node.id) {
    return node.id.name;
  }
  if (exportDefaultDecl && isExportDefaultDeclaration(exportDefaultDecl)) {
    return "default";
  }
  return "UnnamedComponent";
}

function getFunctionLineCount(fn: Node): number {
  if (isFunctionDeclaration(fn) || isFunctionExpression(fn) || isArrowFunctionExpression(fn)) {
    const loc = fn.body.loc;
    if (loc === null || loc === undefined) {
      return 0;
    }
    return loc.end.line - loc.start.line + 1;
  }
  return 0;
}

const BRANCHING_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "ConditionalExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
  "TryStatement",
  "CatchClause",
]);

function isBranchingNode(node: Node): boolean {
  return BRANCHING_TYPES.has(node.type);
}

function walkBody(
  node: Node,
  branchingDepth: number,
  hooks: HookCall[],
  fetchCalls: FetchCall[],
): void {
  if (isCallExpression(node)) {
    const callName = getCallName(node);
    const callObject = getCallObject(node);
    const line = node.loc?.start.line ?? 0;

    if (callName && isHookCall(callName)) {
      hooks.push({
        name: callName,
        line,
        isTopLevel: branchingDepth === 0,
      });
    }

    if (callName === "fetch" && !callObject) {
      fetchCalls.push({ line, method: "fetch" });
    }

    if (callObject === "axios" && callName && AXIOS_PROPERTY_METHODS.has(callName)) {
      fetchCalls.push({ line, method: `axios.${callName}` });
    }
  }

  const isBranching = isBranchingNode(node);
  const nextDepth = isBranching ? branchingDepth + 1 : branchingDepth;

  for (const key of Object.keys(node)) {
    if (isSkippedKey(key)) {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined && typeof item === "object" && "type" in item) {
          walkBody(item as Node, nextDepth, hooks, fetchCalls);
        }
      }
    } else if (value !== null && value !== undefined && typeof value === "object" && "type" in value) {
      walkBody(value as Node, nextDepth, hooks, fetchCalls);
    }
  }
}

const SKIPPED_KEYS = new Set([
  "type",
  "start",
  "end",
  "loc",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

function isSkippedKey(key: string): boolean {
  return SKIPPED_KEYS.has(key);
}

function isReactComponentCandidate(node: Node): boolean {
  if (isFunctionDeclaration(node)) {
    return true;
  }
  if (isVariableDeclaration(node)) {
    return node.declarations.some((decl) => {
      if (!decl.init) {
        return false;
      }
      return isArrowFunctionExpression(decl.init) || isFunctionExpression(decl.init);
    });
  }
  if (isExportDefaultDeclaration(node)) {
    return (
      isFunctionDeclaration(node.declaration) ||
      isArrowFunctionExpression(node.declaration) ||
      isFunctionExpression(node.declaration)
    );
  }
  return false;
}

function buildParsedComponent(
  name: string,
  functionNode: Node,
  body: BlockStatement | Expression,
  hooks: HookCall[],
  fetchCalls: FetchCall[],
): ParsedComponent {
  const bodyStartLine = body.loc?.start.line ?? 0;
  const bodyEndLine = body.loc?.end.line ?? 0;
  const totalLines = getFunctionLineCount(functionNode);

  return {
    name,
    bodyStartLine,
    bodyEndLine,
    totalLines,
    hooks,
    fetchCalls,
  };
}

export function parseReactComponent(filePath: string): ParsedComponent | null {
  let sourceText: string;
  try {
    sourceText = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  let ast: File;
  try {
    ast = parse(sourceText, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch {
    return null;
  }

  for (const stmt of ast.program.body) {
    if (!isReactComponentCandidate(stmt)) {
      continue;
    }

    let functionNode: Node | undefined;
    let componentBody: BlockStatement | Expression | undefined;

    if (isFunctionDeclaration(stmt)) {
      functionNode = stmt;
      componentBody = isJSXReturningFunction(stmt);
    } else if (isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!decl.init) {
          continue;
        }
        if (isArrowFunctionExpression(decl.init) || isFunctionExpression(decl.init)) {
          componentBody = isJSXReturningFunction(decl.init);
          if (componentBody) {
            functionNode = decl.init;
            break;
          }
        }
      }
    } else if (isExportDefaultDeclaration(stmt)) {
      const decl = stmt.declaration;
      if (isFunctionDeclaration(decl) || isArrowFunctionExpression(decl) || isFunctionExpression(decl)) {
        componentBody = isJSXReturningFunction(decl);
        if (componentBody) {
          functionNode = decl;
        }
      }
    }

    if (!functionNode || !componentBody) {
      continue;
    }

    const name = getComponentName(functionNode, stmt);
    const hooks: HookCall[] = [];
    const fetchCalls: FetchCall[] = [];

    const walkRoot = isBlockStatement(componentBody) ? componentBody : functionNode;
    walkBody(walkRoot, 0, hooks, fetchCalls);

    return buildParsedComponent(name, functionNode, componentBody, hooks, fetchCalls);
  }

  return null;
}
