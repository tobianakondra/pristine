# Analysis Rules Reference

Pristine-MCP currently detects **8 maintainability issues** in React components. Each rule has a severity (`error` or `warning`) and a clear explanation of why it matters.

---

## 1. Hooks Separation (error)

**Rule name:** `hooks-separation`

**What it detects:** React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `useContext`, etc.) called inside conditions, loops, or nested functions.

**Bad code:**
```tsx
function UserProfile() {
  const [name, setName] = useState("");

  if (name === "") {
    useEffect(() => {          // ← ERROR: hook inside condition
      document.title = "Empty";
    }, []);
  }

  for (const item of items) {
    useState(item);            // ← ERROR: hook inside loop
  }

  const handler = () => {
    useState(false);           // ← ERROR: hook inside nested function
  };
}
```

**Why it matters:** React relies on the **order** of hook calls being identical between renders. When hooks are placed inside conditions or loops, the order can change between renders, causing React to mismanage state and produce subtle, hard-to-debug bugs. This is [Rule #1 of the Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks).

**Severity rationale:** `error` — violating this rule breaks React's internal state management and almost always leads to runtime bugs.

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

**Severity rationale:** `warning` — mutating props or writing side effects directly in render violates React's core contract. Prop mutations cause hard-to-track bugs (unexpected UI updates), and render-body side effects break the assumption that rendering is a pure transformation, leading to inconsistent state and performance issues.

---

## Summary

| Rule | Severity | Detects |
|------|----------|---------|
| `hooks-separation` | error | Hooks inside conditions, loops, or nested functions |
| `naked-effect` | error | `useEffect` without a dependency array |
| `inline-fetching` | warning | Raw `fetch`/`axios` calls in component body |
| `inline-style-abuse` | warning | Inline styles with > 3 CSS properties |
| `state-fatness` | warning | Components with more than 4 `useState` calls |
| `no-props-drilling` | warning | Props passed to children without local usage |
| `react-purity` | warning | Prop mutations + render-body side effects |
| `component-length` | warning | Components longer than 100 lines |

## Adding New Rules

Each rule is a standalone file in `src/rules/`. To add a new one:

1. Create `src/rules/myRule.ts` exporting `registerListeners(context: RuleContext): Record<string, ASTListener[]>` that returns AST node type listeners
2. If the rule needs to act after the AST traversal, push a callback to `context.onComplete`
3. If the rule needs to inspect the function signature (parameters), access `context.functionNode`
4. Import and add the registration function to the `RULE_REGISTRATIONS` array in `src/parser/reactComponentParser.ts`

No other file needs to change — the rule is automatically wired into the pipeline.
