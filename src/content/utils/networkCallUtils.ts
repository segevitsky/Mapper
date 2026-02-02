import { NetworkCall } from "../../types";

/**
 * Extract URL from NetworkCall - handles various data structures
 * The URL can be in different places depending on the source:
 * - response.response.url: From Chrome debugger API
 * - response.url: Sometimes flattened
 * - request.request.url: From request object
 * - url: Direct property
 */
export function getNetworkCallUrl(call: NetworkCall | null | undefined): string {
  return call?.response?.response?.url ??
         call?.response?.url ??
         call?.request?.request?.url ??
         call?.url ??
         '';
}

/**
 * Extract HTTP method from NetworkCall - handles various data structures
 */
export function getNetworkCallMethod(call: NetworkCall | null | undefined): string {
  return call?.request?.request?.method ??
         call?.method ??
         'GET';
}

/**
 * Extract duration from NetworkCall - handles various data structures
 */
export function getNetworkCallDuration(call: NetworkCall | null | undefined): number {
  return call?.response?.response?.timing?.receiveHeadersEnd ??
         call?.duration ??
         0;
}

/**
 * Extract headers from NetworkCall request
 */
export function getNetworkCallHeaders(call: NetworkCall | null | undefined): Record<string, string> {
  return call?.request?.request?.headers ??
         call?.request?.headers ??
         {};
}
