import { describe, it, expect } from "vitest";
import { parse } from "@babel/parser";
import { registerListeners } from "./index.js";
import { traverseAST } from "../../parser/bodyExtractor.js";
import type { RuleContext, RuleViolation } from "../../types.js";

function runRule(
  code: string,
  componentName = "TestComponent",
): RuleViolation[] {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  let functionNode: Record<string, unknown> | undefined;
  let walkRoot: unknown = ast;

  for (const stmt of ast.program.body) {
    if (stmt.type === "FunctionDeclaration") {
      functionNode = stmt as unknown as Record<string, unknown>;
      walkRoot = (stmt as unknown as Record<string, unknown>).body;
      break;
    }
    if (stmt.type === "VariableDeclaration") {
      const decls = (stmt as unknown as Record<string, unknown>)
        .declarations as Record<string, unknown>[] | undefined;
      if (decls) {
        for (const decl of decls) {
          const init = decl.init as Record<string, unknown> | undefined;
          if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
            functionNode = init;
            walkRoot = init.body;
            break;
          }
        }
      }
    }
    if (
      stmt.type === "ExportNamedDeclaration" &&
      (stmt as unknown as Record<string, unknown>).declaration
    ) {
      const decl = (stmt as unknown as Record<string, unknown>)
        .declaration as Record<string, unknown>;
      if (decl.type === "FunctionDeclaration") {
        functionNode = decl;
        walkRoot = decl.body;
        break;
      }
    }
    if (stmt.type === "ExportDefaultDeclaration") {
      const decl = (stmt as unknown as Record<string, unknown>)
        .declaration as Record<string, unknown>;
      if (
        decl.type === "FunctionDeclaration" ||
        decl.type === "ArrowFunctionExpression" ||
        decl.type === "FunctionExpression"
      ) {
        functionNode = decl;
        walkRoot = decl.type === "FunctionDeclaration"
          ? decl.body
          : (decl as Record<string, unknown>).body;
        break;
      }
    }
    if (functionNode) break;
  }

  const violations: RuleViolation[] = [];
  const context: RuleContext = {
    componentName,
    componentTotalLines: code.split("\n").length,
    violations,
    onComplete: [],
    functionNode,
  };

  const listeners = registerListeners(context);
  traverseAST(walkRoot, listeners);

  for (const cb of context.onComplete) {
    cb();
  }

  return violations;
}

describe("rules-of-hooks", () => {
  describe("Check (a): Top-level rule — no conditional / loop / callback ancestors", () => {
    it("errors when useState is inside an if block", () => {
      const code = `
        function App() {
          if (condition) {
            useState(0);
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
      expect(hookViolations[0]?.message).toContain("useState");
      expect(hookViolations[0]?.message).toContain("conditionally");
    });

    it("errors when useEffect is inside a for loop", () => {
      const code = `
        function App() {
          for (let i = 0; i < items.length; i++) {
            useEffect(() => {});
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
      expect(hookViolations[0]?.message).toContain("useEffect");
    });

    it("errors when useState is inside a while loop", () => {
      const code = `
        function App() {
          while (condition) {
            useState(0);
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
    });

    it("errors when useEffect is inside a switch case", () => {
      const code = `
        function App() {
          switch (value) {
            case "a":
              useEffect(() => {});
              break;
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
    });

    it("errors when useState is inside a ConditionalExpression (ternary)", () => {
      const code = `
        function App() {
          const x = condition ? useState(0) : null;
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
    });

    it("errors when useState is inside a .map() callback", () => {
      const code = `
        function App() {
          items.map((item) => {
            useState(item);
          });
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
      expect(hookViolations[0]?.message).toContain("useState");
    });

    it("errors when useState is inside a nested function declaration", () => {
      const code = `
        function App() {
          function inner() {
            useState(0);
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
    });

    it("errors when useState is inside a try block", () => {
      const code = `
        function App() {
          try {
            useState(0);
          } catch (e) {}
          return <div />;
        }
      `;
      const violations = runRule(code, "App");
      const hookViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(hookViolations).toHaveLength(1);
    });
  });

  describe("Check (b): Context rule — hooks must be in a component or custom hook", () => {
    it("errors when useState is inside a lowercase-named utility function", () => {
      const code = `
        function fetchHelper() {
          useState(0);
        }
      `;
      const violations = runRule(code, "TestComponent");
      const ctxViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-context",
      );
      expect(ctxViolations).toHaveLength(1);
      expect(ctxViolations[0]?.message).toContain("useState");
      expect(ctxViolations[0]?.message).toContain("fetchHelper");
    });

    it("errors when useEffect is inside a lowercase helper", () => {
      const code = `
        function formatData() {
          useEffect(() => {});
        }
      `;
      const violations = runRule(code, "TestComponent");
      const ctxViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-context",
      );
      expect(ctxViolations).toHaveLength(1);
    });

    it("errors when a hook is inside an anonymous arrow assigned to lowercase const", () => {
      const code = `
        const helper = () => {
          useState(0);
        };
      `;
      const violations = runRule(code, "helper");
      const ctxViolations = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-context",
      );
      expect(ctxViolations).toHaveLength(1);
    });
  });

  describe("Valid cases — no violations", () => {
    it("no violation when hooks are at top level of a named component", () => {
      const code = `
        function MyComponent() {
          const [val, setVal] = useState(0);
          useEffect(() => {});
          return <div />;
        }
      `;
      const violations = runRule(code, "MyComponent");
      const rulesViolations = violations.filter(
        (v) => v.ruleName.startsWith("rules-of-hooks"),
      );
      expect(rulesViolations).toHaveLength(0);
    });

    it("no violation when hooks are at top level of a custom hook", () => {
      const code = `
        function useAuth() {
          const [user, setUser] = useState(null);
          useEffect(() => {}, []);
          return user;
        }
      `;
      const violations = runRule(code, "useAuth");
      const rulesViolations = violations.filter(
        (v) => v.ruleName.startsWith("rules-of-hooks"),
      );
      expect(rulesViolations).toHaveLength(0);
    });

    it("no violation when hooks are in an arrow component", () => {
      const code = `
        const MyComponent = () => {
          const [val, setVal] = useState(0);
          return <div />;
        };
      `;
      const violations = runRule(code, "MyComponent");
      const rulesViolations = violations.filter(
        (v) => v.ruleName.startsWith("rules-of-hooks"),
      );
      expect(rulesViolations).toHaveLength(0);
    });

    it("no violation for hooks at top level of uppercase default export", () => {
      const code = `
        export default function Dashboard() {
          const [data, setData] = useState(null);
          return <div />;
        }
      `;
      const violations = runRule(code, "Dashboard");
      const rulesViolations = violations.filter(
        (v) => v.ruleName.startsWith("rules-of-hooks"),
      );
      expect(rulesViolations).toHaveLength(0);
    });

    it("no violation for hooks inside custom hook with use prefix", () => {
      const code = `
        function useMyCustomHook() {
          const [state, setState] = useState(0);
          useEffect(() => {}, []);
          return state;
        }
      `;
      const violations = runRule(code, "useMyCustomHook");
      const rulesViolations = violations.filter(
        (v) => v.ruleName.startsWith("rules-of-hooks"),
      );
      expect(rulesViolations).toHaveLength(0);
    });
  });

  describe("Mixed: both checks can fire for different hooks", () => {
    it("fires conditional for hook inside if AND context for hook in util", () => {
      const code = `
        function MyComponent() {
          if (cond) {
            useState(0);
          }
          return <div />;
        }
      `;
      const violations = runRule(code, "MyComponent");
      const conditional = violations.filter(
        (v) => v.ruleName === "rules-of-hooks-conditional",
      );
      expect(conditional).toHaveLength(1);
    });
  });
});
