// src/content/blob/PageSummary.ts

import { NetworkCall } from '../../types';
import { consoleCapture } from '../services/consoleCapture';
import { ConsoleError } from '../../types/console';
import { getRandomTip } from '../../utils/loadingTips';

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
  private activeTab: 'summary' | 'network' | 'console' = 'summary';
  private networkCalls: NetworkCall[] = [];
  private currentSummaryData: PageSummaryData | null = null;
  private summaryReady: boolean = false;

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

    const summary = {
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

    // Store summary data for tab navigation
    this.currentSummaryData = summary;
    this.summaryReady = true; // Mark summary as ready

    return summary;
  }

  /**
   * Public methods for tab management
   */
  public setNetworkCalls(calls: NetworkCall[]): void {
    this.networkCalls = calls;
  }

  public setActiveTab(tab: 'summary' | 'network' | 'console'): void {
    this.activeTab = tab as 'summary' | 'network' | 'console';
  }

  public getCurrentSummaryData(): PageSummaryData | null {
    return this.currentSummaryData;
  }

  /**
   * Set default tab based on whether summary is ready
   */
  public setDefaultTabForState(hasSummary: boolean): void {
    this.summaryReady = hasSummary;
    // If summary not ready, default to console tab (which always has data)
    if (!hasSummary) {
      this.activeTab = 'console';
    } else {
      this.activeTab = 'summary';
    }
  }

  public isSummaryReady(): boolean {
    return this.summaryReady;
  }


  /**
   * Generate HTML summary for tooltip with tabs
   */
  public generateSummaryHTML(summary: PageSummaryData): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937 !important; font-weight: 500 !important;">
        ${this.generateTabNav()}
        ${this.generateTabContent(summary)}
        ${this.generateActionButtons()}
      </div>
    `;
  }

  /**
   * Generate tab navigation
   */
  private generateTabNav(): string {
    const tabs = [
      { id: 'summary', emoji: '📊', label: 'Summary' },
      { id: 'network', emoji: '🌐', label: 'Network' },
      { id: 'console', emoji: '💡', label: 'Console' }
    ];

    return `
      <style>
        .indi-tab {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .indi-tab:not([data-active="true"]):hover {
          background: #f9fafb !important;
          transform: translateY(-1px);
        }
      </style>
      <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
        ${tabs.map(tab => `
          <button
            class="indi-tab"
            data-tab="${tab.id}"
            data-active="${this.activeTab === tab.id}"
            style="
              flex: 1;
              padding: 8px 12px;
              background: ${this.activeTab === tab.id ? 'linear-gradient(135deg, #f857a6, #ff5858)' : 'transparent'};
              color: ${this.activeTab === tab.id ? '#fff' : '#6b7280'};
              border: none;
              border-radius: 6px 6px 0 0;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              box-shadow: ${this.activeTab === tab.id ? '0 -2px 8px rgba(248, 87, 166, 0.2)' : 'none'};
            "
          >
            <span style="font-size: 14px;">${tab.emoji}</span>
            <span>${tab.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Route to appropriate tab content
   */
  private generateTabContent(summary: PageSummaryData): string {
    switch (this.activeTab) {
      case 'summary':
        return this.generateSummaryTab(summary);
      case 'network':
        return this.generateNetworkTab();
      case 'console':
        return this.generateConsoleTab();
      default:
        return this.generateSummaryTab(summary);
    }
  }

  /**
   * Generate Summary tab content (original summary view)
   */
  private generateSummaryTab(summary: PageSummaryData): string {
    // If summary not ready, show loading state with random tip
    if (!this.summaryReady || summary?.totalCalls === 0) {
      const randomTip = getRandomTip();
      return `
        <style>
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .hourglass-spin {
            display: inline-block;
            animation: spin 2s linear infinite;
          }
        </style>
        <div style="text-align: center; padding: 20px;">
          <div class="hourglass-spin" style="font-size: 32px; margin-bottom: 12px;">⏳</div>
          <div style="font-weight: 700; font-size: 15px; color: #1f2937; margin-bottom: 8px;">
            Analyzing network...
          </div>
          <div style="
            background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
            border-left: 3px solid #a78bfa;
            border-radius: 8px;
            padding: 12px;
            margin-top: 12px;
            text-align: left;
            box-shadow: 0 2px 8px rgba(167, 139, 250, 0.15);
          ">
            <div style="font-size: 11px; font-weight: 600; color: #7c3aed; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
              💡 Pro Tip
            </div>
            <div style="font-size: 13px; color: #374151; line-height: 1.5;">
              ${randomTip}
            </div>
          </div>
        </div>
      `;
    }

    // 🎉 ALL CLEAR CELEBRATION - When everything is perfect!
    const hasIssues = summary.errorCalls > 0 || summary.securityIssues > 0 || (summary.slowestApi && summary.slowestApi.duration > this.slowCallThreshold);

    if (!hasIssues && summary.totalCalls > 0) {
      return `
        <style>
          @keyframes celebrate {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .celebration {
            animation: celebrate 0.6s ease-in-out;
          }
        </style>
        <div class="celebration" style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
          <div style="font-weight: 700; font-size: 18px; color: #10b981; margin-bottom: 12px;">
            You're crushing it!
          </div>

          <div style="
            background: linear-gradient(135deg, #d1fae5, #a7f3d0);
            border-left: 4px solid #10b981;
            border-radius: 12px;
            padding: 16px;
            margin-top: 16px;
            text-align: left;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
          ">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <span style="font-size: 20px;">✨</span>
              <span style="font-weight: 600; color: #065f46; font-size: 14px;">All systems green</span>
            </div>

            <div style="display: grid; gap: 8px; font-size: 13px; color: #047857;">
              <div style="display: flex; justify-content: space-between;">
                <span>📊 API calls:</span>
                <span style="font-weight: 600;">${summary.totalCalls} (all perfect!)</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>⚡ Average response:</span>
                <span style="font-weight: 600; color: #10b981;">${summary.averageResponseTime}ms</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>🛡️ Caught:</span>
                <span style="font-weight: 600;">0 - nothing to worry about!</span>
              </div>
            </div>
          </div>

          <div style="
            margin-top: 16px;
            padding: 12px;
            background: linear-gradient(135deg, #fef3c7, #fde68a);
            border-radius: 8px;
            font-size: 13px;
            color: #92400e;
            line-height: 1.6;
          ">
            <strong>Your wingman's got your back! 😎</strong><br/>
            Your users are happy. Keep vibing!
          </div>
        </div>
      `;
    }

    return `
      <div style="display: grid; gap: 8px; font-size: 14px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #4b5563 !important; font-weight: 500 !important;">⏱️ Total API Time:</span>
          <span style="font-weight: 700 !important; color: #1f2937 !important;">${(summary.totalTime / 1000).toFixed(2)}s</span>
        </div>

        <div style="display: flex; justify-content: space-between;">
          <span style="color: #4b5563 !important; font-weight: 500 !important;">🌐 API Calls:</span>
          <span style="font-weight: 700 !important; color: #1f2937 !important;">${summary.totalCalls}</span>
        </div>

        ${summary.errorCalls > 0 ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #10b981;">🛡️ Protected users from:</span>
            <span style="font-weight: 600; color: #10b981;">${summary.errorCalls} ${summary.errorCalls === 1 ? 'error' : 'errors'}</span>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between;">
          <span style="color: #4b5563 !important; font-weight: 500 !important;">⚡ Avg Response:</span>
          <span style="font-weight: 700 !important; color: ${summary.averageResponseTime > this.slowCallThreshold ? '#f59e0b' : '#10b981'} !important;">
            ${summary.averageResponseTime}ms
          </span>
        </div>

        ${summary.slowestApi ? `
          <div style="margin-top: 8px; padding: 10px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 8px; border-left: 3px solid #f59e0b;">
            <div style="font-size: 13px; color: #92400e; margin-bottom: 6px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <span>⚡</span>
              <span>Quick Win Available</span>
            </div>

            <div style="font-size: 11px; color: #78350f; word-break: break-all; font-family: monospace; background: rgba(255,255,255,0.5); padding: 4px 6px; border-radius: 4px; margin-bottom: 6px;">
              ${this.shortUrl(summary.slowestApi.url)}
            </div>

            <div style="font-size: 12px; color: #92400e; margin-bottom: 8px;">
              <div style="font-weight: 600;">This call takes ${summary.slowestApi.duration}ms</div>
              <div style="margin-top: 2px;">Your target: ${this.slowCallThreshold}ms</div>
            </div>

            <div style="
              background: linear-gradient(135deg, #dcfce7, #bbf7d0);
              border-left: 3px solid #10b981;
              padding: 8px;
              border-radius: 6px;
              margin-bottom: 8px;
            ">
              <div style="font-size: 12px; color: #065f46; font-weight: 600; margin-bottom: 4px;">
                💚 Fix this → Save ${summary.slowestApi.duration - this.slowCallThreshold}ms
              </div>
              <div style="font-size: 11px; color: #047857; line-height: 1.4;">
                Your users will get their data ${((summary.slowestApi.duration / this.slowCallThreshold) - 1).toFixed(1)}x faster. They'll feel the difference.
              </div>
            </div>

            <details style="margin-top: 8px;">
              <summary style="
                cursor: pointer;
                font-size: 11px;
                color: #92400e;
                font-weight: 600;
                padding: 4px 0;
                user-select: none;
              ">
                🔧 Quick fixes that usually work →
              </summary>
              <div style="
                margin-top: 8px;
                padding: 8px;
                background: rgba(255,255,255,0.7);
                border-radius: 6px;
                font-size: 11px;
                color: #78350f;
                line-height: 1.6;
              ">
                <div style="margin-bottom: 6px;">
                  <strong>• Add caching</strong><br/>
                  Use Redis or in-memory cache with 5-10min TTL<br/>
                  <em>Expected: ~80% faster</em>
                </div>
                <div style="margin-bottom: 6px;">
                  <strong>• Check for N+1 queries</strong><br/>
                  Look for loops calling the database in your backend<br/>
                  <em>Expected: 50-90% faster</em>
                </div>
                <div style="margin-bottom: 6px;">
                  <strong>• Add pagination</strong><br/>
                  If returning large datasets, limit to 20-50 items<br/>
                  <em>Expected: 60-80% faster</em>
                </div>
                <div>
                  <strong>• Use database indexes</strong><br/>
                  Add indexes on columns you're searching/filtering<br/>
                  <em>Expected: 70-95% faster</em>
                </div>
              </div>
            </details>
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
            <span style="color: #3b82f6;">🔒 Security insights:</span>
            <span style="font-weight: 600; color: #3b82f6;">${summary.securityIssues} ${summary.securityIssues === 1 ? 'finding' : 'findings'}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate Network tab content
   */
  private generateNetworkTab(): string {
    if (this.networkCalls.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px; color: #6b7280 !important;">
          <div style="font-size: 40px; margin-bottom: 12px;">🌐</div>
          <div style="font-size: 14px !important; font-weight: 600 !important; color: #6b7280 !important;">No network calls captured yet</div>
        </div>
      `;
    }

    // Only show 20 most recent network calls for performance
    const recentCalls = this.networkCalls.slice(0, 20);
    const hasMore = this.networkCalls.length > 20;

    return `
      <div style="max-height: 400px; overflow-y: auto; padding: 4px;">
        ${hasMore ? `<div style="padding: 8px; background: #dbeafe; border-radius: 6px; margin-bottom: 8px; font-size: 11px; color: #1e40af; text-align: center;">Showing 20 most recent calls (${this.networkCalls.length} total captured)</div>` : ''}
        ${recentCalls.map((call, index) => this.generateNetworkCallItem(call, index)).join('')}
      </div>
    `;
  }

  /**
   * Generate individual network call item (collapsible)
   */
  private generateNetworkCallItem(call: NetworkCall, index: number): string {
    const url = this.extractUrl(call);
    const status = this.getStatus(call);
    const method = call?.request?.request?.method || call?.method || 'GET';
    const duration = this.getDuration(call);
    const timestamp = new Date(call.timestamp || Date.now()).toLocaleTimeString();

    // Status color coding
    let statusColor = '#10b981'; // Green for 2xx
    if (status >= 400) statusColor = '#ef4444'; // Red for 4xx/5xx
    else if (status >= 300) statusColor = '#f59e0b'; // Yellow for 3xx
    else if (status === 0) statusColor = '#6b7280'; // Gray for errors

    // Serialize call data for the copy button (escape single quotes for attribute)
    const callDataEncoded = JSON.stringify(call).replace(/'/g, '&#39;');

    return `
      <style>
        .network-call-item {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .network-call-item:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border-color: #f857a6;
        }
        .network-call-header {
          transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .network-call-header:hover {
          background: linear-gradient(135deg, #fef2f2, #fff) !important;
        }
        .network-call-details {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .network-call-details.expanded {
          max-height: 800px;
        }
        .copy-curl-btn {
          transition: all 0.15s ease;
        }
        .copy-curl-btn:hover {
          transform: scale(1.05);
          background: #f3f4f6 !important;
        }
        .copy-curl-btn:active {
          transform: scale(0.95);
        }
      </style>
      <div class="network-call-item" style="margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <!-- Collapsed Header (clickable) -->
        <div
          class="network-call-header"
          data-call-index="${index}"
          style="padding: 10px; cursor: pointer; background: #fff;"
        >
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 600; font-size: 12px; color: ${statusColor};">
              ${method} ${status || 'ERR'}
            </span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: #6b7280;">${duration}ms</span>
              <button
                class="copy-curl-btn"
                data-call-data='${callDataEncoded}'
                style="
                  padding: 4px 8px;
                  background: #f9fafb;
                  border: 1px solid #e5e7eb;
                  border-radius: 4px;
                  font-size: 10px;
                  color: #6366f1;
                  cursor: pointer;
                  font-weight: 600;
                "
                title="Copy as cURL"
              >
                📋 cURL
              </button>
            </div>
          </div>
          <div style="font-size: 11px; color: #374151; word-break: break-all; font-family: monospace;">
            ${this.shortUrl(url)}
          </div>
          <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">
            ${timestamp}
          </div>
        </div>

        <!-- Expanded Content (hidden by default) -->
        <div
          class="network-call-details"
          data-call-index="${index}"
          style="display: none; padding: 10px; background: #f9fafb; border-top: 1px solid #e5e7eb;"
        >
          ${this.generateNetworkCallDetails(call)}
        </div>
      </div>
    `;
  }

  /**
   * Generate network call expanded details
   */
  private generateNetworkCallDetails(call: NetworkCall): string {
    try {
      const headers = call?.request?.request?.headers || call?.request?.headers || {};
      const requestBody = call?.request?.request?.postData || call?.body || null;

    // Extract response body - try multiple locations
    let responseBody = null;
    let isBase64 = false;

    // Try different locations where body might be stored
    if (call?.body) {
      // Check if body is directly on the call object
      if (typeof call.body === 'object' && call.body.body) {
        responseBody = call.body.body;
        isBase64 = call.body.base64Encoded || false;
      } else if (typeof call.body === 'string') {
        responseBody = call.body;
      } else {
        responseBody = call.body;
      }
    } else if (call?.response?.body) {
      // Check in response.body
      if (typeof call.response.body === 'object' && call.response.body.body) {
        responseBody = call.response.body.body;
        isBase64 = call.response.body.base64Encoded || false;
      } else if (typeof call.response.body === 'string') {
        responseBody = call.response.body;
      } else {
        responseBody = call.response.body;
      }
    } else if (call?.response?.response) {
      // Check in response.response (older structure)
      responseBody = call.response.response;
    }

    // Decode base64 if needed
    if (isBase64 && responseBody) {
      try {
        responseBody = atob(responseBody);
      } catch (e) {
        console.error('Failed to decode base64 response:', e);
      }
    }

    // Try to parse if it's a JSON string
    let parsedBody = responseBody;
    if (typeof responseBody === 'string') {
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        // Not JSON, keep as string
        parsedBody = responseBody;
      }
    }

    // Format the response body nicely
    let formattedResponse = '';
    try {
      if (parsedBody !== null && parsedBody !== undefined) {
        if (typeof parsedBody === 'object') {
          formattedResponse = this.formatJSON(parsedBody);
        } else {
          formattedResponse = `<pre style="margin: 0; white-space: pre-wrap; word-break: break-word;">${this.escapeHtml(String(parsedBody))}</pre>`;
        }
      } else {
        formattedResponse = '<span style="color: #9ca3af; font-style: italic;">No response body</span>';
      }
    } catch (error) {
      console.error('Error formatting response:', error);
      formattedResponse = '<span style="color: #ef4444; font-style: italic;">Error formatting response</span>';
    }

    return `
      <div style="font-size: 12px;">
        <!-- Request Headers -->
        <div style="margin-bottom: 12px;">
          <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">📤 Request Headers:</div>
          <div style="background: #fff; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 10px; max-height: 150px; overflow-y: auto;">
            ${Object.entries(headers).map(([key, value]) => `
              <div style="margin-bottom: 2px;">
                <span style="color: #6366f1;">${key}:</span> ${value}
              </div>
            `).join('') || '<span style="color: #9ca3af;">No headers</span>'}
          </div>
        </div>

        <!-- Request Body (if exists) -->
        ${requestBody ? `
          <div style="margin-bottom: 12px;">
            <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">📝 Request Body:</div>
            <div style="background: #fff; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 10px; max-height: 150px; overflow-y: auto; word-break: break-all;">
              ${typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody, null, 2)}
            </div>
          </div>
        ` : ''}

        <!-- Response Body -->
        <div>
          <div style="font-weight: 600; color: #374151; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>📥 Response Body</span>
            ${parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? `<span style="font-size: 10px; color: #6b7280; font-weight: normal;">(${Object.keys(parsedBody).length} fields)</span>` : ''}
          </div>
          <div style="
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            padding: 12px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            max-height: 300px;
            overflow-y: auto;
            line-height: 1.6;
          ">
            ${formattedResponse}
          </div>
        </div>
      </div>
    `;
    } catch (error) {
      console.error('Error generating network call details:', error);
      return `
        <div style="font-size: 12px; padding: 12px; color: #ef4444;">
          Error displaying network call details. Check console for more info.
        </div>
      `;
    }
  }

  /**
   * Format JSON with better readability - simplified for performance
   */
  private formatJSON(obj: any, indent: number = 0): string {
    try {
      // Limit nesting depth for performance
      if (indent > 3) {
        return `<span style="color: #9ca3af;">...</span>`;
      }

      const indentStr = '  '.repeat(indent);
      const nextIndent = '  '.repeat(indent + 1);

      if (obj === null) {
        return `<span style="color: #9ca3af;">null</span>`;
      }

      if (typeof obj === 'boolean') {
        return `<span style="color: #f59e0b;">${obj}</span>`;
      }

      if (typeof obj === 'number') {
        return `<span style="color: #3b82f6;">${obj}</span>`;
      }

      if (typeof obj === 'string') {
        // Truncate very long strings
        const truncated = obj.length > 100 ? obj.substring(0, 100) + '...' : obj;
        return `<span style="color: #10b981;">"${this.escapeHtml(truncated)}"</span>`;
      }

      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[ ]';
        // Limit array size for performance
        const items = obj.slice(0, 5).map((item, index) => {
          const comma = index < Math.min(obj.length, 5) - 1 ? ',' : '';
          return `\n${nextIndent}${this.formatJSON(item, indent + 1)}${comma}`;
        }).join('');
        const more = obj.length > 5 ? `\n${nextIndent}<span style="color: #9ca3af;">... ${obj.length - 5} more</span>` : '';
        return `[${items}${more}\n${indentStr}]`;
      }

      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{ }';

        // Limit object keys for performance
        const limitedKeys = keys.slice(0, 10);
        const items = limitedKeys.map((key, index) => {
          const comma = index < limitedKeys.length - 1 ? ',' : '';
          return `\n${nextIndent}<span style="color: #f857a6;">"${this.escapeHtml(key)}"</span>: ${this.formatJSON(obj[key], indent + 1)}${comma}`;
        }).join('');
        const more = keys.length > 10 ? `\n${nextIndent}<span style="color: #9ca3af;">... ${keys.length - 10} more fields</span>` : '';
        return `{${items}${more}\n${indentStr}}`;
      }

      return String(obj);
    } catch (error) {
      return `<span style="color: #ef4444;">Error formatting</span>`;
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Generate cURL command from NetworkCall
   */
  public generateCurlCommand(call: NetworkCall): string {
    const url = this.extractUrl(call);
    const method = call?.request?.request?.method ?? call.method ?? 'GET';
    const headers = call?.request?.request?.headers || call?.request?.headers || {};

    let curl = `curl -X ${method} '${url}'`;

    // Add headers
    Object.entries(headers).forEach(([key, value]) => {
      // Skip some headers that curl adds automatically or are problematic
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        curl += ` \\\n  -H '${key}: ${value}'`;
      }
    });

    // Add request body if exists
    if (call?.request?.request?.postData || call?.body) {
      const bodyData = call?.request?.request?.postData || call?.body;
      const bodyStr = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
      curl += ` \\\n  --data '${bodyStr.replace(/'/g, "'\\''")}'`;
    }

    return curl;
  }

  /**
   * Generate Console tab content
   */
  private generateConsoleTab(): string {
    const logs = consoleCapture.getErrors();

    if (logs.length === 0) {
      return `
        <div style="text-align: center; padding: 40px 20px; color: #6b7280 !important;">
          <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
          <div style="font-size: 14px !important; font-weight: 600 !important; color: #6b7280 !important;">No console logs captured yet</div>
          <div style="font-size: 12px !important; color: #9ca3af !important; margin-top: 8px; font-weight: 500 !important;">Logs will appear here as they occur</div>
        </div>
      `;
    }

    // Only show 30 most recent logs for performance
    const recentLogs = logs.slice(0, 30);
    const hasMore = logs.length > 30;

    return `
      <div style="max-height: 400px; overflow-y: auto; padding: 4px;">
        ${hasMore ? `<div style="padding: 8px; background: #fef3c7; border-radius: 6px; margin-bottom: 8px; font-size: 11px; color: #92400e; text-align: center;">Showing 30 most recent logs (${logs.length} total captured)</div>` : ''}
        ${recentLogs.map((log, index) => this.generateConsoleLogItem(log, index)).join('')}
      </div>
    `;
  }

  /**
   * Generate individual console log item
   */
  private generateConsoleLogItem(log: ConsoleError, _index: number): string {
    const typeStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      log: { bg: '#f9fafb', border: '#6b7280', text: '#374151', icon: '📝' },
      info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' },
      debug: { bg: '#f5f3ff', border: '#8b5cf6', text: '#6b21a8', icon: '🔍' },
      warn: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
      error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '❌' },
      exception: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b', icon: '💥' },
      rejection: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b', icon: '🚫' }
    };

    const style = typeStyles[log.type] || typeStyles.log;
    const timestamp = new Date(log.timestamp).toLocaleTimeString();

    return `
      <style>
        .console-log-item {
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .console-log-item:hover {
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
          transform: translateX(2px);
        }
      </style>
      <div class="console-log-item" style="margin-bottom: 6px; padding: 8px; background: ${style.bg}; border-left: 3px solid ${style.border}; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 600; font-size: 11px; color: ${style.text};">
            ${style.icon} ${log.type.toUpperCase()}
          </span>
          <span style="font-size: 10px; color: #9ca3af;">${timestamp}</span>
        </div>

        <div style="font-size: 11px; color: #1f2937; font-family: monospace; word-break: break-word; line-height: 1.4;">
          ${this.escapeHtml(log.message)}
        </div>

        ${log.stack ? `
          <details style="margin-top: 6px;">
            <summary style="cursor: pointer; font-size: 10px; color: ${style.text}; font-weight: 600;">
              Stack Trace
            </summary>
            <pre style="margin-top: 4px; font-size: 9px; color: #6b7280; background: #fff; padding: 6px; border-radius: 3px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${this.escapeHtml(log.stack)}</pre>
          </details>
        ` : ''}

        ${log.url ? `
          <div style="font-size: 9px; color: #9ca3af; margin-top: 3px; font-family: monospace;">
            ${this.escapeHtml(log.url)}${log.line ? `:${log.line}` : ''}${log.column ? `:${log.column}` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Generate action buttons (appears on all tabs)
   */
  private generateActionButtons(): string {
    return `
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