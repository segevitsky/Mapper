// Indi Flows - Type Definitions

import { NetworkCall } from './index';

/**
 * Element locator strategy
 */
export interface Locator {
  priority: number;        // Lower = try first
  strategy: string;        // Human readable name (e.g., 'role-with-name', 'data-testid')
  selector: string;        // The actual selector
  confidence: number;      // 1-10, how reliable is this locator
}

/**
 * Element fingerprint with multiple locator strategies
 */
export interface ElementFingerprint {
  // Multiple locators in priority order
  locators: Locator[];

  // Visual reference for debugging
  visual: {
    screenshot?: string;
    rect: DOMRect;
    innerHTML?: string; // First 200 chars
  };

  // Verification properties to confirm correct element
  verification: {
    tagName: string;
    textContent?: string;
    role?: string;
    type?: string; // for inputs
  };
}

/**
 * User action types
 */
export type ActionType = 'click' | 'input' | 'change' | 'scroll' | 'navigate' | 'hover' | 'wait' | 'keypress';

/**
 * Keyboard modifiers
 */
export interface KeyboardModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Recorded user action
 */
export interface FlowAction {
  type: ActionType;
  element?: ElementFingerprint; // Not needed for navigate
  value?: string; // For input/change/keypress events
  url?: string; // For navigate events
  position?: { x: number; y: number }; // For click/hover
  scrollPosition?: { x: number; y: number }; // For scroll
  modifiers?: KeyboardModifiers; // For keypress events
}

/**
 * API call expectations (user-defined success criteria)
 */
export interface APIExpectations {
  required: boolean; // Must this API fire?

  status?: {
    mustBe: number | number[]; // 200 or [200, 201]
  };

  responseBody?: {
    mustContainFields?: string[]; // ['token', 'userId']
    schemaMatch?: boolean; // Validate against captured schema
    customAssertion?: string; // JavaScript code to eval
  };

  timing?: {
    maxDuration?: number; // Maximum response time in ms
  };
}

/**
 * Expected API call during flow playback
 */
export interface ExpectedAPI {
  url: string;
  method: string;

  // User-defined expectations
  expectations: APIExpectations;

  // Reference data from recording (for display/comparison)
  capturedResponse?: any;
  capturedStatus?: number;
  capturedSchema?: string;
  capturedDuration?: number;
}

/**
 * A single step in the flow
 */
export interface FlowStep {
  id: string; // Unique step ID
  timestamp: number;
  action: FlowAction;

  // APIs triggered by this action (filled during correlation)
  triggeredAPIs: ExpectedAPI[];

  // Optional settings
  continueOnFailure?: boolean; // Continue flow even if this step fails
  waitAfter?: number; // Wait N ms after this step
  description?: string; // User-added description
}

/**
 * Complete flow definition
 */
export interface IndiFlow {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;

  // All steps in order
  steps: FlowStep[];

  // Metadata
  tags?: string[];
  domain: string; // Which domain this flow is for
  startUrl: string; // URL where the flow starts

  // Playback results
  lastRun?: {
    timestamp: number;
    passed: boolean;
    duration: number;
    failedStepId?: string;
  };
}

/**
 * Result of a single API validation during playback
 */
export interface APIValidationResult {
  api: ExpectedAPI;
  passed: boolean;
  actualStatus?: number;
  actualResponse?: any;
  actualDuration?: number;

  failures: {
    type: 'status' | 'schema' | 'timing' | 'missing' | 'custom';
    expected: any;
    actual: any;
    message: string;
  }[];
}

/**
 * Result of a single step during playback
 */
export interface StepResult {
  step: FlowStep;
  passed: boolean;
  elementFound: boolean;
  actionPerformed: boolean;

  apiResults: APIValidationResult[];

  error?: string;
  duration: number;
}

/**
 * Complete flow playback result
 */
export interface FlowPlaybackResult {
  flow: IndiFlow;
  success: boolean;
  startTime: number;
  endTime: number;
  duration: number;

  results: StepResult[];

  failedAt?: {
    stepId: string;
    reason: string;
  };
}

/**
 * Recording session state
 */
export interface RecordingSession {
  flowId: string;
  flowName: string;
  startTime: number;
  steps: FlowStep[];

  // Temporary map for API correlation (not saved)
  pendingAPIs?: Map<number, NetworkCall[]>;
}
