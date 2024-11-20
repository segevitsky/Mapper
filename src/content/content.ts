import { IndicatorData, NetworkCall } from "../types";

// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement | null = null;
let indicatorsContainer: HTMLElement | null = null;

// אתחול בטעינת הדף
createContainers();
injectStyles();
loadIndicators();

// יצירת מיכל למודל ולאינדיקטורים
function createContainers() {
  modalContainer = document.createElement("div");
  modalContainer.id = "api-mapper-modal-container";
  modalContainer.style.zIndex = "999999"; // ערך גבוה יותר
  document.body.appendChild(modalContainer);

  // אותו דבר לאינדיקטורים
  indicatorsContainer = document.createElement("div");
  indicatorsContainer.id = "api-mapper-indicators-container";
  indicatorsContainer.style.zIndex = "999999";
  indicatorsContainer.style.pointerEvents = "none";
  indicatorsContainer.style.top = "0";
  indicatorsContainer.style.bottom = "0";
  indicatorsContainer.style.left = "0";
  indicatorsContainer.style.right = "0";

  document.body.appendChild(indicatorsContainer);
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
  if (!modalContainer) return;
  console.log({ element, data });
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
  const rect = element?.rect;
  console.log({ rect });

  modalContainer.innerHTML = `
  <div class="modal-content" style="
    position: fixed;
    z-index: 999999;
    top: ${rect.bottom + window.scrollY + 10}px;
    left: ${rect.left + window.scrollX}px;
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border: 1px solid #e0e0e0;
    max-width: 500px;
    pointer-events: auto;
  ">
    <h3 style="font-size: 18px; font-weight: bold; margin-bottom: 12px;">
      Select API Call for Element
    </h3>
    <div style="margin-bottom: 12px;">
      <strong>Selected Element:</strong><br/>
      ${element.tagName.toLowerCase()} - ${element.id || "no id"}
    </div>
    <div style="max-height: 300px; overflow-y: auto;">
      ${callsList}
    </div>
  </div>
`;

  // הוספת מאזינים לקליקים על הקריאות
  modalContainer.querySelectorAll(".api-call-item").forEach((item) => {
    item.addEventListener("click", () => {
      const callId = item.getAttribute("data-call-id");
      const selectedCall = data.networkCalls.find((call) => call.id === callId);

      if (selectedCall) {
        const rect = element.rect;
        const indicatorData: IndicatorData = {
          id: Date.now().toString(),
          pageUrl: window.location.href,
          position: {
            top: rect.top + 13,
            left: rect.left + 8,
          },
          element: {
            path: element.path,
            rect: rect,
          },
          apiCall: {
            id: selectedCall.id,
            method: selectedCall.method,
            url: selectedCall.url,
            status: Number(selectedCall.status),
            timing: selectedCall.timing,
          },
        };

        const indicator = document.createElement("div");
        indicator.className = "indicator";
        indicator.dataset.indicatorId = indicatorData.id;
        indicator.style.cssText = `
          position: fixed;
          top: ${indicatorData.position.top}px;
          left: ${indicatorData.position.left}px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: ${
            selectedCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336"
          };
          cursor: pointer;
          pointer-events: auto;
          z-index: 999999;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;

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

        if (indicatorsContainer) {
          indicatorsContainer.appendChild(indicator);
        }

        chrome.storage.local.get(["indicators"], (result) => {
          const indicators = result.indicators || {};
          indicators[window.location.href] =
            indicators[window.location.href] || [];
          indicators[window.location.href].push(indicatorData);
          chrome.storage.local.set({ indicators });
        });

        if (modalContainer) {
          modalContainer.innerHTML = "";
        }
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
  `;
  document.head.appendChild(style);
}

// הוספת אינדיקטור
function addIndicator(rect: DOMRect, status: number) {
  if (!indicatorsContainer) return;

  // עדכון הסטייל של הקונטיינר
  indicatorsContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;י
    pointer-events: none;
    z-index: 999999;
  `;

  const indicator = document.createElement("div");
  indicator.style.cssText = `
    position: fixed;
    top: ${rect.top + window.scrollY}px;
    left: ${rect.right + window.scrollX + 8}px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${status === 200 ? "#4CAF50" : "#f44336"};
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 999999;
  `;

  indicatorsContainer.appendChild(indicator);
}

function loadIndicators() {
  chrome.storage.local.get(["indicators"], (result) => {
    console.log({ result });
    const indicators = result.indicators || {};
    const currentPageIndicators = indicators[window.location.href] || [];
    currentPageIndicators.forEach(createIndicatorFromData);
  });
}

function createIndicatorFromData(indicatorData: IndicatorData) {
  const indicator = document.createElement("div");
  indicator.className = "indicator";
  indicator.dataset.indicatorId = indicatorData.id;
  indicator.style.cssText = `
    position: fixed;
    top: ${indicatorData.position.top}px;
    left: ${indicatorData.position.left}px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${
      indicatorData.apiCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336"
    };
    cursor: pointer;
    pointer-events: auto;
    z-index: 999999;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;

  addIndicatorEvents(indicator, indicatorData);
  indicatorsContainer?.appendChild(indicator);
}

function addIndicatorEvents(indicator: HTMLElement, data: IndicatorData) {
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
      top: ${data.element.rect.top + window.scrollY - 4}px;
      left: ${data.element.rect.right + window.scrollX + 24}px;
      background: white;
      padding: 12px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      font-size: 12px;
      z-index: 999999;
    `;

    const durationColor =
      data.apiCall.timing.duration < 300
        ? "#4CAF50"
        : data.apiCall.timing.duration < 1000
        ? "#FFC107"
        : "#f44336";

    tooltip.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${data.apiCall.method}</strong>
        <span style="color: ${durationColor}; font-weight: bold;">
          ${Math.floor(data.apiCall.timing.duration)}ms
        </span>
      </div>
      <div style="color: #666; word-break: break-all; margin: 8px 0;">
        ${data.apiCall.url}
      </div>
      <div style="color: ${
        data.apiCall.status === 200 ? "#4CAF50" : "#f44336"
      }">
        Status: ${data.apiCall.status}
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

    case "ADD_INDICATOR":
      const { rect, status } = message.data;
      addIndicator(rect, status);
      break;

    case "CLEAR_INDICATORS":
      if (indicatorsContainer) {
        indicatorsContainer.innerHTML = "";
      }
      break;

    case "TOGGLE_INDICATORS":
      if (indicatorsContainer) {
        indicatorsContainer.style.display =
          indicatorsContainer.style.display === "none" ? "block" : "none";
      }
      break;
  }

  return true;
});

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

console.log("Content script loaded");
