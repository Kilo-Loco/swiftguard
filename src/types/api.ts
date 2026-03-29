export interface ReviewRequest {
  source: string;
  swiftVersion?: string;
  platform?: string;
}

export interface Issue {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  column: number;
  confidence: number;
  suggestion: string;
  seProposal?: string;
  seProposalUrl?: string;
}

export interface ReviewMetadata {
  rulesApplied: number;
  parseTimeMs: number;
  astValid: boolean;
}

export interface ReviewResponse {
  issues: Issue[];
  metadata: ReviewMetadata;
}
