import type { Node, BlockStatement, CallExpression, Expression } from "@babel/types";
import {
  isIdentifier,
  isMemberExpression,
  isJSXElement,
  isJSXFragment,
  isBlockStatement,
  isReturnStatement,
  isArrowFunctionExpression,
  isFunctionExpression,
  isFunctionDeclaration,
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

export interface EffectCall {
  line: number;
  hasDependencyArray: boolean;
}

export interface AnyKeywordUsage {
  line: number;
}

export interface InlineStyleUsage {
  line: number;
  propertyCount: number;
}

export interface ParsedComponent {
  name: string;
  bodyStartLine: number;
  bodyEndLine: number;
  totalLines: number;
  hooks: HookCall[];
  fetchCalls: FetchCall[];
  effectCalls: EffectCall[];
  anyKeywords: AnyKeywordUsage[];
  inlineStyles: InlineStyleUsage[];
}

const HOOK_REGEX = /^use[A-Z]/;

export const AXIOS_PROPERTY_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "request",
]);

export const BRANCHING_TYPES = new Set([
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

const SKIPPED_KEYS = new Set([
  "type",
  "start",
  "end",
  "loc",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

export function isHookCall(name: string): boolean {
  return name.length > 3 && HOOK_REGEX.test(name);
}

export function getCallName(node: CallExpression): string | undefined {
  if (isIdentifier(node.callee)) {
    return node.callee.name;
  }
  if (isMemberExpression(node.callee) && isIdentifier(node.callee.property)) {
    return node.callee.property.name;
  }
  return undefined;
}

export function getCallObject(node: CallExpression): string | undefined {
  if (isMemberExpression(node.callee) && isIdentifier(node.callee.object)) {
    return node.callee.object.name;
  }
  return undefined;
}

export function isSkippedKey(key: string): boolean {
  return SKIPPED_KEYS.has(key);
}

export function isBranchingNode(node: Node): boolean {
  return BRANCHING_TYPES.has(node.type);
}

export function hasJSXDeep(node: Node): boolean {
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

export function isJSXReturningFunction(
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

export function getComponentName(
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

export function getFunctionLineCount(fn: Node): number {
  if (isFunctionDeclaration(fn) || isFunctionExpression(fn) || isArrowFunctionExpression(fn)) {
    const loc = fn.body.loc;
    if (loc === null || loc === undefined) {
      return 0;
    }
    return loc.end.line - loc.start.line + 1;
  }
  return 0;
}

export function isReactComponentCandidate(node: Node): boolean {
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
