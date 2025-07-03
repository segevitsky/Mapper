import { generateStoragePath } from "./storage";

export class URLChangeDetector {
  private lastUrl: string;
  private observers: (() => void)[] = [];

  constructor() {
    this.lastUrl = window.location.href;
    this.setupListeners();
  }

  private setupListeners() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(window.history, args);
      this.handleUrlChange();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(window.history, args);
      this.handleUrlChange();
    };

    window.addEventListener("popstate", () => this.handleUrlChange());

    setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        this.handleUrlChange();
      }
    }, 100);
  }

  private handleUrlChange() {
    const currentUrl = window.location.href;
    if (this.lastUrl !== currentUrl) {
      this.lastUrl = currentUrl;
      const currentPath = generateStoragePath(currentUrl);
      // הוספת בדיקת תקינות לפני שליחת ההודעה
      try {
        if (chrome.runtime?.id) {
          // בודק אם ה-extension עדיין פעיל
          chrome.runtime
            .sendMessage({
              type: "URL_CHANGED",
              url: currentPath,
            })
            .catch((error) => {
              console.debug("Failed to send URL change message:", error);
              // לא מדווחים על שגיאה כי זה צפוי במקרים מסוימים
            });
        }
      } catch (error) {
        console.debug("Extension context invalid:", error);
        // לא מדווחים על שגיאה כי זה צפוי במקרים מסוימים
      }

      // ממשיכים להפעיל את ה-observers גם אם השליחה נכשלה
      this.observers.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error("Observer callback failed:", error);
        }
      });
    }
  }

  public subscribe(callback: () => void) {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter((cb) => cb !== callback);
    };
  }
}
