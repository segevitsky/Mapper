import { JiraTicketData } from "../services/jiraService";
import { IndicatorData, NetworkCall } from "../types";
import {
  waitForElement,
  getBorderByTiming,
  removeDuplicatedIndicatorElements,
} from "../utils/general";
import { analyzeSecurityIssues } from "../utils/securityAnalyzer";
import { URLChangeDetector } from "../utils/urlChangeDetector";
import { generateStoragePath } from "../utils/storage";
import {
  extractUUIDFromUrl,
  identifyDynamicParams,
  updateUrlWithNewUUID,
} from "../utils/urlUrils";
// import { authenticatedLoadIndicators } from "./loginManager";

// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement;
let innerModalContainer: HTMLElement;
let pageIndicators: any[] = [];
let latestNetworkCalls: NetworkCall[] = [];

// אתחול בטעינת הדף
createContainers();
injectStyles();
loadIndicators();
// authenticatedLoadIndicators(loadIndicators);

// יצירת instance יחיד
const urlDetector = new URLChangeDetector();

// נרשם לשינויי URL
urlDetector.subscribe(() => {
  // מחיקת האינדיקטורים הקיימים
  document.querySelectorAll(".indicator")?.forEach((indicator) => {
    indicator.remove();
  });
  // טעינה מחדש
  loadIndicators();
  updateIndicatorsOnceFinishedLoading(latestNetworkCalls);
  removeDuplicatedIndicatorElements();
});

window.addEventListener("popstate", () => {
  loadIndicators();
  removeDuplicatedIndicatorElements();
  // authenticatedLoadIndicators(loadIndicators);
});

// ונוסיף גם האזנה לשינויי hash אם יש כאלה
window.addEventListener("hashchange", () => {
  loadIndicators();
  removeDuplicatedIndicatorElements();
  // authenticatedLoadIndicators(loadIndicators);
});

window.addEventListener("load", () => {
  loadIndicators();
  // remove all indicators except the first index
  removeDuplicatedIndicatorElements();
  // authenticatedLoadIndicators(loadIndicators);
});

// בדיקה נוספת אחרי שהדום מוכן
document.addEventListener("DOMContentLoaded", () => {
  loadIndicators();
  removeDuplicatedIndicatorElements();
  console.log({ pageIndicators }, "DOMContentLoaded page indicators");
  // authenticatedLoadIndicators(loadIndicators);
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

function createIndicator(data: any, item: any, element: any) {
  const callId = item.getAttribute("data-call-id");
  const selectedCall = data.networkCalls.find(
    (call: any) => call.id === callId
  );
  const elementByPath = document.querySelector(element.path);
  const elementBefore = elementByPath.previousElementSibling;
  let originalElementAndElementBeforeAreInline = false;

  if (elementBefore) {
    originalElementAndElementBeforeAreInline = true;
  }

  if (!elementByPath) return;
  const pattern =
    identifyDynamicParams(selectedCall.url) ||
    identifyDynamicParams(window.location.href);

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
    calls: [selectedCall],
    hisDaddyElement: item,
  };
  console.log("Creating new indicator before pattern:", indicatorData); // לוג לבדיקה

  if (pattern !== null && pattern !== undefined) {
    indicatorData.pattern = pattern;
  }

  console.log("Creating new indicator after pattern:", indicatorData); // לוג לבדיקה

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
              position: ${
                !originalElementAndElementBeforeAreInline
                  ? "absolute"
                  : "relative"
              };
          top: 1rem;
          
        `;

  // הוספת האינדיקטור מייד אחרי האלמנט
  elementByPath.after(indicator);

  indicator.addEventListener("click", () => {
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
              position: fixed;
              top: 16rem;
              left: 40%;
              background: #fff;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 13px;
              line-height: 1.4;
              color: #333;
              z-index: 999999;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
              border-left: 3px solid #cf556c;
              transform-origin: center;
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
              Status: ${
                selectedCall.status === 0 ? "Pending..." : selectedCall.status
              }
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
              Page: ${new URL(window.location.href).pathname}
            </div>
      <button class="create-jira-ticket" style="
        margin-top: 8px;
        padding: 4px 8px;
        background: #0052CC;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 8px;
      ">
        Create Jira Ticket
      </button>
      <button class="remove-indicator">Remove</button>
      <button class="change-position change-indicator-position"> Stick </button>
      <button class="close-indicator-tooltip"> Close </button>
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        Use arrow keys to fine tune your indi's position
      </div>    
          `;

    tooltip
      .querySelector(".remove-indicator")
      ?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        chrome.storage.local.get(["indicators"], (result) => {
          // change this to the new storage structure
          const indicators = result.indicators || {};
          const path = generateStoragePath(window.location.href);
          let currentPageIndicators = indicators[path] || [];
          if (Object.keys(currentPageIndicators).length > 0) {
            currentPageIndicators = currentPageIndicators.filter(
              (ind: IndicatorData) => ind.id !== indicatorData.id
            );
            chrome.storage.local.set({ indicators });
          }
        });
      });

    tooltip.querySelector(".change-position")?.addEventListener("click", () => {
      // toggle position from relative to absolute and vise versa
      const currentPosition = indicator.style.position;
      indicator.style.position =
        currentPosition === "absolute" ? "relative" : "absolute";

      // update the position in the storage
      // get all indicators from storage
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const pathToUpdate = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[pathToUpdate] || [];

        // find the indicator we want to update
        const indicatorToUpdate = currentPageIndicators.find(
          (ind: IndicatorData) => ind.id === indicatorData.id
        );
        // update the position
        indicatorToUpdate.updatedPosition = indicator.style.position;
        // save the updated indicators
        chrome.storage.local.set({ indicators });
      });
    });

    // מוסיפים האזנה למקשים כשהטולטיפ פתוח
    const moveHandler = (e: KeyboardEvent) => {
      const step = 5; // פיקסלים לכל הזזה
      const currentTop = parseInt(indicator.style.top) || 0;
      const currentLeft = parseInt(indicator.style.left) || 0;

      switch (e.key) {
        case "ArrowUp":
          indicator.style.top = `${currentTop - step}px`;
          break;
        case "ArrowDown":
          indicator.style.top = `${currentTop + step}px`;
          break;
        case "ArrowLeft":
          indicator.style.left = `${currentLeft - step}px`;
          break;
        case "ArrowRight":
          indicator.style.left = `${currentLeft + step}px`;
          break;
      }
    };

    document.addEventListener("keydown", moveHandler);
    tooltip
      .querySelector(".close-indicator-tooltip")
      ?.addEventListener("click", () => {
        document.removeEventListener("keydown", moveHandler);
        tooltip.remove();
      });

    document.body.appendChild(tooltip);
  });

  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    indicators[storagePath] = indicators[storagePath] || [];
    indicators[storagePath].push(indicatorData);
    chrome.storage.local.set({ indicators }, () => {
      elementByPath.after(indicator);
    });
  });
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
      <div style="margin-bottom: 16px;">
      <input 
        type="text" 
        id="search-calls" 
        placeholder="Search API calls..." 
        style="
          width: 100%;
          padding: 8px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
        "
      />
    </div>
    </div>
    <div style="max-height: 300px; overflow-y: auto;">
      ${callsList}
    </div>
  `;

  // הוספת לוגיקת החיפוש
  const searchInput = modalContent.querySelector("#search-calls");

  searchInput?.addEventListener("input", (e) => {
    const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();

    // יצירת רשימה מסוננת
    const filteredCallsList = data.networkCalls
      .filter(
        (call) =>
          call.url.toLowerCase().includes(searchTerm) ||
          call.method.toLowerCase().includes(searchTerm)
      )
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

    // עדכון התצוגה
    const listContainer = modalContent.querySelector(
      'div[style*="overflow-y: auto"]'
    );
    if (listContainer) {
      listContainer.innerHTML = filteredCallsList || "No matching calls found";

      modalContent.querySelectorAll(".api-call-item")?.forEach((item) => {
        item.addEventListener("click", () => {
          // כל הלוגיקה של הקליק שכבר יש לנו
          const callId = item.getAttribute("data-call-id");
          const selectedCall = data.networkCalls.find(
            (call) => call.id === callId
          );
          if (selectedCall) {
            createIndicator(data, item, element);
            modalContent.remove(); // סגירת המודל אחרי בחירת קריאה
          }
        });
      });
    }
  });

  // הוספת המודל ל-innerModalContainer
  innerModalContainer.appendChild(modalContent);

  // טיפול בסגירת המודל
  const closeModal = modalContent.querySelector("#close-modal");
  closeModal?.addEventListener("click", () => {
    modalContent.remove(); // במקום לרוקן את כל ה-container
  });

  // הוספת מאזינים לקליקים על הקריאות
  modalContent.querySelectorAll(".api-call-item")?.forEach((item) => {
    item.addEventListener("click", () => {
      const callId = item.getAttribute("data-call-id");
      const selectedCall = data.networkCalls.find((call) => call.id === callId);
      if (selectedCall) {
        createIndicator(data, item, element);
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

    .change-indicator-position {
        border: 0;
        padding: 0.25rem;
        color: white;
        background: rgb(95, 2, 31);
        border-radius: 3px;
        margin: 0 0.3rem;
      }
  `;
  document.head.appendChild(style);
}

async function createJiraTicketFromIndicator(data: any) {
  const securityAnalysis = analyzeSecurityIssues(data); // נוסיף בהמשך

  const ticketData: JiraTicketData = {
    summary: `API Issue: ${data.method} ${new URL(data.lastCall.url).pathname}`,
    description: `
  API Call Details:
  ----------------
  Method: ${data.method}
  URL: ${data.lastCall.url}
  Status: ${data.lastCall.status}
  Response Time: ${data.lastCall.timing?.duration}ms

  Element Path: ${data.elementInfo.path}
  Page URL: ${window.location.href}

  ${
    securityAnalysis
      ? `
  Security Analysis:
  ----------------
  Risk Level: ${securityAnalysis.riskLevel}
  Potential Issues:
  ${securityAnalysis.potentialIssues.join("\n")}

  Recommendations:
  ${securityAnalysis.recommendations.join("\n")}`
      : ""
  }
      `,
    issueType: "Bug",
    priority: data.lastCall.status !== 200 ? "High" : "Medium",
    labels: ["api-issue", "auto-generated", "element-mapper"],
    securityInfo: securityAnalysis,
  };

  console.log("Sending ticket data to background:", ticketData);

  chrome.runtime.sendMessage(
    {
      type: "CREATE_JIRA_TICKET",
      data: ticketData,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        return;
      }
      if (response?.success) {
        console.log("Ticket created:", response.data);
        // REPLACE THIS ALERT WITH A NICE MODAL
        alert(`Ticket created successfully! ID: ${response.data.key}`);
      } else {
        console.error("Error creating ticket:", response?.error);
        alert(`Failed to create ticket: ${response?.error}`);
      }
    }
  );
}

function loadIndicators() {
  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    console.log("All saved indicators:", result.indicators);

    const indicators = result.indicators || {};
    const currentPageIndicators = indicators[storagePath] || [];
    pageIndicators = currentPageIndicators.slice();

    currentPageIndicators?.forEach(createIndicatorFromData);

    // Make sure we have all indicators
    currentPageIndicators?.forEach((indicator: any) => {
      const indicatorElement = document.getElementById(`indi-${indicator.id}`);
      if (!indicatorElement) {
        console.log({ indicator }, "Indicator not found - retrying load");
        setTimeout(() => {
          createIndicatorFromData(indicator);
        }, 5000);
      }
    });

    const currentPageIndicatorsUuuidArray = currentPageIndicators?.map(
      (indi: IndicatorData) => indi.id
    );
    document.querySelectorAll(".indicator").forEach((indicator: any) => {
      console.log({ indicator }, "Indicator found in load");
      console.log(indicator.dataset.indicatorId, "indicator id to remove");
      console.log({ currentPageIndicatorsUuuidArray }, "uuid array to compare");
      if (
        !currentPageIndicatorsUuuidArray.includes(indicator.dataset.indicatorId)
      ) {
        indicator.remove();
      }
    });
  });
}

async function createIndicatorFromData(indicatorData: IndicatorData) {
  const indicatorElement = document.getElementById(`indi-${indicatorData.id}`);
  if (indicatorElement) {
    return;
  }
  if (indicatorData.pattern) {
    const currentPageUUID = extractUUIDFromUrl(window.location.href);
    indicatorData.baseUrl = window.location.href;
    indicatorData.lastCall.url = updateUrlWithNewUUID(
      indicatorData.lastCall.url,
      currentPageUUID
    );

    // lets update the current indicator in the storage
    chrome.storage.local.get(["indicators"], (result) => {
      const indicators = result.indicators || {};
      const pathToUpdate = generateStoragePath(window.location.href);
      const currentPageIndicators = indicators[pathToUpdate] || [];
      const ind = currentPageIndicators.find(
        (i: IndicatorData) => i.id === indicatorData.id
      );
      if (ind) {
        ind.lastCall.url = updateUrlWithNewUUID(
          ind.lastCall.url,
          currentPageUUID
        );
      }
      chrome.storage.local.set({ indicators });
    });
  }

  console.log("indicators path", indicatorData.elementInfo.path);
  const elementByPath = await waitForElement(indicatorData.elementInfo.path);

  console.log({ indicatorData, elementByPath }, "element by path");
  const elementBefore = elementByPath?.previousElementSibling;
  let originalElementAndElementBeforeAreInline = false;

  if (elementBefore) {
    originalElementAndElementBeforeAreInline = true;
  } else {
    originalElementAndElementBeforeAreInline = false;
  }

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
    position: ${
      indicatorData.updatedPosition
        ? indicatorData.updatedPosition
        : !originalElementAndElementBeforeAreInline
        ? "absolute"
        : "relative"
    };
    top: ${
      indicatorData?.offset?.top ? indicatorData.offset.top + "px" : "1rem"
    };
    left: ${
      indicatorData?.offset?.left ? indicatorData.offset.left + "px" : "0"
    };
    border: ${getBorderByTiming(indicatorData.lastCall.timing.duration)};
  `;

  addIndicatorEvents(indicator, indicatorData);
  // elementByPath.after(indicator);
  elementByPath?.insertAdjacentElement("beforebegin", indicator);
}

function addIndicatorEvents(indicator: HTMLElement, data: any) {
  indicator.addEventListener("click", async () => {
    const tooltipElement = document.getElementById("indicator-tooltip");
    if (tooltipElement) {
      tooltipElement.remove();
    }

    // מוסיפים האזנה למקשים כשהטולטיפ פתוח
    let totalOffsetTop = parseInt(indicator.style.top) || 0;
    let totalOffsetLeft = parseInt(indicator.style.left) || 0;

    const moveHandler = (e: KeyboardEvent) => {
      const step = 5;

      switch (e.key) {
        case "ArrowUp":
          totalOffsetTop -= step;
          indicator.style.top = `${totalOffsetTop}px`;
          break;
        case "ArrowDown":
          totalOffsetTop += step;
          indicator.style.top = `${totalOffsetTop}px`;
          break;
        case "ArrowLeft":
          totalOffsetLeft -= step;
          indicator.style.left = `${totalOffsetLeft}px`;
          break;
        case "ArrowRight":
          totalOffsetLeft += step;
          indicator.style.left = `${totalOffsetLeft}px`;
          break;
      }

      // lets save the new position in our storage according to our new rules
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const pathToUpdate = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[pathToUpdate] || [];
        const ind = currentPageIndicators.find(
          (i: IndicatorData) => i.id === indicator.dataset.indicatorId
        );
        if (ind) {
          ind.offset = {
            top: totalOffsetTop,
            left: totalOffsetLeft,
          };
        }
        chrome.storage.local.set({ indicators });
      });
    };

    document.addEventListener("keydown", moveHandler);

    // const currentData = await getCurrentIndicatorData(data.id);
    const currentData = pageIndicators.filter(
      (el: IndicatorData) => el.id === data.id
    )[0];
    console.log({ currentData }, "this is the current data for the indicator");
    const tooltip = document.createElement("div");
    tooltip.id = "indicator-tooltip";
    tooltip.style.cssText = `
        position: fixed;
        top: 16rem;
        left: 40%;
        background: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        color: #333;
        z-index: 999999;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        border-left: 3px solid #cf556c;
        transform-origin: center;
    `;

    const durationColor =
      data.lastCall.timing < 300
        ? "#4CAF50"
        : data.lastCall.timing < 1000
        ? "#FFC107"
        : "#f44336";

    tooltip.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${currentData.method}</strong>
        <span style="color: ${durationColor}; font-weight: bold;">
          ${Math.floor(currentData.lastCall.timing?.duration)}ms
        </span>
      </div>
      <div class='indi-url' style="color: #666; word-break: break-all; margin: 8px 0;">
        ${currentData?.lastCall.url}
      </div>
      <div style="color: ${
        currentData.lastCall.status === 200 ? "#4CAF50" : "#f44336"
      }">
        Status: ${currentData.lastCall.status}
      </div>
      <button class="create-jira-ticket" style="
        margin-top: 8px;
        padding: 4px 8px;
        background: #0052CC;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 8px;
      ">
        Create Jira Ticket
      </button>
      <button class="remove-indicator">Remove</button>
      <button class="change-position change-indicator-position"> Stick </button>
      <button class="close-indicator-tooltip"> Close </button>
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        Use arrow keys to fine tune your indi's position
      </div>
    `;

    tooltip
      .querySelector(".remove-indicator")
      ?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        removeIndicatorFromStorage(currentData.id);
      });

    tooltip.querySelector(".indi-url")?.addEventListener("click", () => {
      // send message to the panel to print the response of all network calls perhaps find this one using the url
      chrome.runtime.sendMessage({
        type: "SHOW_REQUEST_REPONSE",
        data: {
          url: currentData.lastCall.url,
          timiing: currentData.lastCall.timing.duration,
        },
      });
      tooltip.remove();
      removeIndicatorFromStorage(currentData.id);
    });

    // הוספת האזנה לכפתור החדש
    tooltip
      .querySelector(".create-jira-ticket")
      ?.addEventListener("click", () => {
        createJiraTicketFromIndicator(currentData);
      });

    tooltip
      .querySelector(".close-indicator-tooltip")
      ?.addEventListener("click", () => {
        document.removeEventListener("keydown", moveHandler);
        tooltip.remove();
      });

    tooltip.querySelector(".change-position")?.addEventListener("click", () => {
      // toggle position from relative to absolute and vise versa
      const currentPosition = indicator.style.position;
      indicator.style.position =
        currentPosition === "absolute" ? "relative" : "absolute";

      // update the position in the storage
      // get all indicators from storage
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const pathToUpdate = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[pathToUpdate] || [];

        // find the indicator we want to update
        const indicatorToUpdate = currentPageIndicators.find(
          (ind: IndicatorData) => ind.id === currentData.id
        );
        // update the position
        indicatorToUpdate.updatedPosition = indicator.style.position;
        // save the updated indicators
        chrome.storage.local.set({ indicators });
      });
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
  switch (message.type) {
    case "START_INSPECT_MODE":
      enableInspectMode();
      break;

    case "NETWORK_IDLE":
      console.log("network tab idle", message);
      break;

    case "STOP_INSPECT_MODE":
      enableInspectMode();
      break;

    case "SHOW_API_MODAL":
      const { element, networkCalls } = message.data;
      showModal(element, { networkCalls });
      break;

    case "CLEAR_INDICATORS":
      // This here depends on my current url! so I need to get the current url and delete the indicators according to it
      // according to wheather it is a full path or a path like DASHBOAR, ACCESS, etc...
      document.querySelectorAll(".indicator")?.forEach((indicator) => {
        indicator.remove();
      });
      // lets check if the url has a uuid in it

      chrome.storage.local.get(["indicators"], (result) => {
        let indicators = result.indicators || {};
        console.log({ indicators }, "our indicators before deleting");
        // lets delete all the indicators in storage
        indicators = {};
        chrome.storage.local.set({ indicators });
      });
      break;

    case "NETWORK_RESPONSE":
      console.log("network response", message.data);
      break;

    case "CLEAR_CURRENT_URL_INDICATORS":
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        console.log(
          indicators["Dashboard"],
          "this is the data i want to delete"
        );
        delete indicators["Dashboard"];
        chrome.storage.local.set({ indicators });
      });
      break;

    case "TOGGLE_INDICATORS": {
      const indicators = document.querySelectorAll(".indicator");
      indicators?.forEach((indicator) => {
        const currentDisplay = window.getComputedStyle(indicator).display;
        (indicator as HTMLElement).style.display =
          currentDisplay === "none" ? "inline-block" : "none";
      });
      break;
    }

    case "DELETE_INDICATOR": {
      // lets remove the indicator from storage
      const indicatorId = message.data;
      const path = generateStoragePath(window.location.href);
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const currentPageIndicators = indicators[path] || [];
        const updatedIndicators = currentPageIndicators.filter(
          (ind: IndicatorData) => ind.id !== indicatorId
        );
        indicators[path] = updatedIndicators;
        chrome.storage.local.set({ indicators });
      });
      // lets also remove the indicator from the dom
      const indicator = document.getElementById(`indi-${indicatorId}`);
      if (indicator) {
        indicator.remove();
      }
      break;
    }

    case "RELOAD_INDICATORS": {
      loadIndicators();
      break;
    }

    case "UPDATE_INDICATORS":
      updateRelevantIndicators(message.data);
      break;

    case "NEW_NETWORK_CALL":
      updateRelevantIndicators(message.data);
      break;

    case "ALL_NETWORK_CALLS":
      console.log("for now");
      // updateIndicatorsOnceFinishedLoading(message.data);
      // latestNetworkCalls = message.data.networkCalls;
      break;
  }

  return true;
});

const updatableobject: { [key: string]: number } = {};

function updateIndicatorsOnceFinishedLoading(data: any) {
  console.log({ data }, "this is the data we got from the background");
  const { networkCalls } = data;
  console.log(networkCalls, "this is the data we got from the background");

  let currentPageIndicators: any[] = [];
  chrome.storage.local.get(["indicators"], (result) => {
    const path = generateStoragePath(window.location.href);
    currentPageIndicators = result.indicators[path] || [];
  });
  console.log({ currentPageIndicators }, "this is the current page indicators");
  // find the indicators that exist in our current page indicators and in our network calls
  networkCalls?.forEach((call: NetworkCall) => {
    updateRelevantIndicators(call);
  });
}

function updateRelevantIndicators(newCall: NetworkCall) {
  console.log("Updating indicators with new call:", newCall);
  const currentPageIndicators = pageIndicators || [];
  console.log("indicators in update function", currentPageIndicators);
  console.log({ currentPageIndicators }, "Current page indicators");

  let hasUpdates = false;
  currentPageIndicators?.forEach((indicator: IndicatorData) => {
    try {
      const indicatorUrl = new URL(indicator?.lastCall?.url);
      const newCallUrl = new URL(newCall.url);

      console.log("Comparing URLs:", {
        indicator: indicatorUrl.pathname,
        newCall: newCallUrl.pathname,
      });

      if (newCall.url.includes("studies?")) {
        console.log(
          "this is the new call and the indicator",
          newCall,
          indicator
        );
      }

      if (
        (indicator?.method === newCall.method &&
          indicatorUrl.pathname === newCallUrl.pathname) ||
        (indicator?.lastCall?.url === newCall.url &&
          indicator?.method === newCall.method) ||
        generateStoragePath(indicator?.lastCall?.url) ===
          generateStoragePath(newCall.url)
        //   ||
        // urlsMatchPattern(
        //   location.origin + indicatorUrl.pathname,
        //   location.origin + newCallUrl.pathname
        // )
      ) {
        console.log("Found matching indicator:", indicator.id);
        updatableobject[indicator.id] += 1;

        // עדכון המידע
        indicator.lastCall = {
          ...indicator.lastCall,
          status: newCall.status,
          timing: newCall.timing,
          timestamp: Date.now(),
          url: newCall.url, // שומרים את ה-URL המלא החדש,
        };
        if (indicator.calls.length) {
          indicator.calls.push(newCall);
        } else {
          indicator.calls = [newCall];
        }

        const indicatorElement = document.getElementById(
          `indi-${indicator.id}`
        );

        console.log("Found indicator element:", !!indicatorElement);

        if (indicatorElement) {
          indicatorElement.classList.add("indicator-updating");
          setTimeout(() => {
            indicatorElement.classList.remove("indicator-updating");
          }, 500);

          (indicatorElement as HTMLElement).style.backgroundColor =
            newCall.status === 200 ? "rgba(25,200, 50, .75)" : "#f44336";

          // שמירת המידע המעודכן על האלמנט
          const updatedData = {
            ...indicator,
            lastUpdated: Date.now(),
          };

          indicatorElement.setAttribute(
            "data-indicator-info",
            JSON.stringify(updatedData)
          );

          // עדכון הטולטיפ אם הוא פתוח
          const openTooltip = document.getElementById("indicator-tooltip");
          if (openTooltip) {
            updateTooltipContent(openTooltip, updatedData);
          }

          // אנימציה
          (indicatorElement as HTMLElement).style.transform = "scale(1.2)";
          setTimeout(() => {
            (indicatorElement as HTMLElement).style.transform = "scale(1)";
          }, 200);

          hasUpdates = true;
        } else {
          console.log("Indicator element not found:", indicator);
          const indicatorSecondAttempt = document.getElementById(
            `indi-${indicator.id}`
          );
          console.log(
            "Indicator element second attempt:",
            !!indicatorSecondAttempt
          );
        }
      }
    } catch (error) {
      console.error("Error processing indicator:", error);
    }
  });

  console.log("Has updates:", hasUpdates);
  console.log("Indicators after update:", currentPageIndicators);
}

// פונקציה חדשה לעדכון תוכן הטולטיפ
function updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
  console.log("lets update our indicator", data);
  const durationColor =
    data.lastCall.timing.duration < 300
      ? "#4CAF50"
      : data.lastCall.timing.duration < 1000
      ? "#FFC107"
      : "#f44336";

  // עדכון זמן תגובה
  const durationSpan = tooltip.querySelector("span");
  if (durationSpan) {
    durationSpan.textContent = `${Math.floor(data.lastCall.timing.duration)}ms`;
    durationSpan.style.color = durationColor;
  }

  // עדכון סטטוס
  const statusDiv = tooltip.querySelector("div:nth-child(3)");
  if (statusDiv) {
    statusDiv.textContent = `Status: ${data.lastCall.status}`;
    (statusDiv as HTMLElement).style.color =
      data.lastCall.status === 200 ? "#4CAF50" : "#f44336";
  }
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
