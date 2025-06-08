import { IndicatorData, NetworkRequest } from "../../types";
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


    console.log(
      { duration, indicator, newCall },
      "this is the updated duration in the indicators monitor screen"
    );
  
  
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
    console.log("Found indicator element:", indicatorElement);
    console.log("indicator after update", indicator);
  
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
    let backgroundColor = "#f44336"; // ברירת מחדל - אדום
  
    // Lets check if we have a schema and body to validate
    if (indicator.body && !indicator.schema) {
      // יצירת סכמה חדשה - בדיוק כמו בקוד המקורי
      const typeDefinition = schemaService.generateTypeDefinition(
        indicator.body?.body, 
        'PatientResponse', 
        { format: 'inline' }
      );
      console.log({ typeDefinition }, "typeDefinition for indicator body");
      indicator.schema = typeDefinition;
      
    } else if (indicator.schema && indicator.body && newCall?.body) {
      const validation = schemaService.validateResponse(
        newCall?.body?.body,  
        indicator.body?.body
      );
      
      console.log(
        { validation, indicator, newCall }, 
        'validation schema for indicator body'
      );
  
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
      console.log("Updated data indicator monitor:", updatedData);
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
      
      chrome.storage.local.set({ indicators: indies });
    });
  }


  private updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
    console.log("lets update our indicator", data);
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
    allNetworkCalls?: any,
    currentMessages?: any
  ): void | IndicatorData[] {
    console.log({ currentMessages }, "currentMessages");

    const indicatorsThatDidNotUpdate: IndicatorData[] = [];

    if (indicators.length > 0) {
      indicators.forEach((indicator) => {
        const networkCall = allNetworkCalls.find(
          (call: any) =>
            generateStoragePath(
              call?.response?.url ?? call?.request?.request?.url
            ) === generateStoragePath(indicator.lastCall?.url)
        );

        const allNetworkCallsThatMatch = allNetworkCalls
          .filter(
            (call: any) =>
              generateStoragePath(
                call?.response?.url ?? call?.request?.request?.url
              ) === generateStoragePath(indicator.lastCall?.url)
          )
          .filter(
            (el: any) => el?.request?.request?.method === indicator.method
          );

        const allNetworkCallsThatMatchTest = allNetworkCalls
          .filter(
            (call: any) =>
              generatePatternBasedStoragePath(
                call?.response?.url ?? call?.request?.request?.url
              ) === generatePatternBasedStoragePath(indicator.lastCall?.url)
          )
          .filter(
            (el: any) => el?.request?.request?.method === indicator.method
          );

        const networkCallWithBody = allNetworkCallsThatMatchTest.find(
          (el: any) => !!el.body
        );

        console.log(
          { allNetworkCallsThatMatchTest },
          "allNetworkCallsThatMatchTest"
        );

        if (
          networkCall ||
          allNetworkCallsThatMatch.length > 0 ||
          allNetworkCallsThatMatchTest.length > 0
        ) {
          console.log(
            "Updating indicator with this network call",
            allNetworkCallsThatMatchTest,
            indicator,
            allNetworkCallsThatMatch,
            allNetworkCallsThatMatch[allNetworkCallsThatMatch.length - 1] ??
              networkCall
          );
          this.updateIndicatorContent(
            indicator,
            allNetworkCallsThatMatch[allNetworkCallsThatMatch.length - 1] ??
              networkCallWithBody ??
              networkCall
          );
        } else {
          // Add here a way to report this on the screen!
          indicatorsThatDidNotUpdate.push(indicator);
        }
      });
    } else {
      // In this situation we are navigating to a page that has no indicators however his children might have indicators so we are checking
      // lets update all the indicators from our storage with our current network calls and save them back to storage
      chrome.storage.local.get(["indicators"], (result) => {
        const indies = result.indicators as { [key: string]: IndicatorData[] };

        const currentPageNestedIndies = Object.keys(indies)
          .filter((key) =>
            key.includes(generateStoragePath(window.location.href))
          )
          .map((key) => indies[key])
          .flat()
          .map((indicator: IndicatorData) => {
            const networkCall = allNetworkCalls.find(
              (call: any) =>
                generateStoragePath(
                  call?.response?.response?.url ?? call?.request?.request?.url
                ) === generateStoragePath(indicator.lastCall?.url)
            );

            if (networkCall) {
              console.log(
                "מצאנו התאמה - מעדכנים אינדיקטור:",
                indicator,
                networkCall
              );

              // עדכון ישיר של האובייקט בתוך המערך
              return {
                ...indicator,
                ...networkCall,
                lastCall: {
                  ...indicator.lastCall,
                  status:
                    networkCall.response?.status || indicator.lastCall.status,
                  timestamp: Date.now(),
                  url:
                    networkCall.response?.response?.url ||
                    indicator.lastCall.url,
                },
              };
            }
          });
        console.log({ currentPageNestedIndies }, "currentPageNestedIndies");

        if (!indies) return;
        let hasUpdates = false;

        Object.keys(indies).forEach((key: string) => {
          const arrayOfIndiesPerPath = indies[key];

          arrayOfIndiesPerPath.forEach((indicator, index) => {
            const networkCall = allNetworkCalls.find(
              (call: any) =>
                generateStoragePath(
                  call?.response?.response?.url ?? call?.request?.request?.url
                ) === generateStoragePath(indicator.lastCall?.url) &&
                call.request.request.method === indicator.method
            );

            if (networkCall) {
              console.log(
                "מצאנו התאמה - מעדכנים אינדיקטור:",
                indicator,
                networkCall
              );

              // עדכון ישיר של האובייקט בתוך המערך
              indies[key][index] = {
                ...indicator,
                ...networkCall,
                lastCall: {
                  ...indicator.lastCall,
                  status:
                    networkCall.response?.status || indicator.lastCall.status,
                  timestamp: Date.now(),
                  url:
                    networkCall.response?.response?.url ||
                    indicator.lastCall.url,
                },
              };

              console.log("אינדיקטור אחרי עדכון", indies[key][index]);
              hasUpdates = true;
            }
          });
        });

        // שמירה בסטוראג' רק אם היו עדכונים
        if (hasUpdates) {
          console.log("שומר אינדיקטורים מעודכנים", indies);
          chrome.storage.local.set({ indicators: indies });
        }
      });
    }

    // RIGHT HERE WE NEED TO SEND A MESSAGE SAYING LETS START TO SCAN FOR INDICATORS
    const autoIndicatorService = AutoIndicatorService.getInstance();
    autoIndicatorService.scanForDataIndies(allNetworkCalls);
  }
}

// יצוא ברירת מחדל של המחלקה
export default IndicatorMonitor;
