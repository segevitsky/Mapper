// src/content/blob/IndiBlob.ts

import { ReplayModal } from '../components/ReplayModal';

export type EmotionType = 'happy' | 'calm' | 'satisfied' | 'excited';

interface Position {
  x: number;
  y: number;
}

interface EmotionColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

export class IndiBlob {
  private container: HTMLElement | null = null;
  private iris: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private aura: HTMLElement | null = null;
  private mouthPath: SVGPathElement | null = null;
  private zipperMouth: SVGGElement | null = null;
  private eyeContainer: HTMLElement | null = null;
  private colorStop1: SVGStopElement | null = null;
  private colorStop2: SVGStopElement | null = null;
  private colorStop3: SVGStopElement | null = null;

  private emotion: EmotionType = 'happy';
  private notificationCount: number = 0;
  private isDragging: boolean = false;
  private hasDragged: boolean = false;
  private dragOffset: Position = { x: 0, y: 0 };
  private dragStartPos: Position = { x: 0, y: 0 };
  private position: Position = { x: 0, y: 0 };
  private readonly DRAG_THRESHOLD = 5; // pixels - minimum movement to consider it a drag
  private blinkInterval: number | null = null;
  private summaryTooltip: HTMLElement | null = null;
  private currentSummary: string | null = null;
  private speechBubble: any = null;
  private currentSummaryData: any = null;
  private isMuted: boolean = false;
  private muteButton: HTMLElement | null = null;
  private minimizeButton: HTMLElement | null = null;
  private isMinimized: boolean = false;
  private originalPosition: Position | null = null; // Saved position before viewport adjustment
  private _backendConfigured: boolean = false; // Cached backend config status
  private tooltipEventListenersAttached: boolean = false; // Track if event listeners are attached
  private currentNetworkCalls: any[] = []; // Store current network calls for tab switching


  constructor(parentElement: HTMLElement = document.body) {
    this.createBlobDOM(parentElement);
    this.initializeReferences();
    this.init();
    this.setInitialPosition();
    this.setEmotion('happy'); // Initialize iris background color
    this.initializeTooltip(); // Initialize tooltip async
  }

  public setSpeechBubble(speechBubble: any): void {
    this.speechBubble = speechBubble;
  }

  /**
   * Initialize tooltip once - check backend config and create tooltip element
   */
  private async initializeTooltip(): Promise<void> {
    // Check backend config once and cache it
    const key = `indi_onboarding_${window.location.hostname}`;
    const result = await chrome.storage.local.get([key]);
    const state = result[key];
    this._backendConfigured = state?.selectedBackendUrl ? true : false;

    // Create tooltip element once (hidden by default)
    this.createTooltipElement();
  }

  /**
   * Create the tooltip DOM element once (called only during initialization)
   */
  private createTooltipElement(): void {
    if (this.summaryTooltip) return; // Already created

    // Check if tooltip already exists in DOM (from a previous instance)
    const existingTooltip = document.querySelector('.indi-summary-tooltip') as HTMLElement;
    if (existingTooltip) {
      console.warn('⚠️ Summary tooltip already exists in DOM, reusing it');
      this.summaryTooltip = existingTooltip;
      return;
    }

    this.summaryTooltip = document.createElement('div');
    this.summaryTooltip.className = 'indi-summary-tooltip';
    this.summaryTooltip.style.cssText = `
      position: fixed;
      bottom: 160px;
      right: 40px;
      background: #ffffff;
      border-radius: 16px;
      padding: 20px;
      min-width: 450px;
      max-width: 600px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
      z-index: 999997;
      display: none;
      transform: translateY(10px);
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      color: #1f2937 !important;
      font-weight: 500 !important;
      font-size: 14px !important;
    `;

    // Add arrow pointing to blob
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      bottom: -6px;
      right: 40px;
      width: 12px;
      height: 12px;
      background: #fff;
      transform: rotate(45deg);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    `;
    this.summaryTooltip.appendChild(arrow);

    // Default content
    this.summaryTooltip.innerHTML = '<div style="text-align: center; padding: 12px;">Loading...</div>' + arrow.outerHTML;

    document.body.appendChild(this.summaryTooltip);
  }

  /**
   * Show loading state in Blobi
   * Performance: Gives instant feedback to user while analysis runs
   */
  public showLoading(): void {
    if (!this.summaryTooltip) {
      this.createTooltipElement();
    }

    if (this.summaryTooltip) {
      const loadingHTML = `
        <div style="
          padding: 40px 20px;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            width: 48px;
            height: 48px;
            margin: 0 auto 20px;
            border: 4px solid #f3f4f6;
            border-top-color: #8b5cf6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          "></div>
          <style>
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
          <div style="font-size: 16px; font-weight: 600; color: #374151; margin-bottom: 8px;">
            Analyzing network traffic...
          </div>
          <div style="font-size: 13px; color: #6b7280;">
            Blobi is crunching the data 🔍
          </div>
        </div>
      `;
      this.summaryTooltip.innerHTML = loadingHTML;

      if (this.isTooltipVisible()) {
        this.summaryTooltip.style.display = 'block';
      }
    }
  }

  /**
   * Update tooltip content (replaces showSummaryOnHover)
   */
  public updateContent(summaryHTML: string, summaryData?: any, networkCalls?: any[]): void {
    this.currentSummary = summaryHTML;
    this.currentSummaryData = summaryData;
    this.currentNetworkCalls = networkCalls || [];

    if (!this.summaryTooltip) {
      this.createTooltipElement();
    }

    if (this.summaryTooltip) {
      // Get the arrow element before updating
      const arrow = this.summaryTooltip.querySelector('div[style*="bottom: -6px"]');

      // Update innerHTML
      this.summaryTooltip.innerHTML = summaryHTML;

      // Re-add arrow
      if (arrow) {
        this.summaryTooltip.appendChild(arrow);
      }

      // Setup event delegation only once
      if (!this.tooltipEventListenersAttached) {
        this.setupTooltipEventHandlers();
        this.tooltipEventListenersAttached = true;
      }
    }
  }

  /**
   * Setup event handlers for tooltip tabs and network calls using event delegation
   */
  private setupTooltipEventHandlers(): void {
    if (!this.summaryTooltip) return;

    // Use event delegation on the tooltip container
    this.summaryTooltip.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // Handle copy cURL button clicks
      if (target.classList.contains('copy-curl-btn') || target.closest('.copy-curl-btn')) {
        e.stopPropagation(); // Prevent expanding/collapsing the network call

        const button = target.classList.contains('copy-curl-btn') ? target : target.closest('.copy-curl-btn') as HTMLElement;
        const callData = button?.getAttribute('data-call-data');

        if (callData) {
          try {
            // Parse the JSON directly (single quotes are already escaped as &#39;)
            const call = JSON.parse(callData);

            // Access pageSummary to use its generateCurlCommand method
            const pageSummary = (window as any).pageSummary;
            if (pageSummary) {
              const curlCommand = pageSummary.generateCurlCommand(call);
              await navigator.clipboard.writeText(curlCommand);

              // Show success feedback
              const originalText = button.textContent;
              button.textContent = '✅ Copied';
              setTimeout(() => {
                button.textContent = originalText;
              }, 2000);
            }
          } catch (error) {
            console.error('Failed to copy cURL command:', error);
            button.textContent = '❌ Failed';
            setTimeout(() => {
              button.textContent = '📋 cURL';
            }, 2000);
          }
        }
        return; // Stop further event handling
      }

      // Handle pop-out button clicks
      if (target.classList.contains('pop-out-btn') || target.closest('.pop-out-btn')) {
        e.stopPropagation(); // Prevent expanding/collapsing the network call

        const button = target.classList.contains('pop-out-btn') ? target : target.closest('.pop-out-btn') as HTMLElement;
        const callData = button?.getAttribute('data-call-data');

        if (callData) {
          try {
            // Parse the JSON directly (single quotes are already escaped as &#39;)
            const call = JSON.parse(callData);

            // Show success feedback immediately
            const originalText = button.textContent;
            button.textContent = '✅ Opened';
            setTimeout(() => {
              button.textContent = originalText;
            }, 2000);

            // Generate schema if body exists (async, doesn't block UI feedback)
            // Extract the actual body content (not the wrapper with base64Encoded)
            const bodyData = call.body?.body || call.response?.body?.body || call.response?.response;
            if (bodyData) {
              import('../../content/services/schemaValidationService').then((module) => {
                const SchemaValidationService = module.default;
                const schemaService = new SchemaValidationService();

                const schema = schemaService.generateTypeDefinition(
                  bodyData,
                  'ResponseSchema',
                  { format: 'multiline' }
                );
                call.schema = schema;

                // Send message with schema
                chrome.runtime.sendMessage({
                  type: "OPEN_FLOATING_WINDOW",
                  data: {
                    indicatorData: call,
                    networkCall: call,
                  }
                });
              }).catch((err) => {
                console.warn('Schema generation failed, sending without schema:', err);
                // Send without schema
                chrome.runtime.sendMessage({
                  type: "OPEN_FLOATING_WINDOW",
                  data: {
                    indicatorData: call,
                    networkCall: call,
                  }
                });
              });
            } else {
              // No body, send without schema
              chrome.runtime.sendMessage({
                type: "OPEN_FLOATING_WINDOW",
                data: {
                  indicatorData: call,
                  networkCall: call,
                }
              });
            }
          } catch (error) {
            console.error('Failed to open floating window:', error);
            button.textContent = '❌ Failed';
            setTimeout(() => {
              button.textContent = '📤 Pop Out';
            }, 2000);
          }
        }
        return; // Stop further event handling
      }

      // Handle replay button clicks
      if (target.classList.contains('replay-btn') || target.closest('.replay-btn')) {
        e.stopPropagation(); // Prevent expanding/collapsing the network call

        const button = target.classList.contains('replay-btn') ? target : target.closest('.replay-btn') as HTMLElement;
        const callData = button?.getAttribute('data-call-data');

        if (callData) {
          try {
            // Parse the JSON directly (single quotes are already escaped as &#39;)
            const call = JSON.parse(callData);

            // Show ReplayModal
            const replayModal = new ReplayModal();
            replayModal.show(call);
          } catch (error) {
            console.error('Failed to open replay modal:', error);
          }
        }
        return; // Stop further event handling
      }

      // Handle tab clicks
      if (target.classList.contains('indi-tab') || target.closest('.indi-tab')) {
        const tabButton = target.classList.contains('indi-tab') ? target : target.closest('.indi-tab') as HTMLElement;
        const tab = tabButton?.dataset.tab;

        if (tab) {
          // Performance: Only update tab content, not entire HTML
          const pageSummary = (window as any).pageSummary;
          if (pageSummary && this.summaryTooltip) {
            pageSummary.setActiveTab(tab);

            // Update tab active states (CSS only, no HTML regeneration)
            const allTabs = this.summaryTooltip.querySelectorAll('.indi-tab');
            allTabs.forEach((t: Element) => {
              const htmlTab = t as HTMLElement;
              const isActive = htmlTab.dataset.tab === tab;
              htmlTab.setAttribute('data-active', String(isActive));
              htmlTab.style.background = isActive
                ? 'linear-gradient(135deg, #f857a6, #ff5858)'
                : 'transparent';
              htmlTab.style.color = isActive ? '#fff' : '#6b7280';
            });

            // Only regenerate the tab content area
            const tabContentArea = this.summaryTooltip.querySelector('[data-tab-content]');
            if (tabContentArea) {
              const summary = pageSummary.getCurrentSummaryData();
              const contentHTML = pageSummary.generateTabContent(summary);
              tabContentArea.innerHTML = contentHTML;
            }
          }
        }
        return;
      }

      // Handle network call expand/collapse with smooth animation
      if (target.classList.contains('network-call-header') || target.closest('.network-call-header')) {
        const header = target.classList.contains('network-call-header') ? target : target.closest('.network-call-header') as HTMLElement;
        const index = header?.dataset.callIndex;

        if (index) {
          const details = this.summaryTooltip?.querySelector(`.network-call-details[data-call-index="${index}"]`) as HTMLElement;
          if (details) {
            const isExpanded = details.classList.contains('expanded');
            if (isExpanded) {
              details.classList.remove('expanded');
              setTimeout(() => {
                details.style.display = 'none';
              }, 300); // Match transition duration
            } else {
              details.style.display = 'block';
              // Trigger reflow to enable transition
              details.offsetHeight;
              details.classList.add('expanded');
            }
          }
        }
        return;
      }

      // Handle Clear button clicks (Network tab)
      if (target.id === 'network-clear-btn') {
        e.stopPropagation();
        const pageSummary = (window as any).pageSummary;
        if (pageSummary) {
          pageSummary.clearNetworkCalls();
          const summary = pageSummary.getCurrentSummaryData();
          const html = pageSummary.generateSummaryHTML(summary);
          this.updateContent(html, summary, []);
        }
        return;
      }

      // Handle Clear button clicks (Console tab)
      if (target.id === 'clear-console-btn') {
        e.stopPropagation();
        const { consoleCapture } = await import('../../content/services/consoleCapture');
        consoleCapture.clearErrors();

        // Refresh the console tab
        const pageSummary = (window as any).pageSummary;
        if (pageSummary && this.summaryTooltip) {
          const tabContentArea = this.summaryTooltip.querySelector('[data-tab-content]');
          if (tabContentArea) {
            const summary = pageSummary.getCurrentSummaryData();
            const contentHTML = pageSummary.generateTabContent(summary);
            tabContentArea.innerHTML = contentHTML;
          }
        }
        return;
      }

      // Handle Blobiman button clicks (API Tester)
      if (target.id === 'indi-summary-blobiman' || target.closest('#indi-summary-blobiman')) {
        e.stopPropagation();
        e.preventDefault();

        // Show ReplayModal with recent calls dropdown (async)
        const replayModal = new ReplayModal();
        replayModal.showWithRecentCalls(this.currentNetworkCalls).catch((err) => {
          console.error('Failed to open Blobiman:', err);
        });
        return;
      }
    });

    // Handle network search input
    this.summaryTooltip?.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.id === 'network-search-input') {
        const searchTerm = target.value.toLowerCase();
        const networkList = this.summaryTooltip?.querySelector('#network-calls-list');

        if (networkList) {
          const items = networkList.querySelectorAll('.network-call-item');
          items.forEach((item: Element) => {
            const htmlItem = item as HTMLElement;
            const text = htmlItem.textContent?.toLowerCase() || '';
            // Also search in response body field names
            const bodyFields = htmlItem.dataset.bodyFields?.toLowerCase() || '';
            const matches = text.includes(searchTerm) || bodyFields.includes(searchTerm);
            htmlItem.style.display = matches ? '' : 'none';
          });
        }
      }
    });
  }

  /**
   * Simple toggle - show or hide tooltip (replaces toggleTooltip)
   */
  public toggle(): void {
    if (!this.summaryTooltip) return;

    const isHidden = this.summaryTooltip.style.display === 'none';

    if (isHidden) {
      // Show
      this.summaryTooltip.style.display = 'block';
      // Trigger reflow for animation
      this.summaryTooltip.offsetHeight;
      this.summaryTooltip.style.opacity = '1';
      this.summaryTooltip.style.transform = 'translateY(0)';
    } else {
      // Hide
      this.summaryTooltip.style.opacity = '0';
      this.summaryTooltip.style.transform = 'translateY(10px)';
      // Wait for animation then hide
      setTimeout(() => {
        if (this.summaryTooltip) {
          this.summaryTooltip.style.display = 'none';
        }
      }, 300);
    }
  }

  /**
   * Check if backend is configured (cached value)
   */
  public isConfigured(): boolean {
    return this._backendConfigured;
  }

  /**
   * Update backend configured status (call this after onboarding completes)
   */
  public setConfigured(configured: boolean): void {
    this._backendConfigured = configured;
    if (configured && !this.summaryTooltip) {
      this.createTooltipElement();
    }
  }

  /**
   * Check if tooltip is currently visible
   */
  public isTooltipVisible(): boolean {
    if (!this.summaryTooltip) return false;
    return this.summaryTooltip.style.display !== 'none';
  }

  /**
   * Legacy method for backwards compatibility - will be removed
   * @deprecated Use toggle() instead
   */
  public toggleTooltip(): void {
    this.toggle();
  }

  /**
   * Get current summary data
   */
  public getCurrentSummaryData(): any {
    return this.currentSummaryData;
  }

  /**
   * Get current blob position
   */
  public getPosition(): Position {
    return { ...this.position };
  }

  /**
   * Check if blob is within viewport bounds and adjust if needed
   */
  private adjustPositionToViewport(): void {
    if (!this.container) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const blobSize = 100; // Blob width/height

    // First, if we have a saved original position, try to restore it
    if (this.originalPosition) {
      const { x, y } = this.originalPosition;

      // Check if original position would be valid in current viewport
      const isValid =
        x >= 20 &&
        x + blobSize <= viewportWidth - 20 &&
        y >= 20 &&
        y + blobSize <= viewportHeight - 20;

      if (isValid) {
        // Restore original position
        this.setPosition(x, y);
        this.savePosition();
        this.originalPosition = null;
        return;
      }
      // If not valid, continue to adjustment logic below
    }

    let { x, y } = this.position;
    let adjusted = false;

    // Save current position as original before first adjustment
    const needsSaving = !this.originalPosition;

    // Check right edge
    if (x + blobSize > viewportWidth - 20) {
      if (needsSaving) this.originalPosition = { ...this.position };
      x = viewportWidth - blobSize - 20; // 20px padding
      adjusted = true;
    }

    // Check left edge
    if (x < 20) {
      if (needsSaving) this.originalPosition = { ...this.position };
      x = 20;
      adjusted = true;
    }

    // Check bottom edge
    if (y + blobSize > viewportHeight - 20) {
      if (needsSaving) this.originalPosition = { ...this.position };
      y = viewportHeight - blobSize - 20;
      adjusted = true;
    }

    // Check top edge
    if (y < 20) {
      if (needsSaving) this.originalPosition = { ...this.position };
      y = 20;
      adjusted = true;
    }

    if (adjusted) {
      this.setPosition(x, y);
      this.savePosition();
      // if (this.originalPosition) {
      //   console.log('📍 Original position saved:', this.originalPosition);
      // }
    } else {
      // Position is within bounds, clear original if we have one
      if (this.originalPosition) {
        this.originalPosition = null;
      }
    }
  }



  private createBlobDOM(parent: HTMLElement): void {
    // Check if container already exists to prevent duplicates
    const existingContainer = document.getElementById('indiContainer');
    if (existingContainer) {
      console.warn('⚠️ IndiBlob container already exists, skipping DOM creation');
      return;
    }

    const blobHTML = `
      <div class="indi-blob-container happy" id="indiContainer">
        <div class="indi-shadow"></div>

        <div class="indi-blob">
          <div class="indi-aura" id="indiAura"></div>

          <svg class="indi-blob-svg" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="blobGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a78bfa" id="colorStop1" style="transition: stop-color 0.6s ease;" />
                <stop offset="50%" stop-color="#8b5cf6" id="colorStop2" style="transition: stop-color 0.6s ease;" />
                <stop offset="100%" stop-color="#7c3aed" id="colorStop3" style="transition: stop-color 0.6s ease;" />
              </linearGradient>
            </defs>
            
            <ellipse
              cx="50"
              cy="50"
              rx="40"
              ry="42"
              fill="url(#blobGradient)"
              opacity="0.95"
            />

            <path
              id="mouthPath"
              d="M35,65 Q50,72 65,65"
              fill="none"
              stroke="rgba(0, 0, 0, 0.3)"
              stroke-width="2"
              stroke-linecap="round"
              style="transition: d 0.4s ease;"
            />

            <!-- Zipper mouth (hidden by default) -->
            <g id="zipperMouth" opacity="0" style="transition: opacity 0.4s ease;">
              <!-- Main zipper line -->
              <line x1="35" y1="68" x2="65" y2="68"
                    stroke="rgba(0, 0, 0, 0.4)"
                    stroke-width="2.5"
                    stroke-linecap="round" />
              <!-- Zipper teeth -->
              <line x1="38" y1="66" x2="38" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="42" y1="66" x2="42" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="46" y1="66" x2="46" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="50" y1="66" x2="50" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="54" y1="66" x2="54" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="58" y1="66" x2="58" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
              <line x1="62" y1="66" x2="62" y2="70" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5" />
            </g>
          </svg>

          <div class="indi-eye-container" id="eyeContainer">
            <div class="indi-eye">
              <div class="indi-iris" id="indiIris">
                <div class="indi-pupil">
                  <div class="indi-highlight"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="indi-blush left"></div>
          <div class="indi-blush right"></div>
          <div class="indi-sweat"></div>
        </div>

        <div class="indi-notification-badge" id="notificationBadge">0</div>

        <div class="indi-mute-button" id="muteButton" title="Mute/Unmute Indi">
          <span class="mute-icon">🔊</span>
        </div>

        <div class="indi-minimize-button" id="minimizeButton" title="Minimize Indi">
          <span class="minimize-icon">➖</span>
        </div>

        <!-- ZZZ sleep indicator (hidden by default) -->
        <div class="indi-sleep-indicator" id="sleepIndicator">
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </div>
      </div>
    `;

    parent.insertAdjacentHTML('beforeend', blobHTML);
    this.injectStyles();
  }

  private injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById('indi-blob-styles')) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'indi-blob-styles';
    styleElement.textContent = `
      /* ==================== INDI BLOB CSS RESET ==================== */
      .indi-blob-container,
      .indi-blob-container *,
      .indi-summary-tooltip,
      .indi-summary-tooltip *,
      .indi-notification-badge,
      .indi-mute-button,
      .indi-minimize-button,
      .indi-sleep-indicator {
        direction: ltr !important;
        text-align: left !important;
        unicode-bidi: normal !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
        box-sizing: border-box !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        text-transform: none !important;
        color: #1f2937 !important;
        font-weight: 500 !important;
      }
      /* ==================== END CSS RESET ==================== */

      .indi-blob-container {
        position: fixed;
        width: 80px;
        height: 80px;
        cursor: grab;
        user-select: none;
        z-index: 999999;
        pointer-events: auto !important;
      }

      .indi-blob-container.dragging {
        cursor: grabbing;
      }

      .indi-shadow {
        position: absolute;
        bottom: -18px;
        left: 50%;
        transform: translateX(-50%);
        width: 70%;
        height: 14px;
        background: radial-gradient(ellipse, rgba(0, 0, 0, 0.4), transparent);
        filter: blur(8px);
        transition: transform 0.3s ease;
      }

      .indi-blob {
        position: relative;
        width: 100%;
        height: 100%;
        transition: transform 0.3s ease;
        pointer-events: auto !important;
      }

      .indi-blob-container:hover .indi-blob {
        transform: scale(1.1);
      }

      .indi-blob-container.dragging .indi-blob {
        transform: scale(1.05);
      }

      /* Click feedback animation */
      @keyframes clickBounce {
        0% { transform: scale(1); }
        50% { transform: scale(0.92); }
        100% { transform: scale(1); }
      }

      .indi-blob-container.clicked .indi-blob {
        animation: clickBounce 0.3s ease;
      }

      /* Celebration mode animation */
      @keyframes celebrate {
        0%, 100% {
          transform: translateY(0) rotate(0deg) scale(1);
        }
        10% {
          transform: translateY(-8px) rotate(-5deg) scale(1.05);
        }
        20% {
          transform: translateY(-12px) rotate(5deg) scale(1.08);
        }
        30% {
          transform: translateY(-8px) rotate(-3deg) scale(1.05);
        }
        40% {
          transform: translateY(0) rotate(0deg) scale(1);
        }
        50% {
          transform: translateY(-4px) rotate(2deg) scale(1.02);
        }
        60% {
          transform: translateY(0) rotate(0deg) scale(1);
        }
      }

      .indi-blob-container.celebrating .indi-blob {
        animation: celebrate 1.5s ease-in-out;
      }

      .indi-blob-container.celebrating .indi-aura {
        animation: indi-urgent-pulse 0.5s ease-in-out 3;
      }

      .indi-aura {
        position: absolute;
        inset: -20px;
        border-radius: 50%;
        opacity: 0.5;
        animation: indi-gentle-pulse 3s ease-in-out infinite;
        pointer-events: none;
        transition: background 0.6s ease, opacity 0.3s ease;
      }

      .indi-blob-container.panic .indi-aura {
        animation: indi-urgent-pulse 1s ease-in-out infinite;
      }

      .indi-blob-svg {
        position: absolute;
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 8px 24px rgba(139, 92, 246, 0.4));
      }

      .indi-eye-container {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        transition: transform 0.15s ease;
      }

      .indi-eye {
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at 35% 35%, #ffffff, #f5f5f5);
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        position: relative;
        transition: transform 0.3s ease;
      }

      .indi-iris {
        width: 60%;
        height: 60%;
        border-radius: 50%;
        position: relative;
        background: radial-gradient(circle at 35% 35%, #8b5cf6dd, #7c3aedaa); /* Default purple background */
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.3);
        transition: background 0.6s ease, transform 0.15s ease-out, box-shadow 0.3s ease;
      }

      .indi-pupil {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50%;
        height: 50%;
        background: radial-gradient(circle at 30% 30%, #2d3748, #000000);
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      }

      .indi-highlight {
        position: absolute;
        top: 20%;
        left: 25%;
        width: 40%;
        height: 40%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.95), transparent 70%);
        border-radius: 50%;
      }

      /* Eye sparkle effect when excited or satisfied */
      @keyframes eyeSparkle {
        0%, 100% {
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3),
                      0 0 20px rgba(255, 255, 255, 0.2),
                      inset 0 0 10px rgba(255, 255, 255, 0.1);
        }
        50% {
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.6),
                      0 0 30px rgba(255, 255, 255, 0.4),
                      inset 0 0 15px rgba(255, 255, 255, 0.3);
        }
      }

      .indi-blob-container.satisfied .indi-iris,
      .indi-blob-container.excited .indi-iris {
        animation: eyeSparkle 2s ease-in-out infinite;
      }

      .indi-blob-container.excited .indi-iris {
        animation-duration: 1s; /* Faster sparkle when super excited! */
      }

      .indi-blush {
        position: absolute;
        top: 52%;
        width: 14px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255, 182, 193, 0.5);
        filter: blur(3px);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .indi-blush.left { left: 15%; }
      .indi-blush.right { right: 15%; }

      .indi-blob-container:hover .indi-blush {
        opacity: 1;
      }

      /* Hover personality effects */
      .indi-blob-container:hover .indi-eye {
        transform: scale(1.08);
      }

      .indi-blob-container:hover .indi-iris {
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.6),
                    inset 0 1px 4px rgba(0, 0, 0, 0.3);
      }

      .indi-blob-container:hover .indi-aura {
        opacity: 0.7;
      }

      .indi-sweat {
        position: absolute;
        top: 25%;
        right: 18%;
        width: 8px;
        height: 12px;
        background: radial-gradient(ellipse at top, #60a5fa, #3b82f6);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .indi-blob-container.worried .indi-sweat,
      .indi-blob-container.panic .indi-sweat {
        opacity: 1;
      }

      .indi-notification-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        min-width: 38px;
        height: 34px;
        padding: 0 8px;
        background: linear-gradient(135deg, #ff4757 0%, #ff6348 100%);
        border-radius: 17px;
        border: 4px solid white;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 14px !important;
        font-weight: 800 !important;
        color: #ffffff !important;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        box-shadow: 0 4px 20px rgba(255, 71, 87, 0.6);
        cursor: pointer;
        z-index: 20;
        gap: 2px;
        pointer-events: auto !important;
      }

      .indi-notification-badge.visible {
        display: flex;
      }

      .indi-mute-button {
        position: absolute;
        bottom: -8px;
        right: -8px;
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        border-radius: 50%;
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        cursor: pointer;
        z-index: 21;
        transition: all 0.3s ease;
        pointer-events: auto !important;
      }

      .indi-mute-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(99, 102, 241, 0.6);
      }

      .indi-mute-button.muted {
        background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
        box-shadow: 0 4px 12px rgba(100, 116, 139, 0.4);
      }

      .mute-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s ease;
      }

      .indi-mute-button:active .mute-icon {
        transform: scale(0.9);
      }

      @keyframes mute-button-press {
        0% { transform: scale(1); }
        50% { transform: scale(0.85) rotate(15deg); }
        100% { transform: scale(1) rotate(0deg); }
      }

      .indi-mute-button.animating {
        animation: mute-button-press 0.4s ease;
      }

      .indi-minimize-button {
        position: absolute;
        top: -8px;
        left: -8px;
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 50%;
        border: 3px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        cursor: pointer;
        z-index: 21;
        transition: all 0.3s ease;
        pointer-events: auto !important;
      }

      .indi-minimize-button:hover {
        transform: scale(1.1);
        background: #ffffff;
        border-color: #d1d5db;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }

      .minimize-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s ease;
      }

      .indi-minimize-button:active .minimize-icon {
        transform: scale(0.9);
      }

      /* Minimized state */
      .indi-blob-container.minimized {
        width: 32px;
        height: 32px;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      }

      .indi-blob-container.minimized .indi-blob {
        transform: scale(0.4);
        filter: grayscale(0.7);
        opacity: 0.8;
      }

      .indi-blob-container.minimized:hover .indi-blob {
        transform: scale(0.45);
        filter: grayscale(0.3);
        opacity: 1;
      }

      .indi-blob-container.minimized .indi-shadow {
        opacity: 0;
      }

      .indi-blob-container.minimized .indi-notification-badge,
      .indi-blob-container.minimized .indi-mute-button,
      .indi-blob-container.minimized .indi-minimize-button {
        display: none;
      }

      .indi-blob-container.minimized .indi-eye-container {
        transform: translate(-50%, -50%) scaleY(0.1);
      }

      /* Sleep indicator (zzz) */
      .indi-sleep-indicator {
        position: absolute;
        top: -30px;
        right: 0px;
        display: none;
        flex-direction: column;
        gap: 2px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .indi-blob-container.minimized .indi-sleep-indicator {
        display: flex;
        animation: fadeInSleep 0.5s ease 0.3s forwards;
      }

      .indi-sleep-indicator span {
        font-size: 12px;
        color: #8b5cf6;
        font-weight: bold;
        animation: floatUp 2s ease-in-out infinite;
        opacity: 0.7;
      }

      .indi-sleep-indicator span:nth-child(1) {
        animation-delay: 0s;
        font-size: 10px;
      }

      .indi-sleep-indicator span:nth-child(2) {
        animation-delay: 0.3s;
        font-size: 14px;
      }

      .indi-sleep-indicator span:nth-child(3) {
        animation-delay: 0.6s;
        font-size: 16px;
      }

      @keyframes floatUp {
        0% {
          transform: translateY(0px);
          opacity: 0.3;
        }
        50% {
          transform: translateY(-5px);
          opacity: 0.9;
        }
        100% {
          transform: translateY(-10px);
          opacity: 0;
        }
      }

      @keyframes fadeInSleep {
        to {
          opacity: 1;
        }
      }

      @keyframes indi-gentle-pulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.5; 
        }
        50% { 
          transform: scale(1.1); 
          opacity: 0.7; 
        }
      }

      @keyframes indi-urgent-pulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.7; 
        }
        50% { 
          transform: scale(1.2); 
          opacity: 0.9; 
        }
      }
    `;

    document.head.appendChild(styleElement);
  }

  private initializeReferences(): void {
    this.container = document.getElementById('indiContainer');
    this.iris = document.getElementById('indiIris');
    this.badge = document.getElementById('notificationBadge');
    this.aura = document.getElementById('indiAura');
    this.mouthPath = document.getElementById('mouthPath') as unknown as SVGPathElement;
    this.zipperMouth = document.getElementById('zipperMouth') as unknown as SVGGElement;
    this.eyeContainer = document.getElementById('eyeContainer');
    this.colorStop1 = document.getElementById('colorStop1') as unknown as SVGStopElement;
    this.colorStop2 = document.getElementById('colorStop2') as unknown as SVGStopElement;
    this.colorStop3 = document.getElementById('colorStop3') as unknown as SVGStopElement;
    this.muteButton = document.getElementById('muteButton');
    this.minimizeButton = document.getElementById('minimizeButton');
  }

  private init(): void {
    if (!this.container) return;

    // Eye follow cursor on hover
    this.container.addEventListener('mouseenter', () => {
      document.addEventListener('mousemove', this.followCursor);
    });

    this.container.addEventListener('mouseleave', () => {
      document.removeEventListener('mousemove', this.followCursor);
      if (this.iris) {
        this.iris.style.transform = 'translate(0, 0)';
      }
    });

    // Dragging
    this.container.addEventListener('mousedown', this.startDrag);
    document.addEventListener('mousemove', this.drag);
    document.addEventListener('mouseup', this.stopDrag);

    // Blinking
    this.blinkInterval = window.setInterval(() => {
      if (!this.isDragging) {
        this.blink();
      }
    }, 4000 + Math.random() * 2000);

    // Click handler - use capture phase to ensure we catch clicks before websites can intercept
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Skip if click is on badge, mute button, or minimize button (they have their own handlers)
      if (this.badge && (target === this.badge || this.badge.contains(target))) {
        return; // Let badge handler handle it
      }
      if (this.muteButton && (target === this.muteButton || this.muteButton.contains(target))) {
        return; // Let mute button handler handle it
      }
      if (this.minimizeButton && (target === this.minimizeButton || this.minimizeButton.contains(target))) {
        return; // Let minimize button handler handle it
      }

      e.stopPropagation(); // Prevent website from handling our clicks
      console.log('🖱️ Container clicked', { isDragging: this.isDragging, hasDragged: this.hasDragged });
      if (!this.isDragging && !this.hasDragged) {
        this.handleClick();
      } else {
        console.log('⚠️ Click blocked by drag state');
      }
    }, true); // true = capture phase

    // Badge click handler
    if (this.badge) {
      this.badge.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering container click
        console.log('🏷️ Badge clicked');
        if (!this.isDragging && !this.hasDragged) {
          this.handleBadgeClick();
        }
      }, true); // capture phase
    }

    // Mute button
    if (this.muteButton) {
      this.muteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering container click
        console.log('🔇 Mute button clicked');
        this.toggleMute();
      }, true); // capture phase
    }

    // Minimize button
    if (this.minimizeButton) {
      this.minimizeButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering container click
        console.log('🔘 Minimize button clicked');
        this.minimize();
      }, true); // capture phase
    }

  // Window resize listener to keep blob visible
  window.addEventListener('resize', () => {
    this.adjustPositionToViewport();
  });

  // Load mute state from storage
  this.loadMuteState();

  // Load minimize state from storage
  this.loadMinimizeState();
  }

  private handleBadgeClick(): void {

  // Dispatch custom event with the issue count and summary data
  const event = new CustomEvent('indi-badge-clicked', {
    detail: {
      count: this.notificationCount,
      summaryData: this.currentSummaryData
    }
  });
  document.dispatchEvent(event);
}

  private setInitialPosition(): void {
    // Position in bottom-right corner
    const x = window.innerWidth - 150;
    const y = window.innerHeight - 150;
    this.setPosition(x, y);
  }

  private setPosition(x: number, y: number): void {
    if (!this.container) return;

    this.position = { x, y };
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y}px`;
  }

  private followCursor = (e: MouseEvent): void => {
    if (!this.container || !this.iris) return;

    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    const maxMove = 5;
    const scale = Math.min(maxMove / (distance / 80), 1);

    const moveX = (deltaX / distance) * maxMove * scale;
    const moveY = (deltaY / distance) * maxMove * scale;

    this.iris.style.transform = `translate(${moveX}px, ${moveY}px)`;
  };

  private startDrag = (e: MouseEvent): void => {
    if (!this.container) return;

    this.isDragging = true;
    this.hasDragged = false;
    this.container.classList.add('dragging');

    // Store initial mouse position for drag threshold detection
    this.dragStartPos = {
      x: e.clientX,
      y: e.clientY,
    };

    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    e.preventDefault();
  };

  private drag = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    // Calculate distance from start position
    const deltaX = e.clientX - this.dragStartPos.x;
    const deltaY = e.clientY - this.dragStartPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only mark as dragged if moved beyond threshold
    if (distance > this.DRAG_THRESHOLD) {
      this.hasDragged = true;
    }

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;
    this.setPosition(x, y);

    // Update bubble positions in real-time while dragging
    this.updateBubblePositions();
  };

  private stopDrag = (): void => {
    if (!this.isDragging || !this.container) return;

    this.isDragging = false;
    this.container.classList.remove('dragging');
    this.updateBubblePositions();

    // Reset hasDragged after a short delay to allow click event to fire
    // This prevents the click event from being blocked forever after dragging
    setTimeout(() => {
      this.hasDragged = false;
    }, 100);

    // Only save position if actually dragged beyond threshold
    if (this.hasDragged) {
      // Clear original position if user manually moved blob
      this.originalPosition = null;
      // Save position to storage
      this.savePosition();
    }
  };

  private updateBubblePositions(): void {
  if (!this.container) return;

  const blobRect = this.container.getBoundingClientRect();

  // Update speech bubble position if it exists and is visible
  if (this.speechBubble && this.speechBubble.isShowing()) {
    this.speechBubble.updatePosition();
  }

  // Update summary tooltip position
  if (this.summaryTooltip) {
    this.updateSummaryTooltipPosition(blobRect);
  }
}

// Add this new method
private updateSummaryTooltipPosition(blobRect: DOMRect): void {
  if (!this.summaryTooltip) return;

  // Keep tooltip in same relative position to blob
  this.summaryTooltip.style.bottom = `${window.innerHeight - blobRect.top + 10}px`;
  this.summaryTooltip.style.right = `${window.innerWidth - blobRect.right + 10}px`;

  // Update arrow position
  const arrow = this.summaryTooltip.querySelector('div') as HTMLElement;
  if (arrow) {
    arrow.style.right = '40px';
  }
}

  private blink(): void {
    if (!this.eyeContainer) return;

    this.eyeContainer.style.transform = 'translate(-50%, -50%) scaleY(0.1)';
    setTimeout(() => {
      if (this.eyeContainer) {
        this.eyeContainer.style.transform = 'translate(-50%, -50%)';
      }
    }, 150);
  }

  private handleClick(): void {
    console.log('🎯 Blob clicked - dispatching event');

    // If minimized, restore instead of regular click
    if (this.isMinimized) {
      this.restore();
      return;
    }

    // Add click feedback animation
    if (this.container) {
      this.container.classList.add('clicked');
      setTimeout(() => {
        this.container?.classList.remove('clicked');
      }, 300);
    }

    if (this.speechBubble && this.speechBubble.isShowing()) {
      this.speechBubble.hide();
    }
    const event = new CustomEvent('indi-blob-clicked');
    document.dispatchEvent(event);
  }

  public setEmotion(emotion: EmotionType): void {
    if (!this.container) return;

    this.emotion = emotion;
    this.container.className = `indi-blob-container ${emotion}`;

    const colors = this.getEmotionColors(emotion);
    
    if (this.colorStop1) this.colorStop1.setAttribute('stop-color', colors.primary);
    if (this.colorStop2) this.colorStop2.setAttribute('stop-color', colors.secondary);
    if (this.colorStop3) this.colorStop3.setAttribute('stop-color', colors.tertiary);

    if (this.aura) {
      this.aura.style.background = `radial-gradient(circle, ${colors.primary}50 0%, transparent 70%)`;
    }

    if (this.iris) {
      this.iris.style.background = `radial-gradient(circle at 35% 35%, ${colors.secondary}dd, ${colors.tertiary}aa)`;
    }

    this.updateMouth(emotion);
  }

  private getEmotionColors(emotion: EmotionType): EmotionColors {
    const colorMap: Record<EmotionType, EmotionColors> = {
      happy: { primary: '#a78bfa', secondary: '#8b5cf6', tertiary: '#7c3aed' }, // Purple - default
      calm: { primary: '#60a5fa', secondary: '#3b82f6', tertiary: '#2563eb' }, // Blue - chill
      satisfied: { primary: '#f9a8d4', secondary: '#ec4899', tertiary: '#db2777' }, // Pink - caught something!
      excited: { primary: '#fbbf24', secondary: '#f59e0b', tertiary: '#d97706' }, // Gold/Yellow - big win!
    };
    return colorMap[emotion];
  }

  private updateMouth(emotion: EmotionType): void {
    if (!this.mouthPath || !this.zipperMouth) return;

    // If muted, show zipper mouth instead of normal mouth
    if (this.isMuted) {
      this.mouthPath.setAttribute('opacity', '0');
      this.zipperMouth.setAttribute('opacity', '1');
      return;
    }

    // Normal mouth behavior - show emotion-based mouth
    this.mouthPath.setAttribute('opacity', '1');
    this.zipperMouth.setAttribute('opacity', '0');

    const mouthShapes: Record<EmotionType, string> = {
      happy: 'M35,65 Q50,72 65,65', // Medium smile - default
      calm: 'M38,67 Q50,71 62,67', // Small smile - chill
      satisfied: 'M33,64 Q50,74 67,64', // Big smile - caught something!
      excited: 'M30,62 Q50,76 70,62', // Huge smile - big win!
    };

    this.mouthPath.setAttribute('d', mouthShapes[emotion]);
  }

  /**
   * Trigger celebration animation when everything's perfect!
   */
  public celebrate(): void {
    if (!this.container) return;

    this.container.classList.add('celebrating');
    setTimeout(() => {
      this.container?.classList.remove('celebrating');
    }, 1500);
  }

  public setNotifications(count: number): void {
    this.notificationCount = count;

    if (!this.badge) return;

    if (count > 0) {
      this.badge.textContent = `✨ ${count}`;
      this.badge.classList.add('visible');

      // Auto-set emotion based on count (MORE catches = MORE excited!)
      if (count >= 6) {
        this.setEmotion('excited'); // Big win! Caught lots of things!
      } else if (count >= 3) {
        this.setEmotion('satisfied'); // Nice! Got some catches
      } else {
        this.setEmotion('calm'); // A few things
      }
    } else {
      this.badge.classList.remove('visible');
      this.setEmotion('happy');
    }
  };

  public setNetworkCallsPerPage(count: number): void {
    this.notificationCount = count;
    if (count <= 5) {
      this.setEmotion('happy');
    } else if (count <= 15) {
        this.setEmotion('calm');
    } else if (count <= 30) {
        this.setEmotion('satisfied');
    } else {
        this.setEmotion('excited');
    }
  };

  private savePosition(): void {
    const domainKey = `indi_position_${window.location.hostname}`;
    chrome.storage.local.set({
      [domainKey]: this.position,
    });
  }

  public async loadPosition(): Promise<void> {
    const domainKey = `indi_position_${window.location.hostname}`;
    
    return new Promise((resolve) => {
      chrome.storage.local.get([domainKey], (result) => {
        if (result[domainKey]) {
          const savedPosition = result[domainKey] as Position;
          this.setPosition(savedPosition.x, savedPosition.y);
        }
        resolve();
      });
    });
  }

  // ========== MUTE FUNCTIONALITY ==========

  private async loadMuteState(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['indi_global_mute'], (result) => {
        this.isMuted = result.indi_global_mute || false;
        this.updateMuteUI();
        resolve();
      });
    });
  }

  private toggleMute(): void {
    this.isMuted = !this.isMuted;

    // Save to storage
    chrome.storage.local.set({
      indi_global_mute: this.isMuted,
    });

    // Trigger button press animation
    if (this.muteButton) {
      this.muteButton.classList.add('animating');
      setTimeout(() => {
        this.muteButton?.classList.remove('animating');
      }, 400);
    }

    this.updateMuteUI();

  }

  private updateMuteUI(): void {
    if (!this.muteButton) return;

    const muteIcon = this.muteButton.querySelector('.mute-icon') as HTMLElement;
    if (!muteIcon) return;

    if (this.isMuted) {
      this.muteButton.classList.add('muted');
      muteIcon.textContent = '🔇';
      this.muteButton.title = 'Unmute Indi';
    } else {
      this.muteButton.classList.remove('muted');
      muteIcon.textContent = '🔊';
      this.muteButton.title = 'Mute Indi';
    }

    // Update mouth to show zipper when muted
    this.updateMouth(this.emotion);
  }

  public getMuteState(): boolean {
    return this.isMuted;
  }

  // ========== MINIMIZE FUNCTIONALITY ==========

  private async loadMinimizeState(): Promise<void> {
    const domainKey = `indi_minimized_${window.location.hostname}`;
    return new Promise((resolve) => {
      chrome.storage.local.get([domainKey], (result) => {
        const minimized = result[domainKey] || false;
        if (minimized) {
          // Apply minimized state without animation
          this.isMinimized = true;
          if (this.container) {
            this.container.classList.add('minimized');
          }
          // Hide tooltip and speech bubble
          if (this.summaryTooltip) {
            this.summaryTooltip.style.display = 'none';
          }
          if (this.speechBubble) {
            this.speechBubble.hide();
          }
          // Dispatch minimize event to notify content script
          const event = new CustomEvent('indi-minimized');
          document.dispatchEvent(event);
        }
        resolve();
      });
    });
  }

  private saveMinimizeState(): void {
    const domainKey = `indi_minimized_${window.location.hostname}`;
    chrome.storage.local.set({
      [domainKey]: this.isMinimized,
    });
  }

  private minimize(): void {
    if (this.isMinimized) return;

    this.isMinimized = true;

    // Move to bottom-right corner (accounting for minimized size of 32px)
    const x = window.innerWidth - 32 - 20; // 20px padding from edge
    const y = window.innerHeight - 32 - 20;
    this.setPosition(x, y);

    // Add minimized class to container
    if (this.container) {
      this.container.classList.add('minimized');
    }

    // Hide tooltip
    if (this.summaryTooltip) {
      this.summaryTooltip.style.display = 'none';
    }

    // Hide speech bubble
    if (this.speechBubble) {
      this.speechBubble.hide();
    }

    // Save state
    this.saveMinimizeState();

    // Dispatch minimize event to notify content script (to detach debugger)
    const event = new CustomEvent('indi-minimized');
    document.dispatchEvent(event);

    console.log('😴 Indi minimized - monitoring paused');
  }

  public restore(): void {
    if (!this.isMinimized) return;

    this.isMinimized = false;

    // Remove minimized class (position stays where it was dragged to)
    if (this.container) {
      this.container.classList.remove('minimized');
    }

    // Save state
    this.saveMinimizeState();

    // Dispatch restore event to notify content script (to re-attach debugger)
    const event = new CustomEvent('indi-restored');
    document.dispatchEvent(event);

    console.log('👀 Indi restored - monitoring resumed');
  }

  public getMinimizedState(): boolean {
    return this.isMinimized;
  }

    public destroy(): void {
    // Clean up
    if (this.blinkInterval) {
        clearInterval(this.blinkInterval);
    }

    // Remove tooltip
    if (this.summaryTooltip) {
        this.summaryTooltip.remove();
        this.summaryTooltip = null;
    }

    document.removeEventListener('mousemove', this.followCursor);
    document.removeEventListener('mousemove', this.drag);
    document.removeEventListener('mouseup', this.stopDrag);

    if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
    }
    }
}