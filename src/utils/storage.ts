import { uuidRegex } from "./urlUrils";

export function generateStoragePath(url: string): string {
  const urlObj = new URL(url);
  const search = urlObj.search;
  const pathname = urlObj.pathname;
  const params = new URLSearchParams(search);
  const tabValue = params.get("tab");

  const pathParts = pathname
    .split("/")
    .filter(Boolean)
    .filter((el) => el !== "/")
    .filter((el) => el !== "")
    .filter((el) => !uuidRegex.test(el));

  if (tabValue) {
    pathParts.push(tabValue);
  }

  return pathParts.join("_");
}

/**
 * יוצר מזהה עקבי עבור URL בהתבסס על הנתיב והפרמטרים שלו
 * @param url כתובת ה-URL המלאה
 * @param ignoreParams רשימת פרמטרים להתעלם מהם (אופציונלי)
 * @returns מחרוזת מזהה המבוססת על הנתיב ורשימת הפרמטרים
 */
export function generatePatternBasedStoragePath(
  url: string,
  ignoreParams?: string[]
): string {
  // בדיקת null או undefined עבור ה-URL
  if (!url) {
    console.error("URL is null or undefined");
    return "";
  }

  // וודא שיש לנו רשימת ignoreParams תקינה
  const safeIgnoreParams = ignoreParams || [];

  try {
    const urlObj = new URL(url);

    // בדיקת null עבור pathname
    const pathname = urlObj.pathname || "";
    const params = urlObj.searchParams;

    // regex לזיהוי UUIDs (וודא שזה מוגדר)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // סינון הנתיב מ-UUID וכו' עם בדיקות null
    const pathPart = (pathname || "")
      .split("/")
      .filter((part) => part != null) // סינון null/undefined
      .filter((part) => part !== "") // סינון מחרוזות ריקות
      .filter((part) => part !== "/")
      .filter((part) => !uuidRegex.test(part))
      .join("_");

    // בדיקה שהפרמטרים והמערך הנוצר מהם אינם null
    const paramNames = params ? Array.from(params.keys()) : [];
    const filteredParamNames = paramNames
      .filter((param) => param != null) // סינון null/undefined
      .filter((param) => !safeIgnoreParams.includes(param)); // שימוש ברשימה הבטוחה

    // בדיקה שיש לנו pathPart תקין
    const validPathPart = pathPart || "path";

    // אם אין פרמטרים אחרי הסינון, החזר רק את חלק הנתיב
    if (!filteredParamNames || filteredParamNames.length === 0) {
      return validPathPart;
    }

    // הוסף את שמות הפרמטרים למזהה
    const paramsPattern = filteredParamNames.join("-");

    return `${validPathPart}_${paramsPattern}`;
  } catch (error) {
    console.error("שגיאה ביצירת מזהה דפוס:", error);
    // החזרת ערך ברירת מחדל בטוח במקרה של שגיאה
    return url || "invalid_url";
  }
}
