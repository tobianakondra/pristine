# Analysis Rules Reference

Pristine-MCP currently detects **9 maintainability issues** (with 5 sub-detections under `react-purity`) in React components. Each rule has a severity (`error` or `warning`) and a clear explanation of why it matters.

---

## 1. Rules of Hooks (error)

**Rule names:** `rules-of-hooks-conditional`, `rules-of-hooks-context`

**What it detects:** Two complementary checks that enforce the [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks):

### 1a. Not Inside Conditionals, Loops, or Nested Functions (`rules-of-hooks-conditional`)

Flags hook calls (`useState`, `useEffect`, etc.) that have a **conditional/loop ancestor** (`IfStatement`, `ForStatement`, `WhileStatement`, `SwitchStatement`, `ConditionalExpression`, `TryStatement`, `CatchClause`) or a **nested function ancestor** (`FunctionDeclaration`, `FunctionExpression`, `ArrowFunctionExpression`) inside the component body.

**Bad code:**
```tsx
function UserProfile() {
  const [name, setName] = useState("");

  if (name === "") {
    useEffect(() => {          // ← ERROR: hook inside conditional
      document.title = "Empty";
    }, []);
  }

  for (const item of items) {
    useState(item);            // ← ERROR: hook inside loop
  }

  const handler = () => {
    useState(false);           // ← ERROR: hook inside nested callback
  };

  function inner() {
    useState(null);            // ← ERROR: hook inside nested function
  }
}
```

### 1b. Valid Component / Hook Context (`rules-of-hooks-context`)

Flags hook calls inside functions whose name **does not start with an uppercase letter** (component convention) **or the `use` prefix** (custom hook convention). This catches hooks called from utility helpers, event handlers, or any non-React context. A full-program scan ensures no hook call in the file goes undetected, even in non-component functions.

**Bad code:**
```tsx
function formatUserData(user) {
  useState(null);               // ← ERROR: not a component or hook
  return user;
}

function fetchHelper() {
  useEffect(() => {             // ← ERROR: not a component or hook
    fetch("/api/data");
  }, []);
}
```

**Good code:**
```tsx
function MyComponent() {        // ← uppercase: component ✓
  const [val, setVal] = useState(0);
  useEffect(() => {}, []);
  return <div />;
}

function useAuth() {            // ← "use" prefix: custom hook ✓
  const [user, setUser] = useState(null);
  useEffect(() => {}, []);
  return user;
}
```

**Detection logic (conditionalDepth + functionDepth):**
- `conditionalDepth` — incremented on enter of conditional/loop/try/catch nodes, decremented on exit
- `functionDepth` — incremented on enter of function nodes, decremented on exit
- Check (1a) fires when `conditionalDepth > 0` OR (`isComponentWalk` AND `functionDepth > 0`)
- Check (1b) fires when the nearest named function ancestor does not match `/^[A-Z]/` or `/^use[A-Z]/`
- Full-program walk (with `skipStack`): when `functionNode` is undefined, the rule walks the entire AST and skips hook calls inside valid components/custom hooks to avoid duplicates with component-body passes

**Severity rationale:** `error` — violating either rule breaks React's internal state management and leads to runtime bugs.

---

## 2. Naked useEffect (error)

**Rule name:** `naked-effect`

**What it detects:** `useEffect` called **without a dependency array** (the second argument).

**Bad code:**
```tsx
function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {                    // ← ERROR: no dependency array
    fetch(`/api/search?q=${query}`)
      .then(r => r.json())
      .then(setResults);
  });

  return <ul>{results.map(...)}</ul>;
}
```

**Good code:**
```tsx
useEffect(() => {
  fetch(`/api/search?q=${query}`)
    .then(r => r.json())
    .then(setResults);
}, [query]);                            // ← OK: dependency array present
```

**Why it matters:** Without a dependency array, the effect runs **after every single render** — including renders triggered by the effect's own `setResults` call. This creates an infinite loop: render → fetch → setState → render → fetch → ... It also causes unnecessary network requests and performance degradation.

**Severity rationale:** `error` — the almost certain consequence is an infinite re-render loop, which crashes or freezes the application.

---

## 3. Inline Fetching (warning)

**Rule name:** `inline-fetching`

**What it detects:** Raw `fetch()` or `axios.get()`/`post()`/etc. calls directly inside the component body, outside of a `useEffect` or event handler.

**Bad code:**
```tsx
function Dashboard() {
  const [data, setData] = useState(null);

  fetch("/api/dashboard")             // ← WARNING: inline fetch
    .then(r => r.json())
    .then(setData);

  return <div>...</div>;
}
```

**Better approaches:**
```tsx
// Extracted into a custom hook
function useDashboardData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData);
  }, []);
  return data;
}

function Dashboard() {
  const data = useDashboardData();
  return <div>...</div>;
}
```

**Why it matters:** Inline fetching couples data loading with the component's render lifecycle. This makes the component harder to test, impossible to reuse the data logic elsewhere, and — since there is no `useEffect` wrapper — the fetch fires on **every render** (similar to a naked effect). Extracting into a custom hook or a service layer improves separation of concerns, testability, and reusability.

**Severity rationale:** `warning` — while this works in simple cases, it indicates a structural design issue that will cause problems as the component grows.

---

## 4. Component Length (warning)

**Rule name:** `component-length`

**What it detects:** Components exceeding **100 lines** (from the opening `{` to the closing `}` of the function body).

**Bad code:**
```tsx
function ProfilePage() {
  // ... 110 lines of JSX, state, effects, handlers ...
}
```

**Why it matters:** Long components violate the **Single Responsibility Principle**. They are harder to read, harder to test, harder to debug, and more likely to contain duplicate logic. A component that spans more than one screen height in an editor is a strong signal that it should be broken into smaller units.

**Refactoring strategies:**
- Extract repeated JSX into sub-components (`<ProfileHeader />`, `<ProfileTabs />`)
- Extract data logic into custom hooks (`useProfile()`, `useNotifications()`)
- Extract complex conditionals into helper functions outside the component

**Severity rationale:** `warning` — a long component does not guarantee a bug, but it is a reliable predictor of future maintenance difficulty (code churn, merge conflicts, and hidden coupling).

---

## 5. Inline Style Abuse (warning)

**Rule name:** `inline-style-abuse`

**What it detects:** JSX elements with more than **3 CSS properties** defined inline via the `style={{...}}` attribute.

**Bad code:**
```tsx
function Card() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px",
        borderRadius: "8px",
        background: "#fff",
      }}
    >
      ...
    </div>
  );
}
```

**Better approach:**
```tsx
function Card() {
  return <div className="card-container">...</div>;
}
```

```css
/* styles.css */
.card-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 8px;
  background: #fff;
}
```

**Why it matters:** Inline styles bypass the CSS cascade, cannot use media queries or pseudo-classes (`:hover`, `:focus`), increase bundle size, create specificity conflicts, and make the component harder to theme or override. Extracting styles into CSS classes (Tailwind, CSS Modules, or plain CSS) improves reusability, performance, and separation of concerns.

**Threshold:** More than 3 CSS properties in a single `style={{...}}`.

**Severity rationale:** `warning` — inline styles themselves are not a bug, but complex inline styles indicate a missed opportunity to use proper CSS, leading to maintainability issues as the project grows.

---

## 6. State Fatness (warning)

**Rule name:** `state-fatness`

**What it detects:** Components with more than **4 `useState` declarations** in their body.

**Bad code:**
```tsx
function HeavyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState(0);
  const [role, setRole] = useState("user");
  const [isActive, setIsActive] = useState(false);
  // 5 useState — too much local state
  return <form>...</form>;
}
```

**Better approach:**
```tsx
function HeavyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState(0);
  // extracted into a custom hook
  const { role, isActive } = useRoleManagement();
  return <form>...</form>;
}
```

**Why it matters:** Components with many `useState` calls handle too many concerns, violating the **Single Responsibility Principle**. According to *Thinking in React*, state should be distributed across focused sub-components or extracted into custom hooks. Too many local states make the component harder to test, reuse, and reason about.

**Threshold:** More than 4 `useState` calls in a single component.

**Severity rationale:** `warning` — many `useState` calls can work in simple cases, but they indicate a component that is likely doing too much, which will hurt maintainability as the feature grows.

---

## 7. No Props Drilling (warning)

**Rule name:** `no-props-drilling`

**What it detects:** Props that a component receives via destructured parameters but **never uses locally** — every reference to the prop is a passthrough to a child component (e.g. `<Child user={user} />`).

**Bad code:**
```tsx
function Dashboard({ user, theme }: { user: string; theme: string }) {
  // `theme` is never used in Dashboard's logic or JSX text
  const greeting = `Hello ${user}`;           // `user` is used locally ✓
  return <Child theme={theme} />;             // `theme` drilled through ✗
}
```

**Better approach:**
```tsx
// Option 1: Use the prop locally before passing it down
function Dashboard({ user, theme }: { user: string; theme: string }) {
  const themeClass = `theme-${theme}`;        // Local usage ✓
  return <Child theme={theme} />;
}
```

```tsx
// Option 2: Consume the context directly in the child
function Dashboard({ user }: { user: string }) {
  return <Child />;                           // `theme` obtained via Context in Child
}
```

**Why it matters:** Props drilling creates tight coupling between parent and child components and forces intermediate components to be aware of data they don't need. This violates the **Principle of Least Knowledge** (Law of Demeter) and makes refactoring harder — changing a deep prop requires modifying every intermediate component. Use React Context, component composition, or custom hooks to avoid drilling.

**Detection logic:** The rule inspects the component's function parameters (via `functionNode.params` in the AST) to identify all destructured prop variables. It then counts:
- **Total references**: every time the variable appears as an `Identifier` in the component body
- **Drilling references**: subset where the variable appears inside a JSX attribute expression (being passed to a child)

If `totalReferences > 0` AND `totalReferences === drillingReferences`, the prop is flagged as drilled.

**Limitation:** Variable shadowing (a local `const user = ...` hiding the prop) cannot be detected at the AST level without full scope analysis. If a prop name is shadowed, local references to the shadowing variable will be counted as prop references, potentially masking a drilling violation.

**Severity rationale:** `warning` — drilling is not a bug, but it signals a design smell that reduces composability and increases maintenance burden.

---

## 8. React Purity (warning)

**Rule name:** `react-purity`

**What it detects:** Two sub-detections that enforce React's purity contract:

### 8a. No Prop Mutation

Flags direct assignments to prop variables and mutation method calls (`.push()`, `.splice()`, etc.) on prop objects. React props must always remain read-only.

**Bad code:**
```tsx
function Bad({ user, items }: { user: { name: string }; items: string[] }) {
  user.name = "admin";         // ← WARNING: prop mutation
  items.push("new-item");      // ← WARNING: mutation via method call
  return <div>{user.name}</div>;
}
```

### 8b. No Render Side Effects

Flags side-effect operations (`localStorage.setItem`, `document.title = ...`, `window.location = ...`, `history.pushState`, `console.log`, etc.) that are invoked **directly in the render body** — not wrapped in a `useEffect`, `useMemo`, event handler, or nested function.

**Bad code:**
```tsx
function SideEffects() {
  document.title = "New Title";              // ← WARNING: side effect at depth 0
  console.log("rendering");                  // ← WARNING: side effect at depth 0
  localStorage.setItem("key", "value");      // ← WARNING: side effect at depth 0
  return <div>Hello</div>;
}
```

**Good code (side effects inside useEffect are safe):**
```tsx
function Good() {
  useEffect(() => {
    document.title = "New Title";            // OK: inside useEffect
    localStorage.setItem("key", "value");    // OK: inside useEffect
    console.log("mounted");                  // OK: inside useEffect
  }, []);
  return <div>Hello</div>;
}
```

**Detection logic:** The rule tracks a `depth` counter incremented on enter of every branching or function AST node and decremented on `:exit`. Side effects are only flagged at depth 0 (the top-level render body). Inside `useEffect` callbacks, arrow function expressions increment depth to > 0, so side effects there are correctly ignored.

Side effects checked at depth 0:

| Category | Patterns |
|----------|----------|
| Storage writes | `localStorage.setItem/removeItem/clear`, `sessionStorage.setItem/removeItem/clear` |
| Document mutations | `document.title = ...` |
| Navigation | `window.location = ...`, `window.location.href = ...` |
| Browser history | `history.pushState/replaceState` |
| Dialogs | `window.alert/confirm/prompt/open/close` |
| Logging | `console.log/warn/error/info/debug` |

### 8c. No Non-Idempotent Expressions

Flags non-idempotent functions and constructors called **directly in the render body** (depth 0). These produce a different value on every invocation and break React's purity contract.

**Bad code:**
```tsx
function Impure() {
  const r = Math.random();              // ← WARNING: non-idempotent
  const id = crypto.randomUUID();       // ← WARNING: non-idempotent
  const now = Date.now();               // ← WARNING: non-idempotent
  const perf = performance.now();       // ← WARNING: non-idempotent
  const u = uuid();                     // ← WARNING: non-idempotent
  const d = new Date();                 // ← WARNING: non-idempotent
  return <div>{r}</div>;
}
```

**Good code (moved to `useEffect` or event handler):**
```tsx
function Pure() {
  const [id, setId] = useState("");
  useEffect(() => {
    setId(crypto.randomUUID());          // OK: inside useEffect
  }, []);
  return <div>{id}</div>;
}
```

**Detection scope:**

| Category | Patterns |
|----------|----------|
| Member expressions | `Math.random()`, `Date.now()`, `performance.now()`, `crypto.randomUUID()`, `crypto.getRandomValues()` |
| Standalone identifiers | `uuid()`, `uuidv4()`, `nanoid()` |
| Constructor calls | `new Date()` |

**Severity rationale:** `warning` — not a runtime error, but it causes hydration mismatches in SSR and makes components unpredictable. The value should be computed inside `useEffect` or an event handler instead.

---

### 8d. Post-JSX Immutability

Flags assignments and mutation method calls (`.push()`, `.splice()`, etc.) on variables that have **already been passed as props to a JSX element** earlier in the same render body. React props must remain immutable once passed.

**Bad code:**
```tsx
function Bad() {
  const user = { name: "Alice" };
  const items = [1, 2, 3];
  return (
    <div>
      <Profile user={user} />              {/* user passed at line 5 */}
      <List data={items} />                {/* items passed at line 6 */}
      {user.name = "Bob"}                  {/* ← WARNING: mutation after JSX */}
      {items.push(4)}                      {/* ← WARNING: mutation after JSX */}
    </div>
  );
}
```

```tsx
function BadConditional() {
  const user = { name: "Alice" };
  if (someCondition) {
    return <Profile user={user} />;        {/* user passed at line 4 */}
  }
  user.name = "Bob";                       {/* ← WARNING: mutation after JSX */}
  return <div>{user.name}</div>;
}
```

**Good code (assign before passing to JSX):**
```tsx
function Good() {
  const user = { name: "Alice" };
  const items = [1, 2, 3];
  items.push(4);                            // OK: mutation before JSX
  return (
    <div>
      <Profile user={user} />
      <List data={items} />
    </div>
  );
}
```

**Detection logic:**
- `jsxVariables` Map records a variable name → line number the first time it appears inside a `JSXExpressionContainer` (e.g. `style={myVar}`).
- `AssignmentExpression` and `CallExpression` at depth 0 check their target variable against the Map. If the current line is **strictly greater** than the JSX line, a violation fires.

| Category | Patterns |
|----------|----------|
| Direct assignment | `user.name = ...`, `obj.attr = ...` |
| Mutation methods | `.push()`, `.pop()`, `.splice()`, `.shift()`, `.unshift()`, `.reverse()`, `.sort()`, `.fill()`, `.copyWithin()` |

**Severity rationale:** `warning` — mutating a variable after it has been injected into JSX breaks React's immutability contract and can cause subtle UI bugs where child components render stale or inconsistent data.

---

### 8e. Out-of-Scope Mutation

Flags mutations (assignments, increment/decrement, and mutative method calls) on variables that are **not declared locally** in the component function — i.e. globals, module-level variables, and imports. In React, the render phase must be a pure computation with no side effects on external state.

**Bad code:**
```tsx
let renderCount = 0;
const globalArray: string[] = [];

function Bad() {
  renderCount++;                       // ← WARNING: out-of-scope mutation
  globalArray.push("x");               // ← WARNING: out-of-scope mutation
  globalArray[0] = "y";                // ← WARNING: out-of-scope mutation
  return <div>{renderCount}</div>;
}
```

**Good code (all mutations use local variables):**
```tsx
function Good() {
  const [count, setCount] = useState(0);
  const localArray: string[] = [];
  localArray.push("x");                // OK: local variable
  return <div>{count}</div>;
}
```

**Detection logic:**

The rule pre-scans `context.functionNode` to build a `Set` of locally declared variable names:

- **Function parameters** — plain `Identifier` (`props`), destructured `ObjectPattern` (`{ id, theme }`), and `AssignmentPattern` defaults (`props = {}`)
- **Variable declarators** — `Identifier`, `ObjectPattern` destructuring, and `ArrayPattern` destructuring (for hooks like `const [state, setState] = useState(...)`)
- **Nested function declarations** — e.g. `function handleClick() {}` inside the component

At traversal time, these listeners fire only at `depth === 0`:

| Listener | Target | Detection |
|----------|--------|-----------|
| `AssignmentExpression` | `left` side root | `target = value` or `target.x = value` on non-local |
| `UpdateExpression` | `argument` root | `target++`, `++target`, `--target` on non-local |
| `CallExpression` | method on non-local root | `.push()`, `.pop()`, `.splice()`, `.shift()`, `.unshift()`, `.reverse()`, `.sort()`, `.fill()`, `.copyWithin()` |

**Severity rationale:** `warning` — mutating external state during render breaks React's purity contract. Such mutations cause inconsistent UI, make components unpredictable in concurrent rendering, and are a common source of hard-to-find bugs.

---

**Severity rationale overall:** `warning` — mutating props or writing side effects directly in render violates React's core contract. Prop mutations cause hard-to-track bugs (unexpected UI updates), and render-body side effects break the assumption that rendering is a pure transformation, leading to inconsistent state and performance issues.

---

## 9. React Calls (error)

**Rule name:** `react-calls`

**What it detects:** Two violations related to how React components and Hooks are invoked:

### 9a. Components Called as Functions

Flags `CallExpression` nodes where the callee is an uppercase-starting identifier (React component convention) used as a plain function. Components must be instantiated with JSX syntax, not called directly.

**Bad code:**
```tsx
function App() {
  const menu = Menu();              // ← ERROR: called as function
  const footer = Footer();          // ← ERROR: called as function
  return <div>{menu}{footer}</div>;
}
```

**Good code:**
```tsx
function App() {
  return (
    <div>
      <Menu />
      <Footer />
    </div>
  );
}
```

Native constructors (`Array()`, `Map()`, `Set()`, `Date()`, `Error()`, `Promise()`, `RegExp()`, `Object()`, etc.) are excluded from this detection.

### 9b. Hooks Referenced as Values

Flags `Identifier` nodes matching the hook naming convention (`use` + uppercase, e.g. `useState`, `useEffect`) that are **not immediately called** — i.e. used as a value reference instead of invoked as a function.

**Bad code:**
```tsx
function App() {
  const myHook = useState;          // ← ERROR: referenced but not called
  return <div />;
}
```

```tsx
function App() {
  return <div>{useState}</div>;     // ← ERROR: referenced but not called
}
```

**Good code:**
```tsx
function App() {
  const [value, setValue] = useState(0);  // OK: properly called
  useEffect(() => {                       // OK: properly called
    console.log(value);
  }, [value]);
  return <div>{value}</div>;
}
```

**Detection logic:** A `pendingHookCallee` flag is set to `true` when entering a `CallExpression` whose callee (or `MemberExpression` property) matches the hook naming convention. The flag is consumed by the first hook-matching `Identifier` visited — which is always the callee itself. Any subsequent hook-matching `Identifier` encountered (in arguments or elsewhere) while the flag is `false` triggers a violation. This correctly handles:
- `useState(0)` → valid (flag consumed by callee)
- `React.useState(0)` → valid (flag consumed by MemberExpression property)
- `const fn = useState` → violation (flag never set)
- `useEffect(useCallback, [])` → violation on `useCallback` (passed as value, not called)

**Severity rationale:** `error` — calling a component as a function instead of using JSX skips React's reconciliation logic and can cause subtle rendering bugs. Using hooks as values (instead of calling them) violates the Rules of Hooks and leads to state management bugs and unpredictable component behavior.

---

## Summary

| Rule | Severity | Detects |
|------|----------|---------|
| `rules-of-hooks` | error | Hooks inside conditionals/loops/nested functions + hooks in non-component context |
| `naked-effect` | error | `useEffect` without a dependency array |
| `react-calls` | error | Components called as functions + hooks referenced as values |
| `inline-fetching` | warning | Raw `fetch`/`axios` calls in component body |
| `inline-style-abuse` | warning | Inline styles with > 3 CSS properties |
| `state-fatness` | warning | Components with more than 4 `useState` calls |
| `no-props-drilling` | warning | Props passed to children without local usage |
| `react-purity` | warning | Prop mutations + render-body side effects + non-idempotent expressions + post-JSX mutations + out-of-scope mutations |
| `component-length` | warning | Components longer than 100 lines |

## Adding New Rules

Each rule is a standalone file in `src/rules/`. To add a new one:

1. Create `src/rules/myRule.ts` exporting `registerListeners(context: RuleContext): Record<string, ASTListener[]>` that returns AST node type listeners
2. If the rule needs to act after the AST traversal, push a callback to `context.onComplete`
3. If the rule needs to inspect the function signature (parameters), access `context.functionNode`
4. Import and add the registration function to the `RULE_REGISTRATIONS` array in `src/parser/reactComponentParser.ts`

No other file needs to change — the rule is automatically wired into the pipeline.
