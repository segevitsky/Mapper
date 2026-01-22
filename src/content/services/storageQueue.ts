/**
 * Storage Queue Service
 * Batches Chrome storage writes to reduce I/O overhead and improve performance
 */

import { IndicatorData } from "../../types";

interface StorageUpdate {
  path: string;
  indicators: IndicatorData[];
  timestamp: number;
}

export class StorageQueue {
  private static instance: StorageQueue;
  private pendingUpdates: Map<string, StorageUpdate> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_INTERVAL = 1000; // Flush every 1 second
  private readonly MAX_QUEUE_SIZE = 50; // Force flush if queue gets too large
  private isFlushing = false;

  private constructor() {}

  static getInstance(): StorageQueue {
    if (!StorageQueue.instance) {
      StorageQueue.instance = new StorageQueue();
    }
    return StorageQueue.instance;
  }

  /**
   * Queue an indicator update for batched writing
   */
  queueUpdate(path: string, indicators: IndicatorData[]): void {
    // Update or add to pending updates
    this.pendingUpdates.set(path, {
      path,
      indicators,
      timestamp: Date.now(),
    });

    // Force flush if queue is getting too large
    if (this.pendingUpdates.size >= this.MAX_QUEUE_SIZE) {
      this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.FLUSH_INTERVAL);
    }
  }

  /**
   * Immediately flush all pending updates to storage
   */
  async flush(): Promise<void> {
    // Prevent concurrent flushes
    if (this.isFlushing) {
      return;
    }

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Nothing to flush
    if (this.pendingUpdates.size === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      // Get current storage state
      const result = await chrome.storage.local.get(['indicators']);
      const indies = (result.indicators as { [key: string]: IndicatorData[] }) || {};

      // Apply all pending updates
      for (const [path, update] of this.pendingUpdates.entries()) {
        indies[path] = update.indicators;
      }

      // Single write for all updates
      await chrome.storage.local.set({ indicators: indies });

      console.log(`💾 Flushed ${this.pendingUpdates.size} indicator updates to storage`);

      // Clear pending updates
      this.pendingUpdates.clear();
    } catch (error) {
      console.error('Failed to flush storage queue:', error);
      // Keep pending updates for retry
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Get current queue size for debugging
   */
  getQueueSize(): number {
    return this.pendingUpdates.size;
  }

  /**
   * Force immediate flush (useful for critical updates)
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export default StorageQueue;
