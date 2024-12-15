import { DynamicPattern } from "../types";

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

// updated function
export function createUrlPattern(url: string): string {
  const urlObj = new URL(url);
  const searchParams = new URLSearchParams(urlObj.search);
  let patternUrl = `${urlObj.origin}${urlObj.pathname}`;
  
  // יוצרים תבנית עם a,b,c,d במקום ערכים
  const queryPattern: string[] = [];
  searchParams.forEach((value, key) => {
    console.log({ key, value });
    queryPattern.push(`${key}=${String.fromCharCode(97 + queryPattern.length)}`);
  });
  
  if (queryPattern.length) {
    patternUrl += '?' + queryPattern.join('&');
  }
  
  return patternUrl;
}

export function urlMatchesPattern(pattern: string, currentUrl: string): boolean {
  const patternUrl = new URL(pattern);
  const urlObj = new URL(currentUrl);
  
  if (patternUrl.origin + patternUrl.pathname !== urlObj.origin + urlObj.pathname) {
    return false;
  }
  
  // בודקים שיש את אותם פרמטרים
  const patternParams = new URLSearchParams(patternUrl.search);
  const currentParams = new URLSearchParams(urlObj.search);
  
  return Array.from(patternParams.keys()).every(key => currentParams.has(key));
}