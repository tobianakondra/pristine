# Parser Fixes — ExportNamedDeclaration & Debug Logging

## Issue 1: `ExportNamedDeclaration` Blind Spot

### Symptom

`export const Component = () => <div />` and `export function Component() { return <div /> }` were silently ignored. The parser returned `null` even for valid components.

### Root Cause

Babel represents named exports with an `ExportNamedDeclaration` node wrapping the actual declaration:

```
export const Sidebar = () => <aside />;
  ↓ Babel AST
ExportNamedDeclaration
  └── declaration: VariableDeclaration
        └── declarations[0]: VariableDeclarator
              ├── id: Identifier("Sidebar")
              └── init: ArrowFunctionExpression
```

```
export function Header() { return <header />; }
  ↓ Babel AST
ExportNamedDeclaration
  └── declaration: FunctionDeclaration
        └── id: Identifier("Header")
```

The function `isReactComponentCandidate` only checked for raw `FunctionDeclaration`, `VariableDeclaration`, and `ExportDefaultDeclaration` at the top level. `ExportNamedDeclaration` was not handled, causing all named-export components to be skipped.

### Fix (3 changes in `src/parser/reactComponentParser.ts`)

**a) `isReactComponentCandidate` — recursive delegation**

```typescript
if (isExportNamedDeclaration(node) && node.declaration) {
  return isReactComponentCandidate(node.declaration);
}
```

When the node is an `ExportNamedDeclaration`, the check recurses into its inner `declaration` (a `FunctionDeclaration` or `VariableDeclaration`), which the existing logic already knows how to evaluate.

**b) Main loop — unwrap before processing**

```typescript
const unwrapped = isExportNamedDeclaration(stmt) && stmt.declaration
  ? stmt.declaration
  : stmt;
```

All subsequent checks (`isFunctionDeclaration`, `isVariableDeclaration`, `isExportDefaultDeclaration`) operate on the unwrapped node. The original `stmt` is still passed to `getComponentName` so it can extract the component name from the export context when the inner function has no `.id`.

**c) `getComponentName` — extract name from declarator**

Arrow functions and function expressions assigned to variables (e.g. `export const Foo = () => ...`) have no `.id` property. The name lives in the parent `VariableDeclarator.id`:

```typescript
if (parentDecl && isVariableDeclarator(parentDecl) && isIdentifier(parentDecl.id)) {
  return parentDecl.id.name;
}
```

Additionally, for `ExportNamedDeclaration` wrapping, a fallback traverses `declaration.declarations[0].id`.

---

## Issue 2: Silent Catch Blocks

### Symptom

When parsing failed (e.g. invalid JSX in the source file), the parser returned `null` with no indication of why. The user saw only `"Could not parse ... as a React component"`.

### Root Cause

Both `try/catch` blocks — file read and Babel parse — had empty `catch` clauses:

```typescript
try { sourceText = readFileSync(filePath, "utf-8"); } catch { return null; }
try { ast = parse(sourceText, ...); } catch { return null; }
```

### Fix

`console.error` calls were added to both catch blocks with descriptive prefixes:

```typescript
catch (readError: unknown) {
  console.error("[Pristine Parser] Failed to read file:", filePath, readError);
  return null;
}
```

```typescript
catch (parseError: unknown) {
  const msg = parseError instanceof Error ? parseError.message : String(parseError);
  console.error("[Pristine Parser] Babel parse error for", filePath, ":", msg);
  return null;
}
```

Additionally, the final `return null` (when no component is found after iterating all top-level statements) now also logs:

```typescript
console.error("[Pristine Parser] No React component found in:", filePath);
```

---

## How to Reproduce the Fix

| Before | After |
|--------|-------|
| `export const Sidebar = () => <aside/>` → `null` | → `{ name: "Sidebar", hooks: [...], ... }` |
| `export function Header() { return <header/> }` → `null` | → `{ name: "Header", hooks: [...], ... }` |
| Invalid JSX → `null` (silent) | → `null` + `[Pristine Parser] Babel parse error for ...` on stderr |

---

## Common Parse Errors (from debug logs)

| Error | Likely Cause |
|-------|-------------|
| `Unexpected token, expected "," (21:6)` | Invalid JavaScript inside an arrow function body. Check for missing operators, braces, or JSX fragment wrappers. |
| `Unexpected token (1:0)` | File is empty or has a BOM marker that Babel cannot handle. |
| `'import' and 'export' may only appear at the top level` | Missing `sourceType: "module"` in parser options (not applicable here — already set). |

---

## Verified Patterns (post-fix)

```
export default function Dashboard() { ... }    ✓  was already working
       default function Dashboard() { ... }    ✓  was already working
export const Sidebar = () => { ... }           ✓  fixed
       const Sidebar = () => { ... }           ✓  was already working
export function Header() { ... }               ✓  fixed
       function Header() { ... }               ✓  was already working
export default () => <div />                   ✓  was already working
```
