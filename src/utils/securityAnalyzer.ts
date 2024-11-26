// utils/securityAnalyzer.ts
export function analyzeSecurityIssues(data: any) {
  const issues: string[] = [];
  let riskLevel: "High" | "Medium" | "Low" = "Low";
  const recommendations: string[] = [];

  // בדיקת HTTPS
  if (!data.lastCall.url.startsWith("https://")) {
    issues.push("Non-secure HTTP connection");
    riskLevel = "High";
    recommendations.push("Switch to HTTPS");
  }

  // בדיקת זמני תגובה
  if (data.lastCall.timing?.duration > 1000) {
    issues.push("Slow response time might indicate DDoS vulnerability");
    recommendations.push("Implement rate limiting");
  }

  // בדיקת סטטוס קודים
  if (data.lastCall.status === 500) {
    issues.push("Internal Server Error - Possible server vulnerability");
    recommendations.push("Implement proper error handling");
  }

  // עוד בדיקות שנוכל להוסיף:
  // - חיפוש פרמטרים רגישים ב-URL
  // - בדיקת הדרים חשודים
  // - זיהוי תבניות של מתקפות XSS/SQLi
  // וכו'

  return {
    potentialIssues: issues,
    riskLevel,
    recommendations,
  };
}
