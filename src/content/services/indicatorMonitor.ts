import { IndicatorData, NetworkCall, NetworkRequest } from "../../types";
import { waitForIndicator } from "../../utils/general";
import { getNetworkCallUrl } from "../utils/networkCallUtils";
import {
  generatePatternBasedStoragePath,
  generateStoragePath,
} from "../../utils/storage";
import { AutoIndicatorService } from "./autoIndicatorService";
import SchemaValidationService from "./schemaValidationService";
import { StorageQueue } from "./storageQueue";

// src/content/services/indicatorMonitor.ts
export class IndicatorMonitor {
  private static _instance: IndicatorMonitor | null = null;
  private storageQueue: StorageQueue;
  private schemaCache: Map<string, { schema: string; bodyHash: string }> = new Map();
  private lastPulseTime: Map<string, number> = new Map(); // Track last pulse per indicator
  private readonly PULSE_COOLDOWN = 1000; // Only pulse once per second per indicator

  private constructor() {
    this.storageQueue = StorageQueue.getInstance();
  }

  public static getInstance() {
    if (!this._instance) {
      this._instance = new IndicatorMonitor();
    }
    return this._instance;
  }

  // New function to update indicator content including schema validation
  private async updateIndicatorContent(
    indicator: IndicatorData,
    newCall: NetworkRequest
  ) {
    const schemaService = new SchemaValidationService();
    
    // First lets calculate the duration
    const duration = newCall?.response?.response?.timing?.receiveHeadersEnd ?? newCall?.duration;
  
    // Second lets update the lastCall object with the new data
    indicator.lastCall = {
      ...indicator.lastCall,
      status: newCall?.failed
        ? newCall?.errorText
        : newCall?.response?.response?.status ?? "error - debug",
      timing: {
        startTime: newCall?.response?.timing?.sendStart ?? 0,
        endTime: newCall?.response?.timing?.sendEnd ?? 0,
        duration,
      },
      timestamp: Date.now(),
      url: getNetworkCallUrl(newCall as any) || indicator.lastCall.url,
      updatedInThisRound: true,
    };
    
    indicator = { ...indicator, ...newCall };
    if (!newCall?.body) {
      delete indicator.body;
    }
  
    // Lets find the element in the DOM
    const indicatorElement = await waitForIndicator(indicator.id);
  
    // Lets remove any duplicated indicators
    if (indicatorElement) {
      const repeatedIndicators = document.querySelectorAll(`#indi-${indicator.id}`);
      if (repeatedIndicators.length > 1) {
        repeatedIndicators.forEach((el, index) => {
          if (index !== 0) el.remove();
        });
      }
    }
  
    // Lets prepare for schema validation with caching
    let schemaDiff = null;
    let backgroundColor = "#f44336"; // Default - red

    // Helper: Generate hash of body for cache key
    const getBodyHash = (body: any): string => {
      try {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        return bodyStr.substring(0, 100); // Simple hash using first 100 chars
      } catch {
        return '';
      }
    };

    // Lets check if we have a schema and body to validate
    if (indicator.body && !indicator.schema) {
      // Create new schema from the first response
      const bodyHash = getBodyHash(indicator.body?.body);
      const cacheKey = `${indicator.id}_${bodyHash}`;

      // Check cache first
      let cached = this.schemaCache.get(cacheKey);
      if (cached) {
        indicator.schema = cached.schema;
      } else {
        // Generate new schema
        const typeDefinition = schemaService.generateTypeDefinition(
          indicator.body?.body,
          indicator.name ?? "Indicator-Schema",
          { format: 'inline' }
        );
        indicator.schema = typeDefinition;

        // Cache it
        this.schemaCache.set(cacheKey, { schema: typeDefinition, bodyHash });

        // Limit cache size to 100 entries
        if (this.schemaCache.size > 100) {
          const firstKey = this.schemaCache.keys().next().value;
          if (firstKey) {
            this.schemaCache.delete(firstKey);
          }
        }
      }

    } else if (indicator.schema && newCall?.body) {
      // Compare existing schema against new incoming response
      const bodyHash = getBodyHash(newCall?.body?.body);
      const cacheKey = `${indicator.id}_incoming_${bodyHash}`;

      // Check if we've already validated this exact body
      let cached = this.schemaCache.get(cacheKey);
      if (!cached) {
        // Generate schema for incoming request
        const incomingRequestSchema = schemaService.generateTypeDefinition(
          newCall?.body?.body,
          indicator?.name ?? 'Unnamed',
          { format: 'inline' }
        );

        // Compare schemas
        schemaDiff = schemaService.compareTypeSchemas(indicator.schema, incomingRequestSchema);

        // Cache the result
        this.schemaCache.set(cacheKey, { schema: incomingRequestSchema, bodyHash });

        // Limit cache size
        if (this.schemaCache.size > 100) {
          const firstKey = this.schemaCache.keys().next().value;
          if (firstKey) {
            this.schemaCache.delete(firstKey);
          }
        }
      }
      // If cached, schemaDiff stays null (no changes - already validated)
    }
  
    // Set the background color based on the schema diff and status code
    const statusCode = newCall.response?.response?.status;
    const hasSchemaChanges = schemaDiff && (schemaDiff.added.length > 0 || schemaDiff.removed.length > 0 || schemaDiff.changed.length > 0);

    if (statusCode === 200) {
      if (!hasSchemaChanges) {
        backgroundColor = "rgba(25, 200, 50, .75)"; // Green - all good
      } else {
        backgroundColor = "#ff9800"; // Orange - status OK but schema changed
      }
    } else {
      backgroundColor = "#f44336"; // Red - status error
    }
  
    // Update the indicator element in the DOM
    const elementToUpdate = indicatorElement || await waitForIndicator(indicator.id);
    
    if (elementToUpdate) {
      elementToUpdate.classList.add("indicator-updating");
      setTimeout(() => {
        elementToUpdate.classList.remove("indicator-updating");
      }, 500);
  
      (elementToUpdate as HTMLElement).style.backgroundColor = backgroundColor;

      if (hasSchemaChanges) {
        elementToUpdate.classList.add('schema-error');
        const changeCount = (schemaDiff?.added.length || 0) + (schemaDiff?.removed.length || 0) + (schemaDiff?.changed.length || 0);
        const shortMessage = `Schema Changed (${changeCount} changes): ${schemaDiff?.added.length || 0} added, ${schemaDiff?.removed.length || 0} removed, ${schemaDiff?.changed.length || 0} modified`;
        elementToUpdate.setAttribute('data-schema-status', shortMessage);
        elementToUpdate.setAttribute('data-schema-diff', JSON.stringify(schemaDiff));
      } else {
        elementToUpdate.classList.remove('schema-error');
        // If the schema is valid, we can add a success class and tooltip
        if (schemaDiff !== null) {
          elementToUpdate.classList.add('schema-valid');
          const successMessage = `✅ Schema validated successfully!`;
          elementToUpdate.setAttribute('data-schema-status', successMessage);
          elementToUpdate.classList.add('schema-success-pulse');

          setTimeout(() => {
            elementToUpdate.classList.remove('schema-success-pulse');
          }, 1000);

        } else if (elementToUpdate.hasAttribute('data-schema-diff')) {
          // If there was no validation, clear previous errors
          elementToUpdate.removeAttribute('data-schema-diff');
          elementToUpdate.removeAttribute('data-schema-status');
        }
      }

      
  
     // preare the updated data for storage and tooltip
      const updatedData = {
        ...indicator,
        lastUpdated: Date.now(),
      };
  
      // Saving the updated data to the element
      // console.log("Updated data indicator monitor:", updatedData);
      elementToUpdate.setAttribute(
        "data-indicator-info",
        JSON.stringify(updatedData)
      );
  
      // updating the tooltip if it is open
      const openTooltip = document.getElementById("indicator-tooltip");
      if (openTooltip) {
        this.updateTooltipContent(openTooltip, updatedData);
      }

      // Pulse animation with cooldown (only once per second per indicator)
      const now = Date.now();
      const lastPulse = this.lastPulseTime.get(indicator.id) || 0;

      if (now - lastPulse > this.PULSE_COOLDOWN) {
        (elementToUpdate as HTMLElement).style.transform = "scale(1.2)";
        setTimeout(() => {
          (elementToUpdate as HTMLElement).style.transform = "scale(1)";
        }, 200);
        this.lastPulseTime.set(indicator.id, now);
      }
    }
  
    // Finally update the indicator in storage using batched writes
    const currentPath = generateStoragePath(window.location.href);
    const indicatorOriginalPath = generateStoragePath(indicator.request?.documentURL);

    // If our current path is not the document URL, we don't update the indicator
    if (currentPath !== indicatorOriginalPath) return;

    // Get current indicators from storage
    chrome.storage.local.get(["indicators"], (result) => {
      const indies = result.indicators as { [key: string]: IndicatorData[] } || {};

      if (!indies[currentPath]) {
        indies[currentPath] = [];
      }

      const index = indies[currentPath].findIndex(
        (el) => el.id === indicator.id
      );

      if (index !== -1) {
        indies[currentPath][index] = indicator;
      } else {
        indies[currentPath].push(indicator);
      }

      // Queue the update instead of writing immediately
      this.storageQueue.queueUpdate(currentPath, indies[currentPath]);
    });
  }


  private updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
    // console.log("lets update our indicator", data);
    const durationColor =
      data.lastCall?.timing?.duration < 300
        ? "#4CAF50"
        : data.lastCall?.timing?.duration < 1000
        ? "#FFC107"
        : "#f44336";

    // עדכון זמן תגובה
    const durationSpan = tooltip.querySelector("span");
    if (durationSpan) {
      durationSpan.textContent = `${Math.floor(
        data.lastCall?.timing?.duration
      )}ms`;
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

  private cleanAndParseJSON(str: any): any {
    try {
      // First, parse the outer JSON
      const parsed = typeof str === "string" ? JSON.parse(str) : str;

      // If we have a body field that's a string and looks like JSON, parse it
      if (parsed.body && typeof parsed.body === "string") {
        try {
          // Clean up the body string
          const cleanBody = parsed.body
            .trim()
            // Remove escaped quotes
            .replace(/\\\"/g, '"')
            // Handle unescaped quotes
            .replace(/([{,]\s*)([a-zA-Z0-9_]+?):/g, '$1"$2":')
            // Clean up any remaining issues
            .replace(/\n/g, "")
            .replace(/\r/g, "");

          // Parse the body
          parsed.body = JSON.parse(cleanBody);
        } catch (bodyError) {
          console.error("Error parsing body:", bodyError);
        }
      }

      return parsed;
    } catch (e) {
      console.error("Error parsing JSON:", e);
      return str;
    }
  }

  public checkIndicatorsUpdate(
  indicators: IndicatorData[],
  recentCalls: Map<string, NetworkCall[]>
): void | IndicatorData[] {

  const indicatorsThatDidNotUpdate: IndicatorData[] = [];

  if (indicators.length > 0) {
    // Update indicators on current page
    indicators.forEach((indicator) => {
      try {
        // Create keys using same logic as cache
        const normalKey = generateStoragePath(indicator.lastCall?.url) + '|' + indicator.method;
        const patternKey = generatePatternBasedStoragePath(indicator.lastCall?.url) + '|' + indicator.method;

        // Get recent calls for both keys
        const normalCalls = recentCalls.get(normalKey) || [];
        const patternCalls = recentCalls.get(patternKey) || [];

        // Combine and deduplicate by requestId
        const allMatches = [...normalCalls, ...patternCalls];
        const uniqueMatches = Array.from(
          new Map(allMatches.map(call => [call.request?.requestId, call])).values()
        );

        // Find best match using fallback chain
        let matchingCall = null;
        
        // 1. Try exact path match first
        matchingCall = uniqueMatches.find(call => {
          const callUrl = getNetworkCallUrl(call);
          return generateStoragePath(callUrl) === generateStoragePath(indicator.lastCall?.url);
        });

        // 2. Try pattern-based match
        if (!matchingCall) {
          matchingCall = uniqueMatches.find(call => {
            const callUrl = getNetworkCallUrl(call);
            return generatePatternBasedStoragePath(callUrl) ===
                   generatePatternBasedStoragePath(indicator.lastCall?.url);
          });
        }
        
        // 3. Prefer call with body if available
        if (!matchingCall) {
          matchingCall = uniqueMatches.find(call => !!call.body);
        }
        
        // 4. Fall back to latest call
        if (!matchingCall && uniqueMatches.length > 0) {
          matchingCall = uniqueMatches[0]; // Newest since we unshift
        }
        
        if (matchingCall) {
          this.updateIndicatorContent(indicator, matchingCall as any);
        } else {
          indicatorsThatDidNotUpdate.push(indicator);
        }
      } catch (error) {
        console.error(`Failed to update indicator ${indicator.id}:`, error);
        indicatorsThatDidNotUpdate.push(indicator);
      }
    });
  } else {
    // Update nested route indicators in storage
    this.updateNestedIndicators(recentCalls);
  }

  // Scan for auto indicators - pass only recent calls
  const autoIndicatorService = AutoIndicatorService.getInstance();
  const allRecentCalls = Array.from(recentCalls.values()).flat();
  autoIndicatorService.scanForDataIndies(allRecentCalls);
  
  return indicatorsThatDidNotUpdate;
}

private updateNestedIndicators(recentCalls: Map<string, NetworkCall[]>): void {
  chrome.storage.local.get(["indicators"], (result) => {
    const indies = result.indicators as { [key: string]: IndicatorData[] };
    if (!indies) return;

    const currentPath = generateStoragePath(window.location.href);
    const pathsToUpdate: Map<string, IndicatorData[]> = new Map();

    // Only check indicators whose paths contain current URL
    Object.keys(indies).forEach((path: string) => {
      if (!path.includes(currentPath)) return; // Skip unrelated paths

      const arrayOfIndiesPerPath = indies[path];
      let pathUpdated = false;

      arrayOfIndiesPerPath.forEach((indicator, index) => {
        try {
          const normalKey = generateStoragePath(indicator.lastCall?.url) + '|' + indicator.method;
          const patternKey = generatePatternBasedStoragePath(indicator.lastCall?.url) + '|' + indicator.method;

          const normalCalls = recentCalls.get(normalKey) || [];
          const patternCalls = recentCalls.get(patternKey) || [];
          const allMatches = [...normalCalls, ...patternCalls];

          const matchingCall = allMatches.find(call => {
            const callUrl = getNetworkCallUrl(call);
            return generateStoragePath(callUrl) === generateStoragePath(indicator.lastCall?.url);
          });

          if (matchingCall) {
            // Update indicator
            arrayOfIndiesPerPath[index] = {
              ...indicator,
              lastCall: {
                ...indicator.lastCall,
                status: matchingCall.response?.status || indicator.lastCall.status,
                timestamp: Date.now(),
                url: matchingCall.response?.response?.url || indicator.lastCall.url,
              },
            };
            pathUpdated = true;
          }
        } catch (error) {
          console.error('Error updating nested indicator:', error, indicator);
        }
      });

      // Track paths that need updating
      if (pathUpdated) {
        pathsToUpdate.set(path, arrayOfIndiesPerPath);
      }
    });

    // Queue all updates using batched writes
    pathsToUpdate.forEach((indicators, path) => {
      this.storageQueue.queueUpdate(path, indicators);
    });
  });
}


}

// יצוא ברירת מחדל של המחלקה
export default IndicatorMonitor;
