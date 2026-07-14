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
}
