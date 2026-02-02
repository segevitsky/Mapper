// import { JiraTicketData } from "../services/jiraService";
import { IndicatorData, NetworkCall } from "../types";
// import { analyzeSecurityIssues } from "../utils/securityAnalyzer";
import { generatePatternBasedStoragePath, generateStoragePath } from "../utils/storage";
import { getNetworkCallUrl, getNetworkCallMethod, getNetworkCallDuration } from "./utils/networkCallUtils";
import { identifyDynamicParams } from "../utils/urlUrils";
import { SecurityEngine } from "../utils/securityEngine";
import { SecurityIssue } from "../types/security";
import { consoleCapture } from './services/consoleCapture';




// Prevent content script from running multiple times
if ((window as any).__INDI_CONTENT_SCRIPT_LOADED__) {
  console.warn('⚠️ Indi content script already loaded, preventing duplicate initialization');
  throw new Error('Content script already loaded');
}
(window as any).__INDI_CONTENT_SCRIPT_LOADED__ = true;

// Track if this tab is currently visible
let isTabVisible = !document.hidden;
import { IndicatorMonitor } from "./services/indicatorMonitor";
import { IndicatorLoader } from "./services/indicatorLoader";
import {
  getElementPath,
  injectStyles,
  pageIndicators,
  createIndicatorFromData,
  makeDraggable,
} from "./services/indicatorService"
import { waitForIndicator } from "../utils/general";
import Swal from "sweetalert2";
import { IndiBlob } from './blob/indiBlob';
import { SpeechBubble } from './blob/speechBubble';
import { OnboardingFlow } from './blob/onboarding';
import { PageSummary, PageSummaryData } from './blob/PageSummary';
import { flowRecorder } from './services/flowRecorder';
import { FlowStorage } from './services/flowStorage';
import { flowPlayer } from './services/flowPlayer';
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
let slowCallThreshold: number = 1000; // Default slow call threshold, loaded from storage
let securityEngine: SecurityEngine | null = null; // Security analysis engine

/**
 * Load slow call threshold from storage
 */
async function loadSlowCallThreshold() {
  try {
    const settings = await chrome.storage.local.get(['slowCallThreshold']);
    if (settings.slowCallThreshold) {
      slowCallThreshold = settings.slowCallThreshold;
      // Update pageSummary threshold if it exists
      if (pageSummary) {
        pageSummary.setSlowCallThreshold(slowCallThreshold);
      }
    }
  } catch (error) {
    console.error('Failed to load slow call threshold:', error);
  }
}

/**
 * Initialize security engine with context
 */
async function initializeSecurityEngine(): Promise<void> {
  try {
    const hostname = window.location.hostname;

    // Get configured backend URL
    const key = `indi_onboarding_${hostname}`;
    const result = await chrome.storage.local.get([key]);
    const configuredBackend = result[key]?.selectedBackendUrl || null;

    // Create security engine with context
    securityEngine = new SecurityEngine({
      hostname,
      configuredBackend,
    });
  } catch (error) {
    console.error('Failed to initialize security engine:', error);
  }
}

async function initializeIndi(networkData: NetworkCall[]) {
  if (networkData) {
    console.log({ networkData });
  }
  if (isIndiInitialized) return;

  // Set flag immediately to prevent race conditions from multiple NETWORK_IDLE messages
  isIndiInitialized = true;

  try {

    // 1. Create Indi blob
    indiBlob = new IndiBlob();
    await indiBlob.loadPosition();

    // 2. Create speech bubble
    speechBubble = new SpeechBubble();
    indiBlob.setSpeechBubble(speechBubble);
    speechBubble.setIndiBlob(indiBlob); // Allow SpeechBubble to check mute state

    // 3. Create page summary analyzer
    pageSummary = new PageSummary();

    // Expose pageSummary on window for IndiBlob access
    (window as any).pageSummary = pageSummary;

    // 3.5. Load slow call threshold from storage
    await loadSlowCallThreshold();

    // 3.6. Initialize security engine
    await initializeSecurityEngine();

    // 3.7. Initialize console error capture (importing it initializes it)
    consoleCapture; // Just referencing it to ensure it's imported

    // 4. Create onboarding flow
    onboardingFlow = new OnboardingFlow(indiBlob, speechBubble);
    // await onboardingFlow.startWithNetworkData(networkData);

    // 5. Set up event listeners
    setupIndiEventListeners();

    // Flag already set at start - initialization complete
  } catch (error) {
    console.error('Failed to initialize Indi components:', error);
    // Reset flag on failure to allow retry
    isIndiInitialized = false;
  }
}

/**
 * Helper function to check if a URL is a static asset (not an API call)
 */
function isStaticAsset(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const staticExtensions = [
      '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
      '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map',
      '.webp', '.avif', '.mp4', '.webm', '.mp3', '.wav',
      '.pdf', '.zip', '.tar', '.gz'
    ];

    // Filter source files (.tsx, .ts, .jsx, .js from /src/)
    if (pathname.endsWith('.tsx') || pathname.endsWith('.ts') ||
        pathname.endsWith('.jsx') || pathname.endsWith('.mjs')) {
      return true;
    }

    // Filter webpack/vite dev server requests
    if (pathname.includes('/src/') || pathname.includes('/@vite') ||
        pathname.includes('/@react-refresh') || pathname.includes('/node_modules/')) {
      return true;
    }

    return staticExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Check if a network call should be stored based on backend config
 */
async function shouldStoreCall(url: string): Promise<boolean> {
  // Filter out extension URLs (chrome-extension://, moz-extension://, etc.)
  if (url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('safari-extension://') ||
      url.startsWith('edge-extension://')) {
    return false;
  }

  // Filter out static assets immediately
  if (isStaticAsset(url)) {
    return false;
  }

  // Check onboarding state
  const key = `indi_onboarding_${window.location.hostname}`;
  const result = await chrome.storage.local.get([key]);
  const onboardingState = result[key];

  // CASE 1: Onboarding not started OR not completed yet
  // → Store ALL non-static calls (user needs to see them to select backend)
  if (!onboardingState || !onboardingState.completed) {
    return true; // ✅ Store everything during onboarding
  }

  // CASE 2: Onboarding completed, backend configured
  // → Only store calls matching the configured backend
  const backendUrl = onboardingState.selectedBackendUrl;

  if (!backendUrl) {
    // Onboarding says completed but no backend URL? Allow for safety
    return true;
  }

  // Only store if URL starts with configured backend
  return url.startsWith(backendUrl);
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
        // console.log('✅ Found API call in cache:', { url: cachedUrl, method, call: foundCall });
      }
    } catch (error) {
      console.error('Error processing cache key:', key, error);
    }
  });

  return foundCall;
}

// listen to create indi events
document.addEventListener('indi-create-indicator', async (e: Event) => {
  const customEvent = e as CustomEvent<{ apiUrl: string; duration?: number; fullSummary?: any }>;
  const { apiUrl, duration, fullSummary } = customEvent.detail;

  // Try to find the full NetworkCall data from cache using the safe helper
  const fullNetworkCall = findNetworkCallInCache(apiUrl);
  // Store the URL and full data for later use
  indiBlobUrlWithIssue = apiUrl;
  (window as any).__indiBlobNetworkCall = fullNetworkCall; // Store for handleIndiBlobRef

  enableInspectMode(apiUrl);
});


document.addEventListener('indi-badge-clicked', (e: Event) => {
  // cast the generic Event to our CustomEvent with the expected detail shape
  const customEvent = e as CustomEvent<{ count: number; summaryData: PageSummaryData }>;
  const { count, summaryData } = customEvent.detail;

  // Show detailed modal with all issues listed individually
  if (issuesSummary) {
    showDetailedIssuesModal(issuesSummary);
  } else {
    console.warn('Badge clicked but no summary data available');
  }
});


document.addEventListener('indi-create-indicator-from-summary', async () => {
  enableInspectMode();
});


// ========== IMPORT/EXPORT INDICATORS ==========

interface IndicatorExport {
  version: string;
  exportedAt: string;
  source: string;
  indicators: Record<string, any[]>;
}

/**
 * Export all indicators to a JSON file
 */
async function handleExportIndicators(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['indicators']);
    const indicators = result.indicators || {};

    const totalIndicators = Object.values(indicators).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

    if (totalIndicators === 0) {
      await Swal.fire({
        icon: 'info',
        title: 'No Indicators',
        text: 'There are no indicators to export.',
        customClass: { popup: 'jira-popup' }
      });
      return;
    }

    const exportData: IndicatorExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      source: window.location.origin,
      indicators
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const filename = `indi-indicators-${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await Swal.fire({
      icon: 'success',
      title: 'Export Complete!',
      text: `Exported ${totalIndicators} indicators to ${filename}`,
      timer: 2000,
      showConfirmButton: false,
      customClass: { popup: 'jira-popup' }
    });
  } catch (error) {
    console.error('Export failed:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Export Failed',
      text: 'Something went wrong during export.',
      customClass: { popup: 'jira-popup' }
    });
  }
}

/**
 * Import indicators from a JSON file
 */
async function handleImportIndicators(): Promise<void> {
  // Create file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';

  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate structure
      let indicators: Record<string, any[]>;

      if (data.version && data.indicators) {
        // New format with metadata
        indicators = data.indicators;
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        // Legacy format - raw indicators object
        indicators = data;
      } else {
        throw new Error('Invalid format');
      }

      // Validate indicators have proper structure
      const paths = Object.keys(indicators);
      if (paths.length === 0) {
        throw new Error('No indicators found in file');
      }

      let totalIndicators = 0;
      const pathSummary: { path: string; count: number }[] = [];

      for (const path of paths) {
        const pathIndicators = indicators[path];
        if (!Array.isArray(pathIndicators)) {
          throw new Error(`Invalid data for path: ${path}`);
        }
        pathSummary.push({ path, count: pathIndicators.length });
        totalIndicators += pathIndicators.length;
      }

      // Show selection modal
      await showImportSelectionModal(indicators, pathSummary, totalIndicators, data.exportedAt);
    } catch (error) {
      console.error('Import failed:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Import Failed',
        html: `
          <p style="margin-bottom: 12px;">Could not parse the file.</p>
          <p style="font-size: 13px; color: #6b7280;">Make sure it's a valid Indi indicators export file.</p>
        `,
        customClass: { popup: 'jira-popup' }
      });
    }
  };

  fileInput.click();
}

/**
 * Show import selection modal
 */
async function showImportSelectionModal(
  indicators: Record<string, any[]>,
  pathSummary: { path: string; count: number }[],
  totalIndicators: number,
  exportedAt?: string
): Promise<void> {
  const pathsHtml = pathSummary
    .sort((a, b) => b.count - a.count)
    .map((p) => `
      <label style="
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: #f9fafb;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#8b5cf6'" onmouseout="this.style.borderColor=this.querySelector('input').checked ? '#8b5cf6' : '#e5e7eb'">
        <input
          type="checkbox"
          name="import-path"
          value="${p.path}"
          checked
          style="width: 18px; height: 18px; accent-color: #8b5cf6;"
        />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.path}">
            ${formatPath(p.path)}
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${p.path}</div>
        </div>
        <span style="
          background: linear-gradient(to right, #8b5cf6, #7c3aed);
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        ">${p.count}</span>
      </label>
    `).join('');

  const result = await Swal.fire({
    title: '📤 Import Indicators',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: left;">
        <!-- Summary -->
        <div style="background: linear-gradient(to right, #f3e8ff, #ede9fe); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-weight: 600; color: #6b21a8;">
            ${totalIndicators} indicators in ${pathSummary.length} paths
          </div>
          ${exportedAt ? `<div style="font-size: 12px; color: #7c3aed; margin-top: 4px;">Exported: ${new Date(exportedAt).toLocaleString()}</div>` : ''}
        </div>

        <!-- Path Selection -->
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #374151;">Select paths to import:</span>
            <div>
              <button type="button" id="import-select-all" style="background: none; border: none; color: #8b5cf6; font-size: 12px; cursor: pointer; font-weight: 600;">Select All</button>
              <span style="color: #d1d5db; margin: 0 4px;">|</span>
              <button type="button" id="import-select-none" style="background: none; border: none; color: #8b5cf6; font-size: 12px; cursor: pointer; font-weight: 600;">Select None</button>
            </div>
          </div>
          <div style="max-height: 250px; overflow-y: auto; padding-right: 8px;">
            ${pathsHtml}
          </div>
        </div>

        <!-- Import Mode -->
        <div style="margin-bottom: 8px;">
          <span style="font-weight: 600; color: #374151; display: block; margin-bottom: 8px;">Import mode:</span>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <label style="
              display: flex;
              flex-direction: column;
              padding: 12px;
              background: #ecfdf5;
              border: 2px solid #10b981;
              border-radius: 8px;
              cursor: pointer;
            ">
              <input type="radio" name="import-mode" value="merge" checked style="margin-bottom: 6px; accent-color: #10b981;" />
              <span style="font-weight: 600; color: #065f46;">Merge</span>
              <span style="font-size: 11px; color: #047857;">Add new, skip duplicates</span>
            </label>
            <label style="
              display: flex;
              flex-direction: column;
              padding: 12px;
              background: #fff7ed;
              border: 2px solid #f59e0b;
              border-radius: 8px;
              cursor: pointer;
            ">
              <input type="radio" name="import-mode" value="overwrite" style="margin-bottom: 6px; accent-color: #f59e0b;" />
              <span style="font-weight: 600; color: #92400e;">Overwrite</span>
              <span style="font-size: 11px; color: #b45309;">Replace existing paths</span>
            </label>
          </div>
        </div>
      </div>
    `,
    width: '550px',
    showCancelButton: true,
    confirmButtonText: 'Import',
    cancelButtonText: 'Cancel',
    customClass: {
      popup: 'jira-popup',
      confirmButton: 'swal2-confirm-custom',
    },
    didOpen: (popup) => {
      const confirmBtn = Swal.getConfirmButton();
      if (confirmBtn) {
        confirmBtn.style.cssText = `
          background: linear-gradient(to right, #8b5cf6, #7c3aed) !important;
          border: none !important;
          padding: 12px 24px !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
        `;
      }

      // Select all/none handlers
      popup.querySelector('#import-select-all')?.addEventListener('click', () => {
        popup.querySelectorAll('input[name="import-path"]').forEach((cb: any) => cb.checked = true);
      });
      popup.querySelector('#import-select-none')?.addEventListener('click', () => {
        popup.querySelectorAll('input[name="import-path"]').forEach((cb: any) => cb.checked = false);
      });
    },
    preConfirm: () => {
      const selectedPaths = Array.from(document.querySelectorAll('input[name="import-path"]:checked'))
        .map((cb: any) => cb.value);
      const mode = (document.querySelector('input[name="import-mode"]:checked') as HTMLInputElement)?.value || 'merge';

      if (selectedPaths.length === 0) {
        Swal.showValidationMessage('Please select at least one path to import');
        return false;
      }

      return { selectedPaths, mode };
    }
  });

  if (result.isConfirmed && result.value) {
    await performImport(indicators, result.value.selectedPaths, result.value.mode);
  }
}

/**
 * Format path for display
 */
function formatPath(path: string): string {
  return path
    .split(/[-_.]/)
    .flatMap(part => part.split(/(?=[A-Z])/))
    .filter(Boolean)
    .join(' ');
}

/**
 * Perform the actual import
 */
async function performImport(
  importIndicators: Record<string, any[]>,
  selectedPaths: string[],
  mode: string
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['indicators']);
    const existingIndicators = result.indicators || {};

    let imported = 0;
    let skipped = 0;
    let newIndicators: Record<string, any[]>;

    if (mode === 'overwrite') {
      newIndicators = { ...existingIndicators };
      for (const path of selectedPaths) {
        const pathIndicators = importIndicators[path] || [];
        newIndicators[path] = pathIndicators;
        imported += pathIndicators.length;
      }
    } else {
      // Merge mode
      newIndicators = { ...existingIndicators };
      for (const path of selectedPaths) {
        const importPathIndicators = importIndicators[path] || [];
        const existingPathIndicators = newIndicators[path] || [];
        const existingIds = new Set(existingPathIndicators.map((ind: any) => ind.id));

        for (const indicator of importPathIndicators) {
          if (existingIds.has(indicator.id)) {
            skipped++;
          } else {
            existingPathIndicators.push(indicator);
            imported++;
          }
        }
        newIndicators[path] = existingPathIndicators;
      }
    }

    await chrome.storage.local.set({ indicators: newIndicators });

    const skippedMsg = skipped > 0 ? ` (${skipped} skipped - already exist)` : '';

    await Swal.fire({
      icon: 'success',
      title: 'Import Complete!',
      text: `Successfully imported ${imported} indicators${skippedMsg}`,
      timer: 3000,
      showConfirmButton: false,
      customClass: { popup: 'jira-popup' }
    });

    // Reload indicators on page
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error('Import failed:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Import Failed',
      text: 'Something went wrong during import.',
      customClass: { popup: 'jira-popup' }
    });
  }
}

// ========== END IMPORT/EXPORT ==========


/**
 * Show settings modal with backend URL and slow call threshold
 */
async function showSettingsModal() {
  // Load current settings
  const settings = await chrome.storage.local.get(['backendUrl', 'slowCallThreshold']);
  const key = `indi_onboarding_${window.location.hostname}`;
  const keyResult = await chrome.storage.local.get([key]);
  const onboardingState = keyResult[key];

  const currentBackendUrl = onboardingState.selectedBackendUrl || '';
  const currentThreshold = settings.slowCallThreshold || 1000; // Default 1000ms

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <!-- Backend URL Section -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          Backend URL
        </label>
        <div style="display: flex; gap: 8px;">
          <input
            id="indi-settings-backend-url"
            type="text"
            value="${currentBackendUrl}"
            placeholder="No backend configured"
            disabled
            style="
              flex: 1;
              padding: 10px 12px;
              border: 2px solid #e5e7eb;
              border-radius: 8px;
              font-size: 14px;
              background: #f9fafb;
              color: #374151;
              cursor: not-allowed;
            "
          />
          <button
            id="indi-settings-reconfigure-backend"
            style="
              padding: 10px 16px;
              background: linear-gradient(to right, rgb(139, 92, 246), rgb(124, 58, 237)) !important;
              color: white !important;
              border: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.2s;
            "
            onmouseover="this.style.color='white'"
            onmouseout="this.style.background='linear-gradient(to right, rgb(139, 92, 246), rgb(124, 58, 237)) !important;'"
          >
            Reconfigure
          </button>
        </div>
        <p style="font-size: 12px; color: #6b7280; margin-top: 6px;">
          The API endpoint where your backend is hosted. Click "Reconfigure" to change it.
        </p>
      </div>

      <!-- Slow Call Threshold Section -->
      <div style="margin-bottom: 24px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          Slow Call Threshold: <span id="indi-threshold-value" style="color: #8b5cf6;">${currentThreshold}ms</span>
        </label>
        <div style="position: relative; margin-bottom: 12px;">
          <input
            id="indi-settings-threshold-slider"
            type="range"
            min="100"
            max="10000"
            step="100"
            value="${currentThreshold}"
            style="
              width: 100%;
              height: 8px;
              border-radius: 4px;
              background: linear-gradient(to right, #10b981 0%, #f59e0b 50%, #ef4444 100%);
              outline: none;
              -webkit-appearance: none;
              appearance: none;
            "
            oninput="document.getElementById('indi-threshold-value').textContent = this.value + 'ms'"
          />
          <style>
            #indi-settings-threshold-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #8b5cf6;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
              transition: all 0.2s;
            }
            #indi-settings-threshold-slider::-webkit-slider-thumb:hover {
              background: #7c3aed;
              transform: scale(1.1);
            }
            #indi-settings-threshold-slider::-moz-range-thumb {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #8b5cf6;
              cursor: pointer;
              border: none;
              box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
              transition: all 0.2s;
            }
            #indi-settings-threshold-slider::-moz-range-thumb:hover {
              background: #7c3aed;
              transform: scale(1.1);
            }
          </style>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af;">
          <span>⚡ Fast (100ms)</span>
          <span>😐 Normal (5000ms)</span>
          <span>🐌 Very Slow (10000ms)</span>
        </div>
        <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">
          API calls slower than <strong>${currentThreshold}ms</strong> will be flagged as slow and highlighted in blobi reports, summaries, and the logger. This affects issue detection and notifications.
        </p>
      </div>

      <!-- Import/Export Section -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <label style="display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 12px;">
          Import / Export Indicators
        </label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <button
            id="indi-settings-export"
            style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 12px 16px;
              background: linear-gradient(to right, #10b981, #059669);
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            "
          >
            <span style="font-size: 16px;">📥</span> Export
          </button>
          <button
            id="indi-settings-import"
            style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 12px 16px;
              background: linear-gradient(to right, #8b5cf6, #7c3aed);
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            "
          >
            <span style="font-size: 16px;">📤</span> Import
          </button>
        </div>
        <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">
          Export all indicators to a JSON file for backup or sharing. Import previously exported indicators.
        </p>
      </div>
    </div>
  `;

  const result = await Swal.fire({
    title: '⚙️ Indi Settings',
    html: html,
    width: '550px',
    draggable: true,
    showCancelButton: true,
    confirmButtonText: 'Save Settings',
    cancelButtonText: 'Cancel',
    customClass: {
      popup: 'jira-popup',
      confirmButton: 'swal2-confirm-custom',
      cancelButton: 'swal2-cancel-custom'
    },
    didOpen: (popup) => {
      // Add custom styling for buttons
      const confirmBtn = Swal.getConfirmButton();
      const cancelBtn = Swal.getCancelButton();

      if (confirmBtn) {
        confirmBtn.style.cssText = `
          background: linear-gradient(to right, #8b5cf6, #7c3aed) !important;
          border: none !important;
          padding: 12px 24px !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          transition: all 0.2s !important;
        `;
      }

      if (cancelBtn) {
        cancelBtn.style.cssText = `
          background: #f3f4f6 !important;
          color: #374151 !important;
          border: none !important;
          padding: 12px 24px !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          transition: all 0.2s !important;
        `;
      }

      // Add event listener for reconfigure button - query within popup element
      const reconfigureBtn = popup.querySelector('#indi-settings-reconfigure-backend') as HTMLButtonElement;
      if (reconfigureBtn) {
        reconfigureBtn.addEventListener('click', async () => {
          // Close the settings modal
          Swal.close();

          // Open onboarding flow to reconfigure backend
          if (onboardingFlow) {
            const networkData = Array.from(recentCallsCache.values()).flat();
            await onboardingFlow.startWithNetworkData(networkData, true);
          }
        });
      }

      // Export button handler
      const exportBtn = popup.querySelector('#indi-settings-export') as HTMLButtonElement;
      if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
          await handleExportIndicators();
        });
      }

      // Import button handler
      const importBtn = popup.querySelector('#indi-settings-import') as HTMLButtonElement;
      if (importBtn) {
        importBtn.addEventListener('click', async () => {
          Swal.close();
          await handleImportIndicators();
        });
      }
    },
    preConfirm: () => {
      const thresholdSlider = document.getElementById('indi-settings-threshold-slider') as HTMLInputElement;

      return {
        slowCallThreshold: parseInt(thresholdSlider?.value || '1000')
      };
    }
  });

  if (result.isConfirmed && result.value) {
    const { slowCallThreshold: newThreshold } = result.value;

    // Save slow call threshold
    await chrome.storage.local.set({
      slowCallThreshold: newThreshold
    });

    // Update global threshold variable
    slowCallThreshold = newThreshold;

    // Update pageSummary threshold
    if (pageSummary) {
      pageSummary.setSlowCallThreshold(newThreshold);
    }

    // Show success message
    await Swal.fire({
      icon: 'success',
      title: 'Settings Saved!',
      text: `Slow Call Threshold: ${newThreshold}ms`,
      timer: 2000,
      timerProgressBar: true,
      showConfirmButton: false,
      customClass: { popup: 'jira-popup' }
    });
  }
}

/**
 * Show upgrade modal when user hits flow limit
 */
async function showUpgradeModal(flowCount: number) {
  const INTEREST_KEY = 'indi_pro_interest_submitted';

  // Check if user already submitted interest
  const result = await chrome.storage.local.get([INTEREST_KEY]);
  const hasSubmitted = result[INTEREST_KEY];

  if (hasSubmitted) {
    // User already expressed interest - show simpler message
    await Swal.fire({
      title: '🎯 Flow Limit Reached',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: left;">
          <p style="color: #374151; margin-bottom: 16px;">
            You've already expressed interest in <strong>Indi Mapper Pro</strong>!
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            We'll notify you at <strong>${hasSubmitted.email}</strong> when it launches.
          </p>
          <div style="margin-top: 20px; padding: 12px; background: #f3f4f6; border-radius: 8px; border-left: 4px solid #8b5cf6;">
            <p style="color: #374151; font-size: 13px; margin: 0;">
              💡 In the meantime, you can manage your existing ${flowCount} flows.
            </p>
          </div>
        </div>
      `,
      confirmButtonText: 'Got it',
      customClass: {
        popup: 'jira-popup'
      }
    });
    return;
  }

  // First time - show email collection form
  const { value: formValues } = await Swal.fire({
    title: '🎯 Upgrade to Indi Mapper Pro',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: left;">
        <p style="color: #374151; margin-bottom: 16px;">
          You've reached the free plan limit of <strong>5 flows per domain</strong>.
        </p>
        <div style="background: linear-gradient(135deg, #f3e8ff, #e9d5ff); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <p style="color: #5b21b6; font-weight: 600; margin: 0 0 8px 0;">✨ Indi Mapper Pro includes:</p>
          <ul style="color: #6b21a8; margin: 0; padding-left: 20px; font-size: 14px;">
            <li>Unlimited flows</li>
            <li>Advanced analytics</li>
            <li>Priority support</li>
          </ul>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 12px;">
          Interested? Enter your email and we'll notify you when it's available!
        </p>
        <input
          id="upgrade-email"
          type="email"
          class="swal2-input"
          placeholder="your.email@example.com"
          style="margin: 0; width: calc(100% - 20px);"
        >
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Notify Me',
    cancelButtonText: 'Maybe Later',
    customClass: {
      popup: 'jira-popup'
    },
    preConfirm: () => {
      const emailInput = document.getElementById('upgrade-email') as HTMLInputElement;
      const email = emailInput?.value?.trim();

      if (!email) {
        Swal.showValidationMessage('Please enter your email');
        return false;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        Swal.showValidationMessage('Please enter a valid email address');
        return false;
      }

      return { email };
    }
  });

  if (formValues?.email) {
    // Send email via Web3Forms
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          access_key: 'acc914d7-9d0a-43b0-9bc5-e9ea0bf8e1ba',
          email: formValues.email,
          message: `🚀 Indi Mapper Pro - Upgrade Interest

Email: ${formValues.email}
Domain: ${window.location.hostname}
Flows on this domain: ${flowCount}/5
Timestamp: ${new Date().toLocaleString()}
Source: Flow Limit Reached

User has reached the free plan limit (5 flows per domain) and wants to upgrade to Indi Mapper Pro.`,
          from_name: 'Indi Mapper Extension',
          subject: '🚀 Indi Mapper Pro - Upgrade Interest'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Save submission to storage
      await chrome.storage.local.set({
        [INTEREST_KEY]: {
          email: formValues.email,
          timestamp: Date.now(),
          flowCount
        }
      });

      // Show success message
      await Swal.fire({
        icon: 'success',
        title: '✅ Thanks for your interest!',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <p style="color: #374151;">
              We'll email you at <strong>${formValues.email}</strong> when Indi Mapper Pro launches.
            </p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 12px;">
              In the meantime, you can manage your existing ${flowCount} flows.
            </p>
          </div>
        `,
        confirmButtonText: 'Got it',
        customClass: {
          popup: 'jira-popup'
        }
      });
    } catch (error) {
      console.error('Failed to submit upgrade interest:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Submission Failed',
        text: 'Unable to submit your interest. Please try again later.',
        customClass: {
          popup: 'jira-popup'
        }
      });
    }
  }
}

/**
 * Set up Indi-specific event listeners
 */
function setupIndiEventListeners() {
  // Remove any existing listener first to prevent duplicates
  document.removeEventListener('indi-blob-clicked', handleBlobClick);
  // Listen for Indi blob clicks
  document.addEventListener('indi-blob-clicked', handleBlobClick);

  // Listen for minimize event
  document.removeEventListener('indi-minimized', handleIndiMinimized);
  document.addEventListener('indi-minimized', handleIndiMinimized);

  // Listen for restore event
  document.removeEventListener('indi-restored', handleIndiRestored);
  document.addEventListener('indi-restored', handleIndiRestored);

  // Listen for tab visibility changes to save memory
  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;

    if (document.hidden) {
      // Tab became inactive - cleanup to save memory
      console.log('🌙 Tab hidden - cleaning up cache and pausing monitoring');
      cleanupInactiveTabCache();

      // Tell background to reduce monitoring for this tab
      chrome.runtime.sendMessage({
        type: 'TAB_HIDDEN',
        timestamp: Date.now()
      }).catch(() => {
        // Ignore errors if background isn't ready
      });
    } else {
      // Tab became active again
      console.log('👀 Tab visible - resuming full monitoring');

      // Tell background to resume full monitoring
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        timestamp: Date.now()
      }).catch(() => {
        // Ignore errors if background isn't ready
      });
    }
  });

  // Listen for "Create Indicator" button clicks in the summary tooltip (event delegation)
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.id === 'indi-summary-create-indicator') {
      // If already in inspect mode, cancel it
      if (isInspectMode) {
        disableInspectMode();
      } else {
        // Dispatch the event to start inspect mode
        const event = new CustomEvent('indi-create-indicator-from-summary');
        document.dispatchEvent(event);
      }
    }

    // Listen for Settings button clicks
    if (target && target.id === 'indi-summary-settings') {
      // Hide the summary tooltip if it's visible
      if (indiBlob && indiBlob.isTooltipVisible()) {
        indiBlob.toggleTooltip();
      }
      showSettingsModal();
    }

    // Listen for Create Flow button clicks
    if (target && target.id === 'indi-summary-create-flow') {
      handleCreateFlowClick(target);
    }

    // Listen for Play Flow button clicks
    if (target && target.id === 'indi-summary-play-flow') {
      handlePlayFlowClick();
    }
  });
}

// ==================== FLOW RECORDING HANDLERS ====================

/**
 * Handle Create Flow button click - Toggle recording on/off
 */
async function handleCreateFlowClick(button: HTMLElement) {
  // Close the summary tooltip if it's visible
  if (indiBlob && indiBlob.isTooltipVisible()) {
    indiBlob.toggleTooltip();
  }

  if (flowRecorder.isRecording()) {
    // Stop recording
    const session = flowRecorder.stopRecording();

    if (!session) return;

    // Update button appearance
    button.style.background = 'linear-gradient(to right, #10b981, #059669)';
    button.textContent = '⏺️';

    // Ask user to name and save the flow
    const { value: flowName } = await Swal.fire({
      title: '💾 Save Flow',
      html: `
        <p>Recording complete! ${session.steps.length} steps captured.</p>
        <input id="flow-name" class="swal2-input" placeholder="Flow name" value="${session.flowName}">
        <textarea id="flow-description" class="swal2-textarea" placeholder="Description (optional)"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Save Flow',
      cancelButtonText: 'Discard',
      preConfirm: () => {
        const nameInput = document.getElementById('flow-name') as HTMLInputElement;
        const descInput = document.getElementById('flow-description') as HTMLTextAreaElement;
        return {
          name: nameInput.value || session.flowName,
          description: descInput.value
        };
      },
      customClass: {
        popup: 'jira-popup'
      }
    });

    if (flowName) {
      // Save the flow
      const flow = await FlowStorage.saveFlow(session, flowName.description);

      Swal.fire({
        icon: 'success',
        title: 'Flow Saved!',
        text: `"${flowName.name}" saved with ${flow.steps.length} steps.`,
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
        customClass: {
          popup: 'jira-popup'
        }
      });
    }
  } else {
    // Start recording - Check flow limit first (per domain)
    const flowCount = await FlowStorage.countFlowsForDomain();
    const FREE_PLAN_LIMIT = 5;

    if (flowCount >= FREE_PLAN_LIMIT) {
      // User has reached limit - show upgrade modal
      await showUpgradeModal(flowCount);
      return;
    }

    // Start recording
    const { value: flowName } = await Swal.fire({
      title: '🔴 Start Recording',
      input: 'text',
      inputLabel: 'Flow Name',
      inputPlaceholder: 'e.g., "User Login Flow"',
      showCancelButton: true,
      confirmButtonText: 'Start Recording',
      inputValidator: (value) => {
        if (!value) {
          return 'Please enter a flow name';
        }
      },
      customClass: {
        popup: 'jira-popup'
      }
    });

    if (flowName) {
      try {
        await flowRecorder.startRecording(flowName);
      } catch (error: any) {
        await Swal.fire({
          icon: 'error',
          title: 'Cannot Start Recording',
          text: error.message,
          customClass: { popup: 'jira-popup' }
        });
        return;
      }

      // Update button appearance to show recording
      button.style.background = 'linear-gradient(to right, #ef4444, #dc2626)';
      button.textContent = '⏹️';

      // Show recording indicator
      showRecordingIndicator();
    }
  }
}

/**
 * Handle Play Flow button click - Show flow selection and playback
 */
async function handlePlayFlowClick() {
  // Close the summary tooltip if it's visible
  if (indiBlob && indiBlob.isTooltipVisible()) {
    indiBlob.toggleTooltip();
  }

  // Get flows for current domain
  const flows = await FlowStorage.getFlowsForDomain();

  if (flows.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Flows Found',
      text: 'Record a flow first by clicking the Create Flow button!',
      customClass: {
        popup: 'jira-popup'
      }
    });
    return;
  }

  // Show flow selection with custom HTML
  const flowsHTML = generateFlowListHTML(flows);

  const result = await Swal.fire({
    title: 'Select Flow to Play',
    html: flowsHTML,
    showCancelButton: true,
    showConfirmButton: false,
    width: '600px',
    customClass: {
      popup: 'jira-popup'
    },
    didOpen: () => {
      // Add event listeners for play and delete buttons
      flows.forEach(flow => {
        const playBtn = document.getElementById(`play-flow-${flow.id}`);
        const deleteBtn = document.getElementById(`delete-flow-${flow.id}`);

        if (playBtn) {
          playBtn.addEventListener('click', async () => {
            Swal.close();
            await playSelectedFlow(flow.id);
          });
        }

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteFlow(flow.id, flow.name);
          });
        }
      });
    }
  });

  return; // Early return since we handle flow playing in the button click handlers
}

/**
 * Generate HTML for flow list with play and delete buttons
 */
function generateFlowListHTML(flows: any[]): string {
  if (flows.length === 0) {
    return '<p style="text-align: center; color: #6b7280;">No flows found</p>';
  }

  let html = '<div style="max-height: 500px; overflow-y: auto;">';

  flows.forEach((flow, index) => {
    const createdDate = new Date(flow.createdAt).toLocaleDateString();
    const isLastItem = index === flows.length - 1;
    const lastRun = flow.lastRun
      ? `<div style="
           display: inline-block;
           padding: 4px 10px;
           background: ${flow.lastRun.passed ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)'};
           border-radius: 20px;
           font-size: 11px;
           font-weight: 600;
           color: ${flow.lastRun.passed ? '#065f46' : '#991b1b'};
           margin-top: 8px;
         ">
           ${flow.lastRun.passed ? '✓ Passed' : '✗ Failed'} • ${new Date(flow.lastRun.timestamp).toLocaleTimeString()}
         </div>`
      : '';

    html += `
      <div style="
        margin-bottom: ${isLastItem ? '0' : '18px'};
        padding: 14px 16px;
        background: linear-gradient(135deg, #ffffff, #f9fafb);
        border-left: 4px solid #a78bfa;
        border-right: 4px solid #a78bfa;
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      ">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <div style="flex: 1; min-width: 0; padding-right: 12px;">
            <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${flow.name}
            </div>
            <div style="font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${flow.steps.length} steps • Created ${createdDate}
            </div>
            ${lastRun}
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="play-flow-${flow.id}" style="
            padding: 6px 14px;
            background: linear-gradient(135deg, #a78bfa, #8b5cf6);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 3px 10px rgba(139, 92, 246, 0.3);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            letter-spacing: 0.01em;
          " onmouseover="
            this.style.background='linear-gradient(135deg, #8b5cf6, #7c3aed)';
            this.style.boxShadow='0 5px 15px rgba(139, 92, 246, 0.5)';
            this.style.transform='scale(1.05)';
          " onmouseout="
            this.style.background='linear-gradient(135deg, #a78bfa, #8b5cf6)';
            this.style.boxShadow='0 3px 10px rgba(139, 92, 246, 0.3)';
            this.style.transform='scale(1)';
          ">
            ▶️ Play Flow
          </button>
          <button id="delete-flow-${flow.id}" style="
            padding: 6px 14px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            letter-spacing: 0.01em;
          " onmouseover="
            this.style.background='linear-gradient(135deg, #dc2626, #b91c1c)';
            this.style.boxShadow='0 5px 15px rgba(239, 68, 68, 0.5)';
            this.style.transform='scale(1.05)';
          " onmouseout="
            this.style.background='linear-gradient(135deg, #ef4444, #dc2626)';
            this.style.boxShadow='0 3px 10px rgba(239, 68, 68, 0.3)';
            this.style.transform='scale(1)';
          ">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

/**
 * Play a selected flow by ID
 */
async function playSelectedFlow(flowId: string) {
  const flow = await FlowStorage.getFlowById(flowId);

  if (!flow) {
    Swal.fire({
      icon: 'error',
      title: 'Flow Not Found',
      text: 'The selected flow could not be loaded.',
      customClass: { popup: 'jira-popup' }
    });
    return;
  }

  // Show playback started message
  showPlaybackProgressUI(flow);

  // Play the flow
  try {
    const result = await flowPlayer.playFlow(flow);

    // Update last run info
    await FlowStorage.updateFlowLastRun(flow.id, {
      timestamp: Date.now(),
      passed: result.success
    });

    // Show results
    await Swal.fire({
      icon: result.success ? 'success' : 'error',
      title: result.success ? '✅ Flow Passed!' : '❌ Flow Failed',
      html: generatePlaybackResultHTML(result),
      width: '800px',
      customClass: {
        popup: 'jira-popup'
      }
    });
  } catch (error: any) {
    Swal.fire({
      icon: 'error',
      title: 'Playback Error',
      text: error.message || 'Failed to play flow',
      customClass: { popup: 'jira-popup' }
    });
  }
}

/**
 * Delete a flow with confirmation
 */
async function deleteFlow(flowId: string, flowName: string) {
  const confirmed = await Swal.fire({
    icon: 'warning',
    title: 'Delete Flow?',
    html: `Are you sure you want to delete <strong>"${flowName}"</strong>?<br><br>This action cannot be undone.`,
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#ef4444',
    cancelButtonText: 'Cancel',
    customClass: {
      popup: 'jira-popup'
    }
  });

  if (confirmed.isConfirmed) {
    try {
      await FlowStorage.deleteFlow(flowId);

      Swal.fire({
        icon: 'success',
        title: 'Flow Deleted',
        text: `"${flowName}" has been deleted successfully.`,
        timer: 2000,
        showConfirmButton: false,
        customClass: {
          popup: 'jira-popup'
        }
      });

      // Reopen the flow selection modal after a brief delay
      setTimeout(() => {
        handlePlayFlowClick();
      }, 2100);
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: error.message || 'Failed to delete flow',
        customClass: {
          popup: 'jira-popup'
        }
      });
    }
  }
}

/**
 * Show recording indicator with stop button
 */
function showRecordingIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'indi-recording-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #ec4899, #db2777);
    color: white;
    padding: 14px 20px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(236, 72, 153, 0.4);
    z-index: 999998;
    display: flex;
    align-items: center;
    gap: 14px;
    cursor: grab;
    user-select: none;
    transition: box-shadow 0.2s ease;
  `;

  indicator.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="width: 10px; height: 10px; background: white; border-radius: 50%; animation: blink 1s infinite;"></div>
      <span>Recording Flow</span>
    </div>
    <button id="indi-stop-recording-btn" style="
      padding: 6px 14px;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)';"
       onmouseout="this.style.background='rgba(255, 255, 255, 0.2)';">
      ⏹️ Stop
    </button>
  `;

  // Add animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0.3; }
    }
    #indi-recording-indicator:hover {
      box-shadow: 0 6px 20px rgba(236, 72, 153, 0.5);
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(indicator);

  // Make indicator draggable (will prevent dragging when clicking the stop button)
  const cleanupDrag = makeDraggable(indicator, {
    bounds: true, // Keep within viewport
    lockDimensions: true, // Prevent distortion from right->left positioning conflict
  });

  // Add stop button click handler
  const stopBtn = document.getElementById('indi-stop-recording-btn');
  if (stopBtn) {
    // Prevent mousedown from triggering drag
    stopBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Prevent drag from starting
    });

    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent event bubbling
      // Trigger stop recording
      const createFlowBtn = document.getElementById('indi-summary-create-flow');
      if (createFlowBtn) {
        createFlowBtn.click();
      }
    });
  }

  // Listen for recording stopped event to remove indicator
  document.addEventListener('indi-flow-recording-stopped', () => {
    cleanupDrag(); // Remove drag event listeners
    indicator.remove();
  }, { once: true });
}

/**
 * Show playback progress UI
 */
function showPlaybackProgressUI(flow: any) {
  const progressOverlay = document.createElement('div');
  progressOverlay.id = 'indi-playback-progress';
  progressOverlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #a855f7, #9333ea);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(168, 85, 247, 0.4);
    z-index: 999998;
    min-width: 280px;
  `;

  progressOverlay.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 12px; height: 12px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
        <strong>Playing Flow: ${flow.name}</strong>
      </div>
      <button id="indi-stop-playback-btn" style="
        padding: 6px 14px;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(8px);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s ease;
        margin-left: 12px;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)';"
         onmouseout="this.style.background='rgba(255, 255, 255, 0.2)';">
        ⏹️ Stop
      </button>
    </div>
    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
      Step <span id="indi-current-step">0</span> of ${flow.steps.length}
    </div>
    <div style="margin-top: 8px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden;">
      <div id="indi-progress-bar" style="height: 100%; background: white; width: 0%; transition: width 0.3s;"></div>
    </div>
  `;

  document.body.appendChild(progressOverlay);

  // Add stop button click handler
  const stopBtn = document.getElementById('indi-stop-playback-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Stop the flow player
      flowPlayer.stop();
      // Remove the overlay
      progressOverlay.remove();
      // Show notification
      Swal.fire({
        icon: 'info',
        title: 'Playback Stopped',
        text: 'Flow playback was stopped.',
        timer: 2000,
        showConfirmButton: false,
        customClass: { popup: 'jira-popup' }
      });
    });
  }

  // BUG FIX #8: Listen for resume event to restore UI after navigation
  const handleResume = (event: any) => {
    const { stepIndex, totalSteps } = event.detail;

    // Re-show the progress overlay if it's not visible
    const existingOverlay = document.getElementById('indi-playback-progress');
    if (!existingOverlay) {
      showPlaybackProgressUI(event.detail.flow);
    }

    // Update to current step
    const currentStepEl = document.getElementById('indi-current-step');
    const progressBar = document.getElementById('indi-progress-bar');
    if (currentStepEl) currentStepEl.textContent = String(stepIndex + 1);
    if (progressBar) progressBar.style.width = `${((stepIndex + 1) / totalSteps) * 100}%`;
  };

  document.addEventListener('indi-flow-playback-resumed', handleResume);

  // Listen for progress updates
  const updateProgress = (event: any) => {
    const { stepIndex, totalSteps } = event.detail;
    const currentStepEl = document.getElementById('indi-current-step');
    const progressBar = document.getElementById('indi-progress-bar');

    if (currentStepEl) {
      currentStepEl.textContent = String(stepIndex + 1);
    }

    if (progressBar) {
      const percentage = ((stepIndex + 1) / totalSteps) * 100;
      progressBar.style.width = `${percentage}%`;
    }
  };

  document.addEventListener('indi-flow-playback-progress', updateProgress);

  // Listen for completion to remove overlay
  document.addEventListener('indi-flow-playback-completed', () => {
    progressOverlay.remove();
    document.removeEventListener('indi-flow-playback-progress', updateProgress);
  }, { once: true });
}

/**
 * Generate HTML for playback result modal
 */
function generatePlaybackResultHTML(result: any): string {
  const duration = (result.duration / 1000).toFixed(2);
  const passedSteps = result.results.filter((r: any) => r.passed).length;
  const failedSteps = result.results.filter((r: any) => !r.passed).length;

  let html = `
    <div style="text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px;">
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Duration</div>
          <div style="font-size: 20px; font-weight: 600;">${duration}s</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Passed</div>
          <div style="font-size: 20px; font-weight: 600; color: #10b981;">${passedSteps}</div>
        </div>
        <div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Failed</div>
          <div style="font-size: 20px; font-weight: 600; color: #ef4444;">${failedSteps}</div>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h4 style="margin-bottom: 12px; font-size: 14px; font-weight: 600;">Step Results:</h4>
  `;

  result.results.forEach((stepResult: any, index: number) => {
    const icon = stepResult.passed ? '✅' : '❌';
    const statusColor = stepResult.passed ? '#10b981' : '#ef4444';
    const stepDuration = stepResult.duration ? `(${stepResult.duration}ms)` : '';

    // Get user-friendly description
    const stepDescription = FlowStorage.getStepDescription(stepResult.step);

    html += `
      <div style="padding: 14px; margin-bottom: 10px; border-left: 4px solid ${statusColor}; background: ${stepResult.passed ? '#f0fdf4' : '#fef2f2'}; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 14px; color: #1f2937; margin-bottom: 4px;">
              ${icon} ${stepDescription}
            </div>
            <div style="font-size: 11px; color: #6b7280;">
              Step ${index + 1} • ${stepResult.step.action.type} ${stepDuration}
            </div>
          </div>
        </div>
    `;

    if (!stepResult.passed) {
      html += `<div style="color: #ef4444; font-size: 12px; margin-top: 8px;">`;

      if (!stepResult.elementFound) {
        html += `⚠️ Element not found`;
      } else if (!stepResult.actionPerformed) {
        html += `⚠️ Action failed: ${stepResult.error || 'Unknown error'}`;
      } else if (stepResult.apiResults && stepResult.apiResults.length > 0) {
        const failedAPIs = stepResult.apiResults.filter((a: any) => !a.passed);
        if (failedAPIs.length > 0) {
          html += `⚠️ API validation failed:<br/>`;
          failedAPIs.forEach((api: any) => {
            html += `&nbsp;&nbsp;• ${api.api.method} ${api.api.url}<br/>`;
            api.failures.forEach((f: any) => {
              html += `&nbsp;&nbsp;&nbsp;&nbsp;- ${f.message} (expected: ${f.expected}, got: ${f.actual})<br/>`;
            });
          });
        }
      }

      html += `</div>`;
    }

    // Show API results if present
    if (stepResult.apiResults && stepResult.apiResults.length > 0) {
      html += `<div style="margin-top: 8px; font-size: 12px; color: #6b7280;">`;
      stepResult.apiResults.forEach((api: any) => {
        const apiIcon = api.passed ? '✓' : '✗';
        const apiColor = api.passed ? '#10b981' : '#ef4444';
        html += `<div style="color: ${apiColor};">${apiIcon} ${api.api.method} ${api.api.url}</div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Cache for backend URL to avoid repeated chrome.storage calls
 */
let cachedBackendUrl: string | null | undefined = undefined; // undefined = not fetched yet
let backendUrlCacheTime: number = 0;
const BACKEND_URL_CACHE_TTL = 5000; // 5 seconds cache

/**
 * Get cached backend URL or fetch from storage
 */
async function getCachedBackendUrl(): Promise<string | null> {
  const now = Date.now();

  // Return cached value if still valid (and has been fetched at least once)
  if (cachedBackendUrl !== undefined && (now - backendUrlCacheTime) < BACKEND_URL_CACHE_TTL) {
    return cachedBackendUrl ?? null; // Ensure we never return undefined
  }

  // Fetch from storage
  const hostname = window.location.hostname;
  const key = `indi_onboarding_${hostname}`;
  const result = await chrome.storage.local.get([key]);
  cachedBackendUrl = result[key]?.selectedBackendUrl || null;
  backendUrlCacheTime = now;

  return cachedBackendUrl ?? null; // Ensure we never return undefined
}

/**
 * Filter network calls by configured backend URL (optimized with caching)
 */
async function filterCallsByBackend(calls: NetworkCall[]): Promise<NetworkCall[]> {
  const backendUrl = await getCachedBackendUrl();

  if (!backendUrl) {
    // Even without backend URL, filter out OPTIONS calls
    return calls.filter(call => {
      const method = call?.request?.request?.method || call?.method || '';
      return method.toUpperCase() !== 'OPTIONS';
    });
  }

  return calls.filter(call => {
    const url = call?.lastCall?.url || call?.request?.request?.url || call?.url || '';
    const method = call?.request?.request?.method || call?.method || '';

    // Filter by backend URL AND exclude OPTIONS calls
    return url.startsWith(backendUrl) && method.toUpperCase() !== 'OPTIONS';
  });
}

// Debounce flag to prevent double-calls
let isHandlingBlobClick = false;

async function handleBlobClick() {
  console.log('📨 handleBlobClick received event');
  if (!indiBlob) return;

  // Prevent rapid double-calls
  if (isHandlingBlobClick) {
    console.log('🚫 Ignoring duplicate blob click');
    return;
  }

  isHandlingBlobClick = true;

  try {
    // Check cached backend config (no async needed!)
    if (!indiBlob.isConfigured()) {
      // Backend not configured - show onboarding
      if (onboardingFlow) {
        const networkData = Array.from(recentCallsCache.values()).flat();
        await onboardingFlow.startWithNetworkData(networkData);
      }
      return;
    }

    // OPTIMIZATION: Open modal IMMEDIATELY for instant feedback
    // Check if we have existing summary to show
    const existingSummary = cumulativeSummary || indiBlob.getCurrentSummaryData();

    if (existingSummary) {
      // We have data - show it immediately, then update in background
      indiBlob.toggle();

      // Now do the heavy work in background
      const networkData = Array.from(recentCallsCache.values()).flat();
      const filteredCalls = await filterCallsByBackend(networkData);

      if (pageSummary) {
        pageSummary.setNetworkCalls(filteredCalls);
        pageSummary.setDefaultTabForState(true);

        // Update with latest data
        const summaryHTML = pageSummary.generateSummaryHTML(existingSummary);
        indiBlob.updateContent(summaryHTML, existingSummary, filteredCalls);
      }
    } else {
      // No existing data - show loading state immediately for better UX
      indiBlob.showLoading();
      indiBlob.toggle();

      // Now do the heavy work in background
      const networkData = Array.from(recentCallsCache.values()).flat();
      const filteredCalls = await filterCallsByBackend(networkData);

      if (pageSummary) {
        pageSummary.setNetworkCalls(filteredCalls);

        const summaryToUse = pageSummary?.analyze(filteredCalls) || pageSummary?.getCurrentSummaryData();
        const hasSummary = !!summaryToUse;

        pageSummary.setDefaultTabForState(hasSummary);

        if (summaryToUse) {
          const summaryHTML = pageSummary.generateSummaryHTML(summaryToUse);
          indiBlob.updateContent(summaryHTML, summaryToUse, filteredCalls);
        }
      }
    }
  } finally {
    // Reset the flag after a short delay
    setTimeout(() => {
      isHandlingBlobClick = false;
    }, 100); // Reduced from 300ms to 100ms
  }
}

/**
 * Handle Indi minimized event - detach debugger
 */
async function handleIndiMinimized() {
  console.log('😴 Indi minimized - requesting debugger detach');

  try {
    // Don't send tabId - background will get it from sender.tab.id
    const response = await chrome.runtime.sendMessage({
      type: 'DETACH_DEBUGGER'
    });

    if (response?.success) {
      console.log('✅ Debugger detached successfully');
    } else {
      console.warn('⚠️ Failed to detach debugger:', response?.error);
    }
  } catch (error) {
    console.error('❌ Error detaching debugger:', error);
  }
}

/**
 * Handle Indi restored event - re-attach debugger
 */
async function handleIndiRestored() {
  console.log('👀 Indi restored - requesting debugger re-attach');

  try {
    // Don't send tabId - background will get it from sender.tab.id
    const response = await chrome.runtime.sendMessage({
      type: 'REATTACH_DEBUGGER'
    });

    if (response?.success) {
      console.log('✅ Debugger re-attached successfully');

      // Show brief confirmation to user
      if (speechBubble && !indiBlob?.getMuteState()) {
        speechBubble.show({
          title: '👀 Monitoring resumed!',
          message: 'I\'m back to watching your APIs',
          actions: [],
          showClose: false,
          persistent: false
        });

        // Auto-hide after 2 seconds
        setTimeout(() => {
          if (speechBubble) {
            speechBubble.hide();
          }
        }, 2000);
      }
    } else {
      console.warn('⚠️ Failed to re-attach debugger:', response?.error);
    }
  } catch (error) {
    console.error('❌ Error re-attaching debugger:', error);
  }
}

// Track cumulative issues for the current page
let currentPageUrl: string = window.location.href;
const cumulativeErrorCalls = new Set<string>(); // Track unique error URLs
const cumulativeSlowApis = new Set<string>(); // Track unique slow API URLs
const cumulativeSecurityIssues = new Set<string>(); // Track unique security issues
let cumulativeSummary: PageSummaryData | null = null; // Track cumulative summary for badge clicks
let cumulativeFailedCalls: NetworkCall[] = []; // Track actual failed call objects for detailed view
let cumulativeSlowCalls: NetworkCall[] = []; // Track actual slow call objects for detailed view
let cumulativeSecurityIssueObjects: SecurityIssue[] = []; // Track actual security issue objects for detailed view
const notifiedErrorUrls = new Set<string>(); // Track which error URLs we've already notified about
const notifiedSlowUrls = new Set<string>(); // Track which slow URLs we've already notified about
const notifiedSecurityUrls = new Set<string>(); // Track which security URLs we've already notified about

// Performance: Cache onboarding state in memory to avoid storage calls
let cachedOnboardingState: any = null;
let lastOnboardingCheck: number = 0;
const ONBOARDING_CACHE_TTL = 60000; // Cache for 1 minute

// Performance: Debounce timers for heavy operations
let analyzeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let securityAnalysisTimer: ReturnType<typeof setTimeout> | null = null;
let lastAnalysisTime: number = 0;
const ANALYSIS_DEBOUNCE_MS = 1000; // Run analysis max once per second

// Performance: Debounce indicator updates (reduced to 100ms for responsiveness)
let indicatorUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let lastIndicatorUpdateTime: number = 0;
const INDICATOR_UPDATE_DEBOUNCE_MS = 100; // Check indicators max once per 100ms (fast and responsive)

// Reset cumulative tracking when page changes
function resetCumulativeTracking() {
  currentPageUrl = window.location.href;
  cumulativeErrorCalls.clear();
  cumulativeSlowApis.clear();
  cumulativeSecurityIssues.clear();
  cumulativeSummary = null;
  cumulativeFailedCalls = []; // Reset failed calls array
  cumulativeSlowCalls = []; // Reset slow calls array
  cumulativeSecurityIssueObjects = []; // Reset security issues array
  notifiedErrorUrls.clear(); // Reset notified errors
  notifiedSlowUrls.clear(); // Reset notified slow calls
  notifiedSecurityUrls.clear(); // Reset notified security issues

  // Reset performance caches
  cachedOnboardingState = null;
  lastOnboardingCheck = 0;
}

/**
 * Check onboarding state with memory caching to avoid repeated storage calls
 * Performance: Reduces storage API calls by 90%+
 */
async function getCachedOnboardingState(): Promise<any> {
  const now = Date.now();

  // Return cached state if still valid
  if (cachedOnboardingState && (now - lastOnboardingCheck) < ONBOARDING_CACHE_TTL) {
    return cachedOnboardingState;
  }

  // Cache expired or doesn't exist - fetch from storage
  const onboardingKey = `indi_onboarding_${window.location.hostname}`;
  const result = await chrome.storage.local.get([onboardingKey]);
  cachedOnboardingState = result[onboardingKey];
  lastOnboardingCheck = now;

  return cachedOnboardingState;
}

async function analyzeNetworkForIndi(networkData: NetworkCall[]) {
  if (!indiBlob || !pageSummary) return;

  // Performance: Skip analysis if tab is not visible
  if (!isTabVisible) {
    console.log('🌙 Tab hidden - skipping analysis');
    return;
  }

  // Performance: Use cached onboarding state instead of storage call
  const state = await getCachedOnboardingState();

  // If no onboarding data exists, this site is not enabled - return early
  if (!state) {
    return;
  }

  // If onboarding not completed, wait for user to complete it
  if (!state.completed) {
    return;
  }

  // Performance: Debounce analysis to max once per second
  // This prevents excessive CPU usage on pages with frequent network activity
  const now = Date.now();
  const timeSinceLastAnalysis = now - lastAnalysisTime;

  if (timeSinceLastAnalysis < ANALYSIS_DEBOUNCE_MS) {
    // Too soon - schedule for later
    if (analyzeDebounceTimer) {
      clearTimeout(analyzeDebounceTimer);
    }
    analyzeDebounceTimer = setTimeout(() => {
      analyzeNetworkForIndi(networkData);
    }, ANALYSIS_DEBOUNCE_MS - timeSinceLastAnalysis);
    return;
  }

  lastAnalysisTime = now;

  // Check if URL changed - if so, reset cumulative tracking
  if (window.location.href !== currentPageUrl) {
    resetCumulativeTracking();
  }

  // Analyze current batch
  const summary = pageSummary.analyze(networkData);

  // Run security analysis on network calls (silently)
  // Filter out OPTIONS requests - no need to analyze preflight requests
  const callsToAnalyze = networkData.filter(call => {
    const method = call?.request?.request?.method || call?.method || 'GET';
    return method !== 'OPTIONS';
  });

  let securityIssues: SecurityIssue[] = [];
  if (securityEngine && callsToAnalyze.length > 0) {
    const analysisResult = await securityEngine.analyzeMultiple(callsToAnalyze);
    securityIssues = analysisResult.issues;
    // Issues are tracked in cumulativeSecurityIssues and will be shown in UI
  }

  // Update cumulative tracking with NEW issues from this batch
  if (summary.errorCalls > 0) {
    // Add error URLs to cumulative set AND store full call objects
    networkData.forEach(call => {
      if (call.status >= 400) {
        const method = call?.request?.request?.method || call?.method || 'GET';

        // Skip OPTIONS preflight requests - track only actual API call failures
        if (method.toUpperCase() === 'OPTIONS') {
          return;
        }

        const url = extractNetworkCallUrl(call);
        cumulativeErrorCalls.add(url);
        // Store the full NetworkCall object for detailed view (limit to last 50)
        cumulativeFailedCalls.unshift(call); // Add to front (newest first)
        if (cumulativeFailedCalls.length > 50) {
          cumulativeFailedCalls.pop(); // Remove oldest
        }
      }
    });
  }

  // Track slow API URLs AND store full call objects
  networkData.forEach(call => {
    const method = call?.request?.request?.method || call?.method || 'GET';

    // Skip OPTIONS preflight requests - if OPTIONS is slow, the actual request will be slow too
    if (method.toUpperCase() === 'OPTIONS') {
      return;
    }

    const duration = call?.response?.response?.timing?.receiveHeadersEnd ?? call?.duration ?? 0;
    if (duration > slowCallThreshold) {
      const url = extractNetworkCallUrl(call);
      cumulativeSlowApis.add(url);
      // Store the full NetworkCall object for detailed view (limit to last 50)
      cumulativeSlowCalls.unshift(call); // Add to front (newest first)
      if (cumulativeSlowCalls.length > 50) {
        cumulativeSlowCalls.pop(); // Remove oldest
      }
    }
  });

  // Track security issues from both old system and new security engine
  if (summary.apisWithoutAuth && summary.apisWithoutAuth.length > 0) {
    summary.apisWithoutAuth.forEach((url: string) => cumulativeSecurityIssues.add(url));
  }
  // Add new security engine issues to cumulative tracking
  securityIssues.forEach((issue: SecurityIssue) => {
    cumulativeSecurityIssues.add(issue.url);
    // Store the full SecurityIssue object for detailed view (limit to last 50)
    cumulativeSecurityIssueObjects.unshift(issue); // Add to front (newest first)
    if (cumulativeSecurityIssueObjects.length > 50) {
      cumulativeSecurityIssueObjects.pop(); // Remove oldest
    }
  });

  // Calculate total cumulative issue count for this page
  const totalIssueCount =
    cumulativeErrorCalls.size +
    cumulativeSlowApis.size +
    cumulativeSecurityIssues.size;

  // Build cumulative summary for badge clicks
  if (!cumulativeSummary) {
    // First batch - use current summary as base
    cumulativeSummary = { ...summary };
  } else {
    // CRITICAL FIX: Merge ALL fields from new batch into cumulative summary
    // This ensures no fields disappear when new traffic arrives

    // Aggregate timing (accumulate total time)
    cumulativeSummary.totalTime = (cumulativeSummary.totalTime || 0) + (summary.totalTime || 0);

    // Aggregate counts
    cumulativeSummary.totalCalls = (cumulativeSummary.totalCalls || 0) + (summary.totalCalls || 0);
    cumulativeSummary.successfulCalls = (cumulativeSummary.successfulCalls || 0) + (summary.successfulCalls || 0);
    cumulativeSummary.errorCalls = cumulativeErrorCalls.size; // Use cumulative set
    cumulativeSummary.warningCalls = (cumulativeSummary.warningCalls || 0) + (summary.warningCalls || 0);

    // Performance: Use push instead of spread to reduce GC pressure
    // Aggregate durations array for average calculation
    if (!cumulativeSummary.durations) {
      cumulativeSummary.durations = [];
    }
    if (summary.durations && summary.durations.length > 0) {
      cumulativeSummary.durations.push(...summary.durations);
    }

    // Recalculate average response time from all durations
    const durationsCount = cumulativeSummary.durations.length;
    cumulativeSummary.averageResponseTime = durationsCount > 0
      ? Math.round(cumulativeSummary.durations.reduce((sum, d) => sum + d, 0) / durationsCount)
      : 0;

    // Update slowest API (keep the slowest ever seen)
    if (summary.slowestApi) {
      if (!cumulativeSummary.slowestApi || summary.slowestApi.duration > cumulativeSummary.slowestApi.duration) {
        cumulativeSummary.slowestApi = summary.slowestApi;
      }
    }

    // Update fastest API (keep the fastest ever seen)
    if (summary.fastestApi) {
      if (!cumulativeSummary.fastestApi || summary.fastestApi.duration < cumulativeSummary.fastestApi.duration) {
        cumulativeSummary.fastestApi = summary.fastestApi;
      }
    }

    // Aggregate data transfer
    cumulativeSummary.totalDataTransferred = (cumulativeSummary.totalDataTransferred || 0) + (summary.totalDataTransferred || 0);
    cumulativeSummary.totalDataTransferredMB = (cumulativeSummary.totalDataTransferred / (1024 * 1024)).toFixed(2);

    // Update most called API (track across all batches via Map)
    if (summary.mostCalledApi) {
      // We should track this globally, but for now just use the latest if it has higher count
      if (!cumulativeSummary.mostCalledApi || summary.mostCalledApi.count > cumulativeSummary.mostCalledApi.count) {
        cumulativeSummary.mostCalledApi = summary.mostCalledApi;
      }
    }

    // Aggregate unique endpoints count
    cumulativeSummary.uniqueEndpoints = (cumulativeSummary.uniqueEndpoints || 0) + (summary.uniqueEndpoints || 0);

    // Merge new APIs arrays
    const existingNewApis = cumulativeSummary.newApis || [];
    const newNewApis = summary.newApis || [];
    cumulativeSummary.newApis = [...existingNewApis, ...newNewApis];

    // Update security issues
    cumulativeSummary.securityIssues = cumulativeSecurityIssues.size;
    cumulativeSummary.apisWithoutAuth = Array.from(cumulativeSecurityIssues);

    // Update issue flags
    cumulativeSummary.hasIssues = totalIssueCount > 0;
    cumulativeSummary.issueCount = totalIssueCount;

    // Update timestamp fields if present
    if (summary.firstApiTime !== undefined) {
      cumulativeSummary.firstApiTime = Math.min(
        cumulativeSummary.firstApiTime || Infinity,
        summary.firstApiTime
      );
    }
    if (summary.lastApiTime !== undefined) {
      cumulativeSummary.lastApiTime = Math.max(
        cumulativeSummary.lastApiTime || 0,
        summary.lastApiTime
      );
    }
  }

  // Update Indi's notification count with cumulative count
  indiBlob.setNotifications(totalIssueCount);

  // Filter network calls by backend for Network tab
  const filteredCalls = await filterCallsByBackend(networkData);
  pageSummary.setNetworkCalls(filteredCalls);

  // Generate HTML summary and update tooltip content (use cumulative summary)
  const summaryHTML = pageSummary.generateSummaryHTML(cumulativeSummary);
  indiBlob.updateContent(summaryHTML, cumulativeSummary, filteredCalls);

  // Store cumulative summary for badge clicks
  issuesSummary = cumulativeSummary;

  // Show individual notifications for NEW specific API issues
  showIndividualNotifications(networkData);
}

/**
 * Show individual notifications for each NEW API issue (one at a time)
 */
function showIndividualNotifications(networkData: NetworkCall[]) {
  if (!speechBubble) return;

  // Find first NEW error to notify about
  for (const call of networkData) {
    const url = extractNetworkCallUrl(call);
    const method = call?.request?.request?.method ?? call.method ?? 'GET';
    const status = call.status;
    const duration = call?.response?.response?.timing?.receiveHeadersEnd ?? call?.duration ?? 0;

    // Check for error (status >= 400)
    if (status >= 400 && !notifiedErrorUrls.has(url)) {
      notifiedErrorUrls.add(url);

      // Determine error type
      let errorType = 'Error';
      if (status === 401 || status === 403) errorType = 'Auth Error';
      else if (status === 404) errorType = 'Not Found';
      else if (status >= 500) errorType = 'Server Error';
      else if (status === 0) errorType = 'Network Error';

      const urlDisplay = url.length > 50 ? '...' + url.slice(-47) : url;

      speechBubble!.show({
        title: '❌ API Error Detected',
        message: `${method} ${urlDisplay}\n${status} ${errorType}`,
        bypassMute: false,
        actions: [
          {
            label: '➕ Create Indicator',
            style: 'primary',
            onClick: () => {
              speechBubble?.hide();
              // Store API URL and trigger inspect mode
              (window as any).__indiBlobNetworkCall = { url, method, status, duration };
              enableInspectMode();
            },
          },
          {
            label: 'Dismiss',
            style: 'secondary',
            onClick: () => speechBubble?.hide(),
          },
        ],
      });

      return; // Only show first new error
    }
  }

  // If no new errors, check for first NEW slow call
  for (const call of networkData) {
    const url = extractNetworkCallUrl(call);
    const method = call?.request?.request?.method ?? call.method ?? 'GET';
    const status = call.status;
    const duration = call?.response?.response?.timing?.receiveHeadersEnd ?? call?.duration ?? 0;

    // Check for slow call (duration > threshold)
    if (duration > slowCallThreshold && !notifiedSlowUrls.has(url)) {
      notifiedSlowUrls.add(url);

      const urlDisplay = url.length > 50 ? '...' + url.slice(-47) : url;
      const timeSavings = Math.round(duration - slowCallThreshold);
      const speedupFactor = (duration / slowCallThreshold).toFixed(1);

      // Create expandable tips section
      const tipsHTML = `
        <details style="margin-top: 12px; cursor: pointer;">
          <summary style="
            font-size: 12px;
            font-weight: 600;
            color: #374151;
            padding: 6px 0;
            user-select: none;
          ">
            🔧 Quick fixes that usually work →
          </summary>
          <div style="
            margin-top: 8px;
            padding: 10px;
            background: #f9fafb;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.6;
            color: #4b5563;
          ">
            <div style="margin-bottom: 8px;">
              <strong>• Add caching</strong> (Redis/memory)<br/>
              <span style="color: #6b7280;">5-10min TTL → ~80% faster</span>
            </div>
            <div style="margin-bottom: 8px;">
              <strong>• Check for N+1 queries</strong><br/>
              <span style="color: #6b7280;">Look for loops in backend → 50-90% faster</span>
            </div>
            <div style="margin-bottom: 8px;">
              <strong>• Add pagination</strong><br/>
              <span style="color: #6b7280;">Limit to 20-50 items → 60-80% faster</span>
            </div>
            <div>
              <strong>• Use database indexes</strong><br/>
              <span style="color: #6b7280;">On search/filter columns → 70-95% faster</span>
            </div>
          </div>
        </details>
      `;

      speechBubble!.show({
        title: '⚡ Quick Win Available',
        message: `This call's taking ${(duration / 1000).toFixed(1)} seconds\nYour target: ${(slowCallThreshold / 1000).toFixed(1)}s\n\n💚 Fix this → Save ${(timeSavings / 1000).toFixed(1)}s\nYour users will get data ${speedupFactor}x faster`,
        customContent: (() => {
          const div = document.createElement('div');
          div.innerHTML = `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 11px; font-family: monospace; color: #78350f; word-break: break-all;">
              ${method} ${urlDisplay}
            </div>
            ${tipsHTML}
          `;
          return div;
        })(),
        bypassMute: false,
        actions: [
          {
            label: '➕ Create Indicator',
            style: 'primary',
            onClick: () => {
              speechBubble?.hide();
              // Store API URL and trigger inspect mode
              (window as any).__indiBlobNetworkCall = { url, method, status, duration };
              enableInspectMode();
            },
          },
          {
            label: 'Dismiss',
            style: 'secondary',
            onClick: () => speechBubble?.hide(),
          },
        ],
      });

      return; // Only show first new slow call
    }
  }
}

/**
 * Generate cURL command from NetworkCall
 */
function generateCurlCommand(call: NetworkCall): string {
  const url = extractNetworkCallUrl(call);
  const method = call?.request?.request?.method ?? call.method ?? 'GET';
  const headers = call?.request?.request?.headers || {};

  let curl = `curl -X ${method} '${url}'`;

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    // Skip some headers that curl adds automatically or are problematic
    if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      curl += ` \\\n  -H '${key}: ${value}'`;
    }
  });

  // Add body if present (POST/PUT/PATCH)
  if (call.body?.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    const bodyStr = typeof call.body.body === 'string'
      ? call.body.body
      : JSON.stringify(call.body.body);
    curl += ` \\\n  --data '${bodyStr.replace(/'/g, "'\\''")}'`;
  }

  return curl;
}

/**
 * Show detailed issues modal with full information
 */
async function showDetailedIssuesModal(summary: PageSummaryData) {
  // Build detailed HTML for all issues
  let html = '<div style="text-align: left; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif;">';
  const funnyPhrasesOfFailedApis = ['APIs That Swear They Worked Yesterday', 'Troublemaker APIs', 'APIs on Strike', 'Rebellious APIs', 'APIs Needing TLC', 'APIs Blaming the Network', 'APIs Needing a Little Love ❤️'];
  const randomPhrase = funnyPhrasesOfFailedApis[Math.floor(Math.random() * funnyPhrasesOfFailedApis.length)];
  // Failed APIs Section
  if (summary.errorCalls > 0 && cumulativeFailedCalls.length > 0) {
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #dc2626; display: flex; align-items: center; gap: 8px;">
          ${randomPhrase} (${summary.errorCalls})
        </h3>
        <div style="max-height: 300px; overflow-y: auto;">
    `;

    cumulativeFailedCalls.forEach((call) => {
      const url = extractNetworkCallUrl(call);
      const method = call?.request?.request?.method ?? call.method ?? 'GET';
      const status = call.status;
      const timestamp = call.timestamp || Date.now();
      const timeStr = new Date(timestamp).toLocaleTimeString();

      // Determine error type and color
      let errorType = 'Server Error';
      let errorColor = '#dc2626';
      if (status === 409) {
        if (call.body) {
          try {
            const bodyObj = JSON.parse(call?.body?.body);
            if (bodyObj.error) {
              errorType = bodyObj.error;
            }
          } catch (error) {
            console.error('Failed to parse request body:', error);
          }
        }
       }
      if (status === 401 || status === 403) {
        errorType = 'Auth Error';
        errorColor = '#ea580c';
      } else if (status === 404) {
        errorType = 'Not Found';
        errorColor = '#ca8a04';
      } else if (status >= 500) {
        errorType = 'Server Error';
        errorColor = '#dc2626';
      } else if (status === 0 || status === undefined) {
        errorType = 'Network Error';
        errorColor = '#7c2d12';
      }

      html += `
        <div style="
          margin-bottom: 10px;
          padding: 12px;
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border-left: 4px solid ${errorColor};
          border-radius: 8px;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong style="color: ${errorColor}; font-size: 13px;">${method} ${status || 'ERR'}</strong>
            <span style="font-size: 11px; color: #6b7280;">${timeStr}</span>
          </div>
          <div style="font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 8px;">
            ${url}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 11px; color: ${errorColor}; font-weight: 600;">
              ${errorType}
            </div>
            <div style="display: flex; gap: 8px;">
              <button
                class="indi-copy-curl"
                data-call='${JSON.stringify(call).replace(/'/g, '&#39;')}'
                style="
                  padding: 6px 14px;
                  background: linear-gradient(135deg, #60a5fa, #3b82f6);
                  color: white !important;
                  border: none;
                  border-radius: 10px;
                  font-size: 11px;
                  font-weight: 700;
                  cursor: pointer;
                  box-shadow: 0 3px 10px rgba(59, 130, 246, 0.3);
                  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  letter-spacing: 0.01em;
                "
                onmouseover="
                  this.style.background='linear-gradient(135deg, #3b82f6, #2563eb)';
                  this.style.boxShadow='0 5px 15px rgba(59, 130, 246, 0.5)';
                  this.style.transform='scale(1.05)';
                "
                onmouseout="
                  this.style.background='linear-gradient(135deg, #60a5fa, #3b82f6)';
                  this.style.boxShadow='0 3px 10px rgba(59, 130, 246, 0.3)';
                  this.style.transform='scale(1)';
                "
              >
                📋 Copy cURL
              </button>
              <button
                class="indi-create-from-api"
                data-url="${url.replace(/"/g, '&quot;')}"
                style="
                  padding: 6px 14px;
                  background: linear-gradient(135deg, #a78bfa, #8b5cf6);
                  color: white !important;
                  border: none;
                  border-radius: 10px;
                  font-size: 11px;
                  font-weight: 700;
                  cursor: pointer;
                  box-shadow: 0 3px 10px rgba(139, 92, 246, 0.3);
                  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  letter-spacing: 0.01em;
                "
                onmouseover="
                  this.style.background='linear-gradient(135deg, #8b5cf6, #7c3aed)';
                  this.style.boxShadow='0 5px 15px rgba(139, 92, 246, 0.5)';
                  this.style.transform='scale(1.05)';
                "
                onmouseout="
                  this.style.background='linear-gradient(135deg, #a78bfa, #8b5cf6)';
                  this.style.boxShadow='0 3px 10px rgba(139, 92, 246, 0.3)';
                  this.style.transform='scale(1)';
                "
              >
                ➕ Create Indicator
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  // Quick Wins Section (formerly Slow APIs)
  if (cumulativeSlowCalls.length > 0) {
    const slowCount = cumulativeSlowCalls.length;
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #f59e0b; display: flex; align-items: center; gap: 8px;">
          ⚡ Quick Wins Available (${slowCount}) <span style="font-size: 12px; font-weight: normal; color: #6b7280;">>&nbsp;${slowCallThreshold}ms</span>
        </h3>
        <div style="max-height: 300px; overflow-y: auto;">
    `;

    cumulativeSlowCalls.forEach((call) => {
      const url = extractNetworkCallUrl(call);
      const method = call?.request?.request?.method ?? call.method ?? 'GET';
      const duration = call?.response?.response?.timing?.receiveHeadersEnd ?? call?.duration ?? 0;
      const timestamp = call.timestamp || Date.now();
      const timeStr = new Date(timestamp).toLocaleTimeString();

      html += `
        <div style="
          margin-bottom: 10px;
          padding: 12px;
          background: linear-gradient(135deg, #fff7ed, #ffedd5);
          border-left: 4px solid #ea580c;
          border-radius: 8px;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong style="color: #ea580c; font-size: 13px;">${method} ${Math.round(duration)}ms</strong>
            <span style="font-size: 11px; color: #6b7280;">${timeStr}</span>
          </div>
          <div style="font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 8px;">
            ${url}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button
              class="indi-copy-curl"
              data-call='${JSON.stringify(call).replace(/'/g, '&#39;')}'
              style="
                padding: 6px 14px;
                background: linear-gradient(135deg, #60a5fa, #3b82f6);
                color: white !important;
                border: none;
                border-radius: 10px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 3px 10px rgba(59, 130, 246, 0.3);
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                letter-spacing: 0.01em;
              "
              onmouseover="
                this.style.background='linear-gradient(135deg, #3b82f6, #2563eb)';
                this.style.boxShadow='0 5px 15px rgba(59, 130, 246, 0.5)';
                this.style.transform='scale(1.05)';
              "
              onmouseout="
                this.style.background='linear-gradient(135deg, #60a5fa, #3b82f6)';
                this.style.boxShadow='0 3px 10px rgba(59, 130, 246, 0.3)';
                this.style.transform='scale(1)';
              "
            >
              📋 Copy cURL
            </button>
            <button
              class="indi-create-from-api"
              data-url="${url.replace(/"/g, '&quot;')}"
              style="
                padding: 6px 14px;
                background: linear-gradient(135deg, #a78bfa, #8b5cf6);
                color: white !important;
                border: none;
                border-radius: 10px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 3px 10px rgba(139, 92, 246, 0.3);
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                letter-spacing: 0.01em;
              "
              onmouseover="
                this.style.background='linear-gradient(135deg, #8b5cf6, #7c3aed)';
                this.style.boxShadow='0 5px 15px rgba(139, 92, 246, 0.5)';
                this.style.transform='scale(1.05)';
              "
              onmouseout="
                this.style.background='linear-gradient(135deg, #a78bfa, #8b5cf6)';
                this.style.boxShadow='0 3px 10px rgba(139, 92, 246, 0.3)';
                this.style.transform='scale(1)';
              "
            >
              ➕ Create Indicator
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 12px;">
          💡 Consider adding indicators to monitor these APIs' performance
        </div>
      </div>
    `;
  }

  // Security Issues Section
  if (summary.securityIssues > 0 && cumulativeSecurityIssueObjects.length > 0) {
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #7c2d12; display: flex; align-items: center; gap: 8px;">
          🔒 Security Issues (${summary.securityIssues})
        </h3>
        <div style="max-height: 300px; overflow-y: auto;">
    `;

    cumulativeSecurityIssueObjects.forEach((issue) => {
      const timeStr = new Date(issue.timestamp).toLocaleTimeString();

      // Map severity to color
      let severityColor = '#ca8a04'; // Default yellow
      let bgGradient = 'linear-gradient(135deg, #fefce8, #fef9c3)';

      if (issue.severity === 'Critical') {
        severityColor = '#dc2626';
        bgGradient = 'linear-gradient(135deg, #fef2f2, #fee2e2)';
      } else if (issue.severity === 'High') {
        severityColor = '#ea580c';
        bgGradient = 'linear-gradient(135deg, #fff7ed, #ffedd5)';
      } else if (issue.severity === 'Medium') {
        severityColor = '#ca8a04';
        bgGradient = 'linear-gradient(135deg, #fefce8, #fef9c3)';
      }

      html += `
        <div style="
          margin-bottom: 10px;
          padding: 12px;
          background: ${bgGradient};
          border-left: 4px solid ${severityColor};
          border-radius: 8px;
        ">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <strong style="color: ${severityColor}; font-size: 13px;">${issue.severity} - ${issue.category}</strong>
            <span style="font-size: 11px; color: #6b7280;">${timeStr}</span>
          </div>
          <div style="font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 8px;">
            ${issue.url}
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px;">
            ${issue.message}
          </div>
          <div style="font-size: 11px; color: ${severityColor}; font-weight: 600;">
            💡 ${issue.recommendation}
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  // Summary Stats
  html += `
    <div style="
      margin-top: 20px;
      padding: 14px;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 12px;
      color: #6b7280;
    ">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div><strong>Total Calls:</strong> ${summary.totalCalls}</div>
        <div><strong>Success Rate:</strong> ${Math.round((summary.successfulCalls / summary.totalCalls) * 100)}%</div>
        <div><strong>Avg Response:</strong> ${Math.round(summary.averageResponseTime)}ms</div>
        <div><strong>Unique Endpoints:</strong> ${summary.uniqueEndpoints}</div>
      </div>
    </div>
  `;

  html += '</div>';

  // Show draggable Swal modal
  const result = await Swal.fire({
    title: '📊 Detailed Report',
    html: html,
    width: '700px',
    showConfirmButton: true,
    confirmButtonText: '🗑️ Clear Report',
    confirmButtonColor: '#ef4444',
    showCancelButton: true,
    cancelButtonText: 'Close',
    cancelButtonColor: '#64748b',
    showCloseButton: true,
    customClass: {
      popup: 'jira-popup',
      htmlContainer: 'indi-detailed-issues'
    },
    didOpen: (popup) => {
      // Make the modal draggable
      const title = popup.querySelector('.swal2-title') as HTMLElement;
      if (title) {
        title.style.cursor = 'move';
        title.style.userSelect = 'none';

        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        title.addEventListener('mousedown', (e: MouseEvent) => {
          isDragging = true;
          initialX = e.clientX - currentX;
          initialY = e.clientY - currentY;
        });

        document.addEventListener('mousemove', (e: MouseEvent) => {
          if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            popup.style.transform = `translate(${currentX}px, ${currentY}px)`;
          }
        });

        document.addEventListener('mouseup', () => {
          isDragging = false;
        });
      }

      // Add event listeners for "Create Indicator" buttons
      const createButtons = popup.querySelectorAll('.indi-create-from-api');
      createButtons.forEach(button => {
        button.addEventListener('click', () => {
          const url = button.getAttribute('data-url');
          if (url) {
            Swal.close();
            // Store API URL and trigger inspect mode
            (window as any).__indiBlobNetworkCall = { url };
            enableInspectMode();
          }
        }, { once: true });
      });

      // Add event listeners for "Copy cURL" buttons
      const curlButtons = popup.querySelectorAll('.indi-copy-curl');
      curlButtons.forEach(button => {
        button.addEventListener('click', async () => {
          const callData = button.getAttribute('data-call');
          if (callData) {
            try {
              const call = JSON.parse(callData);
              const curlCommand = generateCurlCommand(call);
              await navigator.clipboard.writeText(curlCommand);

              // Show success feedback
              const originalText = button.textContent;
              button.textContent = '✅ Copied!';
              setTimeout(() => {
                button.textContent = originalText;
              }, 2000);
            } catch (error) {
              console.error('Failed to copy cURL command:', error);
              button.textContent = '❌ Failed';
              setTimeout(() => {
                button.textContent = '📋 Copy cURL';
              }, 2000);
            }
          }
        });
      });
    }
  });

  // If user clicked "Clear All Issues" button
  if (result.isConfirmed) {
    // Reset all cumulative tracking
    resetCumulativeTracking();

    // Clear badge
    if (indiBlob) {
      indiBlob.setNotifications(0);
    }

    // Clear stored summary
    issuesSummary = null;
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

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupIndi();
  clearCache();
});

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


// Export for debugging in console
(window as any).indiBlob = indiBlob;


// export const allNetworkCalls: NetworkCall[] = [];
// content.ts - REPLACE allNetworkCalls array with this:
export const recentCallsCache = new Map<string, NetworkCall[]>();
const MAX_CALLS_PER_ENDPOINT = 50;
const MAX_ENDPOINTS_IN_CACHE = 100; // Limit total endpoints to prevent memory bloat

// Reduced limits for inactive tabs to save memory
const INACTIVE_TAB_MAX_CALLS_PER_ENDPOINT = 10;
const INACTIVE_TAB_MAX_ENDPOINTS = 20;

async function addToCache(calls: NetworkCall[]) {
  // Filter calls before processing
  const filteredCalls = [];

  for (const call of calls) {
    try {
      // Extract URL and method using shared utilities
      const url = getNetworkCallUrl(call);
      const method = getNetworkCallMethod(call);

      if (!url) {
        console.warn('Call without URL, skipping cache', call);
        continue;
      }

      // Skip OPTIONS requests (preflight requests - no need to track)
      if (method === 'OPTIONS') {
        continue;
      }

      // FILTERING: Only store backend calls
      const shouldStore = await shouldStoreCall(url);
      if (!shouldStore) {
        // Silently skip non-backend and static asset calls
        continue;
      }

      filteredCalls.push(call);
    } catch (error) {
      console.error('Error filtering call:', error, call);
    }
  }

  // Now add filtered calls to cache
  filteredCalls.forEach(call => {
    try {
      const url = getNetworkCallUrl(call);
      const method = getNetworkCallMethod(call);

      // Use pattern-based storage path (includes param names)
      // NOTE: We only use ONE key per call to avoid duplicates when flattening cache
      const patternKey = generatePatternBasedStoragePath(url) + '|' + method;
      addToCacheKey(patternKey, call);

    } catch (error) {
      console.error('Error adding to cache:', error, call);
    }
  });

}

function addToCacheKey(key: string, call: NetworkCall) {
  // Don't add to cache if tab is hidden (save memory)
  if (!isTabVisible) {
    return;
  }

  const existing = recentCallsCache.get(key) || [];

  // Add to front (newest first)
  existing.unshift(call);

  // Keep only last 50
  if (existing.length > MAX_CALLS_PER_ENDPOINT) {
    existing.pop(); // Remove oldest
  }

  recentCallsCache.set(key, existing);

  // If we have too many endpoints, remove the oldest accessed one
  if (recentCallsCache.size > MAX_ENDPOINTS_IN_CACHE) {
    const firstKey = recentCallsCache.keys().next().value;
    if (firstKey) {
      recentCallsCache.delete(firstKey);
    }
  }
}

function clearCache() {
  recentCallsCache.clear();
  console.log('🧹 Cache cleared');
}

/**
 * Cleanup cache when tab becomes inactive to save memory
 */
function cleanupInactiveTabCache() {
  // Reduce cache size for inactive tabs
  const endpointsToKeep = INACTIVE_TAB_MAX_ENDPOINTS;

  // Keep only most recent endpoints
  if (recentCallsCache.size > endpointsToKeep) {
    const entries = Array.from(recentCallsCache.entries());
    recentCallsCache.clear();

    // Keep only the last N endpoints
    entries.slice(0, endpointsToKeep).forEach(([key, calls]) => {
      // Also limit calls per endpoint
      const limitedCalls = calls.slice(0, INACTIVE_TAB_MAX_CALLS_PER_ENDPOINT);
      recentCallsCache.set(key, limitedCalls);
    });
  } else {
    // Just limit calls per endpoint
    recentCallsCache.forEach((calls, key) => {
      if (calls.length > INACTIVE_TAB_MAX_CALLS_PER_ENDPOINT) {
        recentCallsCache.set(key, calls.slice(0, INACTIVE_TAB_MAX_CALLS_PER_ENDPOINT));
      }
    });
  }

  console.log(`🧹 Cleaned cache for inactive tab: ${recentCallsCache.size} endpoints`);
}

/**
 * Inject custom modal styles for Indi Flows
 */
function injectCustomModalStyles() {
  const style = document.createElement('style');
  style.id = 'indi-custom-modal-styles';
  style.textContent = `
    /* ==================== SWAL/MODAL CSS RESET ==================== */
    .swal2-popup,
    .swal2-popup *,
    .jira-popup,
    .jira-popup * {
      direction: ltr !important;
      text-align: left !important;
      unicode-bidi: normal !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
      box-sizing: border-box !important;
    }

    /* Indi Modal Custom Styles - Pink/Rose Theme */
    .swal2-popup {
      border-radius: 16px !important;
      box-shadow: 0 8px 32px rgba(236, 72, 153, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      border: 1px solid rgba(236, 72, 153, 0.1) !important;
      animation: indiModalSlideIn 0.2s ease-out !important;
    }

    /* Remove aggressive animations */
    .swal2-show {
      animation: indiModalSlideIn 0.2s ease-out !important;
    }

    .swal2-hide {
      animation: indiModalSlideOut 0.15s ease-in !important;
    }

    /* Subtle slide-in animation */
    @keyframes indiModalSlideIn {
      from {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes indiModalSlideOut {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
      }
    }

    /* Backdrop - very subtle */
    .swal2-backdrop-show {
      background: rgba(15, 23, 42, 0.5) !important;
      backdrop-filter: blur(4px) !important;
      animation: indiBackdropFadeIn 0.2s ease-out !important;
    }

    @keyframes indiBackdropFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Title styling */
    .swal2-title {
      color: #1e293b !important;
      font-size: 20px !important;
      font-weight: 600 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    }

    /* Content text */
    .swal2-html-container {
      color: #475569 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      line-height: 1.6 !important;
    }

    /* Buttons - Indi Pink/Rose Theme */
    .swal2-confirm {
      background: linear-gradient(135deg, #ec4899, #db2777) !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 10px 24px !important;
      font-weight: 600 !important;
      font-size: 14px !important;
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3) !important;
      transition: all 0.15s ease !important;
    }

    .swal2-confirm:hover {
      background: linear-gradient(135deg, #db2777, #be185d) !important;
      box-shadow: 0 4px 12px rgba(236, 72, 153, 0.4) !important;
    }

    .swal2-confirm:active {
      transform: scale(0.98) !important;
    }

    .swal2-cancel {
      background: #f1f5f9 !important;
      color: #64748b !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 10px 24px !important;
      font-weight: 600 !important;
      font-size: 14px !important;
      transition: all 0.15s ease !important;
    }

    .swal2-cancel:hover {
      background: #e2e8f0 !important;
      color: #475569 !important;
    }

    /* Input fields */
    .swal2-input, .swal2-select, .swal2-textarea {
      border: 2px solid #e2e8f0 !important;
      border-radius: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      transition: border-color 0.15s ease !important;
    }

    .swal2-input:focus, .swal2-select:focus, .swal2-textarea:focus {
      border-color: #ec4899 !important;
      box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.1) !important;
      outline: none !important;
    }

    /* Icons - softer colors */
    .swal2-success .swal2-success-ring {
      border-color: rgba(16, 185, 129, 0.3) !important;
    }

    .swal2-success .swal2-success-line-tip,
    .swal2-success .swal2-success-line-long {
      background-color: #10b981 !important;
    }

    .swal2-error [class^='swal2-x-mark-line'] {
      background-color: #ef4444 !important;
    }

    .swal2-warning {
      border-color: #f59e0b !important;
      color: #f59e0b !important;
    }

    /* Progress steps - Pink theme */
    .swal2-progress-steps .swal2-progress-step {
      background: #ec4899 !important;
    }

    .swal2-progress-steps .swal2-progress-step-line {
      background: #fce7f3 !important;
    }

    /* Validation message */
    .swal2-validation-message {
      background: #fef2f2 !important;
      color: #dc2626 !important;
      border-radius: 6px !important;
    }

    /* Remove default animations that are too aggressive */
    .swal2-icon {
      animation: none !important;
    }
  `;

  document.head.appendChild(style);
}

createContainers();
injectStyles();
injectCustomModalStyles();
IndicatorLoader.getInstance();

// CRITICAL: Check if there's a recording session in storage (page may have reloaded during recording)
(async () => {
  const restored = await flowRecorder.restoreSessionFromStorage();
  if (restored) {
    showRecordingIndicator();
  }
})();

// DISABLED: Auto-restore playback session
// (Needs more thought - complexity with URLs and navigation)
// TODO: Re-enable when we figure out the right approach
/*
(async () => {
  // Wait for page to be fully loaded
  if (document.readyState !== 'complete') {
    await new Promise(resolve => {
      window.addEventListener('load', resolve, { once: true });
    });
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('🔍 Checking for pending playback session...');

  const playbackState = await flowPlayer.restorePlaybackState();
  if (playbackState) {
    console.log('🎬 Resuming flow playback after page reload...');
    await flowPlayer.playFlow(playbackState.flow, playbackState.stepIndex);
  }
})();
*/

chrome.runtime.sendMessage({
  type: "DEVTOOLS_OPENED",
});

// יצירת מיכל למודל ולאינדיקטורים
function createContainers() {
  modalContainer = document.createElement("div");
  modalContainer.id = "api-mapper-modal-container";
  modalContainer.style.zIndex = "999999";
  modalContainer.style.position = "fixed";
  modalContainer.style.top = "0";
  modalContainer.style.bottom = "0";
  modalContainer.style.left = "0";
  modalContainer.style.right = "0";
  modalContainer.style.pointerEvents = "none"; // Allow clicks to pass through to page

  innerModalContainer = document.createElement("div");
  innerModalContainer.id = "inner-modal-container";
  innerModalContainer.style.cssText = `
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
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

  if (!elementByPath) return;

  const pattern =
    identifyDynamicParams(selectedCall.url) ||
    identifyDynamicParams(window.location.href);

  const rect = element.rect;

  // Prepare indicator data - this is all we need!
  // The actual indicator will be created by createIndicatorFromData() with the better modal
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

  // Save to storage and immediately create the visual indicator
  // This gives instant feedback instead of waiting for MutationObserver debounce (300ms)
  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    indicators[storagePath] = indicators[storagePath] || [];
    indicators[storagePath].push(indicatorData);
    try {
      chrome.storage.local.set({ indicators }, () => {
        // Create indicator immediately for instant feedback (bypasses 300ms debounce)
        // MutationObserver will call it again but duplicate check will prevent re-creation
        createIndicatorFromData(indicatorData);
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
 * Extract URL from NetworkCall - uses shared utility
 */
function extractNetworkCallUrl(call: NetworkCall): string {
  return getNetworkCallUrl(call) || 'Unknown URL';
}

/**
 * Extract HTTP method from NetworkCall - uses shared utility
 */
function extractNetworkCallMethod(call: NetworkCall): string {
  return getNetworkCallMethod(call);
}

function renderCallItems(container: HTMLElement, calls: NetworkCall[]) {
  container.innerHTML = calls.map(call => createCallItemHTML(call)).join('');
}

// UUID pattern - matches standard UUID format
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Numeric ID pattern - matches numeric IDs in path segments (4+ digits)
const NUMERIC_ID_PATTERN = /\/(\d{4,})(\/|$)/g;

function replaceIdsInPath(path: string): string {
  return path
    .replace(UUID_PATTERN, '{uuid}')
    .replace(NUMERIC_ID_PATTERN, '/{id}$2');
}

function createCallItemHTML(call: NetworkCall): string {
  const isSuccess = call.status >= 200 && call.status < 300;
  const url = extractNetworkCallUrl(call);
  const method = extractNetworkCallMethod(call);
  const methodClass = `api-call-badge-${method.toLowerCase()}`;
  const statusClass = isSuccess ? 'api-call-badge-success' : 'api-call-badge-error';
  const indicatorClass = isSuccess ? 'api-call-status-success' : 'api-call-status-error';

  // Parse URL for cleaner display
  let cleanPath = url;
  let queryParams: { key: string; value: string }[] = [];

  try {
    const urlObj = new URL(url);
    cleanPath = replaceIdsInPath(urlObj.pathname);
    queryParams = Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({ key, value }));
  } catch {
    // If URL parsing fails, just use the raw URL
  }

  // Generate query params chips HTML
  const queryParamsHTML = queryParams.length > 0
    ? `<div class="api-call-query-params">
        ${queryParams.map(({ key, value }) =>
          `<span class="api-call-query-chip" title="${key}=${value}">
            <span class="query-key">${key}</span>=<span class="query-value">${value.length > 15 ? value.substring(0, 15) + '...' : value}</span>
          </span>`
        ).join('')}
      </div>`
    : '';

  // Unique ID for this call's expandable section
  const expandId = `expand-${call.id}`;

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
          <div class="api-call-url-main">${cleanPath}</div>
          ${queryParamsHTML}
          <div class="api-call-expand-section">
            <button class="api-call-expand-btn" onclick="event.stopPropagation(); const el = document.getElementById('${expandId}'); const btn = this; if(el.style.display === 'none') { el.style.display = 'block'; btn.innerHTML = '▼ Hide Full URL'; } else { el.style.display = 'none'; btn.innerHTML = '▶ Full URL'; }">
              ▶ Full URL
            </button>
            <div id="${expandId}" class="api-call-url-full" style="display: none;">${url}</div>
          </div>
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

      // Add to cache instead of array (async now for filtering)
      await addToCache(message.requests);

      // Initialize Indi on first NETWORK_IDLE
      if (!isIndiInitialized) {
        initializeIndi(message.requests);
      } else {
        // Already initialized, just analyze
        // only analyze if indi blob is connected to this page - which means finished onboarding
        analyzeNetworkForIndi(message.requests);
      }

      // Performance: Skip indicator updates if tab is not visible
      if (!isTabVisible) {
        console.log('🌙 Tab hidden - skipping indicator update');
        break;
      }

      // Performance: Debounce indicator updates (but don't starve them!)
      const now = Date.now();
      const timeSinceLastUpdate = now - lastIndicatorUpdateTime;

      if (timeSinceLastUpdate < INDICATOR_UPDATE_DEBOUNCE_MS) {
        // Too soon - schedule for later, but only if not already scheduled
        // This prevents timer from being constantly reset on busy pages
        if (!indicatorUpdateTimer) {
          indicatorUpdateTimer = setTimeout(() => {
            // Double-check visibility before updating
            if (!isTabVisible) {
              indicatorUpdateTimer = null;
              return;
            }
            const monitor = IndicatorMonitor.getInstance();
            monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache);
            lastIndicatorUpdateTime = Date.now();
            indicatorUpdateTimer = null;
          }, INDICATOR_UPDATE_DEBOUNCE_MS - timeSinceLastUpdate);
        }
      } else {
        // Enough time passed - update now (leading edge)
        const monitor = IndicatorMonitor.getInstance();
        monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache);
        lastIndicatorUpdateTime = now;

        // Clear any pending timer since we just updated
        if (indicatorUpdateTimer) {
          clearTimeout(indicatorUpdateTimer);
          indicatorUpdateTimer = null;
        }
      }

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

      // Feed to flow recorder if recording
      if (flowRecorder.isRecording()) {
        flowRecorder.addAPICall(message.data);
      }
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

/**
 * Handle ESC key press to cancel inspect mode
 */
function handleEscapeKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && isInspectMode) {
    e.preventDefault();
    disableInspectMode();
  }
}

/**
 * Update Create Indicator button icon (+ vs ✖️)
 */
function updateCreateIndicatorButton(isInspecting: boolean) {
  const button = document.getElementById('indi-summary-create-indicator');
  if (button) {
    button.textContent = isInspecting ? '✖️' : '+';
    button.title = isInspecting ? 'Cancel (ESC)' : 'Create Indicator';
  }
}

function enableInspectMode(indicatorData?: any) {
  // BYPASS: Skip domain validation - allow inspect mode on any domain
  isInspectMode = true;
  document.body.style.cursor = "crosshair";
  createHighlighter();

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("keydown", handleEscapeKey);

  if (indicatorData) {
    // createIndicatorFromData(indicatorData)
    document.addEventListener("click", handleIndiBlobRef, true);
  } else {
    document.addEventListener("click", handleClick, true);
  }

  // Update Create Indicator button to show cancel icon
  updateCreateIndicatorButton(true);
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

  // Exception: Don't handle clicks on the Create Indicator button itself
  const target = e.target as HTMLElement;
  if (target?.id === 'indi-summary-create-indicator' ||
      target?.closest('#indi-summary-create-indicator')) {
    return; // Let the button's own click handler work
  }

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

    showModal({data: callsWithIds, id: data.id, path: getElementPath(hoveredElement), rect: hoveredElement.getBoundingClientRect(), tagName: hoveredElement.tagName}, { networkCalls: callsWithIds });


  }

  disableInspectMode();
}

function handleIndiBlobRef(e: MouseEvent) {
  if (!isInspectMode) return;

  // Exception: Don't handle clicks on the Create Indicator button itself
  const target = e.target as HTMLElement;
  if (target?.id === 'indi-summary-create-indicator' ||
      target?.closest('#indi-summary-create-indicator')) {
    return; // Let the button's own click handler work
  }

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
      networkCalls = [storedNetworkCall];
    } else if (indiBlobUrlWithIssue) {
      // Fallback: try to find it again in the cache using safe helper
      const foundCall = findNetworkCallInCache(indiBlobUrlWithIssue);

      if (foundCall) {
        networkCalls = [foundCall];
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
  document.removeEventListener("keydown", handleEscapeKey);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("click", handleIndiBlobRef, true);

  if (highlighter) {
    highlighter.remove();
    highlighter = null;
  }

  // Clean up stored data
  indiBlobUrlWithIssue = null;
  delete (window as any).__indiBlobNetworkCall;

  // Restore Create Indicator button to plus icon
  updateCreateIndicatorButton(false);
}

// Export for debugging - available in content script context
(window as any).indi = {
  blob: () => indiBlob,
  speech: () => speechBubble,
  onboarding: () => onboardingFlow,
  restart: () => onboardingFlow?.restart(),
  cache: () => recentCallsCache,
  urls: () => getUrlsFromCache(),
};

// content.ts

console.log("Content script loaded");
