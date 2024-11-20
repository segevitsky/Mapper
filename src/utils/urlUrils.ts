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
