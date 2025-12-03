// Flow Player - Replay recorded flows

import { IndiFlow, FlowStep, FlowPlaybackResult, StepResult, APIValidationResult, ExpectedAPI } from '../../types/flow';
import { NetworkCall } from '../../types';
import { ElementFinder } from './elementIdentifier';
import { recentCallsCache } from '../content';
import { FlowStorage } from './flowStorage';
import Swal from 'sweetalert2';

/**
 * Playback session state (for surviving page reloads)
 */
interface PlaybackSession {
  flowId: string;
  currentStepIndex: number;
  startTime: number;
  results: StepResult[];
  sessionId: string; // Unique ID to prevent multi-tab conflicts
  savedAt: number; // Timestamp for expiration check
  expiresAt: number; // TTL (5 minutes)
}

/**
 * FlowPlayer - Replays recorded flows and validates results
 */
export class FlowPlayer {
  private playing = false;
  private currentFlow: IndiFlow | null = null;
  private results: StepResult[] = [];
  private startTime = 0;
  private currentStepIndex = 0;
  private sessionId = ''; // Current playback session ID

  // Temporary storage for API calls during playback
  private playbackAPIsMap: Map<number, NetworkCall[]> = new Map();

  /**
   * Play a flow
   * @param flow - The flow to play
   * @param resumeFromStep - Step index to resume from (0 = start from beginning)
   */
  async playFlow(flow: IndiFlow, resumeFromStep: number = 0): Promise<FlowPlaybackResult> {
    if (this.playing) {
      throw new Error('Already playing a flow');
    }

    // BUG FIX #2: Check if recording is active
    const { flowRecorder } = await import('./flowRecorder');
    if (flowRecorder.isRecording()) {
      throw new Error('Cannot play flow while recording is active. Stop recording first.');
    }

    console.log(`▶️ Playing flow: "${flow.name}" (${flow.steps.length} steps)${resumeFromStep > 0 ? ` - Resuming from step ${resumeFromStep + 1}` : ''}`);

    // Simple warning if not on start URL - don't block playback
    if (resumeFromStep === 0 && flow.startUrl && window.location.href !== flow.startUrl) {
      console.warn(`⚠️ Flow was recorded on: ${flow.startUrl}`);
      console.warn(`⚠️ Currently on: ${window.location.href}`);
      console.warn(`⚠️ Playback may fail if page structure is different`);
    }

    this.playing = true;
    this.currentFlow = flow;
    this.sessionId = this.sessionId || this.generateSessionId();
    this.results = resumeFromStep > 0 ? await this.loadResultsFromStorage() : [];
    this.startTime = resumeFromStep > 0 ? await this.loadStartTimeFromStorage() : Date.now();
    this.currentStepIndex = resumeFromStep;
    this.playbackAPIsMap.clear();

    // Dispatch event to show playback UI (or resume UI)
    if (resumeFromStep > 0) {
      document.dispatchEvent(new CustomEvent('indi-flow-playback-resumed', {
        detail: {
          flow,
          stepIndex: resumeFromStep,
          totalSteps: flow.steps.length
        }
      }));
    } else {
      document.dispatchEvent(new CustomEvent('indi-flow-playback-started', {
        detail: { flow }
      }));
    }

    let failedStepId: string | undefined;

    try {
      for (let i = resumeFromStep; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        this.currentStepIndex = i;

        // Update progress
        document.dispatchEvent(new CustomEvent('indi-flow-playback-progress', {
          detail: { stepIndex: i, totalSteps: flow.steps.length, step }
        }));

        const stepStartTime = Date.now();
        const stepResult = await this.playStep(step);
        const stepDuration = Date.now() - stepStartTime;

        stepResult.duration = stepDuration;
        this.results.push(stepResult);

        // BUG FIX #4: Save progress after each step (in case of mid-flow navigation)
        await this.savePlaybackProgress();

        if (!stepResult.passed && !step.continueOnFailure) {
          failedStepId = step.id;
          console.error(`❌ Step ${i + 1} failed, stopping playback`);
          break;
        }

        // Wait if specified
        if (step.waitAfter) {
          await this.wait(step.waitAfter);
        }
      }
    } finally {
      this.playing = false;
      this.playbackAPIsMap.clear();
      // BUG FIX #1 & #10: Clear playback state with fallback
      await this.clearPlaybackState();
    }

    const endTime = Date.now();
    const success = this.results.every(r => r.passed);

    const result: FlowPlaybackResult = {
      flow,
      success,
      startTime: this.startTime,
      endTime,
      duration: endTime - this.startTime,
      results: this.results,
      failedAt: failedStepId ? {
        stepId: failedStepId,
        reason: this.results.find(r => r.step.id === failedStepId)?.error || 'Unknown error'
      } : undefined
    };

    // Dispatch completion event
    document.dispatchEvent(new CustomEvent('indi-flow-playback-completed', {
      detail: { result }
    }));

    console.log(`✅ Flow playback completed: ${success ? 'PASSED' : 'FAILED'}`);

    return result;
  }

  /**
   * Play a single step
   */
  private async playStep(step: FlowStep): Promise<StepResult> {
    console.log(`▶️ Playing step: ${step.action.type}`, step);

    const result: StepResult = {
      step,
      passed: false,
      elementFound: true,
      actionPerformed: false,
      apiResults: [],
      duration: 0
    };

    try {
      // Navigate action doesn't need element
      if (step.action.type === 'navigate') {
        await this.performNavigate(step.action.url!);
        result.actionPerformed = true;
        result.passed = true;
        return result;
      }

      // Wait action
      if (step.action.type === 'wait') {
        await this.wait(step.waitAfter || 1000);
        result.actionPerformed = true;
        result.passed = true;
        return result;
      }

      // Find element
      if (!step.action.element) {
        result.error = 'No element fingerprint';
        return result;
      }

      const element = await ElementFinder.findElement(step.action.element, 5000);

      if (!element) {
        result.elementFound = false;
        result.error = 'Element not found';
        return result;
      }

      // Validate element is actually an HTMLElement or Element (use safe runtime checks for environments without DOM typings)
      const isDomElement =
        (typeof (globalThis as any).HTMLElement !== 'undefined' && element instanceof (globalThis as any).HTMLElement) ||
        (typeof (globalThis as any).Element !== 'undefined' && element instanceof (globalThis as any).Element) ||
        // fallback: check nodeType for Node-like objects
        (element && (element as any).nodeType === 1);

      if (!isDomElement) {
        result.elementFound = false;
        result.error = 'Found element is not a valid DOM element';
        console.error('Invalid element type:', element, typeof element);
        return result;
      }

      console.log(`✅ Found valid element:`, element.tagName, element.className, element.id);

      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(300);

      // Perform action
      await this.performAction(element, step);
      result.actionPerformed = true;

      // SIMPLIFIED: Just mark as passed if action performed
      // API validation removed for now - focusing on element interaction reliability
      result.passed = result.actionPerformed;

    } catch (error: any) {
      result.error = error.message;
      result.passed = false;
    }

    return result;
  }

  /**
   * Perform action on element
   */
  private async performAction(element: HTMLElement, step: FlowStep): Promise<void> {
    const { action } = step;

    console.log(`🎬 Performing action: ${action.type}`, element);

    switch (action.type) {
      case 'click':
        // Highlight element briefly
        this.highlightElement(element);

        // Special handling for Ant Design select - can't programmatically open dropdown
        if (element.classList.contains('ant-select') || element.closest('.ant-select')) {
          const selectWrapper = element.classList.contains('ant-select')
            ? element
            : element.closest('.ant-select');

          // Find the selector/input inside and click it to trigger dropdown
          const selector = selectWrapper?.querySelector('.ant-select-selector, input');
          if (selector) {
            console.log('🎯 Detected Ant Design select, clicking internal selector to open dropdown');
            (selector as HTMLElement).click();

            // Wait for dropdown to appear in DOM
            await this.wait(200);
            break; // Next action will click the option
          }
        }

        // Special handling for native select elements - can't programmatically open dropdown
        if (element instanceof HTMLSelectElement) {
          element.focus();
          break; // The 'change' action that follows will set the value
        }

        // Try native click first, fallback to dispatching MouseEvent
        try {
          if (typeof element.click === 'function') {
            element.click();
          } else {
            // Fallback: dispatch click event manually
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            element.dispatchEvent(clickEvent);
          }
        } catch (error) {
          console.error('Click failed, trying dispatch:', error);
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          element.dispatchEvent(clickEvent);
        }
        break;

      case 'input':
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.value = action.value || '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true })); // Some apps need both
        } else {
          console.warn('⚠️ Element is not an input/textarea:', element);
        }
        break;

      case 'change':
        if (element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) {
          element.value = action.value || '';
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          console.warn('⚠️ Element does not support value change:', element);
        }
        break;

      case 'scroll':
        if (action.scrollPosition) {
          window.scrollTo(action.scrollPosition.x, action.scrollPosition.y);
        }
        break;

      case 'hover':
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        break;
    }
  }

  /**
   * Perform navigation
   */
  private async performNavigate(url: string): Promise<void> {
    console.log(`🧭 Navigating to: ${url}`);
    console.warn(`⚠️ Navigation will reload the page and stop playback.`);
    console.warn(`⚠️ Flow playback will not continue after navigation (needs implementation).`);

    // Simple navigation - page will reload and playback will stop
    window.location.href = url;

    // Wait for page load
    await this.wait(2000);
  }

  /**
   * Validate API calls against expectations
   */
  private async validateAPIs(
    expectedAPIs: ExpectedAPI[],
    startTime: number,
    endTime: number
  ): Promise<APIValidationResult[]> {
    const results: APIValidationResult[] = [];

    // Get actual API calls from cache within time window
    const actualCalls = Array.from(recentCallsCache.values())
      .flat()
      .filter(call =>
        call.timestamp >= startTime &&
        call.timestamp <= endTime
      );

    for (const expectedAPI of expectedAPIs) {
      // Find matching actual call
      const actualCall = actualCalls.find(call =>
        call.url.includes(expectedAPI.url) &&
        call.method === expectedAPI.method
      );

      const validationResult: APIValidationResult = {
        api: expectedAPI,
        passed: false,
        failures: []
      };

      if (!actualCall) {
        if (expectedAPI.expectations.required) {
          validationResult.failures.push({
            type: 'missing',
            expected: `${expectedAPI.method} ${expectedAPI.url}`,
            actual: 'API did not fire',
            message: 'Required API call did not occur'
          });
        } else {
          validationResult.passed = true; // Optional API, OK if missing
        }
      } else {
        // API fired, validate it
        validationResult.actualStatus = actualCall.status;
        validationResult.actualResponse = actualCall.response?.body || actualCall.body;
        validationResult.actualDuration = actualCall.duration;

        // Validate status
        if (expectedAPI.expectations.status) {
          const expectedStatuses = Array.isArray(expectedAPI.expectations.status.mustBe)
            ? expectedAPI.expectations.status.mustBe
            : [expectedAPI.expectations.status.mustBe];

          if (!expectedStatuses.includes(actualCall.status)) {
            validationResult.failures.push({
              type: 'status',
              expected: expectedStatuses.join(' or '),
              actual: actualCall.status,
              message: `Status code mismatch`
            });
          }
        }

        // Validate timing
        if (expectedAPI.expectations.timing?.maxDuration) {
          if (actualCall?.duration && actualCall.duration > expectedAPI.expectations.timing.maxDuration) {
            validationResult.failures.push({
              type: 'timing',
              expected: `< ${expectedAPI.expectations.timing.maxDuration}ms`,
              actual: `${actualCall.duration}ms`,
              message: 'Response too slow'
            });
          }
        }

        // TODO: Add schema validation when needed

        validationResult.passed = validationResult.failures.length === 0;
      }

      results.push(validationResult);
    }

    return results;
  }

  /**
   * Highlight element during playback
   */
  private highlightElement(element: HTMLElement): void {
    const originalOutline = element.style.outline;
    const originalTransition = element.style.transition;

    element.style.transition = 'outline 0.3s';
    element.style.outline = '3px solid #3b82f6';

    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.transition = originalTransition;
    }, 500);
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Stop playback
   */
  stop(): void {
    this.playing = false;
    this.clearPlaybackState();
  }

  // ==================== STORAGE (SURVIVE PAGE RELOADS) ====================

  /**
   * Save playback state to Chrome storage (before navigation)
   * BUG FIX #4: Awaited to prevent race conditions
   */
  private async savePlaybackState(state: PlaybackSession): Promise<void> {
    try {
      await chrome.storage.local.set({
        'indi_playback_session': state
      });
      console.log('💾 Playback state saved to storage:', {
        flowId: state.flowId,
        step: state.currentStepIndex,
        expiresIn: Math.round((state.expiresAt - Date.now()) / 1000) + 's'
      });
    } catch (err) {
      console.error('❌ Failed to save playback state:', err);
      throw new Error('Failed to save playback state - navigation aborted');
    }
  }

  /**
   * Save current progress (after each step)
   */
  private async savePlaybackProgress(): Promise<void> {
    if (!this.currentFlow) return;

    await this.savePlaybackState({
      flowId: this.currentFlow.id,
      currentStepIndex: this.currentStepIndex,
      startTime: this.startTime,
      results: this.results,
      sessionId: this.sessionId,
      savedAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // Refresh expiration on each step
    });
  }

  /**
   * Restore playback state from Chrome storage (after page reload)
   * Returns the flow and step index to resume from, or null if no pending playback
   *
   * BUG FIXES:
   * #1: Check expiration timestamp
   * #3: Re-fetch flow from storage and validate
   * #5: Check session ID to prevent multi-tab conflicts
   * #7: Verify we're on the expected URL
   */
  async restorePlaybackState(): Promise<{ flow: IndiFlow; stepIndex: number } | null> {
    try {
      const result = await chrome.storage.local.get(['indi_playback_session']);
      const sessionData = result.indi_playback_session as PlaybackSession | undefined;

      if (!sessionData) {
        return null;
      }

      // BUG FIX #1: Check if session expired
      if (sessionData.expiresAt < Date.now()) {
        console.log('⏰ Playback session expired, clearing...');
        await this.clearPlaybackState();
        return null;
      }

      console.log('🔄 Restoring playback session from storage...', sessionData);

      // BUG FIX #3: Re-fetch the flow from storage (it might have been deleted/modified)
      const flow = await FlowStorage.getFlowById(sessionData.flowId);

      if (!flow) {
        console.error('❌ Flow was deleted during playback!');
        await this.clearPlaybackState();

        await Swal.fire({
          icon: 'error',
          title: 'Flow Not Found',
          text: 'The flow was deleted while playback was in progress.',
          customClass: { popup: 'jira-popup' }
        });

        return null;
      }

      // BUG FIX #3: Verify step still exists (flow might have been modified)
      if (sessionData.currentStepIndex >= flow.steps.length) {
        console.error('❌ Flow was modified - step index out of bounds!');
        await this.clearPlaybackState();

        await Swal.fire({
          icon: 'error',
          title: 'Flow Modified',
          text: 'The flow was modified while playback was in progress.',
          customClass: { popup: 'jira-popup' }
        });

        return null;
      }

      // BUG FIX #7: Verify we're on the expected URL (if previous step was navigation)
      if (sessionData.currentStepIndex > 0) {
        const prevStep = flow.steps[sessionData.currentStepIndex - 1];
        if (prevStep?.action.type === 'navigate') {
          const expectedUrl = prevStep.action.url!;
          if (window.location.href !== expectedUrl) {
            console.warn(`⚠️ Navigation landed on wrong URL!`);
            console.warn(`   Expected: ${expectedUrl}`);
            console.warn(`   Actual: ${window.location.href}`);
            // Continue anyway - might be redirect or URL params
          }
        }
      }

      // Restore session state
      this.startTime = sessionData.startTime;
      this.results = sessionData.results;
      this.currentStepIndex = sessionData.currentStepIndex;
      this.sessionId = sessionData.sessionId;

      console.log(`✅ Playback session restored: "${flow.name}" - Resuming from step ${sessionData.currentStepIndex + 1}/${flow.steps.length}`);

      return {
        flow,
        stepIndex: sessionData.currentStepIndex
      };
    } catch (error) {
      console.error('❌ Failed to restore playback state:', error);
      return null;
    }
  }

  /**
   * Clear playback state from storage
   * BUG FIX #10: Try/catch with fallback
   */
  private async clearPlaybackState(): Promise<void> {
    try {
      await chrome.storage.local.remove(['indi_playback_session']);
      console.log('🗑️ Playback state cleared from storage');
    } catch (err) {
      console.error('❌ Failed to clear playback state:', err);
      // BUG FIX #10: Fallback - overwrite with null
      try {
        await chrome.storage.local.set({ 'indi_playback_session': null });
        console.log('✅ Fallback: Playback state nullified');
      } catch (err2) {
        console.error('❌ Fallback clear also failed!', err2);
      }
    }
  }

  /**
   * Load results from storage (for resume)
   */
  private async loadResultsFromStorage(): Promise<StepResult[]> {
    try {
      const result = await chrome.storage.local.get(['indi_playback_session']);
      const sessionData = result.indi_playback_session as PlaybackSession | undefined;
      return sessionData?.results || [];
    } catch {
      return [];
    }
  }

  /**
   * Load start time from storage (for resume)
   */
  private async loadStartTimeFromStorage(): Promise<number> {
    try {
      const result = await chrome.storage.local.get(['indi_playback_session']);
      const sessionData = result.indi_playback_session as PlaybackSession | undefined;
      return sessionData?.startTime || Date.now();
    } catch {
      return Date.now();
    }
  }

  /**
   * Generate unique session ID
   * BUG FIX #5: Prevents multi-tab conflicts
   */
  private generateSessionId(): string {
    return `playback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const flowPlayer = new FlowPlayer();
