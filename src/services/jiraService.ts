// services/jiraService.ts
export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
}

export interface JiraTicketData {
  summary: string;
  description: string;
  issueType: string;
  priority?: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  labels?: string[];
  securityInfo?: {
    potentialIssues: string[];
    riskLevel: "High" | "Medium" | "Low";
    recommendations?: string[];
  };
}
