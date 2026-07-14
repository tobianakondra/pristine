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
  isFunctionDeclaration,
  isFunctionExpression,
  isArrowFunctionExpression,
  isVariableDeclaration,
  isVariableDeclarator,
  isExportDefaultDeclaration,
  isExportNamedDeclaration,
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

/**
 * Parcourt récursivement un nœud AST pour vérifier s'il contient du JSX
 * (Balise classique ou fragment). Cela permet de détecter les retours de JSX
 * même s'ils sont cachés dans des ternaires, des ifs ou des expressions logiques.
 */
function hasJSXDeep(node: Node): boolean {
  if (isJSXElement(node) || isJSXFragment(node)) {
    return true;
  }

  for (const key of Object.keys(node)) {
    if (isSkippedKey(key)) {
      continue;
    }
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined && typeof item === "object" && "type" in item) {
          if (hasJSXDeep(item as Node)) {
            return true;
          }
        }
      }
    } else if (value !== null && value !== undefined && typeof value === "object" && "type" in value) {
      if (hasJSXDeep(value as Node)) {
        return true;
      }
    }
  }
  return false;
}

function isJSXReturningFunction(
  node: Node,
): BlockStatement | Expression | undefined {
  if (isFunctionDeclaration(node) && node.body) {
    if (hasJSXDeep(node.body)) {
      return node.body;
    }
  }
  if (isFunctionExpression(node) || isArrowFunctionExpression(node)) {
    if (isBlockStatement(node.body) && hasJSXDeep(node.body)) {
      return node.body;
    }
    if (!isBlockStatement(node.body) && hasJSXDeep(node.body)) {
      return node.body;
    }
  }
  return undefined;
}

function getComponentName(
  functionNode: Node,
  parentDecl?: Node,
): string {
  if (isFunctionDeclaration(functionNode) && functionNode.id) {
    return functionNode.id.name;
  }
  if (isFunctionExpression(functionNode) && functionNode.id) {
    return functionNode.id.name;
  }
  if (parentDecl && isVariableDeclarator(parentDecl) && isIdentifier(parentDecl.id)) {
    return parentDecl.id.name;
  }
  if (parentDecl && isExportDefaultDeclaration(parentDecl)) {
    return "default";
  }
  if (parentDecl && isExportNamedDeclaration(parentDecl)) {
    const decl = parentDecl.declaration;
    if (decl && isVariableDeclaration(decl)) {
      const first = decl.declarations[0];
      if (first && isVariableDeclarator(first) && isIdentifier(first.id)) {
        return first.id.name;
      }
    }
    if (decl && isFunctionDeclaration(decl) && decl.id) {
      return decl.id.name;
    }
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
  if (isExportNamedDeclaration(node) && node.declaration) {
    return isReactComponentCandidate(node.declaration);
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
  } catch (readError: unknown) {
    console.error("[Pristine Parser] Failed to read file:", filePath, readError);
    return null;
  }

  let ast: File;
  try {
    ast = parse(sourceText, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (parseError: unknown) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    console.error("[Pristine Parser] Babel parse error for", filePath, ":", msg);
    return null;
  }

  for (const stmt of ast.program.body) {
    const unwrapped = isExportNamedDeclaration(stmt) && stmt.declaration
      ? stmt.declaration
      : stmt;

    if (!isReactComponentCandidate(unwrapped)) {
      continue;
    }

    let functionNode: Node | undefined;
    let componentBody: BlockStatement | Expression | undefined;
    let declarator: Node | undefined;

    if (isFunctionDeclaration(unwrapped)) {
      functionNode = unwrapped;
      componentBody = isJSXReturningFunction(unwrapped);
    } else if (isVariableDeclaration(unwrapped)) {
      for (const decl of unwrapped.declarations) {
        if (!decl.init) {
          continue;
        }
        if (isArrowFunctionExpression(decl.init) || isFunctionExpression(decl.init)) {
          componentBody = isJSXReturningFunction(decl.init);
          if (componentBody) {
            functionNode = decl.init;
            declarator = decl;
            break;
          }
        }
      }
    } else if (isExportDefaultDeclaration(unwrapped)) {
      const decl = unwrapped.declaration;
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

    const name = getComponentName(functionNode, declarator ?? stmt);
    const hooks: HookCall[] = [];
    const fetchCalls: FetchCall[] = [];

    const walkRoot = isBlockStatement(componentBody) ? componentBody : functionNode;
    walkBody(walkRoot, 0, hooks, fetchCalls);

    return buildParsedComponent(name, functionNode, componentBody, hooks, fetchCalls);
  }

  console.error("[Pristine Parser] No React component found in:", filePath);
  return null;
}