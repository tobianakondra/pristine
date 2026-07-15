# Analysis Rules Reference

Pristine-MCP currently detects **4 maintainability issues** in React components. Each rule has a severity (`error` or `warning`) and a clear explanation of why it matters.

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

## Summary

| Rule | Severity | Detects |
|------|----------|---------|
| `hooks-separation` | error | Hooks inside conditions, loops, or nested functions |
| `naked-effect` | error | `useEffect` without a dependency array |
| `inline-fetching` | warning | Raw `fetch`/`axios` calls in component body |
| `component-length` | warning | Components longer than 100 lines |

## Adding New Rules

Each rule is a standalone file in `src/rules/`. To add a new one:

1. Create `src/rules/myRule.ts` exporting a function with signature `(componentName: string, ...data: ...) => RuleViolation[]`
2. Add the necessary data fields to `ParsedComponent` in `src/parser/reactComponentParser.ts`
3. Import and call the function in `src/index.ts`
