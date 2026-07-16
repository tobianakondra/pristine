import type { RuleContext, ASTListener } from "../../types.js";
import { registerListeners as registerStateFatness } from "./stateFatness.js";
import { registerListeners as registerPropMutation } from "./propMutation.js";
import { registerListeners as registerSideEffects } from "./sideEffects.js";
import { registerListeners as registerIdempotency } from "./idempotency.js";
import { registerListeners as registerImmutabilityPostJsx } from "./immutabilityPostJsx.js";
import { registerListeners as registerOutOfScopeMutation } from "./outOfScopeMutation.js";

/**
 * Merge an array of listener callbacks into the shared registry.
 */
function mergeListeners(
  target: Record<string, ASTListener[]>,
  source: Record<string, ASTListener[]>,
): void {
  for (const [nodeType, callbacks] of Object.entries(source)) {
    if (!target[nodeType]) target[nodeType] = [];
    target[nodeType].push(...callbacks);
  }
}

/**
 * Rule: react-purity
 *
 * Orchestrates sub-rules that enforce React's purity contract:
 *
 * 1. **State fatness** — warns when a component uses > 4 `useState`
 * 2. **No prop mutation** — flags direct assignment and mutation method
 *    calls on prop variables
 * 3. **No render side effects** — flags side-effect operations invoked
 *    at the top level of the render body (depth 0)
 * 4. **Idempotency** — flags non-idempotent expressions (`new Date()`,
 *    `Math.random()`) in the render body
 * 5. **Post-JSX immutability** — flags mutations of variables after they
 *    have been passed as props to JSX elements
 * 6. **Out-of-scope mutation** — flags mutations of variables declared
 *    outside the component's function scope (globals, module-level, imports)
 */
export function registerListeners(context: RuleContext): Record<string, ASTListener[]> {
  const listeners: Record<string, ASTListener[]> = {};

  mergeListeners(listeners, registerStateFatness(context));
  mergeListeners(listeners, registerPropMutation(context));
  mergeListeners(listeners, registerSideEffects(context));
  mergeListeners(listeners, registerIdempotency(context));
  mergeListeners(listeners, registerImmutabilityPostJsx(context));
  mergeListeners(listeners, registerOutOfScopeMutation(context));

  return listeners;
}
