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
    const staticExtensions = [
      '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
      '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map',
      '.webp', '.avif', '.mp4', '.webm', '.mp3', '.wav',
      '.pdf', '.zip', '.tar', '.gz'
    ];
    return staticExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Get configured backend URL for current domain
 */
async function getConfiguredBackendUrl(): Promise<string | null> {
  const key = `indi_onboarding_${window.location.hostname}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const state = result[key];
      resolve(state?.selectedBackendUrl || null);
    });
  });
}

/**
 * Check if a network call should be stored based on backend config
 */
async function shouldStoreCall(url: string): Promise<boolean> {
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

    // Listen for Settings button clicks
    if (target && target.id === 'indi-summary-settings') {
      console.log('⚙️ Settings button clicked from summary tooltip!');

      // Get network data from cache
      const networkData = Array.from(recentCallsCache.values()).flat();

      // Update onboarding with current network data
      if (onboardingFlow) {
        onboardingFlow.updateNetworkData(networkData);

        // Show backend selection step
        onboardingFlow.showStep2(true);
      }
    }

    // Listen for Create Flow button clicks
    if (target && target.id === 'indi-summary-create-flow') {
      console.log('🔴 Create Flow button clicked!');
      handleCreateFlowClick(target);
    }

    // Listen for Play Flow button clicks
    if (target && target.id === 'indi-summary-play-flow') {
      console.log('▶️ Play Flow button clicked!');
      handlePlayFlowClick();
    }
  });
}

// ==================== FLOW RECORDING HANDLERS ====================

/**
 * Handle Create Flow button click - Toggle recording on/off
 */
async function handleCreateFlowClick(button: HTMLElement) {
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

  flows.forEach(flow => {
    const createdDate = new Date(flow.createdAt).toLocaleDateString();
    const lastRun = flow.lastRun
      ? `<div style="font-size: 11px; color: ${flow.lastRun.passed ? '#10b981' : '#ef4444'}; margin-top: 4px;">
           Last run: ${flow.lastRun.passed ? '✓' : '✗'} ${new Date(flow.lastRun.timestamp).toLocaleString()}
         </div>`
      : '';

    html += `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        margin-bottom: 10px;
        background: linear-gradient(135deg, #fdf2f8, #fce7f3);
        border-radius: 12px;
        border: 2px solid #fbcfe8;
        transition: all 0.2s;
      " onmouseover="this.style.borderColor='#f472b6'; this.style.background='linear-gradient(135deg, #fce7f3, #fbcfe8)';"
         onmouseout="this.style.borderColor='#fbcfe8'; this.style.background='linear-gradient(135deg, #fdf2f8, #fce7f3)';">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px; color: #831843;">${flow.name}</div>
          <div style="font-size: 12px; color: #9ca3af;">
            ${flow.steps.length} steps • Created ${createdDate}
          </div>
          ${lastRun}
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="play-flow-${flow.id}" style="
            padding: 9px 18px;
            background: linear-gradient(135deg, #ec4899, #db2777);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3);
            transition: all 0.15s ease;
          " onmouseover="this.style.background='linear-gradient(135deg, #db2777, #be185d)'; this.style.boxShadow='0 4px 12px rgba(236, 72, 153, 0.4)';"
             onmouseout="this.style.background='linear-gradient(135deg, #ec4899, #db2777)'; this.style.boxShadow='0 2px 8px rgba(236, 72, 153, 0.3)';">
            ▶️ Play
          </button>
          <button id="delete-flow-${flow.id}" style="
            padding: 9px 14px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
            transition: all 0.15s ease;
          " onmouseover="this.style.background='linear-gradient(135deg, #dc2626, #b91c1c)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.4)';"
             onmouseout="this.style.background='linear-gradient(135deg, #ef4444, #dc2626)'; this.style.boxShadow='0 2px 8px rgba(239, 68, 68, 0.3)';">
            🗑️
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
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
      <div style="width: 12px; height: 12px; background: white; border-radius: 50%; animation: pulse 1.5s infinite;"></div>
      <strong>Playing Flow: ${flow.name}</strong>
    </div>
    <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
      Step <span id="indi-current-step">0</span> of ${flow.steps.length}
    </div>
    <div style="margin-top: 8px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden;">
      <div id="indi-progress-bar" style="height: 100%; background: white; width: 0%; transition: width 0.3s;"></div>
    </div>
  `;

  document.body.appendChild(progressOverlay);

  // BUG FIX #8: Listen for resume event to restore UI after navigation
  const handleResume = (event: any) => {
    console.log('🎬 Playback resumed event received:', event.detail);
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
  console.log('🫧 Indi blob clicked!');


  // Check if backend is configured
  const configured = await isBackendConfigured();

  if (configured) {
    // Backend is configured - show summary if we have data, otherwise show menu
    console.log('🫧 Indi blob clicked - backend configured');

    if (indiBlob) {
      // Check FIRST if we have summary data OR cumulative summary
      const summaryData = indiBlob.getCurrentSummaryData();
      const hasSummary = summaryData || cumulativeSummary;

      if (hasSummary) {
        // We have data - show the tooltip
        console.log('📊 Showing summary tooltip with data');
        indiBlob.toggleTooltip();
      } else {
        // No data yet - show main menu instead of "All Good" message
        console.log('📋 No issues detected - showing main menu');
        showIndiMainMenu();
      }
    }
  } else {
    // Backend not configured - show onboarding
    console.log('⚙️ Backend not configured - starting onboarding');
    if (onboardingFlow) {
      // let's get urls from cache for onboarding
      const networkData = Array.from(recentCallsCache.values()).flat();
      await onboardingFlow.startWithNetworkData(networkData);
    }
  }
}

/**
 * Show Indi main menu with all available actions
 */
async function showIndiMainMenu() {
  if (!speechBubble) return;

  // Get flows count for this domain
  const flows = await FlowStorage.getFlowsForDomain();
  const flowsCount = flows.length;

  speechBubble.show({
    title: '🫧 Indi Menu',
    message: 'What would you like to do?',
    actions: [
      {
        label: `▶️ Play Flow${flowsCount > 0 ? ` (${flowsCount})` : ''}`,
        style: 'primary',
        onClick: async () => {
          speechBubble?.hide();
          await handlePlayFlowClick();
        },
      },
      {
        label: '🔴 Record Flow',
        style: 'primary',
        onClick: async () => {
          speechBubble?.hide();

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
              showRecordingIndicator();

              // Show quick tip
              await Swal.fire({
                icon: 'info',
                title: 'Recording Started!',
                html: `
                  <p>I'm now recording your interactions.</p>
                  <p style="margin-top: 12px; font-size: 14px; color: #6b7280;">
                    💡 Tip: Click, type, and navigate as you normally would.
                    Click the recording indicator to stop when done.
                  </p>
                `,
                timer: 4000,
                timerProgressBar: true,
                showConfirmButton: false,
                customClass: { popup: 'jira-popup' }
              });
            } catch (error: any) {
              await Swal.fire({
                icon: 'error',
                title: 'Cannot Start Recording',
                text: error.message,
                customClass: { popup: 'jira-popup' }
              });
            }
          }
        },
      },
      {
        label: '➕ Create Indicator',
        style: 'secondary',
        onClick: () => {
          speechBubble?.hide();
          enableInspectMode();
        },
      },
      {
        label: '📊 Page Summary',
        style: 'secondary',
        onClick: async () => {
          speechBubble?.hide();

          // Analyze current network data
          const networkData = Array.from(recentCallsCache.values()).flat();
          if (networkData.length === 0) {
            await Swal.fire({
              icon: 'info',
              title: 'No API Calls Yet',
              text: 'No API calls have been detected on this page yet. Try interacting with the page first!',
              customClass: { popup: 'jira-popup' }
            });
            return;
          }

          if (pageSummary && indiBlob) {
            const summary = pageSummary.analyze(networkData);
            const summaryHTML = pageSummary.generateSummaryHTML(summary);

            await Swal.fire({
              title: '📊 Page Summary',
              html: summaryHTML,
              width: '500px',
              showConfirmButton: false,
              showCloseButton: true,
              customClass: { popup: 'jira-popup' }
            });
          }
        },
      },
      {
        label: '⚙️ Settings',
        style: 'secondary',
        onClick: async () => {
          speechBubble?.hide();

          // Show onboarding to reconfigure
          if (onboardingFlow) {
            const networkData = Array.from(recentCallsCache.values()).flat();
            await onboardingFlow.startWithNetworkData(networkData);
          }
        },
      },
    ],
    showClose: true,
    persistent: false,
  });
}

// Track cumulative issues for the current page
let currentPageUrl: string = window.location.href;
let cumulativeErrorCalls = new Set<string>(); // Track unique error URLs
let cumulativeSlowApis = new Set<string>(); // Track unique slow API URLs
let cumulativeSecurityIssues = new Set<string>(); // Track unique security issues
let cumulativeSummary: PageSummaryData | null = null; // Track cumulative summary for badge clicks
let cumulativeFailedCalls: NetworkCall[] = []; // Track actual failed call objects for detailed view

// Reset cumulative tracking when page changes
function resetCumulativeTracking() {
  currentPageUrl = window.location.href;
  cumulativeErrorCalls.clear();
  cumulativeSlowApis.clear();
  cumulativeSecurityIssues.clear();
  cumulativeSummary = null;
  cumulativeFailedCalls = []; // Reset failed calls array
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
    // Add error URLs to cumulative set AND store full call objects
    networkData.forEach(call => {
      if (call.status >= 400) {
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

  // Build simple summary message (Option 3 style)
  const issueCount = summary.errorCalls + (summary.slowestApi && summary.slowestApi.duration > 1000 ? 1 : 0) + summary.securityIssues;

  let message = '';

  // Get most recent error if we have failed calls
  let mostRecentError = '';
  if (cumulativeFailedCalls.length > 0 && summary.errorCalls > 0) {
    const recentCall = cumulativeFailedCalls[0];
    const url = extractNetworkCallUrl(recentCall);
    const method = recentCall?.request?.request?.method ?? 'GET';
    const status = recentCall.status;
    let error: string = 'Error';
    const urlDisplay = url.length > 40 ? '...' + url.slice(-37) : url;
    try {
      const bodyObj = JSON.parse(recentCall?.body?.body);
      error = bodyObj.error || 'Error';
    } catch (e) {
      console.error('Failed to parse request body for recent error:', e);
    }


    // Get time ago
    const now = Date.now();
    const timestamp = recentCall.timestamp || now;
    const timeAgo = now - timestamp < 5000 ? 'just now' : `${Math.round((now - timestamp) / 1000)}s ago`;

    mostRecentError = `\nMost Recent:\n❌ ${method} ${urlDisplay} → ${status} Error ${error} (${timeAgo})`;
  }

  // Count errors, slow APIs, security issues
  const errorText = summary.errorCalls > 0 ? `${summary.errorCalls} API${summary.errorCalls > 1 ? 's' : ''} failing` : '';
  const slowText = summary.slowestApi && summary.slowestApi.duration > 1000 ? '1 slow API' : '';
  const securityText = summary.securityIssues > 0 ? `${summary.securityIssues} security issue${summary.securityIssues > 1 ? 's' : ''}` : '';

  const issues = [errorText, slowText, securityText].filter(Boolean);
  const issuesText = issues.join(', ');

  message = `${issuesText}${mostRecentError}`;

  if (message) {
    speechBubble.show({
      title: '⚠️ Issues Detected',
      message: message,
      bypassMute: bypassMute,
      actions: [
        {
          label: 'View Details',
          style: 'primary',
          onClick: () => {
            speechBubble?.hide();
            showDetailedIssuesModal(summary);
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
          label: 'Dismiss All',
          style: 'secondary',
          onClick: () => {
            speechBubble?.hide();

            // Clear all notifications
            if (indiBlob) {
              const currentCount = indiBlob['notificationCount'] || 0;
              indiBlob.setNotifications(0);
              indiBlob.setEmotion('happy');

              console.log('🔔 All notifications dismissed:', currentCount, '→', 0);
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
 * Show detailed issues modal with full information
 */
async function showDetailedIssuesModal(summary: PageSummaryData) {
  // Build detailed HTML for all issues
  let html = '<div style="text-align: left; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif;">';

  // Failed APIs Section
  if (summary.errorCalls > 0 && cumulativeFailedCalls.length > 0) {
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #dc2626; display: flex; align-items: center; gap: 8px;">
          ❌ Failed APIs (${summary.errorCalls})
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
          <div style="font-size: 12px; color: #374151; word-break: break-all; margin-bottom: 4px;">
            ${url}
          </div>
          <div style="font-size: 11px; color: ${errorColor}; font-weight: 600;">
            ${errorType}
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  // Slow APIs Section
  if (summary.slowestApi && summary.slowestApi.duration > 1000) {
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #ea580c; display: flex; align-items: center; gap: 8px;">
          ⚡ Slow APIs
        </h3>
        <div style="
          padding: 12px;
          background: linear-gradient(135deg, #fff7ed, #ffedd5);
          border-left: 4px solid #ea580c;
          border-radius: 8px;
        ">
          <div style="font-size: 13px; color: #ea580c; font-weight: 600; margin-bottom: 6px;">
            ${summary.slowestApi.duration}ms response time
          </div>
          <div style="font-size: 12px; color: #374151; word-break: break-all;">
            ${summary.slowestApi.url}
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
            💡 Consider adding an indicator to monitor this API's performance
          </div>
        </div>
      </div>
    `;
  }

  // Security Issues Section
  if (summary.securityIssues > 0 && summary.apisWithoutAuth && summary.apisWithoutAuth.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #7c2d12; display: flex; align-items: center; gap: 8px;">
          🔒 Security Issues (${summary.securityIssues})
        </h3>
        <div style="max-height: 200px; overflow-y: auto;">
    `;

    summary.apisWithoutAuth.forEach(url => {
      html += `
        <div style="
          margin-bottom: 8px;
          padding: 10px;
          background: linear-gradient(135deg, #fefce8, #fef9c3);
          border-left: 4px solid #ca8a04;
          border-radius: 8px;
          font-size: 12px;
          color: #374151;
          word-break: break-all;
        ">
          ${url}
          <div style="font-size: 11px; color: #92400e; margin-top: 4px;">
            Missing authentication headers
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
  await Swal.fire({
    title: '📊 Detailed Issues Report',
    html: html,
    width: '700px',
    showConfirmButton: false,
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
    }
  });
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

async function addToCache(calls: NetworkCall[]) {
  // Filter calls before processing
  const filteredCalls = [];

  for (const call of calls) {
    try {
      // Extract URL from various possible locations
      const url = call?.response?.response?.url ??
                  call?.response?.url ??
                  call?.request?.request?.url ??
                  call?.url;

      if (!url) {
        console.warn('Call without URL, skipping cache', call);
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
      const url = call?.response?.response?.url ??
                  call?.response?.url ??
                  call?.request?.request?.url ??
                  call?.url;

      const method = call?.request?.request?.method ??
                     call?.method ??
                     'GET';

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

  console.log(`📊 Filtered network calls: ${calls.length} total → ${filteredCalls.length} backend calls stored`);
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
  console.log('✨ Indi modal styles injected');
}

// Clear cache on navigation
window.addEventListener('beforeunload', clearCache);

createContainers();
injectStyles();
injectCustomModalStyles();
IndicatorLoader.getInstance();

// CRITICAL: Check if there's a recording session in storage (page may have reloaded during recording)
(async () => {
  const restored = await flowRecorder.restoreSessionFromStorage();
  if (restored) {
    console.log('🎬 Recording session restored! Showing recording indicator...');
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
        console.log('✅ Indicator data saved! Creating visual indicator immediately...');
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
