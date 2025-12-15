// Security Rule Engine - Analyzes network calls for security issues

import { NetworkCall } from '../types';
import {
  SecurityRule,
  SecurityIssue,
  SecurityContext,
  SecurityAnalysisResult,
} from '../types/security';
import { securityRules } from './securityRules';

export class SecurityEngine {
  private rules: SecurityRule[] = [];
  private context: SecurityContext;

  constructor(context: SecurityContext) {
    this.context = context;
    this.loadRules();
  }

  /**
   * Load all enabled security rules
   */
  private loadRules(): void {
    this.rules = securityRules.filter(rule => rule.enabled);
  }

  /**
   * Update context (e.g., when backend changes)
   */
  public updateContext(context: Partial<SecurityContext>): void {
    this.context = { ...this.context, ...context };
    this.loadRules();
  }

  /**
   * Analyze a single network call
   */
  public async analyzeCall(call: NetworkCall): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    for (const rule of this.rules) {
      try {
        const issue = await rule.check(call, this.context);
        if (issue) {
          issues.push(issue);
        }
      } catch (error) {
        console.error(`Error running security rule ${rule.id}:`, error);
      }
    }

    return issues;
  }

  /**
   * Analyze multiple network calls
   */
  public async analyzeMultiple(calls: NetworkCall[]): Promise<SecurityAnalysisResult> {
    const allIssues: SecurityIssue[] = [];

    for (const call of calls) {
      const issues = await this.analyzeCall(call);
      allIssues.push(...issues);
    }

    return this.aggregateResults(allIssues);
  }

  /**
   * Aggregate issues into summary
   */
  private aggregateResults(issues: SecurityIssue[]): SecurityAnalysisResult {
    const criticalCount = issues.filter(i => i.severity === 'Critical').length;
    const highCount = issues.filter(i => i.severity === 'High').length;
    const mediumCount = issues.filter(i => i.severity === 'Medium').length;
    const lowCount = issues.filter(i => i.severity === 'Low').length;

    return {
      issues,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      totalCount: issues.length,
    };
  }

  /**
   * Get all enabled rules
   */
  public getRules(): SecurityRule[] {
    return this.rules;
  }
}
