export interface RuleViolation {
  ruleName: string;
  severity: "error" | "warning";
  line: number;
  message: string;
}

export interface AnalysisResult {
  filePath: string;
  componentName: string;
  totalLines: number;
  issues: RuleViolation[];
  passed: boolean;
  /** Names of other React components instantiated in this component's JSX. */
  dependencies: string[];
}

export type ASTListener = (node: any) => void;

export interface RuleContext {
  componentName: string;
  componentTotalLines: number;
  violations: RuleViolation[];
  onComplete: (() => void)[];
  /** Reference to the component's function AST node, so rules that need
   *  parameter inspection (e.g. props-drilling detection) can analyse
   *  the function signature without changing the walk root. */
  functionNode: unknown;
}
