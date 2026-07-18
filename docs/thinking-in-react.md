# Thinking in React — Reference

## 1. Component Decomposition (Single Responsibility)

Split the UI into a **component hierarchy**. Each component should do **one thing** — if it grows too large, decompose it into sub-components.

**Method**: draw boxes around every visual element, name each box, then flatten/nest into a parent–child tree. A component should ideally map 1:1 to a piece of your data model.

---

## 2. The Minimal State Filter

Before adding `useState`, ask these **three questions** for every candidate piece of data:

1. **Does it stay the same over time?** → Not state (use a constant).
2. **Is it computed from existing props or state?** → Not state (derive it).
3. **Is it passed from a parent via props?** → Not state (it belongs to the parent).

Only data that survives all three filters deserves `useState`. Everything else is either a prop, a derived value, or a constant.

**Example**: a `fullName` derived from `firstName + " " + lastName` must NOT be state.

---

## 3. State Localization (Common Ancestor Rule)

For every piece of state that **two or more siblings** need:

- Find the **closest common ancestor** of all components that need it.
- Place the state in that ancestor.
- Pass it down via props.

If no common ancestor makes sense, lift the state to a **global store** or use **composition** (pass children as JSX).

**One-way data flow**: state lives in the owner, flows down via props. Callbacks flow back up for mutations.
