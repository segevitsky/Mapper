export function waitForElement(selector: string): Promise<Element> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(document.querySelector(selector)!);
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector)!);
      }
    });

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
