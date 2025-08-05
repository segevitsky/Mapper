// AutoIndicatorService.ts
import { createIndicatorFromData } from "../services/indicatorService";
import {
  generatePatternBasedStoragePath,
  generateStoragePath,
} from "../../utils/storage";
import { IndicatorData } from "../../types";

type IndiConfig = {
  url: string;
  method:
    | "GET"
    | "get"
    | "POST"
    | "post"
    | "PUT"
    | "put"
    | "DELETE"
    | "delete"
    | "PATCH"
    | "patch";
  position: string;
};

export class AutoIndicatorService {
  private static instance: AutoIndicatorService | null = null;

  public static getInstance(): AutoIndicatorService {
    if (!this.instance) {
      this.instance = new AutoIndicatorService();
    }
    return this.instance;
  }

  public scanForDataIndies(networkCalls: any[]): void {
    const elements = document.querySelectorAll("[data-indi]");
    // console.log("Found elements with data-indi:", elements.length);
    elements.forEach(async (element) => {
      try {
        const indiConfig = this.parseIndiAttribute(element as HTMLElement);
        if (indiConfig) {
          // בדיקה אם האינדיקטור כבר קיים
          const exists = await this.checkExistingIndicator(
            element as HTMLElement,
            indiConfig
          );
          if (!exists) {
            const indicatorData = this.createIndicatorData(
              element as HTMLElement,
              indiConfig,
              networkCalls
            );
            createIndicatorFromData(indicatorData, true);
          }
        }
      } catch (error) {
        console.error("Error processing data-indi element:", error);
      }
    });
  }

  private async checkExistingIndicator(
    element: HTMLElement,
    config: IndiConfig
  ): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const storagePath = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[storagePath] || [];

        function hasAdjacentElementIndi(element: any) {
          const previous = element.previousElementSibling;
          // console.log({ previous });
          return (
            previous !== null &&
            (previous.hasAttribute("data-indicator-info") ||
              previous.hasAttribute("data-indicator-id"))
          );
        }

        const exists =
          currentPageIndicators.some(
            (indicator: IndicatorData) =>
              indicator.elementInfo?.path === element.tagName.toLowerCase() && // או getElementPath
              indicator.lastCall?.url === config.url &&
              indicator.method.toLowerCase() === config.method.toLowerCase()
          ) || hasAdjacentElementIndi(element);

        resolve(exists);
      });
    });
  }

  private createIndicatorData(
    element: HTMLElement,
    config: IndiConfig,
    networkCalls: any[]
  ): IndicatorData {
    const matchingNetworkCalls = networkCalls.filter(
      (call) =>
        generatePatternBasedStoragePath(
          call?.response?.url ?? call?.request?.request?.url
        ) === generatePatternBasedStoragePath(config.url)
    );

    if (matchingNetworkCalls.length > 0) {
      const filteredCalls = matchingNetworkCalls.filter(
        (el) => config.method.toUpperCase() === el?.request?.request?.method
      );
      if (filteredCalls.length > 0) {
        // const dataOld = filteredCalls[filteredCalls.length - 1];
        const data = filteredCalls.find((el) => !!el.body && el.body !== "");
        return {
          id: `auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          baseUrl: window.location.href,
          method: config.method.toUpperCase(),
          elementInfo: {
            path: element.tagName.toLowerCase(), // נצטרך להשתמש ב-getElementPath שלך
            rect: element.getBoundingClientRect(),
          },
          position: {
            top: element.getBoundingClientRect().top,
            left: element.getBoundingClientRect().right, // או left בהתאם לconfig.position
          },
          lastCall: {
            url: config.url,
            status: data?.response?.status || 0,
            timing: data?.timing || {
              startTime: 0,
              endTime: 0,
              duration: 0,
            },
            timestamp: Date.now(),
          },
          calls: data ? [data] : [],
          ...data,
        };
      }
    }

    const matchingNetworkCall =
      matchingNetworkCalls.length > 0
        ? matchingNetworkCalls[matchingNetworkCalls.length - 1]
        : null;
    // console.log("Matching network call:", matchingNetworkCall);
    // console.log("all network calls for auto", networkCalls);
    return {
      id: `auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      baseUrl: window.location.href,
      method: config.method.toUpperCase(),
      elementInfo: {
        path: element.tagName.toLowerCase(), // נצטרך להשתמש ב-getElementPath שלך
        rect: element.getBoundingClientRect(),
      },
      position: {
        top: element.getBoundingClientRect().top,
        left: element.getBoundingClientRect().right, // או left בהתאם לconfig.position
      },
      lastCall: {
        url: config.url,
        status: matchingNetworkCall?.response?.status || 0,
        timing: matchingNetworkCall?.timing || {
          startTime: 0,
          endTime: 0,
          duration: 0,
        },
        timestamp: Date.now(),
      },
      calls: matchingNetworkCall ? [matchingNetworkCall] : [],
    };
  }

  private parseIndiAttribute(element: HTMLElement): IndiConfig | null {
    const indiAttr = element.getAttribute("data-indi");
    if (!indiAttr) return null;

    try {
      const config = JSON.parse(indiAttr);
      if (!config.url) {
        console.error("Missing required 'url' in data-indi config");
        return null;
      }
      return config;
    } catch (e) {
      console.error("Invalid data-indi JSON:", indiAttr, e);
      return null;
    }
  }
}
