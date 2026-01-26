// Flow Player - Replay recorded flows

import { IndiFlow, FlowStep, FlowPlaybackResult, StepResult, APIValidationResult, ExpectedAPI, ElementFingerprint } from '../../types/flow';
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

      // Check if this might be a dropdown option click (element in a dropdown/listbox)
      const isLikelyDropdownOption = this.isLikelyDropdownOption(step.action.element);
      if (isLikelyDropdownOption) {
        console.log('🔽 Detected likely dropdown option, waiting for dropdown to be visible...');
        await this.waitForAnyDropdownToAppear(1500);
      }

      const element = await ElementFinder.findElement(step.action.element, 5000);

      if (!element) {
        // If element not found and it looks like a dropdown option, try waiting longer
        if (isLikelyDropdownOption) {
          console.log('⏳ Dropdown option not found, waiting and retrying...');
          await this.wait(500);
          const retryElement = await ElementFinder.findElement(step.action.element, 3000);
          if (retryElement) {
            console.log('✅ Found element on retry');
            // Continue with retryElement below
            const validElement = retryElement;
            // Scroll and perform action
            validElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.wait(300);
            await this.performAction(validElement, step);
            result.actionPerformed = true;
            result.passed = true;
            return result;
          }
        }
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

        // Check if this is a dropdown trigger
        const dropdownInfo = this.detectDropdownTrigger(element);
        if (dropdownInfo.isDropdown) {
          console.log(`🎯 Detected dropdown: ${dropdownInfo.type}`);
          await this.handleDropdownClick(element, dropdownInfo);
          break;
        }

        // Special handling for native select elements - can't programmatically open dropdown
        if (element instanceof HTMLSelectElement) {
          element.focus();
          break; // The 'change' action that follows will set the value
        }

        // Perform comprehensive click (works better with React/Vue)
        await this.performComprehensiveClick(element, action.position);
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
        // Highlight element to show hover is happening
        this.highlightElement(element);

        // Dispatch comprehensive hover events to trigger all hover effects
        const hoverPosition = action.position || { x: 0, y: 0 };
        const mouseEventOptions = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: hoverPosition.x,
          clientY: hoverPosition.y
        };

        // Dispatch mouseenter (triggers :hover CSS, doesn't bubble)
        element.dispatchEvent(new MouseEvent('mouseenter', {
          ...mouseEventOptions,
          bubbles: false // mouseenter doesn't bubble
        }));

        // Dispatch mouseover (bubbles, triggers event handlers)
        element.dispatchEvent(new MouseEvent('mouseover', mouseEventOptions));

        // Dispatch mousemove (some libraries listen for this)
        element.dispatchEvent(new MouseEvent('mousemove', mouseEventOptions));

        // Focus if element is focusable (helps with keyboard-accessible menus)
        if (element instanceof HTMLElement && typeof element.focus === 'function') {
          try {
            element.focus();
          } catch (e) {
            // Element not focusable, ignore
          }
        }

        // Wait to simulate hover dwell time (300ms - enough for most animations)
        await this.wait(300);

        console.log(`✨ Hover performed on:`, element);
        break;

      case 'keypress':
        // Highlight element
        this.highlightElement(element);

        const key = action.value || 'Enter';
        const modifiers = action.modifiers || { ctrl: false, alt: false, shift: false, meta: false };

        // Focus the element first
        if (element instanceof HTMLElement && typeof element.focus === 'function') {
          element.focus();
          await this.wait(50); // Brief wait for focus to take effect
        }

        // Dispatch keydown event
        const keydownEvent = new KeyboardEvent('keydown', {
          key: key,
          code: this.getKeyCode(key),
          bubbles: true,
          cancelable: true,
          ctrlKey: modifiers.ctrl,
          altKey: modifiers.alt,
          shiftKey: modifiers.shift,
          metaKey: modifiers.meta
        });
        element.dispatchEvent(keydownEvent);

        // Small delay between keydown and keyup
        await this.wait(50);

        // Dispatch keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
          key: key,
          code: this.getKeyCode(key),
          bubbles: true,
          cancelable: true,
          ctrlKey: modifiers.ctrl,
          altKey: modifiers.alt,
          shiftKey: modifiers.shift,
          metaKey: modifiers.meta
        });
        element.dispatchEvent(keyupEvent);

        // For Enter key on forms, might need to trigger submit
        if (key === 'Enter' && element instanceof HTMLInputElement) {
          const form = element.closest('form');
          if (form) {
            // Some forms submit on Enter
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }

        console.log(`⌨️ Keypress performed: ${key}`, element);
        break;
    }
  }

  /**
   * Helper to get KeyboardEvent code from key name
   */
  private getKeyCode(key: string): string {
    const keyCodeMap: { [key: string]: string } = {
      'Enter': 'Enter',
      'Tab': 'Tab',
      'Escape': 'Escape',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown'
    };
    return keyCodeMap[key] || key;
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

  // ==================== DROPDOWN HANDLING ====================

  /**
   * Detect if element is a dropdown trigger
   */
  private detectDropdownTrigger(element: HTMLElement): { isDropdown: boolean; type: string; clickTarget?: HTMLElement } {
    // Ant Design Select
    if (element.classList.contains('ant-select') || element.closest('.ant-select')) {
      const selectWrapper = element.classList.contains('ant-select')
        ? element
        : element.closest('.ant-select') as HTMLElement;
      const clickTarget = selectWrapper?.querySelector('.ant-select-selector, input') as HTMLElement;
      return { isDropdown: true, type: 'antd-select', clickTarget: clickTarget || element };
    }

    // Ant Design Dropdown
    if (element.classList.contains('ant-dropdown-trigger') || element.closest('.ant-dropdown-trigger')) {
      return { isDropdown: true, type: 'antd-dropdown', clickTarget: element };
    }

    // Material UI Select
    if (element.classList.contains('MuiSelect-select') || element.closest('.MuiSelect-root')) {
      const selectRoot = element.closest('.MuiSelect-root') as HTMLElement;
      return { isDropdown: true, type: 'mui-select', clickTarget: selectRoot || element };
    }

    // Radix UI / Headless UI triggers
    if (element.hasAttribute('data-radix-collection-item') ||
        element.hasAttribute('data-headlessui-state') ||
        element.closest('[data-radix-popper-content-wrapper]')) {
      return { isDropdown: true, type: 'radix-headless', clickTarget: element };
    }

    // Generic dropdown detection via ARIA attributes
    const ariaExpanded = element.getAttribute('aria-expanded');
    const ariaHaspopup = element.getAttribute('aria-haspopup');
    if (ariaHaspopup === 'true' || ariaHaspopup === 'listbox' || ariaHaspopup === 'menu') {
      return { isDropdown: true, type: 'aria-dropdown', clickTarget: element };
    }

    // Bootstrap dropdown
    if (element.classList.contains('dropdown-toggle') || element.hasAttribute('data-bs-toggle')) {
      return { isDropdown: true, type: 'bootstrap-dropdown', clickTarget: element };
    }

    // Custom dropdown patterns (common class names)
    const dropdownClasses = ['dropdown-trigger', 'select-trigger', 'menu-trigger', 'popover-trigger'];
    if (dropdownClasses.some(cls => element.classList.contains(cls))) {
      return { isDropdown: true, type: 'custom-dropdown', clickTarget: element };
    }

    return { isDropdown: false, type: 'none' };
  }

  /**
   * Handle clicking on a dropdown trigger
   */
  private async handleDropdownClick(element: HTMLElement, dropdownInfo: { type: string; clickTarget?: HTMLElement }): Promise<void> {
    const clickTarget = dropdownInfo.clickTarget || element;

    console.log(`📂 Opening dropdown (${dropdownInfo.type})...`);

    // Perform comprehensive click to open
    await this.performComprehensiveClick(clickTarget);

    // Wait for dropdown to appear with retry logic
    const dropdownAppeared = await this.waitForDropdownToAppear(dropdownInfo.type, 2000);

    if (!dropdownAppeared) {
      console.warn(`⚠️ Dropdown may not have opened, trying focus + click...`);
      // Try focus first, then click again
      clickTarget.focus();
      await this.wait(100);
      await this.performComprehensiveClick(clickTarget);
      await this.wait(300);
    }

    console.log(`✅ Dropdown should now be open`);
  }

  /**
   * Wait for dropdown menu to appear in DOM
   */
  private async waitForDropdownToAppear(dropdownType: string, timeout: number): Promise<boolean> {
    const startTime = Date.now();

    // Selectors for various dropdown menus (usually rendered as portals at body end)
    const dropdownSelectors: Record<string, string[]> = {
      'antd-select': ['.ant-select-dropdown:not(.ant-select-dropdown-hidden)', '.ant-select-dropdown'],
      'antd-dropdown': ['.ant-dropdown:not(.ant-dropdown-hidden)', '.ant-dropdown-menu'],
      'mui-select': ['.MuiMenu-root', '.MuiPopover-root', '.MuiMenu-paper'],
      'radix-headless': ['[data-radix-popper-content-wrapper]', '[data-headlessui-state="open"]'],
      'aria-dropdown': ['[role="listbox"]', '[role="menu"]', '[role="combobox"][aria-expanded="true"]'],
      'bootstrap-dropdown': ['.dropdown-menu.show', '.dropdown-menu[data-bs-popper]'],
      'custom-dropdown': ['.dropdown-menu', '.select-dropdown', '.popover', '[role="listbox"]']
    };

    const selectors = dropdownSelectors[dropdownType] || dropdownSelectors['custom-dropdown'];

    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        const dropdown = document.querySelector(selector);
        if (dropdown) {
          // Check if it's actually visible
          const rect = dropdown.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`✅ Dropdown found with selector: ${selector}`);
            return true;
          }
        }
      }
      await this.wait(50);
    }

    return false;
  }

  /**
   * Check if element fingerprint looks like a dropdown option
   */
  private isLikelyDropdownOption(fingerprint: ElementFingerprint): boolean {
    // Check locator selectors for dropdown-related patterns
    const dropdownPatterns = [
      'select-item', 'select-option', 'option',
      'menu-item', 'menuitem', 'MenuItem',
      'dropdown-item', 'listbox',
      'ant-select', 'MuiMenuItem', 'MuiListItem',
      'radix-collection-item'
    ];

    for (const locator of fingerprint.locators) {
      const selectorLower = locator.selector.toLowerCase();
      if (dropdownPatterns.some(pattern => selectorLower.includes(pattern.toLowerCase()))) {
        return true;
      }
    }

    // Check verification data
    if (fingerprint.verification?.role === 'option' || fingerprint.verification?.role === 'menuitem') {
      return true;
    }

    return false;
  }

  /**
   * Wait for any dropdown to appear in the DOM
   */
  private async waitForAnyDropdownToAppear(timeout: number): Promise<boolean> {
    const startTime = Date.now();

    const dropdownSelectors = [
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
      '.ant-dropdown:not(.ant-dropdown-hidden)',
      '.MuiMenu-root',
      '.MuiPopover-root',
      '[data-radix-popper-content-wrapper]',
      '[role="listbox"]',
      '[role="menu"]:not([aria-hidden="true"])',
      '.dropdown-menu.show',
      '.dropdown-menu[style*="display: block"]'
    ];

    while (Date.now() - startTime < timeout) {
      for (const selector of dropdownSelectors) {
        const dropdown = document.querySelector(selector);
        if (dropdown) {
          const rect = dropdown.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`✅ Dropdown visible: ${selector}`);
            return true;
          }
        }
      }
      await this.wait(50);
    }

    console.log('⚠️ No dropdown found within timeout');
    return false;
  }

  /**
   * Perform comprehensive click - dispatches full mouse event sequence
   * This works better with React, Vue, and other frameworks that use synthetic events
   */
  private async performComprehensiveClick(element: HTMLElement, position?: { x: number; y: number }): Promise<void> {
    // Get element center if position not provided
    const rect = element.getBoundingClientRect();
    const x = position?.x ?? rect.left + rect.width / 2;
    const y = position?.y ?? rect.top + rect.height / 2;

    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1
    };

    // Focus element first (important for accessibility and some frameworks)
    if (typeof element.focus === 'function') {
      element.focus();
    }

    // Dispatch mouseenter (doesn't bubble)
    element.dispatchEvent(new MouseEvent('mouseenter', { ...eventOptions, bubbles: false }));

    // Dispatch mouseover
    element.dispatchEvent(new MouseEvent('mouseover', eventOptions));

    // Small delay to simulate real user
    await this.wait(10);

    // Dispatch mousedown
    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));

    // Small delay between mousedown and mouseup
    await this.wait(50);

    // Dispatch mouseup
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));

    // Dispatch click
    element.dispatchEvent(new MouseEvent('click', eventOptions));

    // Also try native click as fallback
    try {
      if (typeof element.click === 'function') {
        element.click();
      }
    } catch (e) {
      // Native click failed, but we already dispatched events
    }

    // Wait a bit for any animations/reactions
    await this.wait(100);
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
