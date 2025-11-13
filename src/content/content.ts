// import { JiraTicketData } from "../services/jiraService";
import { IndicatorData, NetworkCall } from "../types";
// import { analyzeSecurityIssues } from "../utils/securityAnalyzer";
import { generatePatternBasedStoragePath, generateStoragePath } from "../utils/storage";
import { identifyDynamicParams } from "../utils/urlUrils";
import { IndicatorMonitor } from "./services/indicatorMonitor";
import { IndicatorLoader } from "./services/indicatorLoader";
import {
  getElementPath,
  injectStyles,
  pageIndicators,
  createIndicatorFromData,
} from "./services/indicatorService"
import { waitForIndicator } from "../utils/general";
import Swal from "sweetalert2";
import { IndiBlob } from './blob/indiBlob';
import { SpeechBubble } from './blob/speechBubble';
import { OnboardingFlow } from './blob/onboarding';
import { PageSummary, PageSummaryData } from './blob/PageSummary';
// import { createAIChatInterface } from './aiChatComponent';
// אחרי שכל הדף נטען, פשוט להוסיף:
// createAIChatInterface();


// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement;
let innerModalContainer: HTMLElement;

// Initialize Indi Blob
// Global instances
let indiBlob: IndiBlob | null = null;
let speechBubble: SpeechBubble | null = null;
let onboardingFlow: OnboardingFlow | null = null;
let isIndiInitialized = false;
let pageSummary: PageSummary | null = null;
let issuesSummary: PageSummaryData | null = null;
let indiBlobUrlWithIssue: string | null = null;


async function initializeIndi(networkData: NetworkCall[]) {
  console.log({ networkData });
  if (isIndiInitialized) return;

  try {
    console.log('🫧 Initializing Indi with network data...');

    // 1. Create Indi blob
    indiBlob = new IndiBlob();
    await indiBlob.loadPosition();

    // 2. Create speech bubble
    speechBubble = new SpeechBubble();
    indiBlob.setSpeechBubble(speechBubble);
    speechBubble.setIndiBlob(indiBlob); // Allow SpeechBubble to check mute state

    // 3. Create page summary analyzer
    pageSummary = new PageSummary();

    // 4. Create onboarding flow
    onboardingFlow = new OnboardingFlow(indiBlob, speechBubble);
    // await onboardingFlow.startWithNetworkData(networkData);

    // 5. Set up event listeners
    setupIndiEventListeners();

    isIndiInitialized = true;
    console.log('✅ Indi initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize Indi:', error);
  }
}

/**
 * Helper function to check if a URL is a static asset (not an API call)
 */
function isStaticAsset(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.ico', '.map'];
    return staticExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Helper function to safely generate storage path with error handling
 */
function safeGenerateStoragePath(url: string): string | null {
  try {
    return generateStoragePath(url);
  } catch (error) {
    console.warn('⚠️ Could not generate storage path for URL:', url);
    return null;
  }
}

/**
 * Find a network call in cache by URL, filtering out static assets
 */
function findNetworkCallInCache(targetUrl: string): NetworkCall | null {
  const targetPath = safeGenerateStoragePath(targetUrl);
  if (!targetPath) {
    console.warn('⚠️ Invalid target URL:', targetUrl);
    return null;
  }

  let foundCall: NetworkCall | null = null;

  recentCallsCache.forEach((calls, key) => {
    if (foundCall) return; // Already found, skip remaining

    try {
      const [cachedUrl, method] = key.split('|');

      // Skip static assets
      if (isStaticAsset(cachedUrl)) {
        return;
      }

      const cachedPath = safeGenerateStoragePath(cachedUrl);
      if (!cachedPath) {
        return; // Skip invalid URLs
      }

      if (cachedPath === targetPath && calls.length > 0) {
        foundCall = calls[0];
        console.log('✅ Found API call in cache:', { url: cachedUrl, method, call: foundCall });
      }
    } catch (error) {
      console.warn('⚠️ Error processing cache key:', key, error);
    }
  });

  return foundCall;
}

// listen to create indi events
document.addEventListener('indi-create-indicator', async (e: Event) => {
  const customEvent = e as CustomEvent<{ apiUrl: string; duration?: number; fullSummary?: any }>;
  const { apiUrl, duration, fullSummary } = customEvent.detail;
  console.log('🎯 Indi create indicator event received:', { apiUrl, duration, fullSummary });

  // Try to find the full NetworkCall data from cache using the safe helper
  const fullNetworkCall = findNetworkCallInCache(apiUrl);

  if (fullNetworkCall) {
    console.log('✅ Found full network call data from cache:', fullNetworkCall);
  } else {
    console.warn('⚠️ Could not find network call in cache for URL:', apiUrl);
  }

  // Store the URL and full data for later use
  indiBlobUrlWithIssue = apiUrl;
  (window as any).__indiBlobNetworkCall = fullNetworkCall; // Store for handleIndiBlobRef

  enableInspectMode(apiUrl);
});


document.addEventListener('indi-badge-clicked', (e: Event) => {
  // cast the generic Event to our CustomEvent with the expected detail shape
  const customEvent = e as CustomEvent<{ count: number; summaryData: PageSummaryData }>;
  const { count, summaryData } = customEvent.detail;
  console.log('🔔 Badge clicked, showing issues summary:', { count, summaryData });

  // Call showIssuesSummary with bypassMute=true so it shows even when muted
  if (issuesSummary) {
    showIssuesSummary(issuesSummary, true);
  } else {
    console.warn('⚠️ No summary data available or speech bubble not initialized');
  }
});


document.addEventListener('indi-create-indicator-from-summary', async () => { 
  console.log('🎯 Create indicator from summary event received')
  enableInspectMode();
});


/**
 * Set up Indi-specific event listeners
 */
function setupIndiEventListeners() {
  // Listen for Indi blob clicks
  document.addEventListener('indi-blob-clicked', handleBlobClick);

  // Listen for "Create Indicator" button clicks in the summary tooltip (event delegation)
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.id === 'indi-summary-create-indicator') {
      console.log('➕ Create Indicator button clicked from summary tooltip!');
      // Dispatch the event
      const event = new CustomEvent('indi-create-indicator-from-summary');
      document.dispatchEvent(event);
    }
  });
}


/**
 * Check if backend is configured for current domain
 */
async function isBackendConfigured(): Promise<boolean> {
  const key = `indi_onboarding_${window.location.hostname}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const state = result[key];
      resolve(state?.selectedBackendUrl ? true : false);
    });
  });
}

async function handleBlobClick() {
  // Check if backend is configured
  const configured = await isBackendConfigured();

  if (configured) {
    // Backend is configured - toggle summary tooltip on click
    console.log('🫧 Indi blob clicked - backend configured, toggling summary tooltip');

    if (indiBlob) {
      // Toggle the tooltip that was prepared by showSummaryOnHover
      indiBlob.toggleTooltip();

      // If no tooltip exists yet, show a message
      const summaryData = indiBlob.getCurrentSummaryData();
      if (!summaryData && speechBubble) {
        speechBubble.show({
          title: '✨ All Good!',
          message: 'No issues detected on this page yet.\n\nI\'m monitoring your APIs and will let you know if anything comes up!',
          actions: [
            {
              label: 'Got it!',
              style: 'primary',
              onClick: () => {
                if (speechBubble) {
                speechBubble.hide()
              }},
            },
          ],
          showClose: true,
          persistent: false,
        });
      }
    }
  } else {
    // Backend not configured - show onboarding
    if (onboardingFlow) {
      // let's get urls from cache for onboarding
      const networkData = Array.from(recentCallsCache.values()).flat();
      await onboardingFlow.startWithNetworkData(networkData);
    }
  }
}

// Track cumulative issues for the current page
let currentPageUrl: string = window.location.href;
let cumulativeErrorCalls = new Set<string>(); // Track unique error URLs
let cumulativeSlowApis = new Set<string>(); // Track unique slow API URLs
let cumulativeSecurityIssues = new Set<string>(); // Track unique security issues
let cumulativeSummary: PageSummaryData | null = null; // Track cumulative summary for badge clicks

// Reset cumulative tracking when page changes
function resetCumulativeTracking() {
  currentPageUrl = window.location.href;
  cumulativeErrorCalls.clear();
  cumulativeSlowApis.clear();
  cumulativeSecurityIssues.clear();
  cumulativeSummary = null;
  console.log('🔄 Reset cumulative tracking for new page:', currentPageUrl);
}

async function analyzeNetworkForIndi(networkData: NetworkCall[]) {
  if (!indiBlob || !pageSummary) return;

  // Check if onboarding exists for this domain - if NOT, don't analyze
  // This prevents Indi from being intrusive on every website
  const onboardingKey = `indi_onboarding_${window.location.hostname}`;
  const onboardingState = await chrome.storage.local.get([onboardingKey]);
  const state = onboardingState[onboardingKey];

  // If no onboarding data exists, this site is not enabled - return early
  if (!state) {
    console.log('⏸️ Network analysis skipped - Indi not enabled for this domain');
    return;
  }

  // If onboarding not completed, wait for user to complete it
  if (!state.completed) {
    console.log('⏸️ Network analysis skipped - onboarding not completed yet');
    return;
  }

  // Check if URL changed - if so, reset cumulative tracking
  if (window.location.href !== currentPageUrl) {
    resetCumulativeTracking();
  }

  // Analyze current batch
  const summary = pageSummary.analyze(networkData);

  console.log('📊 Current Batch Summary:', summary);

  // Update cumulative tracking with NEW issues from this batch
  if (summary.errorCalls > 0) {
    // Add error URLs to cumulative set
    networkData.forEach(call => {
      if (call.status >= 400) {
        const url = extractNetworkCallUrl(call);
        cumulativeErrorCalls.add(url);
      }
    });
  }

  if (summary.slowestApi && summary.slowestApi.duration > 1000) {
    cumulativeSlowApis.add(summary.slowestApi.url);
  }

  if (summary.apisWithoutAuth && summary.apisWithoutAuth.length > 0) {
    summary.apisWithoutAuth.forEach((url: string) => cumulativeSecurityIssues.add(url));
  }

  // Calculate total cumulative issue count for this page
  const totalIssueCount =
    cumulativeErrorCalls.size +
    cumulativeSlowApis.size +
    cumulativeSecurityIssues.size;

  console.log('📊 Cumulative Issues for Page:', {
    pageUrl: currentPageUrl,
    errors: cumulativeErrorCalls.size,
    slowApis: cumulativeSlowApis.size,
    security: cumulativeSecurityIssues.size,
    total: totalIssueCount
  });

  // Build cumulative summary for badge clicks
  if (!cumulativeSummary) {
    // First batch - use current summary as base
    cumulativeSummary = { ...summary };
  } else {
    // Merge new batch into cumulative summary
    cumulativeSummary.errorCalls = cumulativeErrorCalls.size;
    cumulativeSummary.securityIssues = cumulativeSecurityIssues.size;
    cumulativeSummary.apisWithoutAuth = Array.from(cumulativeSecurityIssues);

    // Update slowest API if new batch has slower one
    if (summary.slowestApi && cumulativeSlowApis.has(summary.slowestApi.url)) {
      if (!cumulativeSummary.slowestApi || summary.slowestApi.duration > cumulativeSummary.slowestApi.duration) {
        cumulativeSummary.slowestApi = summary.slowestApi;
      }
    }

    // Update issue flags
    cumulativeSummary.hasIssues = totalIssueCount > 0;
    cumulativeSummary.issueCount = totalIssueCount;
  }

  // Update Indi's notification count with cumulative count
  indiBlob.setNotifications(totalIssueCount);

  // Generate HTML summary for hover tooltip (use cumulative summary)
  const summaryHTML = pageSummary.generateSummaryHTML(cumulativeSummary);
  indiBlob.showSummaryOnHover(summaryHTML, cumulativeSummary);

  // If there are NEW issues in this batch, show speech bubble
  if (summary.hasIssues) {
    showIssuesSummary(cumulativeSummary); // Show cumulative summary
    issuesSummary = cumulativeSummary; // Store cumulative summary for badge clicks
  }
}

function showIssuesSummary(summary: PageSummaryData, bypassMute: boolean = false) {
  if (!speechBubble) return;

  const issueMessages: string[] = [];

  if (summary.errorCalls > 0) {
    issueMessages.push(`❌ ${summary.errorCalls} API${summary.errorCalls > 1 ? 's' : ''} failing`);
  }

  if (summary.slowestApi && summary.slowestApi.duration > 1000) {
    issueMessages.push(`⚡ Slow API detected (${summary.slowestApi.duration}ms)`, summary.slowestApi.url);
    // let offer the user to add an indicator for the slow API
    issueMessages.push(`👉 Consider adding an indicator for this API to monitor its performance.`);
  }

  if (summary.securityIssues > 0) {
    issueMessages.push(`🔒 ${summary.securityIssues} security issue${summary.securityIssues > 1 ? 's' : ''}`);
  }

  if (issueMessages.length > 0) {
    speechBubble.show({
      title: '⚠️ Issues Detected',
      message: issueMessages.join('\n'),
      bypassMute: bypassMute,
      actions: [
        {
          label: 'View Details',
          style: 'primary',
          onClick: () => {
            speechBubble?.hide();
            handleBlobClick();
          },
        },
        {
          label: 'Dismiss',
          style: 'secondary',
          onClick: () => {
            speechBubble?.hide();

            // Decrement badge count by 1
            if (indiBlob) {
              const currentCount = indiBlob['notificationCount'] || 0;
              const newCount = Math.max(0, currentCount - 1);
              indiBlob.setNotifications(newCount);

              // Update emotion based on new count
              if (newCount === 0) {
                indiBlob.setEmotion('happy');
              } else if (newCount <= 2) {
                indiBlob.setEmotion('calm');
              }
              // Keep current emotion if still many issues

              console.log('🔔 Badge decremented on dismiss:', currentCount, '→', newCount);
            }
          },
        },
        {
          label: 'Add An Indi',
          style: 'third',
          onClick: () => speechBubble?.createIndi(summary),
        },
      ],
      showClose: true,
      onClose: () => {
        // Also decrement badge when user clicks X to close
        if (indiBlob) {
          const currentCount = indiBlob['notificationCount'] || 0;
          const newCount = Math.max(0, currentCount - 1);
          indiBlob.setNotifications(newCount);

          // Update emotion based on new count
          if (newCount === 0) {
            indiBlob.setEmotion('happy');
          } else if (newCount <= 2) {
            indiBlob.setEmotion('calm');
          }

          console.log('🔔 Badge decremented on X close:', currentCount, '→', newCount);
        }
      },
      persistent: false, // Auto-dismiss after 10s
    });
  }
}

/**
 * Extract URLs from cache for onboarding
 */
function getUrlsFromCache(): string[] {
  const urls = new Set<string>();
  
  // Extract URLs from cache keys
  recentCallsCache.forEach((calls, key) => {
    // Key format: "url|METHOD"
    const url = key.split('|')[0];
    
    // Get a sample call to extract full URL
    if (calls.length > 0) {
      try {
        const sampleCall = calls[0];
        const fullUrl = sampleCall?.response?.url || 
                        sampleCall?.url || 
                        sampleCall?.request?.url;
        
        if (fullUrl) {
          const urlObj = new URL(fullUrl);
          const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          urls.add(baseUrl);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });

  return Array.from(urls);
}


function cleanupIndi() {
  document.removeEventListener('indi-blob-clicked', handleBlobClick);
  
  if (indiBlob) {
    indiBlob.destroy();
    indiBlob = null;
  }

  if (speechBubble) {
    speechBubble.destroy();
    speechBubble = null;
  }

  if (pageSummary) {
    pageSummary = null;
  }

  onboardingFlow = null;
  isIndiInitialized = false;
}

// Add cleanup to existing beforeunload
window.addEventListener('beforeunload', () => {
  cleanupIndi();
  clearCache(); // Your existing cache clear
});

// Export for debugging
(window as any).indi = {
  blob: () => indiBlob,
  speech: () => speechBubble,
  onboarding: () => onboardingFlow,
  restart: () => onboardingFlow?.restart(),
  cache: () => recentCallsCache,
  urls: () => getUrlsFromCache(),
};

/**
 * Get insight title based on type
 */
function getInsightTitle(type: string): string {
  const titles: Record<string, string> = {
    error: '🔴 API Error Detected',
    slow: '⚡ Slow Response',
    security: '🔒 Security Issue',
    new_api: '🆕 New API Discovered',
    schema_change: '📊 Schema Changed',
  };

  return titles[type] || '💡 New Insight';
}

/**
 * Cleanup on page unload
 */
function cleanup() {
  document.removeEventListener('indi-blob-clicked', handleBlobClick);
  
  if (indiBlob) {
    indiBlob.destroy();
    indiBlob = null;
  }

  if (speechBubble) {
    speechBubble.destroy();
    speechBubble = null;
  }

  onboardingFlow = null;
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Export for debugging in console
(window as any).indiBlob = indiBlob;


// export const allNetworkCalls: NetworkCall[] = [];
// content.ts - REPLACE allNetworkCalls array with this:
export const recentCallsCache = new Map<string, NetworkCall[]>();
const MAX_CALLS_PER_ENDPOINT = 50;

function addToCache(calls: NetworkCall[]) {
  calls.forEach(call => {
    try {
      // Extract URL from various possible locations
      const url = call?.response?.response?.url ?? 
                  call?.response?.url ?? 
                  call?.request?.request?.url ?? 
                  call?.url;
      
      // Extract method
      const method = call?.request?.request?.method ?? 
                     call?.method ?? 
                     'GET';
      
      if (!url) {
        console.warn('Call without URL, skipping cache', call);
        return;
      }
      
      // Strategy 1: Simple path (ignores most params)
      const simpleKey = generateStoragePath(url) + '|' + method;
      addToCacheKey(simpleKey, call);
      
      // Strategy 2: Pattern-based (includes param names)
      const patternKey = generatePatternBasedStoragePath(url) + '|' + method;
      addToCacheKey(patternKey, call);
      
    } catch (error) {
      console.error('Error adding to cache:', error, call);
    }
  });
}

function addToCacheKey(key: string, call: NetworkCall) {
  const existing = recentCallsCache.get(key) || [];
  
  // Add to front (newest first)
  existing.unshift(call);
  
  // Keep only last 50
  if (existing.length > MAX_CALLS_PER_ENDPOINT) {
    existing.pop(); // Remove oldest
  }
  
  recentCallsCache.set(key, existing);
}

function clearCache() {
  recentCallsCache.clear();
  console.log('🧹 Cache cleared');
}

// Clear cache on navigation
window.addEventListener('beforeunload', clearCache);

createContainers();
injectStyles();
IndicatorLoader.getInstance();

chrome.runtime.sendMessage({
  type: "DEVTOOLS_OPENED",
});

// יצירת מיכל למודל ולאינדיקטורים
function createContainers() {
  modalContainer = document.createElement("div");
  modalContainer.id = "api-mapper-modal-container";
  modalContainer.style.zIndex = "999999"; // ערך גבוה יותר
  modalContainer.style.position = "fixed";
  modalContainer.style.top = "0";
  modalContainer.style.bottom = "0";
  modalContainer.style.left = "0";
  modalContainer.style.right = "0";

  innerModalContainer = document.createElement("div");
  innerModalContainer.id = "inner-modal-container";
  innerModalContainer.style.cssText = `
  position: relative;
  width: 100%;
  height: 100%;
`;

  modalContainer.appendChild(innerModalContainer);
  document.body.appendChild(modalContainer);
}

function createIndicator(data: any, item: any, element: any, name: string, description: string) {
  const callId = item.getAttribute("data-call-id");
  const selectedCall = data.networkCalls.find(
    (call: any) => call.id === callId
  );
  const elementByPath = document.querySelector(element.path);
  const elementBefore = elementByPath.previousElementSibling;
  let originalElementAndElementBeforeAreInline = false;

  if (elementBefore) {
    originalElementAndElementBeforeAreInline = true;
  }

  if (!elementByPath) return;
  const pattern =
    identifyDynamicParams(selectedCall.url) ||
    identifyDynamicParams(window.location.href);

  const rect = element.rect;
  const indicatorData: IndicatorData = {
    id: Date.now().toString(),
    baseUrl: window.location.href,
    method: selectedCall.method ?? selectedCall.request.request.method,
    elementInfo: {
      path: element.path,
      rect: element.rect,
    },
    lastCall: {
      status: selectedCall.status,
      timing: selectedCall?.timing ?? selectedCall?.request?.request?.timing ?? "debug here!",
      timestamp: Date.now(),
      url: selectedCall.url ?? selectedCall.request.request.url,
    },
    position: {
      top: rect.top + window.scrollY,
      left: rect.right + window.scrollX,
    },
    calls: [selectedCall],
    hisDaddyElement: item ?? null,
    name: name || "API Indicator",
    description: description || "No description provided",
  };

  if (pattern !== null && pattern !== undefined) {
    indicatorData.pattern = pattern;
  }

  const indicator = document.createElement("div");
  indicator.className = "indicator";
  indicator.dataset.indicatorId = indicatorData.id;
  indicator.style.cssText = `
          display: inline-block;
          width: 12px;
          height: 12px;
          margin-left: 8px;
          border-radius: 50%;
          background-color: ${
            selectedCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336"
          };
          cursor: pointer;
          z-index: 999999;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          vertical-align: middle;
              position: ${
                !originalElementAndElementBeforeAreInline
                  ? "absolute"
                  : "relative"
              };
          top: 1rem;

        `;

  // Don't add indicator here - it will be added in the storage callback to avoid duplicates

  indicator.addEventListener("click", () => {
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
              position: fixed;
              top: 10rem;
              left: 33%;
              background: #fff;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 13px;
              line-height: 1.4;
              color: #333;
              z-index: 999999;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
              border-left: 3px solid #cf556c;
              transform-origin: center;
          `;

    const durationColor =
      selectedCall.timing.duration < 300
        ? "#4CAF50"
        : selectedCall.timing.duration < 1000
        ? "#FFC107"
        : "#f44336";

    tooltip.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${selectedCall.method}</strong>
              <span style="color: ${durationColor}; font-weight: bold;">
                ${Math.floor(selectedCall.timing.duration)}ms
              </span>
            </div>
            <div style="color: #666; word-break: break-all; margin: 8px 0;">
              ${selectedCall.url}
            </div>
            <div style="color: ${
              selectedCall.status === 200 ? "#4CAF50" : "#f44336"
            }">
              Status: ${
                selectedCall.status === 0 ? "Pending..." : selectedCall.status
              }
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
              Page: ${new URL(window.location.href).pathname}
            </div>
      <button class="create-jira-ticket" style="
        margin-top: 8px;
        padding: 4px 8px;
        background: #0052CC;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 8px;
      ">
        Create Jira Ticket
      </button>
      <button class="remove-indicator">Remove</button>
      <button class="change-position change-indicator-position"> Stick </button>
      <button class="close-indicator-tooltip"> Close </button>
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        Use arrow keys to fine tune your indi's position
      </div>    
          `;

    tooltip
      .querySelector(".remove-indicator")
      ?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        chrome.storage.local.get(["indicators"], (result) => {
          // change this to the new storage structure
          const indicators = result.indicators || {};
          const path = generateStoragePath(window.location.href);
          let currentPageIndicators = indicators[path] || [];
          if (Object.keys(currentPageIndicators).length > 0) {
            currentPageIndicators = currentPageIndicators.filter(
              (ind: IndicatorData) => ind.id !== indicatorData.id
            );
            chrome.storage.local.set({ indicators });
          }
        });
      });

    tooltip.querySelector(".change-position")?.addEventListener("click", () => {
      // toggle position from relative to absolute and vise versa
      const currentPosition = indicator.style.position;
      indicator.style.position =
        currentPosition === "absolute" ? "relative" : "absolute";

      // update the position in the storage
      // get all indicators from storage
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const pathToUpdate = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[pathToUpdate] || [];

        // find the indicator we want to update
        const indicatorToUpdate = currentPageIndicators.find(
          (ind: IndicatorData) => ind.id === indicatorData.id
        );
        // update the position
        indicatorToUpdate.updatedPosition = indicator.style.position;
        // save the updated indicators
        chrome.storage.local.set({ indicators });
      });
    });

    const moveHandler = (e: KeyboardEvent) => {
      const step = 5; // פיקסלים לכל הזזה
      const currentTop = parseInt(indicator.style.top) || 0;
      const currentLeft = parseInt(indicator.style.left) || 0;

      // פעולה רק אם מקש Shift לחוץ יחד עם מקשי החצים
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowUp":
            indicator.style.top = `${currentTop - step}px`;
            break;
          case "ArrowDown":
            indicator.style.top = `${currentTop + step}px`;
            break;
          case "ArrowLeft":
            indicator.style.left = `${currentLeft - step}px`;
            break;
          case "ArrowRight":
            indicator.style.left = `${currentLeft + step}px`;
            break;
        }
      }
      // אם Shift לא לחוץ, לא מתבצעת שום פעולה
    };

    document.addEventListener("keydown", moveHandler);
    tooltip
      .querySelector(".close-indicator-tooltip")
      ?.addEventListener("click", () => {
        document.removeEventListener("keydown", moveHandler);
        tooltip.remove();
      });

    document.body.appendChild(tooltip);
  });

  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    indicators[storagePath] = indicators[storagePath] || [];
    indicators[storagePath].push(indicatorData);
    try {
      chrome.storage.local.set({ indicators }, () => {
        elementByPath.after(indicator);
      });
    } catch (error) {
      console.error("Error saving indicator to storage:", error);
    }
  });
}

// הצגת המודל
function showModal(
  element: {
    data: NetworkCall[];
    id: string;
    path: string;
    rect: any;
    tagName: string;
  },
  data: { networkCalls: NetworkCall[] },
  autoSelect: boolean = false
) {
  if (!modalContainer) createContainers();

  // Clear previous content
  innerModalContainer.innerHTML = "";

  // Create modal overlay
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "api-modal-overlay";
  // Ensure modal has proper z-index and pointer events
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    pointer-events: auto;
  `;

  // Create modal content
  const modalContent = document.createElement("div");
  modalContent.className = "api-modal-content";
  modalContent.style.pointerEvents = "auto";

  // Create header
  const header = createModalHeader();
  modalContent.appendChild(header);

  // If autoSelect mode, skip search and list, go straight to form
  if (!autoSelect) {
    // Create search section
    const searchSection = createSearchSection(data.networkCalls);
    modalContent.appendChild(searchSection);

    // Create calls list
    const callsList = createCallsList(data.networkCalls);
    modalContent.appendChild(callsList);
  }

  // Create form section (initially hidden unless autoSelect)
  const formSection = createFormSection();
  modalContent.appendChild(formSection);

  modalOverlay.appendChild(modalContent);
  innerModalContainer.appendChild(modalOverlay);

  // Setup event listeners
  if (autoSelect && data.networkCalls.length > 0) {
    // Auto-select the first (and only) call and show form immediately
    const selectedCall = data.networkCalls[0];
    formSection.setAttribute('data-selected-call', JSON.stringify(selectedCall));
    formSection.setAttribute('data-element', JSON.stringify(element));
    formSection.setAttribute('data-data', JSON.stringify(data));
    formSection.classList.add('show');

    // Update header to show selected API
    const subtitle = header.querySelector('.api-modal-subtitle');
    if (subtitle) {
      const apiUrl = extractNetworkCallUrl(selectedCall);
      subtitle.textContent = `API: ${apiUrl}`;
    }

    // Focus on name input
    setTimeout(() => {
      const nameInput = formSection.querySelector('#indicator-name') as HTMLInputElement;
      nameInput?.focus();
    }, 100);

    // Pass null for searchSection and callsList since they don't exist in autoSelect mode
    setupModalEventListeners(modalOverlay, null, null, formSection, data.networkCalls, element, data);
  } else {
    const searchSection = modalContent.querySelector('.api-modal-search-section') as HTMLElement;
    const callsList = modalContent.querySelector('.api-modal-calls-list') as HTMLElement;
    setupModalEventListeners(modalOverlay, searchSection, callsList, formSection, data.networkCalls, element, data);
  }
}

function createModalHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "api-modal-header";

  header.innerHTML = `
    <div>
      <h3 class="api-modal-title">Select API Call for Element</h3>
      <p class="api-modal-subtitle">Choose which network request to associate with this element</p>
    </div>
    <button class="api-modal-close" id="close-modal">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  return header;
}

function createSearchSection(networkCalls: NetworkCall[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "api-modal-search-section";

  section.innerHTML = `
    <div class="api-modal-search-container" id="search-container">
      <svg class="api-modal-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input 
        type="text" 
        class="api-modal-search-input" 
        id="search-calls"
        placeholder="Search API calls..." 
      />
    </div>
    <div class="api-modal-results-count" id="results-count">
      Showing ${networkCalls.length} of ${networkCalls.length} API calls
    </div>
  `;

  return section;
}

function createCallsList(networkCalls: NetworkCall[]): HTMLElement {
  const listContainer = document.createElement("div");
  listContainer.className = "api-modal-calls-list";
  listContainer.id = "calls-list";

  if (networkCalls.length === 0) {
    listContainer.innerHTML = `
      <div class="api-modal-empty-state">
        <svg class="api-modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <p style="font-size: 18px; margin-bottom: 8px;">No API calls found</p>
        <p style="font-size: 14px;">Try adjusting your search or filters</p>
      </div>
    `;
  } else {
    renderCallItems(listContainer, networkCalls);
  }

  return listContainer;
}

/**
 * Extract URL from NetworkCall - handles various data structures
 */
function extractNetworkCallUrl(call: NetworkCall): string {
  return call?.response?.response?.url ??
         call?.response?.url ??
         call?.request?.request?.url ??
         call?.url ??
         'Unknown URL';
}

/**
 * Extract HTTP method from NetworkCall - handles various data structures
 */
function extractNetworkCallMethod(call: NetworkCall): string {
  return call?.request?.request?.method ??
         call?.method ??
         'GET';
}

function renderCallItems(container: HTMLElement, calls: NetworkCall[]) {
  container.innerHTML = calls.map(call => createCallItemHTML(call)).join('');
}

function createCallItemHTML(call: NetworkCall): string {
  const isSuccess = call.status >= 200 && call.status < 300;
  const url = extractNetworkCallUrl(call);
  const method = extractNetworkCallMethod(call);
  const methodClass = `api-call-badge-${method.toLowerCase()}`;
  const statusClass = isSuccess ? 'api-call-badge-success' : 'api-call-badge-error';
  const indicatorClass = isSuccess ? 'api-call-status-success' : 'api-call-status-error';

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
    }
  };

    console.log('🆔 Creating item for call:', {
    id: call.id,
    requestId: call.request?.requestId,
    fullCall: call
  });

  return `
    <div class="api-call-item" data-call-id="${call.id}">
      <div class="api-call-content">
        <div class="api-call-info">
          <div class="api-call-badges">
            <span class="api-call-badge ${methodClass}">${method}</span>
            <span class="api-call-badge ${statusClass}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isSuccess
                  ? '<path d="M9 12l2 2 4-4"></path><circle cx="12" cy="12" r="10"></circle>'
                  : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
                }
              </svg>
              ${call.status}
            </span>
          </div>
          <div class="api-call-url-main">${formatUrl(url)}</div>
          <div class="api-call-url-full">${url}</div>
        </div>
        <div class="api-call-status-indicator ${indicatorClass}"></div>
      </div>
    </div>
  `;
}

function createFormSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "api-modal-form-section";
  section.id = "form-section";

  section.innerHTML = `
    <input 
      type="text" 
      class="api-modal-form-input" 
      id="indicator-name"
      placeholder="Indicator Name *" 
    />
    <textarea 
      class="api-modal-form-textarea" 
      id="indicator-description"
      placeholder="Indicator Description"
    ></textarea>
    <div class="api-modal-form-buttons">
      <button class="api-modal-btn api-modal-btn-secondary" id="form-cancel">Cancel</button>
      <button class="api-modal-btn api-modal-btn-primary" id="form-create">Create Indicator</button>
    </div>
  `;

  return section;
}

// Setup event listeners
function setupModalEventListeners(
  modalOverlay: HTMLElement,
  searchSection: HTMLElement | null,
  callsList: HTMLElement | null,
  formSection: HTMLElement,
  networkCalls: NetworkCall[],
  element: any,
  data: any
) {
  // Close modal
  const closeBtn = modalOverlay.querySelector('#close-modal');
  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    modalOverlay.remove();
  });

  // Click outside to close - only on the overlay itself, not its children
  modalOverlay.addEventListener('click', (e) => {
    // Only close if clicking directly on the overlay (not bubbled from children)
    if (e.target === modalOverlay) {
      modalOverlay.remove();
    }
  });

  // Prevent clicks inside modal from closing it
  const modalContent = modalOverlay.querySelector('.api-modal-content');
  modalContent?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Search functionality - only if searchSection exists (not in autoSelect mode)
  if (searchSection && callsList) {
    const searchInput = searchSection.querySelector('#search-calls') as HTMLInputElement;
    const searchContainer = searchSection.querySelector('#search-container');
    const resultsCount = searchSection.querySelector('#results-count');

    searchInput?.addEventListener('focus', () => {
      searchContainer?.classList.add('focused');
    });

    searchInput?.addEventListener('blur', () => {
      searchContainer?.classList.remove('focused');
    });

    searchInput?.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
      const filteredCalls = networkCalls.filter(call => {
        const url = extractNetworkCallUrl(call);
        const method = extractNetworkCallMethod(call);
        return url.toLowerCase().includes(searchTerm) || method.toLowerCase().includes(searchTerm);
      });

      renderCallItems(callsList, filteredCalls);
      if (resultsCount) {
        resultsCount.textContent = `Showing ${filteredCalls.length} of ${networkCalls.length} API calls`;
      }

      // Re-attach click listeners to new items
      attachCallItemListeners(callsList, networkCalls, formSection, element, data);
    });

    // Initial call item listeners
    attachCallItemListeners(callsList, networkCalls, formSection, element, data);
  }

  // Form listeners
  setupFormListeners(formSection, modalOverlay);
}

function attachCallItemListeners(
  callsList: HTMLElement, 
  networkCalls: NetworkCall[], 
  formSection: HTMLElement,
  element: any,
  data: any,
) {
  const callItems = callsList.querySelectorAll('.api-call-item');
  callItems.forEach(item => {
    item.addEventListener('click', () => {
      const callId = item.getAttribute('data-call-id');
      const selectedCall = networkCalls.find(call => call.id === callId);
      
      if (selectedCall) {
        // Store selected call data for form submission
        formSection.setAttribute('data-selected-call', JSON.stringify(selectedCall));
        formSection.setAttribute('data-element', JSON.stringify(element));
        formSection.setAttribute('data-data', JSON.stringify(data));
        
        // Show form section
        formSection.classList.add('show');
        
        // Focus on name input
        const nameInput = formSection.querySelector('#indicator-name') as HTMLInputElement;
        setTimeout(() => nameInput?.focus(), 100);
      }
    });
  });
}

function setupFormListeners(formSection: HTMLElement, modalOverlay: HTMLElement) {
  const cancelBtn = formSection.querySelector('#form-cancel');
  const createBtn = formSection.querySelector('#form-create');
  const nameInput = formSection.querySelector('#indicator-name') as HTMLInputElement;
  const descInput = formSection.querySelector('#indicator-description') as HTMLTextAreaElement;

  cancelBtn?.addEventListener('click', () => {
    formSection.classList.remove('show');
    nameInput.value = '';
    descInput.value = '';
  });

  createBtn?.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!name) {
      nameInput.style.borderColor = '#dc2626';
      nameInput.focus();
      return;
    }

    // Get stored data
    const selectedCall = JSON.parse(formSection.getAttribute('data-selected-call') || '{}');
    const element = JSON.parse(formSection.getAttribute('data-element') || '{}');
    const data = JSON.parse(formSection.getAttribute('data-data') || '{}');

    // Create indicator (your existing function)
    createIndicator(data, { getAttribute: () => selectedCall.id }, element, name, description);

    // Close modal
    modalOverlay.remove();
  });

  // Enter key to submit
  nameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      (createBtn as HTMLElement)?.click();
    }
  });
}


export async function createJiraTicketFromIndicator(data: any) {
  chrome.storage.local.get(['userData'], (result: any) => { 
    const userData = result.userData || {};
    chrome.runtime.sendMessage(
      {
        type: "CREATE_JIRA_TICKET",
        data: {userData, data},
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          return;
        }
        if (response?.success) {
          Swal.fire({
            title: "Ticket Created",
            text: `Ticket created successfully! ID: ${response.data.key}`,
            icon: "success",
            confirmButtonText: "OK",
          });

        } else {
          Swal.fire({
            title: "Error",
            text: `Failed to create ticket: ${response?.error}`,
            icon: "error",
            confirmButtonText: "OK",
          });
        }
      }
    );
  })
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener( async (message, sender, sendResponse) => {
  console.log({ message, sender, sendResponse }, "message from panel to content script");
  switch (message.type) {
    case "START_INSPECT_MODE":
      enableInspectMode();
      break;

    case "RELOAD_INDICATORS": 
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const path = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[path] || [];
        // Do something with currentPageIndicators
        // console.log({ currentPageIndicators }, "currentPageIndicators on reload");
        currentPageIndicators.forEach((indicator: IndicatorData) => {
          createIndicatorFromData(indicator);
        });
      });
      break;  

    case "NAVIGATE_TO_INDICATOR":
      const { data } = message;
      window.location.href = window.location.origin + data.baseUrl;
      const indicator = await waitForIndicator(data.id);
      
      // lets click the indicator to show the tooltip
      if (indicator) {
        (indicator as HTMLElement).click();
      } else {
        console.error("Indicator not found:", data.id);
      }
        

      break;

    case 'SET_EMOTION':
      // Manually set emotion (for testing or specific events)
      if (indiBlob && message.emotion) {
        indiBlob.setEmotion(message.emotion);
      }
      break;

    case 'RESTART_ONBOARDING':
      if (onboardingFlow) {
        onboardingFlow.restart();
      }
    break;

    case 'GET_NETWORK_CALLS':
      // Background is requesting network calls (for onboarding)
      // We don't have them here, background should respond
      sendResponse({ networkCalls: [] });
      break;

    case "NETWORK_IDLE": {
      if (message.requests.length === 0) {
        return;
      };
      
      // Add to cache instead of array
      addToCache(message.requests);
      
      // Initialize Indi on first NETWORK_IDLE
      if (!isIndiInitialized) {
        initializeIndi(message.requests);
      } else {
        // Already initialized, just analyze
        // only analyze if indi blob is connected to this page - which means finished onboarding
        analyzeNetworkForIndi(message.requests);
      }
      
      
      const monitor = IndicatorMonitor.getInstance();
      monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache, message.requests);
      
      // lets check if we have any indicators that did not update
      const failedIndicators: any[] = [];
      const allIndicators = document.querySelectorAll(".indicator");
      allIndicators.forEach((indicator) => {
        const indicatorIsUpdated = indicator.getAttribute(
          "data-indicator-info"
        );
        if (!indicatorIsUpdated) {
          failedIndicators.push(indicator);
          if (failedIndicators.length > 0) {
            monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache, message.requests);
          }
          // chrome.runtime.sendMessage({
          //   type: "INDICATOR_FAILED",
          //   data: { failedIndicators, message },
          // });
        }
      });
      break;
    }

    case "STOP_INSPECT_MODE":
      enableInspectMode();
      break;

    case "SHOW_API_MODAL":
      const { element, networkCalls } = message.data;
      showModal(element, { networkCalls });
      break;

    case "CLEAR_INDICATORS":
      // This here depends on my current url! so I need to get the current url and delete the indicators according to it
      // according to wheather it is a full path or a path like DASHBOAR, ACCESS, etc...
      Swal.fire({
        title: "Clear All Indicators",
        text: "Are you sure you want to clear all indicators? This action cannot be undone.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, clear them",
        cancelButtonText: "No, keep them",
      }).then((result) => {
        if (result.isConfirmed) {
          clearAllIndicators();
        }
      }
      );

      function clearAllIndicators() {
        document.querySelectorAll(".indicator")?.forEach((indicator) => {
          indicator.remove();
        });
        // lets check if the url has a uuid in it
  
        chrome.storage.local.get(["indicators"], (result) => {
          let indicators = result.indicators || {};
          // lets delete all the indicators in storage
          indicators = {};
          chrome.storage.local.set({ indicators });
        });
      }
      break;

    // case "NETWORK_RESPONSE":
    //   console.log("network response", message.data);
    //   break;

    case "CLEAR_CURRENT_URL_INDICATORS":
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        // console.log(
        //   indicators["Dashboard"],
        //   "this is the data i want to delete"
        // );
        delete indicators["Dashboard"];
        chrome.storage.local.set({ indicators });
      });
      break;

    case "TOGGLE_INDICATORS": {
      const indicators = document.querySelectorAll(".indicator");
      indicators?.forEach((indicator) => {
        const currentDisplay = window.getComputedStyle(indicator).display;
        (indicator as HTMLElement).style.display =
          currentDisplay === "none" ? "inline-block" : "none";
      });
      break;
    }

    case "TOGGLE_RECORD_BUTTON": {
      // console.log("toggle record button", message.data);
      const recordButton = document.getElementById("indi-recorder-button");
      if (recordButton) {
        // lets toggle the style display
        recordButton.style.display =
          recordButton.style.display === "none" ? "block" : "none";
      } else {
        console.error("Record button not found in the DOM.");
      }
      break;
    }

    case "DELETE_INDICATOR": {
      // lets remove the indicator from storage
      const indicatorId = message.data;
      const path = generateStoragePath(message.data);
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const currentPageIndicators = indicators[path] || [];
        const updatedIndicators = currentPageIndicators.filter(
          (ind: IndicatorData) => ind.id !== indicatorId
        );
        indicators[path] = updatedIndicators;
        chrome.storage.local.set({ indicators });
      });
      // lets also remove the indicator from the dom
      const indicator = document.getElementById(`indi-${indicatorId}`);
      if (indicator) {
        indicator.remove();
      }
      break;
    }

    case "UPDATE_INDICATORS":
      // console.log("update indicators", message);
      updateRelevantIndicators(message.data);
      break;

    case "NEW_NETWORK_CALL":
      // console.log("new network call", message.data);
      updateRelevantIndicators(message.data);
      break;
  }

  return false;
});

function updateRelevantIndicators(newCall: NetworkCall) {
  const currentPageIndicators = pageIndicators || [];

  let hasUpdates = false;
  currentPageIndicators?.forEach(async (indicator: IndicatorData) => {
    try {
      const indicatorUrl = new URL(indicator?.lastCall?.url);
      const newCallUrl = new URL(newCall.url);

      // console.log("Comparing URLs:", {
      //   indicator: indicatorUrl.pathname,
      //   newCall: newCallUrl.pathname,
      // });

      // if (indicator.lastCall.url.includes("screening")) {
      //   console.log("screening indicator", indicator);
      // }

      if (
        indicator?.method === newCall.method &&
        generateStoragePath(indicator?.lastCall?.url) ===
          generateStoragePath(newCall.url)
      ) {
        // console.log("Found matching indicator:", indicator);
        // console.log(
        //   "comparison paths",
        //   generateStoragePath(indicator?.lastCall?.url),
        //   generateStoragePath(newCall.url)
        // );

        // עדכון המידע
        indicator.lastCall = {
          ...indicator.lastCall,
          status: newCall.status,
          timing: newCall.timing,
          timestamp: Date.now(),
          url: newCall.url, // שומרים את ה-URL המלא החדש,
          updatedInThisRound: true,
        };
        if (indicator.calls.length) {
          indicator.calls.push(newCall);
        } else {
          indicator.calls = [newCall];
        }

        // const indicatorElement = document.getElementById(
        //   `indi-${indicator.id}`
        // );

        const indicatorElement = await waitForIndicator(indicator.id);
        if (!indicatorElement) return;
        // console.log("Found indicator element:", indicatorElement);

        if (indicatorElement) {
          indicatorElement.classList.add("indicator-updating");
          setTimeout(() => {
            indicatorElement.classList.remove("indicator-updating");
          }, 500);

          (indicatorElement as HTMLElement).style.backgroundColor =
            newCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336";

          // שמירת המידע המעודכן על האלמנט
          const updatedData = {
            ...indicator,
            lastUpdated: Date.now(),
          };

          // console.log("Updated data in update relevant field:", updatedData);

          indicatorElement.setAttribute(
            "data-indicator-info",
            JSON.stringify(updatedData)
          );

          // עדכון הטולטיפ אם הוא פתוח
          const openTooltip = document.getElementById("indicator-tooltip");
          if (openTooltip) {
            updateTooltipContent(openTooltip, updatedData);
          }
          (indicatorElement as HTMLElement).style.transform = "scale(1.2)";
          setTimeout(() => {
            (indicatorElement as HTMLElement).style.transform = "scale(1)";
          }, 200);

          hasUpdates = true;
        } else {
          const indicatorSecondAttempt = document.getElementById(
            `indi-${indicator.id}`
          );

        }
      }
    } catch (error) {
      console.error("Error processing indicator:", error);
    }
  });
}

// פונקציה חדשה לעדכון תוכן הטולטיפ
function updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
  // console.log("lets update our indicator", data);
  const durationColor =
    data.lastCall.timing.duration < 300
      ? "#4CAF50"
      : data.lastCall.timing.duration < 1000
      ? "#FFC107"
      : "#f44336";

  // עדכון זמן תגובה
  const durationSpan = tooltip.querySelector("span");
  if (durationSpan) {
    durationSpan.textContent = `${Math.floor(data.lastCall.timing.duration)}ms`;
    durationSpan.style.color = durationColor;
  }

  // עדכון סטטוס
  const statusDiv = tooltip.querySelector("div:nth-child(3)");
  if (statusDiv) {
    statusDiv.textContent = `Status: ${data.lastCall.status}`;
    (statusDiv as HTMLElement).style.color =
      data.lastCall.status === 200 ? "#4CAF50" : "#f44336";
  }
}

function createHighlighter() {
  highlighter = document.createElement("div");
  highlighter.id = "element-highlighter";
  highlighter.style.position = "fixed";
  highlighter.style.border = "2px solid #0088ff";
  highlighter.style.backgroundColor = "rgba(0, 136, 255, 0.1)";
  highlighter.style.pointerEvents = "none";
  highlighter.style.zIndex = "10000";
  highlighter.style.display = "none";
  document.body.appendChild(highlighter);
}

function enableInspectMode(indicatorData?: any) {
  // BYPASS: Skip domain validation - allow inspect mode on any domain
  isInspectMode = true;
  document.body.style.cursor = "crosshair";
  createHighlighter();

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  if (indicatorData) {
    // createIndicatorFromData(indicatorData)
    document.addEventListener("click", handleIndiBlobRef, true);
  } else {
    document.addEventListener("click", handleClick, true);
  }
}

function handleMouseOver(e: MouseEvent) {
  if (!isInspectMode || !highlighter) return;

  const target = e.target as Element;
  hoveredElement = target;

  // עדכון המסגרת המודגשת
  const rect = target.getBoundingClientRect();
  highlighter.style.display = "block";
  highlighter.style.top = `${window.scrollY + rect.top}px`;
  highlighter.style.left = `${window.scrollX + rect.left}px`;
  highlighter.style.width = `${rect.width}px`;
  highlighter.style.height = `${rect.height}px`;
}

function handleMouseOut() {
  if (!isInspectMode || !highlighter) return;
  highlighter.style.display = "none";
}

function handleClick(e: MouseEvent) {
  if (!isInspectMode) return;

  e.preventDefault();
  e.stopPropagation();

  if (hoveredElement) {
    const data = {
        tagName: hoveredElement.tagName,
        id: hoveredElement.id,
        className: hoveredElement.className,
        path: getElementPath(hoveredElement),
        rect: hoveredElement.getBoundingClientRect(),
      }
    // שליחת מידע על האלמנט שנבחר
    chrome.runtime.sendMessage({
      type: "ELEMENT_SELECTED",
      data
    });

    // lets add here the showModal
    const cachedCalls = Array.from(recentCallsCache.values()).flat();

    // Ensure calls have IDs for modal display (don't modify cache, just create new array)
    const callsWithIds = cachedCalls.map((call, index) => {
      if (call.id) return call;
      return {
        ...call,
        id: call.request?.requestId || `modal-${Date.now()}-${index}`
      };
    });

    console.log({ cachedCalls, callsWithIds }, "cached Calls in SHOW_API_MODAL");
    showModal({data: callsWithIds, id: data.id, path: getElementPath(hoveredElement), rect: hoveredElement.getBoundingClientRect(), tagName: hoveredElement.tagName}, { networkCalls: callsWithIds });


  }

  disableInspectMode();
}

function handleIndiBlobRef(e: MouseEvent) {
  if (!isInspectMode) return;
  e.preventDefault();
  e.stopPropagation();

  if (hoveredElement) {
    const data =  {
        tagName: hoveredElement.tagName,
        id: hoveredElement.id,
        className: hoveredElement.className,
        path: getElementPath(hoveredElement),
        rect: hoveredElement.getBoundingClientRect(),
    };
    // Build element param to satisfy showModal's required shape
    const elementParam = {
      ...data,
      id: data.id || '',
      data: [] as NetworkCall[],
    };

    // Get the full NetworkCall data that was stored by the event listener
    const storedNetworkCall = (window as any).__indiBlobNetworkCall as NetworkCall | null;

    // Build NetworkCall array with complete data
    let networkCalls: NetworkCall[] = [];

    if (storedNetworkCall) {
      // Use the complete network call data from cache
      console.log('✅ Using complete network call data:', storedNetworkCall);
      networkCalls = [storedNetworkCall];
    } else if (indiBlobUrlWithIssue) {
      // Fallback: try to find it again in the cache using safe helper
      console.log('⚠️ No stored network call, searching cache again...');
      const foundCall = findNetworkCallInCache(indiBlobUrlWithIssue);

      if (foundCall) {
        networkCalls = [foundCall];
        console.log('✅ Found network call in cache:', foundCall);
      } else {
        // Last resort: create minimal call
        console.warn('⚠️ Creating minimal network call as fallback');
        networkCalls = [{
          id: 'external-1',
          url: indiBlobUrlWithIssue,
          method: 'GET',
          status: 0,
          timing: { duration: 0 },
          timestamp: Date.now(),
          request: {},
          response: {},
        } as NetworkCall];
      }
    }

    // Disable inspect mode before showing modal
    disableInspectMode();

    // Show modal with auto-select flag
    showModal(elementParam, { networkCalls }, true);
  }
}

function disableInspectMode() {
  isInspectMode = false;
  document.body.style.cursor = "default";
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("mouseout", handleMouseOut);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("click", handleIndiBlobRef, true);

  if (highlighter) {
    highlighter.remove();
    highlighter = null;
  }

  // Clean up stored data
  indiBlobUrlWithIssue = null;
  delete (window as any).__indiBlobNetworkCall;
}

// content.ts

console.log("Content script loaded");
