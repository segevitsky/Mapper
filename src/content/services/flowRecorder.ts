// Flow Recorder - Capture user interactions and API calls

import { FlowStep, FlowAction, RecordingSession, ExpectedAPI } from '../../types/flow';
import { NetworkCall } from '../../types';
import { ElementIdentifier } from './elementIdentifier';

/**
 * FlowRecorder - Captures user interactions and correlates with API calls
 */
export class FlowRecorder {
  private static instance: FlowRecorder | null = null;

  private recording = false;
  private currentSession: RecordingSession | null = null;

  // Temporary storage during recording
  private recordingAPIsMap: Map<number, NetworkCall[]> = new Map();

  // Event listeners (stored for cleanup)
  private eventListeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListener;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  private observers: MutationObserver[] = [];

  // Debouncing for certain events
  private lastScrollTime = 0;
  private lastMouseMoveTime = 0;

  private constructor() {}

  static getInstance(): FlowRecorder {
    if (!FlowRecorder.instance) {
      FlowRecorder.instance = new FlowRecorder();
    }
    return FlowRecorder.instance;
  }

  /**
   * Start recording a new flow
   */
  async startRecording(flowName: string): Promise<void> {
    if (this.recording) {
      console.warn('⚠️ Already recording. Stop current recording first.');
      return;
    }

    // BUG FIX #2: Check if playback is active
    const { flowPlayer } = await import('./flowPlayer');
    if (flowPlayer.isPlaying()) {
      throw new Error('Cannot record while flow is playing. Stop playback first.');
    }

    console.log(`🔴 Started recording flow: "${flowName}"`);

    this.recording = true;
    this.currentSession = {
      flowId: this.generateId(),
      flowName,
      startTime: Date.now(),
      steps: [],
      pendingAPIs: new Map()
    };

    this.recordingAPIsMap.clear();

    // CRITICAL: Save to Chrome storage immediately to survive page reloads
    this.saveSessionToStorage();

    // Set up all event listeners
    this.setupEventListeners();

    // Observe navigation
    this.observeNavigation();

    // Observe DOM changes
    this.observeDOM();

    // Dispatch event to notify UI
    document.dispatchEvent(new CustomEvent('indi-flow-recording-started', {
      detail: { flowName }
    }));
  }

  /**
   * Stop recording and finalize the flow
   */
  stopRecording(): RecordingSession | null {
    if (!this.recording || !this.currentSession) {
      console.warn('⚠️ Not currently recording');
      return null;
    }

    console.log(`⏹️ Stopped recording flow: "${this.currentSession.flowName}"`);

    this.recording = false;

    // Clean up all event listeners
    this.cleanupEventListeners();

    // Clean up observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    // SIMPLIFIED: Skip API correlation for now
    // Focusing on reliable element interaction first
    // this.correlateAllAPIs();

    const session = this.currentSession;
    this.currentSession = null;
    this.recordingAPIsMap.clear();

    // Clear from storage
    this.clearSessionFromStorage();

    // Dispatch event to notify UI
    document.dispatchEvent(new CustomEvent('indi-flow-recording-stopped', {
      detail: { flowId: session.flowId, steps: session.steps.length }
    }));

    return session;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Get current recording session
   */
  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  /**
   * Add API call to recording map (called from content.ts when API fires)
   */
  addAPICall(call: NetworkCall): void {
    if (!this.recording) return;

    const timestamp = call.timestamp || Date.now();
    const existing = this.recordingAPIsMap.get(timestamp) || [];
    this.recordingAPIsMap.set(timestamp, [...existing, call]);

    console.log(`📡 Captured API during recording: ${call.method} ${call.url}`);
  }

  // ==================== EVENT LISTENERS ====================

  private setupEventListeners(): void {
    // Click events (highest priority)
    this.addEventListener(document, 'click', this.onElementClick.bind(this), true);

    // Input events
    this.addEventListener(document, 'input', this.onInput.bind(this), true);
    this.addEventListener(document, 'change', this.onChange.bind(this), true);

    // Scroll events (debounced)
    this.addEventListener(document, 'scroll', this.onScroll.bind(this), true);

    // Mouse move (debounced - for hover detection)
    this.addEventListener(document, 'mousemove', this.onMouseMove.bind(this), true);

    // Keyboard events
    this.addEventListener(document, 'keydown', this.onKeyDown.bind(this), true);
  }

  private addEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener | ((evt: any) => void),
    options?: boolean | AddEventListenerOptions
  ): void {
    // Cast to EventListener when calling the DOM API so callers can pass strongly-typed handlers
    target.addEventListener(type, listener as EventListener, options);
    this.eventListeners.push({ target, type, listener, options });
  }

  private cleanupEventListeners(): void {
    this.eventListeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this.eventListeners = [];
  }

  // ==================== EVENT HANDLERS ====================

  private onElementClick(e: MouseEvent): void {
    if (!this.recording || !this.currentSession) return;

    let target = e.target as HTMLElement;

    // Ignore clicks on Indi elements
    if (target.closest('#indi-blob-container') || target.closest('[id^="indi-"]')) {
      return;
    }

    // CRITICAL FIX: Find the actual clickable element, not just the target
    // If we clicked on a child (like <span> inside <button>), find the parent clickable element
    const clickableElement = this.findClickableParent(target);
    if (clickableElement) {
      target = clickableElement;
    }

    console.log(`🖱️ Captured click on:`, target.tagName, {
      id: target.id,
      className: target.className,
      text: target.textContent?.substring(0, 50)
    });

    const step: FlowStep = {
      id: this.generateId(),
      timestamp: Date.now(),
      action: {
        type: 'click',
        element: ElementIdentifier.captureElement(target),
        position: { x: e.clientX, y: e.clientY }
      },
      triggeredAPIs: []
    };

    this.currentSession.steps.push(step);

    // Save to storage after each step to survive page reloads
    this.saveSessionToStorage();
  }

  /**
   * Find the actual clickable parent element (button, link, etc.)
   * This is critical for navbar clicks where you might click on an icon/text inside a button
   */
  private findClickableParent(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = element;
    let depth = 0;

    while (current && depth < 5) { // Max 5 levels up
      const tag = current.tagName.toLowerCase();
      const role = current.getAttribute('role');

      // Check if this is a clickable element
      if (
        tag === 'button' ||
        tag === 'a' ||
        tag === 'input' ||
        role === 'button' ||
        role === 'link' ||
        role === 'tab' ||
        role === 'menuitem' ||
        current.hasAttribute('onclick') ||
        current.style.cursor === 'pointer'
      ) {
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    return null; // No clickable parent found, use original target
  }

  private onInput(e: Event): void {
    if (!this.recording || !this.currentSession) return;

    const target = e.target as HTMLInputElement;

    console.log(`⌨️ Captured input on:`, target);

    const step: FlowStep = {
      id: this.generateId(),
      timestamp: Date.now(),
      action: {
        type: 'input',
        element: ElementIdentifier.captureElement(target),
        value: target.value
      },
      triggeredAPIs: []
    };

    this.currentSession.steps.push(step);
    this.saveSessionToStorage();
  }

  private onChange(e: Event): void {
    if (!this.recording || !this.currentSession) return;

    const target = e.target as HTMLInputElement | HTMLSelectElement;

    console.log(`🔄 Captured change on:`, target);

    const step: FlowStep = {
      id: this.generateId(),
      timestamp: Date.now(),
      action: {
        type: 'change',
        element: ElementIdentifier.captureElement(target as HTMLElement),
        value: target.value
      },
      triggeredAPIs: []
    };

    this.currentSession.steps.push(step);
    this.saveSessionToStorage();
  }

  private onScroll(e: Event): void {
    if (!this.recording || !this.currentSession) return;

    // Debounce scroll events (only record every 500ms)
    const now = Date.now();
    if (now - this.lastScrollTime < 500) return;
    this.lastScrollTime = now;

    const target = e.target as HTMLElement;

    console.log(`📜 Captured scroll`);

    const step: FlowStep = {
      id: this.generateId(),
      timestamp: now,
      action: {
        type: 'scroll',
        scrollPosition: {
          x: window.scrollX || document.documentElement.scrollLeft,
          y: window.scrollY || document.documentElement.scrollTop
        }
      },
      triggeredAPIs: []
    };

    this.currentSession.steps.push(step);
  }

  private onMouseMove(e: MouseEvent): void {
    console.log({e})
    // TODO: Implement hover detection if needed
    // For now, we'll skip recording every mouse move to avoid noise
  }

  private onKeyDown(e: KeyboardEvent): void {
    console.log({e})
    // TODO: Capture special keys like Enter, Tab, Escape if needed
    // For MVP, input/change events should be enough
  }

  // ==================== NAVIGATION TRACKING ====================

  private observeNavigation(): void {
    // Listen to URL changes (works for SPAs)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const self = this;

    history.pushState = function (...args) {
      self.recordNavigation(args[2] as string);
      return originalPushState.apply(history, args);
    };

    history.replaceState = function (...args) {
      self.recordNavigation(args[2] as string);
      return originalReplaceState.apply(history, args);
    };

    window.addEventListener('popstate', () => {
      this.recordNavigation(window.location.href);
    });
  }

  private recordNavigation(url: string): void {
    if (!this.recording || !this.currentSession) return;

    console.log(`🧭 Captured navigation to: ${url}`);

    const step: FlowStep = {
      id: this.generateId(),
      timestamp: Date.now(),
      action: {
        type: 'navigate',
        url: url
      },
      triggeredAPIs: []
    };

    this.currentSession.steps.push(step);
  }

  // ==================== DOM OBSERVATION ====================

  private observeDOM(): void {
    // Watch for significant DOM changes
    const observer = new MutationObserver((mutations) => {
      // For now, just log significant changes
      // In the future, we could use this to detect dynamic content loading
      const significantChanges = mutations.filter(m =>
        m.addedNodes.length > 0 || m.removedNodes.length > 0
      );

      if (significantChanges.length > 0) {
        console.log('🔄 Significant DOM changes detected');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observers.push(observer);
  }

  // ==================== API CORRELATION ====================

  /**
   * Correlate all APIs to steps (called when recording stops)
   */
  private correlateAllAPIs(): void {
    if (!this.currentSession) return;

    console.log(`🔗 Correlating APIs to ${this.currentSession.steps.length} steps...`);

    this.currentSession.steps.forEach(step => {
      // Get all APIs that fired within 2 seconds after this step
      const correlatedAPIs = this.getAPIsInWindow(
        step.timestamp,
        step.timestamp + 2000
      );

      step.triggeredAPIs = correlatedAPIs.map(call => ({
        url: call.url,
        method: call.method,
        capturedResponse: call.response?.body || call.body,
        capturedStatus: call.status,
        capturedDuration: call.duration,
        // No expectations yet - user will define these later
        expectations: {
          required: true, // Default: API must fire
          status: {
            mustBe: call.status // Default: expect same status
          }
        }
      }));

      if (step.triggeredAPIs.length > 0) {
        console.log(`  Step ${step.id}: ${step.triggeredAPIs.length} APIs correlated`);
      }
    });
  }

  /**
   * Get all API calls within a time window
   */
  private getAPIsInWindow(startTime: number, endTime: number): NetworkCall[] {
    const apis: NetworkCall[] = [];

    this.recordingAPIsMap.forEach((calls, timestamp) => {
      if (timestamp >= startTime && timestamp <= endTime) {
        apis.push(...calls);
      }
    });

    return apis;
  }

  // ==================== STORAGE (SURVIVE PAGE RELOADS) ====================

  /**
   * Save current recording session to Chrome storage
   */
  private saveSessionToStorage(): void {
    if (!this.currentSession) return;

    // Convert session to JSON-serializable format
    const pendingAPIsArray = this.currentSession.pendingAPIs
      ? Array.from(this.currentSession.pendingAPIs.entries())
      : [];

    const sessionData = {
      ...this.currentSession,
      pendingAPIs: pendingAPIsArray
    };

    chrome.storage.local.set({
      'indi_recording_session': sessionData
    }).then(() => {
      console.log('💾 Recording session saved to storage');
    }).catch(err => {
      console.error('Failed to save recording session:', err);
    });
  }

  /**
   * Restore recording session from Chrome storage (if page reloaded during recording)
   */
  async restoreSessionFromStorage(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['indi_recording_session']);
      const sessionData = result.indi_recording_session;

      if (!sessionData) {
        return false;
      }

      console.log('🔄 Restoring recording session from storage...');

      this.recording = true;
      this.currentSession = {
        ...sessionData,
        pendingAPIs: new Map(sessionData.pendingAPIs || [])
      };

      // Resume event listeners
      this.setupEventListeners();
      this.observeNavigation();
      this.observeDOM();

      if (!this.currentSession) {
        console.warn('⚠️ Failed to restore current session');
        return false;
      }

      console.log(`✅ Resumed recording: "${this.currentSession.flowName}" (${this.currentSession.steps.length} steps so far)`);

      return true;
    } catch (error) {
      console.error('Failed to restore recording session:', error);
      return false;
    }
  }

  /**
   * Clear recording session from storage
   */
  private clearSessionFromStorage(): void {
    chrome.storage.local.remove(['indi_recording_session']).catch(err => {
      console.error('Failed to clear recording session:', err);
    });
  }

  // ==================== UTILITIES ====================

  private generateId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const flowRecorder = FlowRecorder.getInstance();
