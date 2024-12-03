export function waitForElement(selector: string): Promise<Element> {
    return new Promise(resolve => {
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
        subtree: true
      });
    });
  }