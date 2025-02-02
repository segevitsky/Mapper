import { debounce } from "../../utils/general";
import { URLChangeDetector } from "../../utils/urlChangeDetector";
import { loadIndicators } from "./indicatorService";

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

  private handleIndicatorLoad = () => {
    if (!this.initialLoadDone) {
      loadIndicators();
      this.initialLoadDone = true;
    } else {
      this.debouncedLoadIndicators();
    }
    this.removeDuplicatedIndicatorElements();
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
