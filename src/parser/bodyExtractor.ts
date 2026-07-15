import type { ASTListener } from "../types.js";

const SKIP_KEYS = new Set([
  "leadingComments",
  "trailingComments",
  "innerComments",
  "comments",
]);

export function traverseAST(
  node: unknown,
  listeners: Record<string, ASTListener[]>,
): void {
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const type = String(record.type ?? "");

  const enterCallbacks = listeners[type];
  if (enterCallbacks) {
    for (const cb of enterCallbacks) {
      cb(node);
    }
  }

  for (const key in record) {
    if (SKIP_KEYS.has(key)) continue;
    const child = record[key];
    if (child && typeof child === "object") {
      if (Array.isArray(child)) {
        for (const item of child) {
          traverseAST(item, listeners);
        }
      } else {
        traverseAST(child, listeners);
      }
    }
  }

  const exitKey = `${type}:exit`;
  const exitCallbacks = listeners[exitKey];
  if (exitCallbacks) {
    for (const cb of exitCallbacks) {
      cb(node);
    }
  }
}
