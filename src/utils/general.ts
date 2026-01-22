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

// Performance: Shared MutationObserver for all indicators
// Instead of creating one observer per indicator, use a single shared observer
class SharedIndicatorObserver {
  private static instance: SharedIndicatorObserver;
  private observer: MutationObserver;
  private pendingWaits: Map<string, { resolve: (element: Element | null) => void; timeoutId: ReturnType<typeof setTimeout> }>;

  private constructor() {
    this.pendingWaits = new Map();
    this.observer = new MutationObserver(() => {
      // Check all pending indicators on each mutation
      for (const [elementId, { resolve, timeoutId }] of this.pendingWaits.entries()) {
        const element = document.getElementById(elementId);
        if (element) {
          clearTimeout(timeoutId);
          this.pendingWaits.delete(elementId);
          resolve(element);
        }
      }
    });

    // Start observing document body once
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  static getInstance(): SharedIndicatorObserver {
    if (!SharedIndicatorObserver.instance) {
      SharedIndicatorObserver.instance = new SharedIndicatorObserver();
    }
    return SharedIndicatorObserver.instance;
  }

  waitForElement(elementId: string, timeout: number): Promise<Element | null> {
    return new Promise((resolve) => {
      // Check if element already exists
      const existingElement = document.getElementById(elementId);
      if (existingElement) {
        resolve(existingElement);
        return;
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingWaits.delete(elementId);
        resolve(null);
      }, timeout);

      // Add to pending waits
      this.pendingWaits.set(elementId, { resolve, timeoutId });
    });
  }
}

export function waitForIndicator(
  indicatorId: string,
  timeout: number = 2000  // Reduced from 5s to 2s for better performance
): Promise<Element | null> {
  const elementId = `indi-${indicatorId}`;
  const observer = SharedIndicatorObserver.getInstance();
  return observer.waitForElement(elementId, timeout);
}
