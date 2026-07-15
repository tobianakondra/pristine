import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import type { File, BlockStatement, Expression } from "@babel/types";
import {
  isExportNamedDeclaration,
  isFunctionDeclaration,
  isVariableDeclaration,
  isExportDefaultDeclaration,
  isArrowFunctionExpression,
  isFunctionExpression,
  isBlockStatement,
} from "@babel/types";
import {
  isReactComponentCandidate,
  isJSXReturningFunction,
  getComponentName,
  getFunctionLineCount,
} from "./astHelpers.js";
import { traverseAST } from "./bodyExtractor.js";
import type { ASTListener, RuleContext, AnalysisResult, RuleViolation } from "../types.js";
import { registerListeners as registerComponentLength } from "../rules/componentLengthRule.js";
import { registerListeners as registerHooksSeparation } from "../rules/hooksSeparationRule.js";
import { registerListeners as registerInlineFetching } from "../rules/inlineFetchingRule.js";
import { registerListeners as registerNakedEffect } from "../rules/nakedEffectRule.js";
import { registerListeners as registerNoExplicitAny } from "../rules/noExplicitAnyRule.js";
import { registerListeners as registerInlineStyleAbuse } from "../rules/inlineStyleAbuseRule.js";
import { registerListeners as registerStateFatness } from "../rules/stateFatnessRule.js";

function mergeListeners(
  target: Record<string, ASTListener[]>,
  source: Record<string, ASTListener[]>,
): void {
  for (const [nodeType, callbacks] of Object.entries(source)) {
    if (!target[nodeType]) target[nodeType] = [];
    target[nodeType].push(...callbacks);
  }
}

const RULE_REGISTRATIONS = [
  registerComponentLength,
  registerHooksSeparation,
  registerInlineFetching,
  registerNakedEffect,
  registerNoExplicitAny,
  registerInlineStyleAbuse,
  registerStateFatness,
];

export function parseReactComponent(filePath: string): AnalysisResult | null {
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

    if (!isReactComponentCandidate(unwrapped)) continue;

    let functionNode: unknown;
    let componentBody: BlockStatement | Expression | undefined;
    let declarator: unknown;

    if (isFunctionDeclaration(unwrapped)) {
      functionNode = unwrapped;
      componentBody = isJSXReturningFunction(unwrapped);
    } else if (isVariableDeclaration(unwrapped)) {
      for (const decl of unwrapped.declarations) {
        if (!decl.init) continue;
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

    if (!functionNode || !componentBody) continue;

    const name = getComponentName(functionNode as any, declarator as any ?? stmt);
    const totalLines = getFunctionLineCount(functionNode as any);

    const violations: RuleViolation[] = [];

    const context: RuleContext = {
      componentName: name,
      componentTotalLines: totalLines,
      violations,
      onComplete: [],
    };

    const masterListeners: Record<string, ASTListener[]> = {};

    for (const register of RULE_REGISTRATIONS) {
      const ruleListeners = register(context);
      mergeListeners(masterListeners, ruleListeners);
    }

    const walkRoot = isBlockStatement(componentBody) ? componentBody : functionNode;
    traverseAST(walkRoot, masterListeners);

    for (const cb of context.onComplete) {
      cb();
    }

    return {
      filePath,
      componentName: name,
      totalLines,
      issues: violations,
      passed: violations.length === 0,
    };
  }

  console.error("[Pristine Parser] No React component found in:", filePath);
  return null;
}
