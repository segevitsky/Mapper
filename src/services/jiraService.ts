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

export class JiraService {
  private baseUrl: string;
  private auth: string;

  constructor() {
    this.baseUrl = `https://indiemapper.atlassian.net/rest/api/3`;
    this.auth = btoa(
      `segevitsky@gmail.com:ATATT3xFfGF0TxPfvaRYvh2Dzz-iLngMUCJJIrbL1_6fpba4wIjoS03ijO1U3kCwPrt9dShWlFcj-PR6TZpevulolMr5S2dvWu7cE8e7Nm7plNNhO8ofTuJNVGATAGL46ado5_J4fT3kZmz0-47ezZfsLi7Jsr2xZGikH5TbJxi3Oms-usDjAek=98E15024`
    );
  }

  async createTicket(data: JiraTicketData) {
    try {
      const response = await fetch(`${this.baseUrl}/issue`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: {
              key: "CCS", // נצטרך להפוך את זה לקונפיגורציה
            },
            summary: data.summary,
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ text: data.description, type: "text" }],
                },
              ],
            },
            issuetype: { name: data.issueType },
            priority: data.priority ? { name: data.priority } : undefined,
            labels: data.labels,
          },
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Error creating Jira ticket:", error);
      throw error;
    }
  }
}
