import { debounce } from "../../utils/general";
import { generateStoragePath } from "../../utils/storage";
import { URLChangeDetector } from "../../utils/urlChangeDetector";
import { loadIndicators } from "./indicatorService";
import { isUserLoggedIn, authenticatedLoadIndicators } from "./loginManager";



export class IndicatorLoader {
  private static instance: IndicatorLoader;
  private initialLoadDone = false;
  private urlDetector: URLChangeDetector;
  private debouncedLoadIndicators: any;

  private constructor() {
    this.urlDetector = new URLChangeDetector();
    this.debouncedLoadIndicators = debounce(loadIndicators, 300);
    this.setupEventListeners();
  }

  public static getInstance(): IndicatorLoader {
    if (!IndicatorLoader.instance) {
      IndicatorLoader.instance = new IndicatorLoader();
    }
    return IndicatorLoader.instance;
  }

  private handleIndicatorLoad = async () => {
    // Check if user is logged in
    const loggedIn = await isUserLoggedIn();

    
    if (!loggedIn) {
      // Show login modal and wait for authentication
      authenticatedLoadIndicators(() => {
        if (!this.initialLoadDone) {
          chrome.storage.local.get(["userData"], (res) => {
            const userData = res.userData;
            if (userData) {
              chrome.runtime.sendMessage({
                type: "USER_AUTHENTICATED",
                data: userData,
              });
            } else {
              console.warn("No user data found, proceeding without it.");
            }
          })
          loadIndicators();
          this.initialLoadDone = true;
        } else {
          this.debouncedLoadIndicators();
        }
        this.removeDuplicatedIndicatorElements();
      });
    } else {
      const currentUrl = window.location.href;
      const currentPath  = generateStoragePath(currentUrl);
      chrome.runtime
      .sendMessage({
        type: "URL_CHANGED",
        url: currentPath,
      })
      // User is already logged in, proceed normally
      if (!this.initialLoadDone) {
        chrome.storage.local.get(["userData"], (res) => {
          const userData = res.userData;
          if (userData) {
            chrome.runtime.sendMessage({
              type: "USER_AUTHENTICATED",
              data: userData,
            });
          } else {
            console.warn("No user data found, proceeding without it.");
          }
        })
        loadIndicators();
        this.initialLoadDone = true;
      } else {
        chrome.storage.local.get(["userData"], (res) => {
          const userData = res.userData;
          if (userData) {
            chrome.runtime.sendMessage({
              type: "USER_AUTHENTICATED",
              data: userData,
            });
          } else {
            console.warn("No user data found, proceeding without it.");
          }
        })
        this.debouncedLoadIndicators();
      }
      this.removeDuplicatedIndicatorElements();
    }
  };

  private setupEventListeners() {
    const events = ["load", "DOMContentLoaded", "popstate", "hashchange"];
    events.forEach((event) =>
      window.addEventListener(event, this.handleIndicatorLoad)
    );

    this.urlDetector.subscribe(() => {
      document.querySelectorAll(".indicator")?.forEach((indicator) => {
        indicator.remove();
      });
      this.debouncedLoadIndicators();
      this.removeDuplicatedIndicatorElements();
    });

    this.handleIndicatorLoad();
  }

  private removeDuplicatedIndicatorElements() {
    const arrayOfIndies = document.querySelectorAll(".indicator");
    arrayOfIndies.forEach((el, index) => {
      if (index !== 0) el.remove();
    });
  }
}
