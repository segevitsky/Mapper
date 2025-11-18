// Flow Storage - Save and load flows from Chrome storage

import { IndiFlow, RecordingSession } from '../../types/flow';

const STORAGE_KEY = 'indi_flows';

/**
 * FlowStorage - Manage flow persistence
 */
export class FlowStorage {

  /**
   * Save a recorded session as a flow
   */
  static async saveFlow(session: RecordingSession, description?: string): Promise<IndiFlow> {
    const flow: IndiFlow = {
      id: session.flowId,
      name: session.flowName,
      description,
      createdAt: session.startTime,
      updatedAt: Date.now(),
      domain: window.location.hostname,
      startUrl: window.location.href, // Save starting URL
      steps: session.steps,
      tags: []
    };

    // Get existing flows
    const flows = await this.getAllFlows();

    // Add new flow
    flows.push(flow);

    // Save to Chrome storage
    await chrome.storage.local.set({ [STORAGE_KEY]: flows });

    console.log(`💾 Saved flow: "${flow.name}" (${flow.steps.length} steps)`);

    return flow;
  }

  /**
   * Get all saved flows
   */
  static async getAllFlows(): Promise<IndiFlow[]> {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || [];
  }

  /**
   * Get flows for current domain
   */
  static async getFlowsForDomain(domain?: string): Promise<IndiFlow[]> {
    const currentDomain = domain || window.location.hostname;
    const allFlows = await this.getAllFlows();
    return allFlows.filter(flow => flow.domain === currentDomain);
  }

  /**
   * Get a specific flow by ID
   */
  static async getFlowById(flowId: string): Promise<IndiFlow | null> {
    const flows = await this.getAllFlows();
    return flows.find(flow => flow.id === flowId) || null;
  }

  /**
   * Update an existing flow
   */
  static async updateFlow(flowId: string, updates: Partial<IndiFlow>): Promise<void> {
    const flows = await this.getAllFlows();
    const index = flows.findIndex(flow => flow.id === flowId);

    if (index === -1) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    flows[index] = {
      ...flows[index],
      ...updates,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: flows });

    console.log(`💾 Updated flow: "${flows[index].name}"`);
  }

  /**
   * Delete a flow
   */
  static async deleteFlow(flowId: string): Promise<void> {
    const flows = await this.getAllFlows();
    const filtered = flows.filter(flow => flow.id !== flowId);

    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });

    console.log(`🗑️ Deleted flow: ${flowId}`);
  }

  /**
   * Update flow last run info
   */
  static async updateFlowLastRun(flowId: string, lastRun: { timestamp: number; passed: boolean }): Promise<void> {
    const flows = await this.getAllFlows();
    const index = flows.findIndex(flow => flow.id === flowId);

    if (index === -1) {
      return; // Flow not found, silently ignore
    }

    // @ts-ignore
    flows[index].lastRun = lastRun;
    flows[index].updatedAt = Date.now();

    await chrome.storage.local.set({ [STORAGE_KEY]: flows });
  }

  /**
   * Export flow as JSON file
   */
  static exportFlow(flow: IndiFlow): void {
    const json = JSON.stringify(flow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `indi-flow-${flow.name.replace(/\s+/g, '-')}.json`;
    a.click();

    URL.revokeObjectURL(url);

    console.log(`📤 Exported flow: "${flow.name}"`);
  }

  /**
   * Import flow from JSON
   */
  static async importFlow(jsonString: string): Promise<IndiFlow> {
    const flow: IndiFlow = JSON.parse(jsonString);

    // Validate flow structure
    if (!flow.id || !flow.name || !flow.steps) {
      throw new Error('Invalid flow format');
    }

    // Generate new ID to avoid conflicts
    flow.id = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    flow.createdAt = Date.now();
    flow.updatedAt = Date.now();

    // Save imported flow
    const flows = await this.getAllFlows();
    flows.push(flow);
    await chrome.storage.local.set({ [STORAGE_KEY]: flows });

    console.log(`📥 Imported flow: "${flow.name}"`);

    return flow;
  }

  /**
   * Clear all flows (use with caution!)
   */
  static async clearAllFlows(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    console.log(`🗑️ Cleared all flows`);
  }

  /**
   * Get storage usage stats
   */
  static async getStorageStats(): Promise<{
    totalFlows: number;
    totalSteps: number;
    bytesUsed: number;
  }> {
    const flows = await this.getAllFlows();
    const totalSteps = flows.reduce((sum, flow) => sum + flow.steps.length, 0);

    // Estimate bytes used
    const json = JSON.stringify(flows);
    const bytesUsed = new Blob([json]).size;

    return {
      totalFlows: flows.length,
      totalSteps,
      bytesUsed
    };
  }

  /**
   * Generate user-friendly description for a flow step
   */
  static getStepDescription(step: any): string {
    const action = step.action;

    switch (action.type) {
      case 'click':
        const clickText = action.element?.verification?.textContent?.trim();
        const clickTag = action.element?.verification?.tagName?.toLowerCase();
        if (clickText && clickText.length < 30) {
          return `Clicked "${clickText}"`;
        }
        return `Clicked ${clickTag || 'element'}`;

      case 'input':
        const inputText = action.value;
        if (inputText && inputText.length < 20) {
          return `Typed "${inputText}"`;
        }
        return `Entered text in field`;

      case 'change':
        return `Changed field value`;

      case 'navigate':
        const url = action.url;
        try {
          const urlObj = new URL(url);
          return `Navigated to ${urlObj.pathname}`;
        } catch {
          return `Navigated to ${url}`;
        }

      case 'scroll':
        return `Scrolled page`;

      case 'hover':
        return `Hovered over element`;

      case 'wait':
        return `Waited ${step.waitAfter || 1000}ms`;

      default:
        return `Performed ${action.type}`;
    }
  }
}
