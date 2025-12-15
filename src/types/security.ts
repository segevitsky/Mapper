// Security types for the rule-based security engine

import { NetworkCall } from './index';

export type SecuritySeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type SecurityCategory =
  | 'Auth'
  | 'Privacy'
  | 'Performance'
  | 'Network'
  | 'Vulnerability';

export interface SecurityIssue {
  ruleId: string;
  url: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  message: string;
  recommendation: string;
  timestamp: number;
  domain?: string; // The domain this issue relates to
  details?: Record<string, any>; // Additional context
}

export interface SecurityRule {
  id: string;
  name: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  enabled: boolean;
  description: string;
  check: (call: NetworkCall, context: SecurityContext) => Promise<SecurityIssue | null>;
  recommendation: string;
}

export interface SecurityContext {
  configuredBackend?: string;
  hostname: string;
}

export interface SecurityAnalysisResult {
  issues: SecurityIssue[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalCount: number;
}
