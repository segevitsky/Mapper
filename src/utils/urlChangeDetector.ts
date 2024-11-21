export class URLChangeDetector {
  private lastUrl: string;
  private observers: (() => void)[] = [];

  constructor() {
    this.lastUrl = window.location.href;
    this.setupListeners();
  }

  private setupListeners() {
    // האזנה לשינויים ב-History API
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

    // האזנה לניווט רגיל (back/forward)
    window.addEventListener("popstate", () => this.handleUrlChange());

    // גיבוי: בדיקה תקופתית של ה-URL
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

      // שליחת הודעה ל-background script
      chrome.runtime.sendMessage({
        type: "URL_CHANGED",
        url: currentUrl,
      });

      // הפעלת כל ה-observers המקומיים
      this.observers.forEach((callback) => callback());
    }
  }

  // מאפשר להירשם לשינויי URL
  public subscribe(callback: () => void) {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter((cb) => cb !== callback);
    };
  }
}
