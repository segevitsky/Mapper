import { IndicatorData, NetworkRequest } from "../../types";
import { waitForIndicator } from "../../utils/general";
import {
  generatePatternBasedStoragePath,
  generateStoragePath,
} from "../../utils/storage";
import { AutoIndicatorService } from "./autoIndicatorService";

// src/content/services/indicatorMonitor.ts
export class IndicatorMonitor {
  private static _instance: IndicatorMonitor | null = null;

  public static getInstance() {
    if (!this._instance) {
      this._instance = new IndicatorMonitor();
    }
    return this._instance;
  }

  private async updateIndicatorContent(
    indicator: IndicatorData,
    newCall: NetworkRequest
  ) {
    const duration =
      newCall?.duration ||
      (newCall?.response?.response?.timing?.receiveHeadersEnd ?? 1000) -
        (newCall?.response?.response?.timing?.sendStart ?? 1000);
    console.log("indicatorUrl", indicator.lastCall.url);
    console.log(
      { duration, indicator, newCall },
      "this is the updated duration in the indicators monitor screen"
    );

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
      url: newCall?.response?.url ?? indicator.lastCall.url, // שומרים את ה-URL המלא החדש,
      updatedInThisRound: true,
    };
    indicator = { ...indicator, ...newCall };

    // const indicatorElement = document.getElementById(`indi-${indicator.id}`);
    const indicatorElement = await waitForIndicator(indicator.id);

    console.log("Found indicator element:", indicatorElement);
    console.log("indicator after update", indicator);
    if (indicatorElement) {
      const repeatedIndicators = document.querySelectorAll(
        `#indi-${indicator.id}`
      );
      if (repeatedIndicators.length > 1) {
        repeatedIndicators.forEach((el, index) => {
          if (index !== 0) el.remove();
        });
      }
      indicatorElement.classList.add("indicator-updating");
      setTimeout(() => {
        indicatorElement.classList.remove("indicator-updating");
      }, 500);

      (indicatorElement as HTMLElement).style.backgroundColor =
        newCall.response?.response?.status === 200
          ? "rgba(25,200, 50, .75)"
          : "#f44336";

      // שמירת המידע המעודכן על האלמנט
      const updatedData = {
        ...indicator,
        lastUpdated: Date.now(),
      };

      console.log("Updated data indicator monitor:", updatedData);

      indicatorElement.setAttribute(
        "data-indicator-info",
        JSON.stringify(updatedData)
      );

      // עדכון הטולטיפ אם הוא פתוח
      const openTooltip = document.getElementById("indicator-tooltip");
      if (openTooltip) {
        this.updateTooltipContent(openTooltip, updatedData);
      }

      // אנימציה
      (indicatorElement as HTMLElement).style.transform = "scale(1.2)";
      setTimeout(() => {
        (indicatorElement as HTMLElement).style.transform = "scale(1)";
      }, 200);
    } else {
      console.log("Indicator element not found:", indicator);
      const indicatorSecondAttempt = document.getElementById(
        `indi-${indicator.id}`
      );
      console.log(
        "Indicator element second attempt:",
        !!indicatorSecondAttempt
      );
    }
  }

  private updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
    console.log("lets update our indicator", data);
    const durationColor =
      data.lastCall?.timing.duration < 300
        ? "#4CAF50"
        : data.lastCall?.timing.duration < 1000
        ? "#FFC107"
        : "#f44336";

    // עדכון זמן תגובה
    const durationSpan = tooltip.querySelector("span");
    if (durationSpan) {
      durationSpan.textContent = `${Math.floor(
        data.lastCall?.timing.duration
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
            allNetworkCallsThatMatchTest[
              allNetworkCallsThatMatchTest.length - 1
            ] ?? networkCall
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

        if (!indies) return;
        let hasUpdates = false;

        Object.keys(indies).forEach((key: string) => {
          const arrayOfIndiesPerPath = indies[key];

          arrayOfIndiesPerPath.forEach((indicator, index) => {
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
