import type { Node } from "@babel/types";
import { isCallExpression } from "@babel/types";
import type { HookCall, FetchCall, EffectCall, AnyKeywordUsage, InlineStyleUsage } from "./astHelpers.js";
import {
  isHookCall,
  getCallName,
  getCallObject,
  isBranchingNode,
  isSkippedKey,
  AXIOS_PROPERTY_METHODS,
} from "./astHelpers.js";

export function walkBody(
  node: Node,
  branchingDepth: number,
  hooks: HookCall[],
  fetchCalls: FetchCall[],
  effectCalls: EffectCall[],
  anyKeywords: AnyKeywordUsage[],
  inlineStyles: InlineStyleUsage[],
): void {
  if (node.type === "TSAnyKeyword") {
    const line = node.loc?.start.line ?? 0;
    anyKeywords.push({ line });
  }

  if (node.type === "JSXAttribute") {
    const attr = node as unknown as {
      name: { name: string };
      value: { type: string; expression: { type: string; properties: unknown[] } };
    };
    if (
      attr.name.name === "style" &&
      attr.value?.type === "JSXExpressionContainer" &&
      attr.value.expression?.type === "ObjectExpression"
    ) {
      const line = node.loc?.start.line ?? 0;
      const count = attr.value.expression.properties.length;
      inlineStyles.push({ line, propertyCount: count });
    }
  }

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

    if (callName === "useEffect") {
      effectCalls.push({
        line,
        hasDependencyArray: node.arguments.length >= 2,
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
          walkBody(item as Node, nextDepth, hooks, fetchCalls, effectCalls, anyKeywords, inlineStyles);
        }
      }
    } else if (value !== null && value !== undefined && typeof value === "object" && "type" in value) {
      walkBody(value as Node, nextDepth, hooks, fetchCalls, effectCalls, anyKeywords, inlineStyles);
    }
  }
}
