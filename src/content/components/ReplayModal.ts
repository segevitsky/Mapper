// src/content/components/ReplayModal.ts
// Modal component for replaying network requests

import { NetworkCall, ReplayRequestData, ReplayResponse } from '../../types';
import { KeyValueEditor, KeyValuePair } from './KeyValueEditor';
import {
  parseNetworkCallToReplayData,
  buildUrlWithParams,
  generateCurlCommand,
  headersArrayToObject,
  formatJsonBody,
} from '../../utils/replayUtils';

export class ReplayModal {
  private modal: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private originalData: ReplayRequestData | null = null;
  private currentData: ReplayRequestData | null = null;
  private response: ReplayResponse | null = null;
  private isLoading: boolean = false;
  private recentCalls: NetworkCall[] = [];
  private showRecentCallsDropdown: boolean = false;

  private headersEditor: KeyValueEditor | null = null;
  private paramsEditor: KeyValueEditor | null = null;

  constructor() {
    this.injectStyles();
  }

  public show(call: NetworkCall): void {
    // Parse network call to editable data
    this.originalData = parseNetworkCallToReplayData(call);
    this.currentData = JSON.parse(JSON.stringify(this.originalData));
    this.response = null;
    this.isLoading = false;
    this.showRecentCallsDropdown = false;

    this.createModal();
    this.render();

    // Show with animation
    requestAnimationFrame(() => {
      if (this.backdrop) this.backdrop.style.opacity = '1';
      if (this.modal) {
        this.modal.style.opacity = '1';
        this.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    });
  }

  /**
   * Show modal with recent calls dropdown (Blobiman mode)
   */
  public async showWithRecentCalls(networkCalls: NetworkCall[]): Promise<void> {
    this.recentCalls = networkCalls || [];
    this.showRecentCallsDropdown = true;

    // Get configured backend URL from storage
    let backendUrl = '';
    try {
      const key = `indi_onboarding_${window.location.hostname}`;
      const result = await chrome.storage.local.get([key]);
      backendUrl = result[key]?.selectedBackendUrl || '';
    } catch (e) {
      console.warn('Failed to get backend URL:', e);
    }

    // Start with backend URL and default headers
    this.originalData = {
      url: backendUrl,
      method: 'GET',
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'Accept', value: 'application/json', enabled: true },
      ],
      body: '',
      queryParams: [],
    };
    this.currentData = JSON.parse(JSON.stringify(this.originalData));
    this.response = null;
    this.isLoading = false;

    // Show splash screen first, then reveal modal
    this.createModal();
    this.showSplashThenRender();
  }

  /**
   * Show a brief blobiman splash screen before revealing the modal content
   */
  private showSplashThenRender(): void {
    if (!this.modal || !this.backdrop) return;

    const blobIconUrl = chrome.runtime.getURL('assets/blobiman-icon.svg');

    // Set modal to visible with splash content
    this.modal.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 40px;
        min-height: 300px;
      ">
        <img src="${blobIconUrl}" alt="Blobiman" style="
          width: 90px;
          height: 90px;
          border-radius: 50%;
          object-fit: cover;
          transform: scale(0.3);
          opacity: 0;
          animation: indi-splash-pop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
          filter: drop-shadow(0 6px 20px rgba(139, 92, 246, 0.4));
        " onerror="this.style.display='none';" />
        <div style="
          margin-top: 16px;
          font-size: 18px;
          font-weight: 700;
          color: #7c3aed;
          opacity: 0;
          animation: indi-splash-text 0.4s ease 0.25s forwards;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">Blobiman</div>
        <div style="
          margin-top: 8px;
          font-size: 12px;
          color: #9ca3af;
          opacity: 0;
          animation: indi-splash-text 0.4s ease 0.4s forwards;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">API Tester</div>
      </div>
      <style>
        @keyframes indi-splash-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes indi-splash-text {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;

    // Show modal with animation
    requestAnimationFrame(() => {
      if (this.backdrop) this.backdrop.style.opacity = '1';
      if (this.modal) {
        this.modal.style.opacity = '1';
        this.modal.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    });

    // After splash, transition to actual content
    setTimeout(() => {
      if (!this.modal) return;
      this.modal.style.opacity = '0';

      setTimeout(() => {
        this.render();
        requestAnimationFrame(() => {
          if (this.modal) {
            this.modal.style.opacity = '1';
          }
        });
      }, 200);
    }, 1000);
  }

  public hide(): void {
    if (this.backdrop) this.backdrop.style.opacity = '0';
    if (this.modal) {
      this.modal.style.opacity = '0';
      this.modal.style.transform = 'translate(-50%, -50%) scale(0.95)';
    }

    setTimeout(() => {
      this.backdrop?.remove();
      this.modal?.remove();
      this.backdrop = null;
      this.modal = null;
    }, 200);
  }

  private createModal(): void {
    // Remove existing modal if any
    this.backdrop?.remove();
    this.modal?.remove();

    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'replay-modal-backdrop';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.hide();
      }
    });

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'replay-modal';

    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.modal);
  }

  private render(): void {
    if (!this.modal || !this.currentData) return;

    const showBody = ['POST', 'PUT', 'PATCH'].includes(this.currentData.method);

    const headerTitle = this.showRecentCallsDropdown ? 'Blobiman' : 'Replay Request';
    const headerSubtitle = this.showRecentCallsDropdown
      ? 'Test any request - select from recent or enter custom URL'
      : 'Edit and resend this network request';
    const blobIconUrl = chrome.runtime.getURL('assets/blobiman-icon.svg');
    const headerIcon = this.showRecentCallsDropdown
      ? `<img src="${blobIconUrl}" alt="Blobiman" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" /><span style="font-size: 20px; display: none;">📮</span>`
      : '<span style="font-size: 20px;">🔄</span>';

    this.modal.innerHTML = `
      <!-- Header -->
      <div class="replay-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${headerIcon}
          <div>
            <div style="font-weight: 700; font-size: 16px;">${headerTitle}</div>
            <div style="font-size: 11px; opacity: 0.9;">${headerSubtitle}</div>
          </div>
        </div>
        <button class="replay-close-btn" title="Close">&#10005;</button>
      </div>

      <!-- Content -->
      <div class="replay-modal-content">
        <!-- Recent Calls Dropdown (only in Blobiman mode) -->
        ${this.showRecentCallsDropdown && this.recentCalls.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <label style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">
              Recent Calls
            </label>
            <select class="replay-recent-calls-select">
              <option value="">-- Select a recent call or enter custom URL below --</option>
              ${this.recentCalls.slice(0, 30).map((call, index) => {
                const url = call?.lastCall?.url || call?.request?.request?.url || call?.url || '';
                const method = call?.request?.request?.method || call?.method || 'GET';
                const status = call?.lastCall?.status || call?.response?.status || call?.status || 0;
                const timestamp = call.timestamp ? new Date(call.timestamp) : new Date();
                const timeAgo = this.getTimeAgo(timestamp);
                const shortUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;
                const statusColor = status >= 200 && status < 300 ? '✓' : status >= 400 ? '✗' : '•';
                return `<option value="${index}">${method} ${shortUrl} (${status}${statusColor}) - ${timeAgo}</option>`;
              }).join('')}
            </select>
          </div>
        ` : ''}

        <!-- URL & Method -->
        <div style="margin-bottom: 16px;">
          <label style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; display: block;">
            URL & Method
          </label>
          <div style="display: flex; gap: 8px;">
            <select class="replay-method-select">
              ${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m =>
                `<option value="${m}" ${this.currentData?.method === m ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
            <input
              type="text"
              class="replay-url-input"
              value="${this.escapeHtml(this.currentData.url)}"
              placeholder="https://api.example.com/endpoint"
            />
          </div>
        </div>

        <!-- Query Parameters -->
        <div class="replay-params-container"></div>

        <!-- Headers -->
        <div class="replay-headers-container"></div>

        <!-- Body (for POST/PUT/PATCH) -->
        ${showBody ? `
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 12px; font-weight: 600; color: #374151;">
                Body
              </label>
              <button class="replay-format-btn" title="Format JSON">Format</button>
            </div>
            <textarea
              class="replay-body-textarea"
              placeholder='{"key": "value"}'
            >${this.escapeHtml(this.currentData.body)}</textarea>
          </div>
        ` : ''}

        <!-- Response Section -->
        ${this.response ? this.renderResponse() : ''}
      </div>

      <!-- Footer -->
      <div class="replay-modal-footer">
        <button class="replay-copy-curl-btn">
          &#128203; Copy cURL
        </button>
        <button class="replay-reset-btn">
          &#8634; Reset
        </button>
        <button class="replay-send-btn" ${this.isLoading ? 'disabled' : ''}>
          ${this.isLoading ? `
            <span class="replay-spinner"></span>
            Sending...
          ` : `
            &#9654; Send
          `}
        </button>
      </div>
    `;

    // Attach event listeners
    this.attachEventListeners();

    // Create KeyValueEditors for params and headers
    this.createEditors();
  }

  private createEditors(): void {
    if (!this.currentData || !this.modal) return;

    // Query Parameters Editor
    const paramsContainer = this.modal.querySelector('.replay-params-container');
    if (paramsContainer) {
      this.paramsEditor = new KeyValueEditor({
        title: 'Query Parameters',
        pairs: this.currentData.queryParams,
        placeholder: { key: 'param', value: 'value' },
        onChange: (pairs) => {
          if (this.currentData) {
            this.currentData.queryParams = pairs;
          }
        },
      });
      paramsContainer.appendChild(this.paramsEditor.getElement());
    }

    // Headers Editor
    const headersContainer = this.modal.querySelector('.replay-headers-container');
    if (headersContainer) {
      this.headersEditor = new KeyValueEditor({
        title: 'Headers',
        pairs: this.currentData.headers,
        placeholder: { key: 'Header-Name', value: 'Header Value' },
        onChange: (pairs) => {
          if (this.currentData) {
            this.currentData.headers = pairs;
          }
        },
      });
      headersContainer.appendChild(this.headersEditor.getElement());
    }
  }

  private renderResponse(): string {
    if (!this.response) return '';

    const isSuccess = this.response.status >= 200 && this.response.status < 300;
    const isClientError = this.response.status >= 400 && this.response.status < 500;
    const isServerError = this.response.status >= 500;
    const isNetworkError = this.response.status === 0;

    let statusColor = '#10b981'; // Green for success
    let statusBg = '#d1fae5';
    if (isClientError) {
      statusColor = '#f59e0b';
      statusBg = '#fef3c7';
    } else if (isServerError || isNetworkError) {
      statusColor = '#ef4444';
      statusBg = '#fee2e2';
    }

    const responseBody = typeof this.response.body === 'object'
      ? JSON.stringify(this.response.body, null, 2)
      : String(this.response.body || '');

    return `
      <div class="replay-response-section">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="
              padding: 4px 12px;
              background: ${statusBg};
              color: ${statusColor};
              font-weight: 700;
              font-size: 12px;
              border-radius: 6px;
            ">
              ${this.response.status} ${this.response.statusText}
            </span>
            <span style="font-size: 11px; color: #6b7280;">
              Duration: <strong>${this.response.duration}ms</strong>
            </span>
          </div>
        </div>

        ${this.response.error ? `
          <div style="
            padding: 12px;
            background: #fee2e2;
            border-left: 3px solid #ef4444;
            border-radius: 6px;
            margin-bottom: 12px;
            font-size: 12px;
            color: #991b1b;
          ">
            <strong>Error:</strong> ${this.escapeHtml(this.response.error)}
          </div>
        ` : ''}

        <details style="margin-bottom: 8px;">
          <summary style="
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            padding: 4px 0;
          ">
            Response Headers (${Object.keys(this.response.headers).length})
          </summary>
          <div style="
            margin-top: 6px;
            padding: 8px;
            background: #f9fafb;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            max-height: 120px;
            overflow-y: auto;
          ">
            ${Object.entries(this.response.headers).map(([key, value]) =>
              `<div style="margin-bottom: 2px;"><span style="color: #6366f1;">${this.escapeHtml(key)}:</span> ${this.escapeHtml(String(value))}</div>`
            ).join('')}
          </div>
        </details>

        <details open>
          <summary style="
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            padding: 4px 0;
          ">
            Response Body
          </summary>
          <pre class="replay-response-body">${this.escapeHtml(responseBody)}</pre>
        </details>
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.modal) return;

    // Close button
    const closeBtn = this.modal.querySelector('.replay-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // Recent calls dropdown (Blobiman mode)
    const recentCallsSelect = this.modal.querySelector('.replay-recent-calls-select') as HTMLSelectElement;
    recentCallsSelect?.addEventListener('change', (e) => {
      const index = parseInt((e.target as HTMLSelectElement).value, 10);
      if (!isNaN(index) && this.recentCalls[index]) {
        // Parse selected call and populate the form
        const selectedCall = this.recentCalls[index];
        this.originalData = parseNetworkCallToReplayData(selectedCall);
        this.currentData = JSON.parse(JSON.stringify(this.originalData));
        this.response = null;
        this.render();
      }
    });

    // Method select
    const methodSelect = this.modal.querySelector('.replay-method-select') as HTMLSelectElement;
    methodSelect?.addEventListener('change', (e) => {
      if (this.currentData) {
        this.currentData.method = (e.target as HTMLSelectElement).value as ReplayRequestData['method'];
        // Re-render to show/hide body section
        this.render();
      }
    });

    // URL input
    const urlInput = this.modal.querySelector('.replay-url-input') as HTMLInputElement;
    urlInput?.addEventListener('input', (e) => {
      if (this.currentData) {
        this.currentData.url = (e.target as HTMLInputElement).value;
      }
    });

    // Body textarea
    const bodyTextarea = this.modal.querySelector('.replay-body-textarea') as HTMLTextAreaElement;
    bodyTextarea?.addEventListener('input', (e) => {
      if (this.currentData) {
        this.currentData.body = (e.target as HTMLTextAreaElement).value;
      }
    });

    // Format button
    const formatBtn = this.modal.querySelector('.replay-format-btn');
    formatBtn?.addEventListener('click', () => {
      if (this.currentData && bodyTextarea) {
        bodyTextarea.value = formatJsonBody(this.currentData.body);
        this.currentData.body = bodyTextarea.value;
      }
    });

    // Copy cURL button
    const curlBtn = this.modal.querySelector('.replay-copy-curl-btn');
    curlBtn?.addEventListener('click', async () => {
      if (this.currentData) {
        const curl = generateCurlCommand(this.currentData);
        await navigator.clipboard.writeText(curl);

        // Show feedback
        if (curlBtn) {
          const originalText = curlBtn.innerHTML;
          curlBtn.innerHTML = '&#10003; Copied!';
          setTimeout(() => {
            curlBtn.innerHTML = originalText;
          }, 2000);
        }
      }
    });

    // Reset button
    const resetBtn = this.modal.querySelector('.replay-reset-btn');
    resetBtn?.addEventListener('click', () => {
      if (this.originalData) {
        this.currentData = JSON.parse(JSON.stringify(this.originalData));
        this.response = null;
        this.render();
      }
    });

    // Send button
    const sendBtn = this.modal.querySelector('.replay-send-btn');
    sendBtn?.addEventListener('click', () => this.sendRequest());

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.hide();
      document.removeEventListener('keydown', this.handleKeyDown);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      this.sendRequest();
    }
  };

  private async sendRequest(): Promise<void> {
    if (!this.currentData || this.isLoading) return;

    this.isLoading = true;
    this.render();

    try {
      // Build full URL with params
      const fullUrl = buildUrlWithParams(this.currentData.url, this.currentData.queryParams);

      // Convert headers to object
      const headers = headersArrayToObject(this.currentData.headers);

      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'REPLAY_REQUEST',
        data: {
          url: fullUrl,
          method: this.currentData.method,
          headers,
          body: this.currentData.body || undefined,
        },
      });

      if (response?.success && response.data) {
        this.response = response.data;
        this.triggerBlobReaction(response.data);
      } else {
        this.response = {
          status: 0,
          statusText: 'Request Failed',
          headers: {},
          body: null,
          duration: 0,
          timestamp: Date.now(),
          error: response?.error || 'Unknown error occurred',
        };
      }
    } catch (error: any) {
      this.response = {
        status: 0,
        statusText: 'Request Failed',
        headers: {},
        body: null,
        duration: 0,
        timestamp: Date.now(),
        error: error.message || 'Unknown error occurred',
      };
    }

    this.isLoading = false;
    this.render();
  }

  private triggerBlobReaction(response: ReplayResponse): void {
    // Get indiBlob instance from window
    const indiBlob = (window as any).indiBlob;
    const speechBubble = (window as any).speechBubble;

    if (!indiBlob) return;

    const isSuccess = response.status >= 200 && response.status < 300;
    const isClientError = response.status >= 400 && response.status < 500;
    const isServerError = response.status >= 500;

    if (isSuccess) {
      indiBlob.setEmotion('excited');
      indiBlob.celebrate();
      if (speechBubble) {
        speechBubble.show({
          title: 'Replay Success!',
          message: `Request completed with status ${response.status}`,
          persistent: false,
        });
      }
    } else if (isClientError) {
      indiBlob.setEmotion('calm');
      if (speechBubble) {
        speechBubble.show({
          title: 'Client Error',
          message: `Got ${response.status}. Check the request parameters.`,
          persistent: false,
        });
      }
    } else if (isServerError) {
      indiBlob.setEmotion('calm');
      if (speechBubble) {
        speechBubble.show({
          title: 'Server Error',
          message: `Server returned ${response.status}. The server might be having issues.`,
          persistent: false,
        });
      }
    } else {
      // Network error
      indiBlob.setEmotion('calm');
      if (speechBubble) {
        speechBubble.show({
          title: 'Network Error',
          message: 'Could not connect. Check the URL and try again.',
          persistent: false,
        });
      }
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return date.toLocaleTimeString();
  }

  private injectStyles(): void {
    if (document.getElementById('replay-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'replay-modal-styles';
    style.textContent = `
      .replay-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999998;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .replay-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        width: 90%;
        max-width: 650px;
        max-height: 85vh;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        opacity: 0;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .replay-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
        border-radius: 16px 16px 0 0;
      }

      .replay-close-btn {
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.15s;
      }

      .replay-close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .replay-modal-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
      }

      .replay-method-select {
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        background: #f9fafb;
        cursor: pointer;
        outline: none;
      }

      .replay-method-select:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }

      .replay-url-input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 12px;
        font-family: monospace;
        color: #374151;
        outline: none;
      }

      .replay-url-input:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }

      .replay-recent-calls-select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 11px;
        font-family: monospace;
        color: #374151;
        background: #f9fafb;
        cursor: pointer;
        outline: none;
      }

      .replay-recent-calls-select:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }

      .replay-body-textarea {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 11px;
        font-family: monospace;
        color: #374151;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }

      .replay-body-textarea:focus {
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }

      .replay-format-btn {
        padding: 4px 10px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 10px;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.15s;
      }

      .replay-format-btn:hover {
        background: #e5e7eb;
        color: #374151;
      }

      .replay-response-section {
        margin-top: 16px;
        padding: 16px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
      }

      .replay-response-body {
        margin-top: 8px;
        padding: 12px;
        background: #1f2937;
        color: #f9fafb;
        border-radius: 6px;
        font-size: 11px;
        font-family: monospace;
        overflow-x: auto;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .replay-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
        border-radius: 0 0 16px 16px;
      }

      .replay-copy-curl-btn,
      .replay-reset-btn {
        padding: 10px 16px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        cursor: pointer;
        transition: all 0.15s;
      }

      .replay-copy-curl-btn:hover,
      .replay-reset-btn:hover {
        background: #e5e7eb;
      }

      .replay-send-btn {
        padding: 10px 24px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        color: white;
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .replay-send-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #9d6eff, #8b5cf6);
        transform: translateY(-1px);
      }

      .replay-send-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      .replay-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: replay-spin 0.8s linear infinite;
      }

      @keyframes replay-spin {
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
  }
}
