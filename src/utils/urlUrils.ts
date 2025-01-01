import { DynamicPattern, IndicatorData } from "../types";

// src/utils/urlUtils.ts
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");

    const cleanPath = pathParts
      .filter((part) => {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return !uuidRegex.test(part);
      })
      .join("/");

    return `${urlObj.origin}${cleanPath}`;
  } catch {
    return url;
  }
}

export function matchUrlToIndicator(
  callUrl: string,
  indicatorUrl: string
): boolean {
  const normalizedCallUrl = normalizeUrl(callUrl);
  return normalizedCallUrl.startsWith(indicatorUrl);
}

export function matchUrlPattern(newUrl: string, patternUrl: string): boolean {
  const normalizedNew = normalizeUrl(newUrl);
  const normalizedPattern = normalizeUrl(patternUrl);
  return normalizedNew === normalizedPattern;
}

export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function urlsMatchPattern(
  savedUrl: string,
  currentUrl: string
): boolean {
  try {
    const saved = new URL(savedUrl);
    const current = new URL(currentUrl);

    const savedParts = saved.pathname.split("/").filter(Boolean);
    const currentParts = current.pathname.split("/").filter(Boolean);

    // אם האורך שונה, זה לא אותו פטרן
    if (savedParts.length !== currentParts.length) return false;

    // השוואה של כל חלק בנתיב
    return savedParts.every((part, index) => {
      // אם אחד מהם UUID, זה בסדר
      if (isUUID(part) || isUUID(currentParts[index])) return true;
      // אחרת, החלקים צריכים להיות זהים
      return part === currentParts[index];
    });
  } catch {
    return false;
  }
}

export function isUUID(str: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str);
}

export function extractUUIDFromUrl(url: string): string {
  const matches = url.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return matches ? matches[0] : "";
}

export function updateUrlWithNewUUID(
  originalUrl: string,
  newUUID: string
): string {
  return originalUrl.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    newUUID
  );
}

export function identifyDynamicParams(url: string): DynamicPattern | undefined {
  try {
    const urlParts = new URL(url).pathname.split("/").filter(Boolean);
    const uuidPositions: number[] = [];

    urlParts.forEach((part, index) => {
      if (isUUID(part)) {
        uuidPositions.push(index);
      }
    });

    if (uuidPositions.length === 0) return undefined;

    return {
      dynamicParams: [
        {
          type: "uuid",
          positions: uuidPositions,
        },
      ],
    };
  } catch {
    return undefined;
  }
}

export function checkIfUrlHasUuid(url: string): boolean {
  const urlObj = new URL(url);

  const matches = urlObj.pathname.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );

  return matches ? true : false;
}

// we need this logic in save, update, clear and create!
export function understandUrlPatterns(indicatorData: IndicatorData) {
  const uuidInUrl = checkIfUrlHasUuid(window.location.href);
  const pathToSaveInStorage = window.location.pathname.split("/")[1];
  if (!uuidInUrl && !window.location.href.includes("tab")) {
    // we need to save our indicators according to our pathname splitted by '/' if the url doesn't have a uuid in it except if it is ca query param
    chrome.storage.local.get(["indicators"], (res) => {
      const indicators = res.indicators || {};
      console.log({ pathToSaveInStorage }, "our path to save in storage");
      indicators[pathToSaveInStorage] = indicators[pathToSaveInStorage] || [];
      indicators[pathToSaveInStorage].push(indicatorData);
      // chrome.storage.local.set({ indicators }, () => {
      //   elementByPath.after(indicator);
      // });
    });
    // This is in case there is a uuid in the saved url we are at so for now we will save it in the current url
  } else if (!uuidInUrl && window.location.href.includes("tab")) {
    chrome.storage.local.get(["indicators"], (res) => {
      const indicators = res.indicators || {};
      const urlParams = new URLSearchParams(window.location.search);
      const tabValue = urlParams.get("tab") || "default";
      indicators[pathToSaveInStorage] = indicators[pathToSaveInStorage] || {};
      indicators[pathToSaveInStorage][tabValue] =
        indicators[pathToSaveInStorage][tabValue] || [];
      // הוסף את האינדיקטור החדש
      indicators[pathToSaveInStorage][tabValue].push(indicatorData);

      console.log({ indicators }, "our indicators after adding one more");

      // chrome.storage.local.set({ indicators }, () => {
      //   elementByPath.after(indicator);
      // });
    });
  } else {
    chrome.storage.local.get(["indicators"], (result) => {
      const indicators = result.indicators || {};
      indicators[window.location.href] = indicators[window.location.href] || [];
      indicators[window.location.href].push(indicatorData);
      // chrome.storage.local.set({ indicators }, () => {
      //   elementByPath.after(indicator);
      // });
    });
  }
}
