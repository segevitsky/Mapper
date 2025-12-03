export function waitForElement(selector: string, timeout: number = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    let timeoutId: NodeJS.Timeout;
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    // Set up timeout to prevent infinite waiting
    timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

export const getBorderByTiming = (timing: number) => {
  if (timing > 3000) return "2px solid #ff0000"; // אדום מלא לאיטיות קיצונית
  if (timing > 2500) return "2px solid #ff6b6b"; // אדום בהיר לאיטיות גבוהה
  if (timing > 2000) return "2px solid #ffd700"; // צהוב לאיטיות בינונית
  return "none";
};

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function removeDuplicatedIndicatorElements() {
  const arrayOfIndies = document.querySelectorAll(".indicator");
  arrayOfIndies.forEach((el, index) => {
    if (index !== 0) el.remove();
  });
}

export function waitForIndicator(
  indicatorId: string,
  timeout: number = 5000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const elementId = `indi-${indicatorId}`;
    const existingElement = document.getElementById(elementId);

    if (existingElement) {
      resolve(existingElement);
      return;
    }

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);

    const observer = new MutationObserver((mutations) => {
      // מחפשים בכל המוטציות החדשות
      for (const mutation of mutations) {
        // בודקים אם נוסף האלמנט שלנו
        if (mutation.type === "childList") {
          const element = document.getElementById(elementId);
          if (element) {
            clearTimeout(timeoutId);
            observer.disconnect();
            resolve(element);
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id"], // נצפה רק על שינויים ב-ID
    });
  });
}
