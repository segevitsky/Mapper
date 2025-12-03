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
  durations: number[];
}

export class PageSummary {
  private pageLoadStart: number = Date.now();
  private previousApis: Set<string> = new Set();
  private slowCallThreshold: number = 1000; // Default threshold

  constructor() {
    this.pageLoadStart = Date.now();
    this.loadPreviousApis();
    this.loadSlowCallThreshold();
    this.getConfiguredBackendUrl();
  }

  /**
   * Load slow call threshold from storage
   */
  private async loadSlowCallThreshold(): Promise<void> {
    try {
      const settings = await chrome.storage.local.get(['slowCallThreshold']);
      if (settings.slowCallThreshold) {
        this.slowCallThreshold = settings.slowCallThreshold;
      }
    } catch (error) {
      console.error('Failed to load slow call threshold:', error);
    }
  };
  
  private async getConfiguredBackendUrl(): Promise<string | null> {
  const key = `indi_onboarding_${window.location.hostname}`;
  try {
    const backendUrl = await chrome.storage.local.get([key]);
    return backendUrl[key]?.selectedBackendUrl || null;
    // this actually does nothing for now - we fetch the backend url but don't use it
  } catch (error) {
    console.error('Failed to get configured backend URL:', error);
    return null;
  }
}

  /**
   * Update threshold (called when settings change)
   */
  public setSlowCallThreshold(threshold: number): void {
    this.slowCallThreshold = threshold;
  }

  /**
   * Analyze network data and generate summary
   */
  public analyze(networkData: NetworkCall[]): PageSummaryData {
    if (!networkData || networkData.length === 0) {
      return this.getEmptySummary();
    }


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
    const slowAPIs = durations.filter(d => d > this.slowCallThreshold).length;
    const issueCount = errors.length + slowAPIs + securityIssues;
    const hasIssues = issueCount > 0;

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
      durations,
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
            <span style="font-weight: 600; color: ${summary.averageResponseTime > this.slowCallThreshold ? '#f59e0b' : '#10b981'};">
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

          <!-- Action Buttons Row -->
          <div style="
            margin-top: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          ">
            <!-- Create Indicator Button -->
            <div style="position: relative; display: inline-block;">
              <button
                id="indi-summary-create-indicator"
                style="
                  width: 48px;
                  height: 48px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 50%;
                  background: linear-gradient(to right, #f857a6, #ff5858);
                  color: white;
                  font-weight: 600;
                  font-size: 24px;
                  border: none;
                  cursor: pointer;
                  transition: all 0.2s ease-in-out;
                  box-shadow: 0 2px 8px rgba(248, 87, 166, 0.3);
                "
                onmouseover="this.style.background='linear-gradient(to right, #ff6aa7, #ff7070)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(248, 87, 166, 0.4)'; this.nextElementSibling.style.opacity='1'; this.nextElementSibling.style.visibility='visible'"
                onmouseout="this.style.background='linear-gradient(to right, #f857a6, #ff5858)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(248, 87, 166, 0.3)'; this.nextElementSibling.style.opacity='0'; this.nextElementSibling.style.visibility='hidden'"
              >
                +
              </button>
              <div style="
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #f857a6, #ff5858);
                color: white;
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(248, 87, 166, 0.5);
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease-in-out;
                z-index: 1000;
                pointer-events: none;
              ">
                Create Indicator
                <div style="
                  position: absolute;
                  top: -6px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-bottom: 6px solid #f857a6;
                "></div>
              </div>
            </div>

            <!-- Create Flow Button -->
            <div style="position: relative; display: inline-block;">
              <button
                id="indi-summary-create-flow"
                style="
                  width: 48px;
                  height: 48px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 50%;
                  background: linear-gradient(to right, #10b981, #059669);
                  color: white;
                  font-weight: 600;
                  font-size: 20px;
                  border: none;
                  cursor: pointer;
                  transition: all 0.2s ease-in-out;
                  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
                "
                onmouseover="this.style.background='linear-gradient(to right, #34d399, #10b981)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.4)'; this.nextElementSibling.style.opacity='1'; this.nextElementSibling.style.visibility='visible'"
                onmouseout="this.style.background='linear-gradient(to right, #10b981, #059669)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(16, 185, 129, 0.3)'; this.nextElementSibling.style.opacity='0'; this.nextElementSibling.style.visibility='hidden'"
              >
                ⏺️
              </button>
              <div style="
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease-in-out;
                z-index: 1000;
                pointer-events: none;
              ">
                Create Flow
                <div style="
                  position: absolute;
                  top: -6px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-bottom: 6px solid #10b981;
                "></div>
              </div>
            </div>

            <!-- Play Flow Button -->
            <div style="position: relative; display: inline-block;">
              <button
                id="indi-summary-play-flow"
                style="
                  width: 48px;
                  height: 48px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 50%;
                  background: linear-gradient(to right, #3b82f6, #2563eb);
                  color: white;
                  font-weight: 600;
                  font-size: 20px;
                  border: none;
                  cursor: pointer;
                  transition: all 0.2s ease-in-out;
                  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
                "
                onmouseover="this.style.background='linear-gradient(to right, #60a5fa, #3b82f6)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)'; this.nextElementSibling.style.opacity='1'; this.nextElementSibling.style.visibility='visible'"
                onmouseout="this.style.background='linear-gradient(to right, #3b82f6, #2563eb)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(59, 130, 246, 0.3)'; this.nextElementSibling.style.opacity='0'; this.nextElementSibling.style.visibility='hidden'"
              >
                ▶️
              </button>
              <div style="
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease-in-out;
                z-index: 1000;
                pointer-events: none;
              ">
                Play Flow
                <div style="
                  position: absolute;
                  top: -6px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-bottom: 6px solid #3b82f6;
                "></div>
              </div>
            </div>

            <!-- Settings Button -->
            <div style="position: relative; display: inline-block;">
              <button
                id="indi-summary-settings"
                style="
                  width: 48px;
                  height: 48px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 50%;
                  background: linear-gradient(to right, #8b5cf6, #7c3aed);
                  color: white;
                  font-weight: 600;
                  font-size: 20px;
                  border: none;
                  cursor: pointer;
                  transition: all 0.2s ease-in-out;
                  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
                "
                onmouseover="this.style.background='linear-gradient(to right, #9d6eff, #8b5cf6)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'; this.nextElementSibling.style.opacity='1'; this.nextElementSibling.style.visibility='visible'"
                onmouseout="this.style.background='linear-gradient(to right, #8b5cf6, #7c3aed)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(139, 92, 246, 0.3)'; this.nextElementSibling.style.opacity='0'; this.nextElementSibling.style.visibility='hidden'"
              >
                ⚙️
              </button>
              <div style="
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #8b5cf6, #7c3aed);
                color: white;
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(139, 92, 246, 0.5);
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s ease-in-out;
                z-index: 1000;
                pointer-events: none;
              ">
                Settings
                <div style="
                  position: absolute;
                  top: -6px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-bottom: 6px solid #8b5cf6;
                "></div>
              </div>
            </div>
          </div>


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
      durations: [],
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