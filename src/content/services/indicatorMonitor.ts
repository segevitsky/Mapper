import { IndicatorData, NetworkRequest } from "../../types";
import { generateStoragePath } from "../../utils/storage";

// src/content/services/indicatorMonitor.ts
export class IndicatorMonitor {
  private static _instance: IndicatorMonitor | null = null;

  public static getInstance() {
    if (!this._instance) {
      this._instance = new IndicatorMonitor();
    }
    return this._instance;
  }

  private updateIndicatorContent(
    indicator: IndicatorData,
    newCall: NetworkRequest
  ) {
    const duration =
      newCall.response.timing.receiveHeadersEnd -
      newCall.response.timing.sendStart;
    indicator.lastCall = {
      ...indicator.lastCall,
      status: newCall.response?.status,
      timing: {
        startTime: newCall.response.timing.sendStart,
        endTime: newCall.response.timing.sendEnd,
        duration,
      },
      timestamp: Date.now(),
      url: newCall.response.url, // שומרים את ה-URL המלא החדש,
      updatedInThisRound: true,
    };
    indicator = { ...indicator, ...newCall };

    const indicatorElement = document.getElementById(`indi-${indicator.id}`);

    console.log("Found indicator element:", indicatorElement);
    console.log("indicator after update", indicator);
    if (indicatorElement) {
      indicatorElement.classList.add("indicator-updating");
      setTimeout(() => {
        indicatorElement.classList.remove("indicator-updating");
      }, 500);

      (indicatorElement as HTMLElement).style.backgroundColor =
        newCall.response?.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336";

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
      data.lastCall.timing.duration < 300
        ? "#4CAF50"
        : data.lastCall.timing.duration < 1000
        ? "#FFC107"
        : "#f44336";

    // עדכון זמן תגובה
    const durationSpan = tooltip.querySelector("span");
    if (durationSpan) {
      durationSpan.textContent = `${Math.floor(
        data.lastCall.timing.duration
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
    allNetworkCalls?: any
  ): void | IndicatorData[] {
    console.log(
      "Checking indicators for updates...",
      indicators,
      allNetworkCalls
    );
    // const outdatedIndicators = indicators.filter((indicator) => {
    //   return !indicator.lastCall?.updatedInThisRound;
    // });

    const failedIndicatorsArray: NetworkRequest | IndicatorData[] = [];

    // if (outdatedIndicators.length > 0) {
    // console.log("Found indicators that did not update:", outdatedIndicators);
    indicators.forEach((indicator) => {
      // debugger;
      const networkCall = allNetworkCalls.find(
        (call: any) =>
          generateStoragePath(
            call?.response?.url ?? call?.request?.request?.url
          ) === generateStoragePath(indicator.lastCall?.url)
      );

      // debugger;

      if (networkCall) {
        console.log(
          "Updating indicator with this network call",
          indicator,
          networkCall
        );
        this.updateIndicatorContent(indicator, networkCall);
      } else {
        failedIndicatorsArray.push(indicator);
      }
    });
    if (failedIndicatorsArray.length > 0) {
      return failedIndicatorsArray;
    }
  }
}

// יצוא ברירת מחדל של המחלקה
export default IndicatorMonitor;
