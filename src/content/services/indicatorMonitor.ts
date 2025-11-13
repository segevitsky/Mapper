import { IndicatorData, NetworkCall, NetworkRequest } from "../../types";
import { waitForIndicator } from "../../utils/general";
import {
  generatePatternBasedStoragePath,
  generateStoragePath,
} from "../../utils/storage";
import { AutoIndicatorService } from "./autoIndicatorService";
import SchemaValidationService from "./schemaValidationService";

// src/content/services/indicatorMonitor.ts
export class IndicatorMonitor {
  private static _instance: IndicatorMonitor | null = null;

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
      url: newCall?.response?.url ?? indicator.lastCall.url,
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
  
    // Lets prepare for schema validation
    let validationResult = null;
    let schemaDiff = null;
    let backgroundColor = "#f44336"; // ברירת מחדל - אדום
  
    // Lets check if we have a schema and body to validate
    if (indicator.body && !indicator.schema) {
      // יצירת סכמה חדשה - בדיוק כמו בקוד המקורי
      const typeDefinition = schemaService.generateTypeDefinition(
        indicator.body?.body, 
        indicator.name ?? "Indicator-Schema", 
        { format: 'inline' }
      );
      console.log({ typeDefinition }, "typeDefinition for indicator body");
      indicator.schema = typeDefinition;
      
    } else if (indicator.schema && indicator.body && newCall?.body) {
      // this is not good  - since we create a validation from the updated body to the new arrived body which is the same

      const validation = schemaService.validateResponse(
        newCall?.body?.body,  
        indicator.body?.body
      );

      const incomingRequestSchema = schemaService.generateTypeDefinition(newCall?.body, indicator?.name ?? 'Unnamed');
      schemaDiff = schemaService.compareTypeSchemas(indicator.schema, incomingRequestSchema);

      console.log(
        { validation, indicator, newCall }, 
        'validation schema for indicator body'
      );

      console.log({ schemaDiff }, 'Schema differences detected:');
  
      validationResult = validation;
    }
  
    // Set the background color based on the validation result and status code
    const statusCode = newCall.response?.response?.status;
    if (statusCode === 200) {
      if (!validationResult || validationResult.isValid) {
        backgroundColor = "rgba(25, 200, 50, .75)"; // ירוק - הכל תקין
      } else {
        backgroundColor = "#ff9800"; // כתום - סטטוס תקין אבל סכמה שגויה
      }
    } else {
      backgroundColor = "#f44336"; // אדום - שגיאת סטטוס
    }
  
    // Update the indicator element in the DOM
    const elementToUpdate = indicatorElement || await waitForIndicator(indicator.id);
    
    if (elementToUpdate) {
      elementToUpdate.classList.add("indicator-updating");
      setTimeout(() => {
        elementToUpdate.classList.remove("indicator-updating");
      }, 500);
  
      (elementToUpdate as HTMLElement).style.backgroundColor = backgroundColor;
  
      if (validationResult && !validationResult.isValid) {
        elementToUpdate.classList.add('schema-error');
        const firstError = validationResult.errors[0];
        const shortMessage = `Schema Error (${validationResult.errors.length} issues): ${firstError.path} - expected ${firstError.expected}, got ${firstError.actual}`;
        elementToUpdate.setAttribute('data-schema-status', shortMessage);
        elementToUpdate.setAttribute('data-validation-errors', JSON.stringify(validationResult.errors));
      } else {
        elementToUpdate.classList.remove('schema-error'); 
        // If the schema is valid, we can add a success class and tooltip
        if (validationResult && validationResult.isValid) {
          elementToUpdate.classList.add('schema-valid');
          const successMessage = `✅ Schema validated successfully!`;
          elementToUpdate.setAttribute('data-schema-status', successMessage);
          elementToUpdate.classList.add('schema-success-pulse');
          
          setTimeout(() => {
            elementToUpdate.classList.remove('schema-success-pulse');
          }, 1000);

        } else if (elementToUpdate.hasAttribute('data-validation-errors')) {
          // אם לא הייתה בדיקה, פשוט נקה את השגיאות הקודמות
          elementToUpdate.removeAttribute('data-validation-errors');
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
  
      (elementToUpdate as HTMLElement).style.transform = "scale(1.2)";
      setTimeout(() => {
        (elementToUpdate as HTMLElement).style.transform = "scale(1)";
      }, 200);
    }
  
    // Finally update the indicator in storage
    chrome.storage.local.get(["indicators"], (result) => {
      const indies = result.indicators as { [key: string]: IndicatorData[] };
      if (!indies) return;
      
      const currentPath = generateStoragePath(window.location.href);
      const indicatorOriginalPath = generateStoragePath(indicator.request?.documentURL);
      // if our current path is not the document URL, we don't update the indicator
      if (currentPath !== indicatorOriginalPath) return;


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
      
      try {
        chrome.storage.local.set({ indicators: indies });
      } catch (error) {
        console.error("Error saving indicators:", error);
      }
      // chrome.storage.local.set({ indicators: indies });
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
  recentCalls: Map<string, NetworkCall[]>,
  currentMessages?: any
): void | IndicatorData[] {

  const indicatorsThatDidNotUpdate: IndicatorData[] = [];
  console.log({ currentMessages });

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
          const callUrl = call?.response?.url ?? call?.request?.request?.url;
          return generateStoragePath(callUrl) === generateStoragePath(indicator.lastCall?.url);
        });
        
        // 2. Try pattern-based match
        if (!matchingCall) {
          matchingCall = uniqueMatches.find(call => {
            const callUrl = call?.response?.url ?? call?.request?.request?.url;
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
          console.warn('No match found for indicator:', {
            indicator: indicator.id,
            url: indicator.lastCall?.url,
            method: indicator.method,
            normalKey,
            patternKey,
            cacheSize: recentCalls.size
          });
        }
      } catch (error) {
        console.error('Error updating indicator:', error, indicator);
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
    let hasUpdates = false;

    // Only check indicators whose paths contain current URL
    Object.keys(indies).forEach((path: string) => {
      if (!path.includes(currentPath)) return; // Skip unrelated paths
      
      const arrayOfIndiesPerPath = indies[path];

      arrayOfIndiesPerPath.forEach((indicator, index) => {
        try {
          const normalKey = generateStoragePath(indicator.lastCall?.url) + '|' + indicator.method;
          const patternKey = generatePatternBasedStoragePath(indicator.lastCall?.url) + '|' + indicator.method;
          
          const normalCalls = recentCalls.get(normalKey) || [];
          const patternCalls = recentCalls.get(patternKey) || [];
          const allMatches = [...normalCalls, ...patternCalls];
          
          const matchingCall = allMatches.find(call => {
            const callUrl = call?.response?.response?.url ?? call?.request?.request?.url;
            return generateStoragePath(callUrl) === generateStoragePath(indicator.lastCall?.url);
          });

          if (matchingCall) {
            // Update indicator in storage
            indies[path][index] = {
              ...indicator,
              lastCall: {
                ...indicator.lastCall,
                status: matchingCall.response?.status || indicator.lastCall.status,
                timestamp: Date.now(),
                url: matchingCall.response?.response?.url || indicator.lastCall.url,
              },
            };
            hasUpdates = true;
          }
        } catch (error) {
          console.error('Error updating nested indicator:', error, indicator);
        }
      });
    });

    // Save to storage only if there were updates
    if (hasUpdates) {
      chrome.storage.local.set({ indicators: indies });
    }
  });
}


}

// יצוא ברירת מחדל של המחלקה
export default IndicatorMonitor;
