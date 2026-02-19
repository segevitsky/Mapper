// src/utils/replayUtils.ts
// Utility functions for the Replay Request feature

import { NetworkCall, ReplayRequestData } from '../types';

/**
 * Parse a NetworkCall object into ReplayRequestData for the modal
 */
export function parseNetworkCallToReplayData(call: NetworkCall): ReplayRequestData {
  const url = extractUrl(call);
  const method = extractMethod(call);
  const headers = extractHeaders(call);
  const body = extractRequestBody(call);
  const queryParams = parseQueryParams(url);

  // Remove query params from URL for cleaner display
  const baseUrl = url.split('?')[0];

  return {
    url: baseUrl,
    method: method as ReplayRequestData['method'],
    headers,
    body,
    queryParams,
  };
}

/**
 * Extract URL from NetworkCall (handles nested structure)
 */
function extractUrl(call: NetworkCall): string {
  return call?.lastCall?.url ||
         call?.request?.request?.url ||
         call?.url ||
         '';
}

/**
 * Extract HTTP method from NetworkCall
 */
function extractMethod(call: NetworkCall): string {
  return call?.request?.request?.method ||
         call?.method ||
         'GET';
}

/**
 * Extract headers from NetworkCall and convert to editable format
 */
function extractHeaders(call: NetworkCall): { key: string; value: string; enabled: boolean }[] {
  const headersObj = call?.request?.request?.headers ||
                     call?.request?.headers ||
                     {};

  return Object.entries(headersObj)
    .filter(([key]) => {
      // Skip headers that are auto-generated or problematic
      const skipHeaders = ['host', 'connection', 'content-length', 'accept-encoding'];
      return !skipHeaders.includes(key.toLowerCase());
    })
    .map(([key, value]) => ({
      key,
      value: String(value),
      enabled: true,
    }));
}

/**
 * Extract request body from NetworkCall
 */
function extractRequestBody(call: NetworkCall): string {
  // Try postData from debugger API first (most reliable for POST data)
  const postData = call?.request?.request?.postData;
  if (postData) {
    return typeof postData === 'string' ? postData : JSON.stringify(postData, null, 2);
  }

  // Try requestBody from webRequest API
  const requestBody = call?.requestBody;
  if (requestBody) {
    // webRequest API returns requestBody in a special format
    // It can have: { formData: {...} } or { raw: [{bytes: ArrayBuffer}] }

    if (typeof requestBody === 'string') {
      return requestBody;
    }

    // Handle formData format
    if (requestBody.formData) {
      const formData: Record<string, any> = {};
      for (const [key, values] of Object.entries(requestBody.formData)) {
        formData[key] = Array.isArray(values) && values.length === 1 ? values[0] : values;
      }
      return JSON.stringify(formData, null, 2);
    }

    // Handle raw bytes format
    if (requestBody.raw && Array.isArray(requestBody.raw)) {
      try {
        // Combine all raw parts and decode as UTF-8
        const parts = requestBody.raw
          .filter((part: any) => part.bytes)
          .map((part: any) => {
            if (part.bytes instanceof ArrayBuffer) {
              return new TextDecoder().decode(part.bytes);
            }
            // Sometimes bytes might already be decoded or in different format
            return typeof part.bytes === 'string' ? part.bytes : '';
          });
        const decoded = parts.join('');
        if (decoded) {
          // Try to format as JSON if possible
          try {
            return JSON.stringify(JSON.parse(decoded), null, 2);
          } catch {
            return decoded;
          }
        }
      } catch (e) {
        console.error('Failed to decode request body:', e);
      }
    }

    // Fallback: stringify the whole object
    return JSON.stringify(requestBody, null, 2);
  }

  // Check if body exists but is response body (skip it)
  const body = call?.body;
  if (body && typeof body === 'object' && 'body' in body) {
    // This is likely a response body, not request body
    return '';
  }

  return '';
}

/**
 * Parse query parameters from a URL
 */
export function parseQueryParams(url: string): { key: string; value: string; enabled: boolean }[] {
  try {
    const urlObj = new URL(url);
    const params: { key: string; value: string; enabled: boolean }[] = [];

    urlObj.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });

    return params;
  } catch {
    return [];
  }
}

/**
 * Build URL with query parameters from editable params list
 */
export function buildUrlWithParams(
  baseUrl: string,
  params: { key: string; value: string; enabled: boolean }[]
): string {
  try {
    const urlObj = new URL(baseUrl);

    // Clear existing params
    urlObj.search = '';

    // Add enabled params
    params
      .filter(p => p.enabled && p.key.trim())
      .forEach(p => {
        urlObj.searchParams.append(p.key, p.value);
      });

    return urlObj.toString();
  } catch {
    // If URL parsing fails, just return the base URL
    return baseUrl;
  }
}

/**
 * Generate a cURL command from replay request data
 */
export function generateCurlCommand(data: ReplayRequestData): string {
  const fullUrl = buildUrlWithParams(data.url, data.queryParams);
  let curl = `curl -X ${data.method} '${fullUrl}'`;

  // Add headers
  data.headers
    .filter(h => h.enabled && h.key.trim())
    .forEach(h => {
      curl += ` \\\n  -H '${h.key}: ${h.value}'`;
    });

  // Add body for appropriate methods
  if (data.body && ['POST', 'PUT', 'PATCH'].includes(data.method)) {
    const escapedBody = data.body.replace(/'/g, "'\\''");
    curl += ` \\\n  --data '${escapedBody}'`;
  }

  return curl;
}

/**
 * Convert headers array to object for fetch()
 */
export function headersArrayToObject(
  headers: { key: string; value: string; enabled: boolean }[]
): Record<string, string> {
  const result: Record<string, string> = {};

  headers
    .filter(h => h.enabled && h.key.trim())
    .forEach(h => {
      result[h.key] = h.value;
    });

  return result;
}

/**
 * Format JSON string with proper indentation
 */
export function formatJsonBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

/**
 * Try to parse response body as JSON
 */
export function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
