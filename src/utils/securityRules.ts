// Security Rules - Individual security checks

import { NetworkCall } from '../types';
import { SecurityRule, SecurityIssue, SecurityContext } from '../types/security';

/**
 * Helper: Extract URL from network call
 */
function extractUrl(call: NetworkCall): string {
  return (
    call?.lastCall?.url ||
    call?.request?.request?.url ||
    call?.url ||
    ''
  );
}

/**
 * Helper: Get request headers
 */
function getHeaders(call: NetworkCall): Record<string, string> {
  return (
    call?.request?.request?.headers ||
    call?.request?.headers ||
    {}
  );
}

/**
 * RULE 1: Credentials in URL
 * Detects API keys, passwords, tokens in query parameters
 */
const credentialsInUrlRule: SecurityRule = {
  id: 'credentials-in-url',
  name: 'Credentials in URL',
  severity: 'Critical',
  category: 'Privacy',
  enabled: true,
  description: 'Detects sensitive credentials exposed in URL parameters',
  recommendation: 'Move credentials to request headers or body. Never expose secrets in URLs.',

  check: async (call: NetworkCall, _context: SecurityContext): Promise<SecurityIssue | null> => {
    const url = extractUrl(call);
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      // Sensitive parameter names to check for
      const sensitiveParams = [
        'password', 'passwd', 'pwd',
        'api_key', 'apikey', 'api-key', 'key',
        'token', 'access_token', 'accesstoken', 'auth_token',
        'secret', 'client_secret',
        'authorization', 'auth',
        'session', 'sessionid', 'session_id',
        'credit_card', 'creditcard', 'cc',
        'ssn', 'social_security',
      ];

      // Check if any sensitive params exist
      for (const [key, value] of params.entries()) {
        const lowerKey = key.toLowerCase();
        const hasSensitiveParam = sensitiveParams.some(sensitive =>
          lowerKey.includes(sensitive)
        );

        if (hasSensitiveParam && value) {
          return {
            ruleId: 'credentials-in-url',
            url,
            severity: 'Critical',
            category: 'Privacy',
            message: `Sensitive parameter "${key}" exposed in URL`,
            recommendation: 'Move credentials to Authorization header or request body',
            timestamp: Date.now(),
            domain: urlObj.hostname,
            details: {
              parameterName: key,
              parameterValue: value.substring(0, 3) + '***', // Redacted preview
            },
          };
        }
      }
    } catch (error) {
      // Invalid URL, skip
      return null;
    }

    return null;
  },
};

/**
 * RULE 2: Missing Authorization
 * Detects API calls without authorization headers
 */
const missingAuthorizationRule: SecurityRule = {
  id: 'missing-authorization',
  name: 'Missing Authorization',
  severity: 'High',
  category: 'Auth',
  enabled: true,
  description: 'Detects API calls to authenticated endpoints without authorization headers',
  recommendation: 'Add Authorization header for authenticated API calls.',

  check: async (call: NetworkCall, context: SecurityContext): Promise<SecurityIssue | null> => {
    const url = extractUrl(call);
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Only check calls to the configured backend
      if (context.configuredBackend) {
        try {
          const backendUrl = new URL(context.configuredBackend);
          // Skip if this call is NOT to the configured backend
          if (domain !== backendUrl.hostname) {
            return null;
          }
        } catch {
          // Invalid backend URL, skip this check
          return null;
        }
      } else {
        // No backend configured, skip this check
        return null;
      }

      // Check if response indicates this is an API call (JSON/XML)
      const contentType = call?.response?.headers?.['content-type'] ||
                         call?.response?.headers?.['Content-Type'] || '';
      const isApiCall = contentType.includes('application/json') ||
                       contentType.includes('application/xml') ||
                       contentType.includes('text/json');

      // If not an API response, skip
      if (!isApiCall) {
        return null;
      }

      // Skip common public/auth endpoints that legitimately don't need auth
      const publicPatterns = [
        '/auth/login',
        '/auth/register',
        '/auth/signup',
        '/public/',
        '/health',
        '/status',
        '/version',
        '/login',
        '/register',
        '/signup',
      ];

      const isPublicEndpoint = publicPatterns.some(pattern =>
        url.toLowerCase().includes(pattern.toLowerCase())
      );

      if (isPublicEndpoint) {
        return null;
      }

      // Check for authorization headers
      const headers = getHeaders(call);
      const hasAuth =
        headers['Authorization'] ||
        headers['authorization'] ||
        headers['X-API-Key'] ||
        headers['X-Api-Key'] ||
        headers['x-api-key'] ||
        headers['X-Auth-Token'] ||
        headers['x-auth-token'];

      if (!hasAuth) {
        return {
          ruleId: 'missing-authorization',
          url,
          severity: 'High',
          category: 'Auth',
          message: `API call without authorization header: ${urlObj.pathname}`,
          recommendation: 'Add Authorization header if this endpoint requires authentication',
          timestamp: Date.now(),
          domain: urlObj.hostname,
          details: {
            method: call?.request?.request?.method || call?.method || 'GET',
            path: urlObj.pathname,
            contentType,
          },
        };
      }
    } catch {
      // Invalid URL, skip
      return null;
    }

    return null;
  },
};

/**
 * Export all rules
 */
export const securityRules: SecurityRule[] = [
  credentialsInUrlRule,
  missingAuthorizationRule,
];
