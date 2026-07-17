import { describe, it, expect } from "vitest";
import { parse } from "@babel/parser";
import { registerListeners } from "./index.js";
import { traverseAST } from "../../parser/bodyExtractor.js";
import type { RuleContext, RuleViolation } from "../../types.js";

function runRule(code: string): RuleViolation[] {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const violations: RuleViolation[] = [];
  const context: RuleContext = {
    componentName: "TestComponent",
    componentTotalLines: code.split("\n").length,
    violations,
    onComplete: [],
    functionNode: undefined,
  };

  const listeners = registerListeners(context);
  traverseAST(ast, listeners);

  for (const cb of context.onComplete) {
    cb();
  }

  return violations;
}

describe("react-calls", () => {
  describe("Detection (a): component called as function", () => {
    it("flags a component called directly as a function", () => {
      const code = `Header();`;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.ruleName).toBe("react-calls");
      expect(violations[0]?.severity).toBe("error");
      expect(violations[0]?.message).toContain("Header");
    });

    it("flags multiple uppercase function calls", () => {
      const code = `
        Header();
        Footer();
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(2);
    });

    it("ignores native constructors (Map, Set, Date, Error, etc.)", () => {
      const code = `
        Map();
        Set();
        Date();
        Error();
        Promise();
        Array();
        RegExp();
        Object();
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("ignores lowercase function calls", () => {
      const code = `console.log("hello");`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("ignores JSX usage of components", () => {
      const code = `const el = <Header />;`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("ignores member expression calls even with uppercase root", () => {
      const code = `Foo.bar();`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("flags component call inside a component body", () => {
      const code = `
        function App() {
          const menu = Menu();
          return <div>{menu}</div>;
        }
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain("Menu");
      expect(violations[0]?.message).toContain("JSX");
    });

    it("ignores new expressions", () => {
      const code = `const map = new Map(); const date = new Date();`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });
  });

  describe("Detection (b): hook referenced as value", () => {
    it("flags a hook identifier used as a value on RHS of assignment", () => {
      const code = `const myHook = useState;`;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.ruleName).toBe("react-calls");
      expect(violations[0]?.severity).toBe("error");
      expect(violations[0]?.message).toContain("useState");
      expect(violations[0]?.message).toContain("called directly");
    });

    it("flags a standalone hook identifier expression", () => {
      const code = `useState;`;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
    });

    it("ignores a hook that is properly called", () => {
      const code = `const value = useState(0);`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("ignores a hook called via MemberExpression (React.useState)", () => {
      const code = `const value = React.useState(0);`;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });

    it("flags an inner hook passed as argument to a non-hook call", () => {
      const code = `setTimeout(useMyHook, 1000);`;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain("useMyHook");
    });

    it("flags a hook passed as argument to another hook", () => {
      const code = `useEffect(useCallback, []);`;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain("useCallback");
    });

    it("flags multiple standalone hook references", () => {
      const code = `
        const a = useState;
        const b = useEffect;
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(2);
    });

    it("flags a hook used as a value in a component body", () => {
      const code = `
        function App() {
          const myHook = useMyCustomHook;
          return <div />;
        }
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain("useMyCustomHook");
    });

    it("does not confuse 'user' or 'useful' with hooks", () => {
      const code = `
        const user = "Alice";
        const useful = true;
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });
  });

  describe("Combined: no false positives for valid patterns", () => {
    it("passes for a complete valid component", () => {
      const code = `
        function Counter() {
          const [count, setCount] = useState(0);
          useEffect(() => {
            document.title = \`Count: \${count}\`;
          }, [count]);
          return (
            <div>
              <p>{count}</p>
              <button onClick={() => setCount(count + 1)}>Increment</button>
            </div>
          );
        }
      `;
      const violations = runRule(code);
      const reactCallsViolations = violations.filter(
        (v) => v.ruleName === "react-calls",
      );
      expect(reactCallsViolations).toHaveLength(0);
    });

    it("does not flag identifiers that only partially match use prefix", () => {
      const code = `
        const useless = true;
        const user = getName();
      `;
      const violations = runRule(code);
      expect(violations).toHaveLength(0);
    });
  });
});
