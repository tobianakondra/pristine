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

// Returns AnalysisResult[] because a single .tsx file may export
// multiple components (e.g. a small utility component alongside the
// main one). Previously we returned after the first component found,
// silently ignoring the rest. Now we accumulate all components so
// the caller gets a complete report for the entire file.
export function parseReactComponent(filePath: string): AnalysisResult[] {
  let sourceText: string;
  try {
    sourceText = readFileSync(filePath, "utf-8");
  } catch (readError: unknown) {
    console.error("[Pristine Parser] Failed to read file:", filePath, readError);
    return [];
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
    return [];
  }

  // Accumulate results for every component found in the file.
  // Previously the loop did `return` on the first valid component,
  // which skipped any subsequent components in the same file.
  const results: AnalysisResult[] = [];

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

    /**
     * Collect JSX dependencies: every <CapitalizedName> element encountered
     * during the AST walk is recorded as a dependency of this component.
     * This powers the "Component Tree Map" in the project-folder report
     * and will later enable props-drilling detection.
     */
    const dependencies: string[] = [];
    const seenDeps = new Set<string>();

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

    /**
     * Inline listener that fires on every JSX opening element tag.
     * If the tag name starts with an uppercase letter (React convention
     * for custom components), we record it as a dependency.
     */
    mergeListeners(masterListeners, {
      "JSXOpeningElement": [
        (node: any) => {
          let depName: string | undefined;

          // <SimpleButton />                    → JSXIdentifier
          // <Foo.Bar />                         → JSXMemberExpression
          if (node.name?.type === "JSXIdentifier") {
            depName = node.name.name;
          } else if (node.name?.type === "JSXMemberExpression") {
            const obj = node.name.object?.name ?? "";
            const prop = node.name.property?.name ?? "";
            depName = `${obj}.${prop}`;
          }

          // Only keep names starting with a capital letter — this
          // matches the React convention for user-defined components.
          if (depName && /^[A-Z]/.test(depName) && !seenDeps.has(depName)) {
            seenDeps.add(depName);
            dependencies.push(depName);
          }
        },
      ],
    });

    const walkRoot = isBlockStatement(componentBody) ? componentBody : functionNode;
    traverseAST(walkRoot, masterListeners);

    for (const cb of context.onComplete) {
      cb();
    }

    // Push instead of returning — keeps the loop alive for remaining
    // components in the file.
    results.push({
      filePath,
      componentName: name,
      totalLines,
      issues: violations,
      passed: violations.length === 0,
      dependencies,
    });
  }

  // Return all component results to the caller (index.ts).
  // If no component was found, the array is empty and the caller
  // shows a "could not parse" message.
  return results;
}
