/**
 * Indicator Memory Cache
 * Keeps indicator data in memory to reduce storage reads
 * Syncs with storage periodically and on demand
 */

import { IndicatorData } from "../../types";
import { generateStoragePath } from "../../utils/storage";

export class IndicatorCache {
  private static instance: IndicatorCache;
  private cache: Map<string, IndicatorData[]> = new Map();
  private lastSync: number = 0;
  private readonly SYNC_INTERVAL = 5000; // Sync with storage every 5 seconds
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isDirty = false; // Track if cache needs to be written to storage

  private constructor() {
    // Initialize cache from storage
    this.loadFromStorage();

    // Set up periodic sync
    this.startPeriodicSync();
  }

  static getInstance(): IndicatorCache {
    if (!IndicatorCache.instance) {
      IndicatorCache.instance = new IndicatorCache();
    }
    return IndicatorCache.instance;
  }

  /**
   * Load indicators from storage into memory
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['indicators']);
      const indies = (result.indicators as { [key: string]: IndicatorData[] }) || {};

      this.cache.clear();
      for (const [path, indicators] of Object.entries(indies)) {
        this.cache.set(path, indicators);
      }

      this.lastSync = Date.now();
      console.log(`📥 Loaded ${this.cache.size} indicator paths into cache`);
    } catch (error) {
      console.error('Failed to load indicators from storage:', error);
    }
  }

  /**
   * Start periodic sync with storage
   */
  private startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (this.isDirty) {
        this.syncToStorage();
      } else {
        // Even if not dirty, refresh from storage in case other tabs modified it
        this.loadFromStorage();
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * Sync memory cache to storage
   */
  private async syncToStorage(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const indies: { [key: string]: IndicatorData[] } = {};
      for (const [path, indicators] of this.cache.entries()) {
        indies[path] = indicators;
      }

      await chrome.storage.local.set({ indicators: indies });
      this.isDirty = false;
      this.lastSync = Date.now();
      console.log(`💾 Synced ${this.cache.size} indicator paths to storage`);
    } catch (error) {
      console.error('Failed to sync indicators to storage:', error);
    }
  }

  /**
   * Get indicators for a specific path (from memory)
   */
  get(path: string): IndicatorData[] | null {
    return this.cache.get(path) || null;
  }

  /**
   * Get indicators for current page
   */
  getCurrent(): IndicatorData[] | null {
    const currentPath = generateStoragePath(window.location.href);
    return this.get(currentPath);
  }

  /**
   * Set indicators for a specific path
   */
  set(path: string, indicators: IndicatorData[]): void {
    this.cache.set(path, indicators);
    this.isDirty = true;
  }

  /**
   * Update a single indicator in cache
   */
  updateIndicator(path: string, indicator: IndicatorData): void {
    const existing = this.cache.get(path) || [];
    const index = existing.findIndex(ind => ind.id === indicator.id);

    if (index !== -1) {
      existing[index] = indicator;
    } else {
      existing.push(indicator);
    }

    this.cache.set(path, existing);
    this.isDirty = true;
  }

  /**
   * Remove an indicator from cache
   */
  removeIndicator(path: string, indicatorId: string): void {
    const existing = this.cache.get(path);
    if (!existing) return;

    const filtered = existing.filter(ind => ind.id !== indicatorId);
    this.cache.set(path, filtered);
    this.isDirty = true;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.isDirty = true;
  }

  /**
   * Force immediate sync to storage
   */
  async forceSync(): Promise<void> {
    await this.syncToStorage();
  }

  /**
   * Force immediate load from storage
   */
  async forceLoad(): Promise<void> {
    await this.loadFromStorage();
  }

  /**
   * Get all paths in cache
   */
  getAllPaths(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Get total indicator count across all paths
   */
  getTotalCount(): number {
    let count = 0;
    for (const indicators of this.cache.values()) {
      count += indicators.length;
    }
    return count;
  }

  /**
   * Search indicators by URL pattern
   */
  searchByUrl(urlPattern: string): IndicatorData[] {
    const results: IndicatorData[] = [];

    for (const indicators of this.cache.values()) {
      for (const indicator of indicators) {
        if (indicator.lastCall?.url?.includes(urlPattern)) {
          results.push(indicator);
        }
      }
    }

    return results;
  }

  /**
   * Clean up when page unloads
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    // Final sync before destroy
    if (this.isDirty) {
      this.syncToStorage();
    }
  }
}

export default IndicatorCache;
