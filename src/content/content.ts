import { IndicatorData, NetworkCall } from "../types";
import { URLChangeDetector } from "../utils/urlChangeDetector";
import { matchUrlPattern } from "../utils/urlUrils";

// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement;
let innerModalContainer: HTMLElement;

// אתחול בטעינת הדף
createContainers();
injectStyles();
loadIndicators();

// יצירת instance יחיד
const urlDetector = new URLChangeDetector();

// נרשם לשינויי URL
urlDetector.subscribe(() => {
  console.log("URL changed (from URLChangeDetector), reloading indicators");
  // מחיקת האינדיקטורים הקיימים
  document.querySelectorAll(".indicator").forEach((indicator) => {
    indicator.remove();
  });
  // טעינה מחדש
  loadIndicators();
});

window.addEventListener("popstate", () => {
  console.log("URL changed, reloading indicators");
  loadIndicators();
});

// ונוסיף גם האזנה לשינויי hash אם יש כאלה
window.addEventListener("hashchange", () => {
  console.log("Hash changed, reloading indicators");
  loadIndicators();
});

// יצירת מיכל למודל ולאינדיקטורים
function createContainers() {
  modalContainer = document.createElement("div");
  modalContainer.id = "api-mapper-modal-container";
  modalContainer.style.zIndex = "999999"; // ערך גבוה יותר
  modalContainer.style.position = "fixed";
  modalContainer.style.top = "0";
  modalContainer.style.bottom = "0";
  modalContainer.style.left = "0";
  modalContainer.style.right = "0";

  innerModalContainer = document.createElement("div");
  innerModalContainer.id = "inner-modal-container";
  innerModalContainer.style.cssText = `
  position: relative;
  width: 100%;
  height: 100%;
`;

  modalContainer.appendChild(innerModalContainer);
  document.body.appendChild(modalContainer);
}

// הצגת המודל
function showModal(
  element: {
    data: NetworkCall[];
    id: string;
    path: string;
    rect: any;
    tagName: string;
  },
  data: { networkCalls: NetworkCall[] }
) {
  if (!modalContainer) createContainers();
  console.log({ element, data });

  // ניקוי התוכן הקודם של innerModalContainer
  innerModalContainer.innerHTML = "";

  const modalContent = document.createElement("div");
  modalContent.className = "modal-content";
  modalContent.style.cssText = `
    position: fixed;
    z-index: 999999;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border: 1px solid #e0e0e0;
    max-width: 500px;
    pointer-events: auto;
  `;

  const callsList = data.networkCalls
    .map(
      (call) => `
    <div 
      class="api-call-item" 
      style="
        padding: 8px;
        margin: 4px 0;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
      "
      data-call-id="${call.id}"
    >
      <div style="
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 8px;
        background-color: ${call.status === 200 ? "#4CAF50" : "#f44336"};
      "></div>
      <div>
        <div style="font-weight: bold;">${call.method}</div>
        <div style="font-size: 12px; color: #666;">${call.url}</div>
      </div>
    </div>
  `
    )
    .join("");

  modalContent.innerHTML = `
    <div style="float: right; cursor: pointer" id='close-modal'> X </div>
    <h3 style="font-size: 18px; font-weight: bold; margin-bottom: 12px;">
      Select API Call for Element
    </h3>
    <div style="margin-bottom: 12px;">
      // add search 
      <strong>Selected Element:</strong><br/>
      ${element.tagName.toLowerCase()} - ${element.id || "no id"}
    </div>
    <div style="max-height: 300px; overflow-y: auto;">
      ${callsList}
    </div>
  `;

  // הוספת המודל ל-innerModalContainer
  innerModalContainer.appendChild(modalContent);

  // טיפול בסגירת המודל
  const closeModal = modalContent.querySelector("#close-modal");
  closeModal?.addEventListener("click", () => {
    modalContent.remove(); // במקום לרוקן את כל ה-container
  });

  // הוספת מאזינים לקליקים על הקריאות
  modalContent.querySelectorAll(".api-call-item").forEach((item) => {
    item.addEventListener("click", () => {
      const callId = item.getAttribute("data-call-id");
      const selectedCall = data.networkCalls.find((call) => call.id === callId);
      console.log({ selectedCall });
      if (selectedCall) {
        const elementByPath = document.querySelector(element.path);
        if (!elementByPath) return;

        const rect = element.rect;
        const indicatorData: IndicatorData = {
          id: Date.now().toString(),
          baseUrl: window.location.href,
          method: selectedCall.method,
          elementInfo: {
            path: element.path,
            rect: element.rect,
          },
          lastCall: {
            status: selectedCall.status,
            timing: selectedCall.timing,
            timestamp: Date.now(),
            url: selectedCall.url,
          },
          position: {
            top: rect.top + window.scrollY,
            left: rect.right + window.scrollX,
          },
          // apiCall: {
          //   id: selectedCall.id,
          //   method: selectedCall.method,
          //   url: selectedCall.url,
          //   status: Number(selectedCall.status),
          //   timing: selectedCall.timing,
          // },
        };

        const indicator = document.createElement("div");
        indicator.className = "indicator";
        indicator.dataset.indicatorId = indicatorData.id;
        indicator.style.cssText = `
          display: inline-block;
          width: 12px;
          height: 12px;
          margin-left: 8px;
          border-radius: 50%;
          background-color: ${
            selectedCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336"
          };
          cursor: pointer;
          z-index: 999999;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          vertical-align: middle;
        `;

        // הוספת האינדיקטור מייד אחרי האלמנט
        elementByPath.after(indicator);

        indicator.addEventListener("click", () => {
          const tooltip = document.createElement("div");
          tooltip.style.cssText = `
            position: absolute;
            top: ${indicatorData.position.top + 16}px;
            left: ${indicatorData.position.left + 16}px;
            background: white;
            padding: 12px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-size: 12px;
            z-index: 999999;
          `;

          const durationColor =
            selectedCall.timing.duration < 300
              ? "#4CAF50"
              : selectedCall.timing.duration < 1000
              ? "#FFC107"
              : "#f44336";

          tooltip.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${selectedCall.method}</strong>
              <span style="color: ${durationColor}; font-weight: bold;">
                ${Math.floor(selectedCall.timing.duration)}ms
              </span>
            </div>
            <div style="color: #666; word-break: break-all; margin: 8px 0;">
              ${selectedCall.url}
            </div>
            <div style="color: ${
              selectedCall.status === 200 ? "#4CAF50" : "#f44336"
            }">
              Status: ${selectedCall.status}
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
              Page: ${new URL(window.location.href).pathname}
            </div>
            <button class="remove-indicator" style="
              margin-top: 8px;
              padding: 4px 8px;
              background: #f44336;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            ">Remove</button>
            <button class="close-indicator-tooltip"> Close </button>
          `;

          tooltip
            .querySelector(".remove-indicator")
            ?.addEventListener("click", () => {
              indicator.remove();
              tooltip.remove();
              chrome.storage.local.get(["indicators"], (result) => {
                const indicators = result.indicators || {};
                if (indicators[window.location.href]) {
                  indicators[window.location.href] = indicators[
                    window.location.href
                  ].filter((ind: IndicatorData) => ind.id !== indicatorData.id);
                  chrome.storage.local.set({ indicators });
                }
              });
            });

          tooltip
            .querySelector(".close-indicator-tooltip")
            ?.addEventListener("click", () => tooltip.remove());

          document.body.appendChild(tooltip);
        });

        chrome.storage.local.get(["indicators"], (result) => {
          const indicators = result.indicators || {};
          indicators[window.location.href] =
            indicators[window.location.href] || [];
          indicators[window.location.href].push(indicatorData);
          chrome.storage.local.set({ indicators }, () => {
            elementByPath.after(indicator);
          });
        });

        modalContent.remove(); // סגירת המודל אחרי בחירת קריאה
      }
    });
  });
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #api-mapper-modal-container {
      pointer-events: none;  // חשוב! מאפשר קליקים לעבור דרכו
      position: fixed;
      z-index: 999999;
    }

    #api-mapper-modal-container .modal-content {
      pointer-events: auto;  // רק המודל עצמו יתפוס אירועים
      position: absolute;
      background: white;
      padding: 1rem;
      border-radius: 0.5rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      min-width: 300px;
    }

    #api-mapper-indicators-container {
      pointer-events: none;
      position: fixed;
      z-index: 999999;
    }

    #api-mapper-indicators-container .indicator {
      pointer-events: auto;
    }

    .indicator {
      transition: all 0.2s ease;
    }

    .remove-indicator {
      margin-top: 8px;
      padding: 4px 8px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

// הוספת אינדיקטור
// function addIndicator(rect: DOMRect, status: number) {
//   if (!indicatorsContainer) return;

//   // עדכון הסטייל של הקונטיינר
//   indicatorsContainer.style.cssText = `
//     position: fixed;
//     top: 0;
//     left: 0;
//     width: 100vw;
//     height: 100vh;י
//     pointer-events: none;
//     z-index: 999999;
//   `;

//   const indicator = document.createElement("div");
//   indicator.style.cssText = `
//     position: fixed;
//     top: ${rect.top + window.scrollY}px;
//     left: ${rect.right + window.scrollX + 8}px;
//     width: 12px;
//     height: 12px;
//     border-radius: 50%;
//     background-color: ${status === 200 ? "#4CAF50" : "#f44336"};
//     cursor: pointer;
//     pointer-events: auto;
//     box-shadow: 0 2px 4px rgba(0,0,0,0.2);
//     z-index: 999999;
//   `;

//   indicatorsContainer.appendChild(indicator);
// }

function loadIndicators() {
  chrome.storage.local.get(["indicators"], (result) => {
    console.log({ result });
    const indicators = result.indicators || {};
    let currentPageIndicators = indicators[window.location.href] || [];
    currentPageIndicators = currentPageIndicators.filter(
      (el: IndicatorData) => el.baseUrl
    );
    console.log({ currentPageIndicators });
    currentPageIndicators.forEach(createIndicatorFromData);
  });
}

function createIndicatorFromData(indicatorData: IndicatorData) {
  console.log({ indicatorData });
  const elementByPath = document.querySelector(indicatorData.elementInfo.path);
  console.log({ elementByPath });
  if (!elementByPath) return;

  const indicator = document.createElement("div");
  indicator.className = "indicator";
  indicator.id = `indi-${indicatorData.id}`;
  indicator.dataset.indicatorId = indicatorData.id;
  indicator.style.cssText = `
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-left: 8px;
    border-radius: 50%;
    background-color: ${
      indicatorData.lastCall.status === 200
        ? "rgba(25,200, 50, .75)"
        : "#f44336"
    };
    cursor: pointer;
    z-index: 999999;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    vertical-align: middle;
    position: absolute;
    top: 1rem;
  `;

  addIndicatorEvents(indicator, indicatorData);
  elementByPath.after(indicator); // הנה השינוי המרכזי!
}

function addIndicatorEvents(indicator: HTMLElement, data: any) {
  indicator.addEventListener("click", () => {
    const tooltipElement = document.getElementById("indicator-tooltip");
    if (tooltipElement) {
      console.log({ tooltipElement });
      tooltipElement.remove();
    }
    const tooltip = document.createElement("div");
    tooltip.id = "indicator-tooltip";
    tooltip.style.cssText = `
      position: absolute;
      top: ${data.elementInfo.rect.top + window.scrollY - 4}px;
      left: ${data.elementInfo.rect.right + window.scrollX + 24}px;
      background: white;
      padding: 12px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      font-size: 12px;
      z-index: 999999;
    `;

    console.log({ data });

    const durationColor =
      data.lastCall.timing < 300
        ? "#4CAF50"
        : data.lastCall.timing < 1000
        ? "#FFC107"
        : "#f44336";

    tooltip.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${data.method}</strong>
        <span style="color: ${durationColor}; font-weight: bold;">
          ${Math.floor(data.lastCall.timing?.duration)}ms
        </span>
      </div>
      <div style="color: #666; word-break: break-all; margin: 8px 0;">
        ${data?.lastCall.url}
      </div>
      <div style="color: ${
        data.lastCall.status === 200 ? "#4CAF50" : "#f44336"
      }">
        Status: ${data.lastCall.status}
      </div>
      <button class="remove-indicator">Remove</button>
      <button class="close-indicator-tooltip"> Close </button>
    `;

    tooltip
      .querySelector(".remove-indicator")
      ?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        removeIndicatorFromStorage(data.id);
      });

    tooltip
      .querySelector(".close-indicator-tooltip")
      ?.addEventListener("click", () => {
        tooltip.remove();
      });

    document.body.appendChild(tooltip);
  });
}

function removeIndicatorFromStorage(indicatorId: string) {
  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    if (indicators[window.location.href]) {
      indicators[window.location.href] = indicators[
        window.location.href
      ].filter((ind: IndicatorData) => ind.id !== indicatorId);
      chrome.storage.local.set({ indicators });
    }
  });
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener((message) => {
  console.log("Message received in content:", message);

  switch (message.type) {
    case "START_INSPECT_MODE":
      enableInspectMode();
      break;

    case "SHOW_API_MODAL":
      const { element, networkCalls } = message.data;
      showModal(element, { networkCalls });
      break;

    case "CLEAR_INDICATORS":
      document.querySelectorAll(".indicator").forEach((indicator) => {
        indicator.remove();
      });
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        delete indicators[window.location.href];
        chrome.storage.local.set({ indicators });
      });
      break;

    case "TOGGLE_INDICATORS": {
      const indicators = document.querySelectorAll(".indicator");
      indicators.forEach((indicator) => {
        const currentDisplay = window.getComputedStyle(indicator).display;
        (indicator as HTMLElement).style.display =
          currentDisplay === "none" ? "inline-block" : "none";
      });
      break;
    }
    case "UPDATE_INDICATORS":
      console.log("lets update the indicators");
      updateRelevantIndicators(message.data);
      break;
  }

  return true;
});

function updateRelevantIndicators(newCall: NetworkCall) {
  console.log("Updating indicators for new call:", newCall);

  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    const currentPageIndicators = indicators[window.location.href] || [];

    console.log("Current indicators:", currentPageIndicators); // נוסיף לוג זה
    console.log("Current URL:", window.location.href); // ונוסיף גם את זה

    let hasUpdates = false;

    currentPageIndicators.forEach((indicator: IndicatorData) => {
      console.log({ indicator, newCall, matchUrlPattern });
      if (
        indicator?.method === newCall.method &&
        indicator?.lastCall?.url === newCall.url
      ) {
        console.log("Found matching indicator:", indicator.apiCall);
        console.log("Found matching indicator:", newCall);
        console.log(
          newCall,
          "this is the new call just arrived from our network listener"
        );
        // עדכון המידע
        indicator.lastCall = {
          ...indicator.lastCall,
          status: newCall.status,
          timing: newCall.timing,
          timestamp: Date.now(),
        };

        console.log("this is the id of the indicator", indicator.id);

        // עדכון הויזואלי של האינדיקטור
        const indicatorElement = document.querySelector(
          `[data-indicator-id="${indicator.id}"]`
        );

        console.log({ indicatorElement });
        console.log({ indicator });

        if (indicatorElement) {
          (indicatorElement as HTMLElement).style.backgroundColor =
            newCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336";

          // אנימציה קטנה שתראה שהיה עדכון
          (indicatorElement as HTMLElement).style.transform = "scale(1.2)";
          setTimeout(() => {
            (indicatorElement as HTMLElement).style.transform = "scale(1)";
          }, 200);
        }

        hasUpdates = true;
      }
    });

    // שומרים רק אם היו שינויים
    if (hasUpdates) {
      indicators[window.location.href] = currentPageIndicators;
      chrome.storage.local.set({ indicators });
    }
  });
}

function createHighlighter() {
  highlighter = document.createElement("div");
  highlighter.id = "element-highlighter";
  highlighter.style.position = "fixed";
  highlighter.style.border = "2px solid #0088ff";
  highlighter.style.backgroundColor = "rgba(0, 136, 255, 0.1)";
  highlighter.style.pointerEvents = "none";
  highlighter.style.zIndex = "10000";
  highlighter.style.display = "none";
  document.body.appendChild(highlighter);
}

function enableInspectMode() {
  console.log("Inspect mode enabled");
  isInspectMode = true;
  document.body.style.cursor = "crosshair";
  createHighlighter();

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("click", handleClick, true);
}

function handleMouseOver(e: MouseEvent) {
  if (!isInspectMode || !highlighter) return;

  const target = e.target as Element;
  hoveredElement = target;

  // עדכון המסגרת המודגשת
  const rect = target.getBoundingClientRect();
  highlighter.style.display = "block";
  highlighter.style.top = `${window.scrollY + rect.top}px`;
  highlighter.style.left = `${window.scrollX + rect.left}px`;
  highlighter.style.width = `${rect.width}px`;
  highlighter.style.height = `${rect.height}px`;
}

function handleMouseOut() {
  if (!isInspectMode || !highlighter) return;
  highlighter.style.display = "none";
}

function handleClick(e: MouseEvent) {
  if (!isInspectMode) return;

  e.preventDefault();
  e.stopPropagation();

  if (hoveredElement) {
    // שליחת מידע על האלמנט שנבחר
    chrome.runtime.sendMessage({
      type: "ELEMENT_SELECTED",
      data: {
        tagName: hoveredElement.tagName,
        id: hoveredElement.id,
        className: hoveredElement.className,
        path: getElementPath(hoveredElement),
        rect: hoveredElement.getBoundingClientRect(),
      },
    });
  }

  disableInspectMode();
}

function disableInspectMode() {
  console.log("Inspect mode disabled");
  isInspectMode = false;
  document.body.style.cursor = "default";
  document.removeEventListener("mouseover", handleMouseOver);
  document.removeEventListener("mouseout", handleMouseOut);
  document.removeEventListener("click", handleClick, true);

  if (highlighter) {
    highlighter.remove();
    highlighter = null;
  }
}

// פונקציה עזר לקבלת נתיב ייחודי לאלמנט
function getElementPath(element: Element): string {
  const path = [];
  let currentElement = element;

  while (currentElement.parentElement) {
    let index = 1;
    let sibling = currentElement;

    while (sibling.previousElementSibling) {
      if (sibling.previousElementSibling.tagName === currentElement.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = currentElement.tagName.toLowerCase();
    const selector = index > 1 ? `${tagName}:nth-of-type(${index})` : tagName;
    path.unshift(selector);

    currentElement = currentElement.parentElement;
  }

  return path.join(" > ");
}

// content.ts

console.log("Content script loaded");
