// src/content/blob/PageSummary.ts

import { NetworkCall } from '../../types';

export interface PageSummaryData {
  // Timing
  totalTime: number; // in ms
  firstApiTime: number;
  lastApiTime: number;
  
  // Counts
  totalCalls: number;
  successfulCalls: number;
  errorCalls: number;
  warningCalls: number;
  
  // Performance
  averageResponseTime: number;
  slowestApi: { url: string; duration: number } | null;
  fastestApi: { url: string; duration: number } | null;
  
  // Data Transfer
  totalDataTransferred: number; // in bytes
  totalDataTransferredMB: string;
  
  // Frequency
  mostCalledApi: { url: string; count: number } | null;
  
  // Discovery
  uniqueEndpoints: number;
  newApis: string[];
  
  // Security
  securityIssues: number;
  apisWithoutAuth: string[];
  
  // Issues Summary
  hasIssues: boolean;
  issueCount: number;
}

export class PageSummary {
  private pageLoadStart: number = Date.now();
  private previousApis: Set<string> = new Set();

  constructor() {
    this.pageLoadStart = Date.now();
    this.loadPreviousApis();
  }

  /**
   * Analyze network data and generate summary
   */
  public analyze(networkData: NetworkCall[]): PageSummaryData {
    if (!networkData || networkData.length === 0) {
      return this.getEmptySummary();
    }

    console.log('📊 PageSummary analyzing:', networkData.length, 'calls');
    console.log('📊 Sample call structure:', networkData[0]);

    // Extract timing info
    const timestamps = this.extractTimestamps(networkData);
    // const totalTime = Date.now() - this.pageLoadStart;
    const firstApiTime = timestamps.length > 0 ? Math.min(...timestamps) - this.pageLoadStart : 0;
    const lastApiTime = timestamps.length > 0 ? Math.max(...timestamps) - this.pageLoadStart : 0;

    // Count by status
    const successful = networkData.filter(call => {
      const status = this.getStatus(call);
      return status >= 200 && status < 300;
    });
    const errors = networkData.filter(call => this.getStatus(call) >= 400);
    const warnings = networkData.filter(call => {
      const status = this.getStatus(call);
      return status >= 300 && status < 400;
    });

    // Performance metrics
    const durations = this.extractDurations(networkData);
    const totalTime = durations.reduce((sum, duration) => sum + duration, 0);
    const averageResponseTime = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;

    const slowestApi = this.findSlowest(networkData);
    const fastestApi = this.findFastest(networkData);

    // Data transfer
    const totalBytes = this.calculateDataTransfer(networkData);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    // Frequency analysis
    const mostCalled = this.findMostCalled(networkData);

    // Discovery
    const uniqueUrls = new Set(networkData.map(call => this.extractUrl(call)).filter(url => url));
    const newApis = this.findNewApis(Array.from(uniqueUrls));

    // Security
    const apisWithoutAuth = this.findApisWithoutAuth(networkData);
    const securityIssues = apisWithoutAuth.length;

    // Issues summary
    const hasSlowAPI = durations.some(d => d > 1000) ? 1 : 0;
    const issueCount = errors.length + hasSlowAPI + securityIssues;
    const hasIssues = issueCount > 0;

    console.log('📊 Analysis complete:', {
      totalCalls: networkData.length,
      successful: successful.length,
      errorsCount: errors.length,
      issueCount,
      errors,
      hasSlowAPI,
      securityIssues,

    });

    return {
      totalTime,
      firstApiTime,
      lastApiTime,
      totalCalls: networkData.length,
      successfulCalls: successful.length,
      errorCalls: errors.length,
      warningCalls: warnings.length,
      averageResponseTime: Math.round(averageResponseTime),
      slowestApi,
      fastestApi,
      totalDataTransferred: totalBytes,
      totalDataTransferredMB: totalMB,
      mostCalledApi: mostCalled,
      uniqueEndpoints: uniqueUrls.size,
      newApis,
      securityIssues,
      apisWithoutAuth,
      hasIssues,
      issueCount,
    };
  }


  /**
   * Generate HTML summary for tooltip
   */
  public generateSummaryHTML(summary: PageSummaryData): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #1f2937;">
          📊 Page Load Summary
        </div>
        
        <div style="display: grid; gap: 8px; font-size: 14px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">⏱️ Total API Time:</span>
            <span style="font-weight: 600; color: #1f2937;">${(summary.totalTime / 1000).toFixed(2)}s</span>
          </div>
          
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">🌐 API Calls:</span>
            <span style="font-weight: 600; color: #1f2937;">${summary.totalCalls}</span>
          </div>
          
          ${summary.errorCalls > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #ef4444;">❌ Failed:</span>
              <span style="font-weight: 600; color: #ef4444;">${summary.errorCalls}</span>
            </div>
          ` : ''}
          
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">⚡ Avg Response:</span>
            <span style="font-weight: 600; color: ${summary.averageResponseTime > 1000 ? '#f59e0b' : '#10b981'};">
              ${summary.averageResponseTime}ms
            </span>
          </div>
          
          ${summary.slowestApi ? `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px;">
              <div style="font-size: 12px; color: #92400e; margin-bottom: 4px;">🐌 Slowest API:</div>
              <div style="font-size: 11px; color: #78350f; word-break: break-all; font-family: monospace;">
                ${this.shortUrl(summary.slowestApi.url)}
              </div>
              <div style="font-size: 12px; color: #92400e; margin-top: 2px; font-weight: 600;">
                ${summary.slowestApi.duration}ms
              </div>
            </div>
          ` : ''}
          
          ${summary.mostCalledApi && summary.mostCalledApi.count > 1 ? `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px;">
              <div style="font-size: 12px; color: #92400e; margin-bottom: 4px;">🔥 Most Called (${summary.mostCalledApi.count}x):</div>
              <div style="font-size: 11px; color: #78350f; word-break: break-all; font-family: monospace;">
                ${this.shortUrl(summary.mostCalledApi.url)}
              </div>
            </div>
          ` : ''}
          
          ${summary.totalDataTransferred > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span style="color: #6b7280;">📦 Data:</span>
              <span style="font-weight: 600; color: #1f2937;">${summary.totalDataTransferredMB} MB</span>
            </div>
          ` : ''}
          
          ${summary.newApis.length > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span style="color: #3b82f6;">🆕 New APIs:</span>
              <span style="font-weight: 600; color: #3b82f6;">${summary.newApis.length}</span>
            </div>
          ` : ''}
          
          ${summary.securityIssues > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span style="color: #ef4444;">🔒 Security Issues:</span>
              <span style="font-weight: 600; color: #ef4444;">${summary.securityIssues}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ========== HELPER METHODS - FIXED FOR NESTED STRUCTURE ==========

  private getEmptySummary(): PageSummaryData {
    return {
      totalTime: 0,
      firstApiTime: 0,
      lastApiTime: 0,
      totalCalls: 0,
      successfulCalls: 0,
      errorCalls: 0,
      warningCalls: 0,
      averageResponseTime: 0,
      slowestApi: null,
      fastestApi: null,
      totalDataTransferred: 0,
      totalDataTransferredMB: '0.00',
      mostCalledApi: null,
      uniqueEndpoints: 0,
      newApis: [],
      securityIssues: 0,
      apisWithoutAuth: [],
      hasIssues: false,
      issueCount: 0,
    };
  }

  /**
   * Extract URL - handles nested structure
   */
  private extractUrl(call: NetworkCall): string {
    // Try multiple paths based on your structure
    return call?.lastCall?.url ||           // From lastCall
           call?.request?.request?.url ||   // Nested request
           call?.url ||                      // Top level
           '';
  }

  /**
   * Get status - handles nested structure
   */
  private getStatus(call: NetworkCall): number {
    return call?.lastCall?.status ||        // From lastCall
           call?.response?.status ||        // From response
           call?.status ||                  // Top level
           0;
  }

  /**
   * Get duration - handles nested structure and your timing object
   */
  private getDuration(call: NetworkCall): number {
    // Your structure has `duration` at top level
    if (call?.duration) {
      return call.duration;
    }
    
    // Also check lastCall.timing
    if (call?.lastCall?.timing) {
      const timing = call.lastCall.timing;
      // If timing is an object with duration property
      if (typeof timing === 'object' && 'duration' in timing) {
        return timing.duration;
      }
      // If timing itself is the duration number
      if (typeof timing === 'number') {
        return timing;
      }
    }
    
    return 0;
  }

  private extractTimestamps(networkData: NetworkCall[]): number[] {
    return networkData
      .map(call => {
        // Try lastCall first
        if (call?.lastCall?.timestamp) {
          return call.lastCall.timestamp;
        }
        // Try response.response
        if (call?.response?.response?.timestamp) {
          return call.response.response.timestamp;
        }
        // Try top level
        if (call?.timestamp) {
          return call.timestamp;
        }
        return 0;
      })
      .filter(t => t > 0);
  }

  private extractDurations(networkData: NetworkCall[]): number[] {
    return networkData
      .map(call => this.getDuration(call))
      .filter(d => d > 0);
  }

  private findSlowest(networkData: NetworkCall[]): { url: string; duration: number } | null {
    let slowest: NetworkCall | null = null;
    let maxDuration = 0;

    networkData.forEach(call => {
      const duration = this.getDuration(call);
      if (duration > maxDuration) {
        maxDuration = duration;
        slowest = call;
      }
    });

    if (!slowest) return null;
    
    const url = this.extractUrl(slowest);
    return url ? { url, duration: Math.round(maxDuration) } : null;
  }

  private findFastest(networkData: NetworkCall[]): { url: string; duration: number } | null {
    let fastest: NetworkCall | null = null;
    let minDuration = Infinity;

    networkData.forEach(call => {
      const duration = this.getDuration(call);
      if (duration > 0 && duration < minDuration) {
        minDuration = duration;
        fastest = call;
      }
    });

    if (!fastest) return null;
    
    const url = this.extractUrl(fastest);
    return url ? { url, duration: Math.round(minDuration) } : null;
  }

  private calculateDataTransfer(networkData: NetworkCall[]): number {
    return networkData.reduce((total, call) => {
      // Try to find body size
      const size = call?.response?.bodySize || 
                   call?.bodySize || 
                   call?.body?.body?.length ||
                   0;
      return total + size;
    }, 0);
  }

  private findMostCalled(networkData: NetworkCall[]): { url: string; count: number } | null {
    const urlCounts = new Map<string, number>();

    networkData.forEach(call => {
      const url = this.extractUrl(call);
      if (url) {
        urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
      }
    });

    let mostCalled: { url: string; count: number } | null = null;
    let maxCount = 0;

    urlCounts.forEach((count, url) => {
      if (count > maxCount) {
        maxCount = count;
        mostCalled = { url, count };
      }
    });

    return mostCalled;
  }

  private findNewApis(currentUrls: string[]): string[] {
    const newApis: string[] = [];

    currentUrls.forEach(url => {
      if (!this.previousApis.has(url)) {
        newApis.push(url);
        this.previousApis.add(url);
      }
    });

    this.savePreviousApis();
    return newApis;
  }

  private findApisWithoutAuth(networkData: NetworkCall[]): string[] {
    return networkData
      .filter(call => {
        const url = this.extractUrl(call);
        // Check nested request.request.headers
        const hasAuth = call?.request?.request?.headers?.Authorization ||
                        call?.request?.headers?.Authorization 
                        // ||
                        // call?.headers?.Authorization;
        return url.includes('/api/') && !hasAuth;
      })
      .map(call => this.extractUrl(call))
      .filter(url => url);
  }

  private shortUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return path.length > 50 ? path.substring(0, 50) + '...' : path;
    } catch {
      return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }
  }

  private loadPreviousApis(): void {
    const key = `indi_previous_apis_${window.location.hostname}`;
    chrome.storage.local.get([key], (result) => {
      if (result[key]) {
        this.previousApis = new Set(result[key]);
      }
    });
  }

  private savePreviousApis(): void {
    const key = `indi_previous_apis_${window.location.hostname}`;
    chrome.storage.local.set({
      [key]: Array.from(this.previousApis),
    });
  }
}