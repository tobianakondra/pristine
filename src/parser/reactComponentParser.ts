import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import type { File, BlockStatement, Expression, Node } from "@babel/types";
import {
  isExportNamedDeclaration,
  isFunctionDeclaration,
  isVariableDeclaration,
  isExportDefaultDeclaration,
  isArrowFunctionExpression,
  isFunctionExpression,
  isBlockStatement,
} from "@babel/types";
import type {
  ParsedComponent,
  HookCall,
  FetchCall,
  EffectCall,
  AnyKeywordUsage,
} from "./astHelpers.js";
import {
  isReactComponentCandidate,
  isJSXReturningFunction,
  getComponentName,
  getFunctionLineCount,
} from "./astHelpers.js";
import { walkBody } from "./bodyExtractor.js";

export type { HookCall, FetchCall, EffectCall, AnyKeywordUsage, ParsedComponent };

function buildParsedComponent(
  name: string,
  functionNode: Node,
  body: BlockStatement | Expression,
  hooks: HookCall[],
  fetchCalls: FetchCall[],
  effectCalls: EffectCall[],
  anyKeywords: AnyKeywordUsage[],
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
    effectCalls,
    anyKeywords,
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
    const effectCalls: EffectCall[] = [];
    const anyKeywords: AnyKeywordUsage[] = [];

    const walkRoot = isBlockStatement(componentBody) ? componentBody : functionNode;
    walkBody(walkRoot, 0, hooks, fetchCalls, effectCalls, anyKeywords);

    return buildParsedComponent(name, functionNode, componentBody, hooks, fetchCalls, effectCalls, anyKeywords);
  }

  console.error("[Pristine Parser] No React component found in:", filePath);
  return null;
}
