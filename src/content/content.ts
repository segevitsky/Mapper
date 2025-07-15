import { JiraTicketData } from "../services/jiraService";
import { IndicatorData, NetworkCall } from "../types";
import { analyzeSecurityIssues } from "../utils/securityAnalyzer";
import { generateStoragePath } from "../utils/storage";
import { identifyDynamicParams } from "../utils/urlUrils";
import { IndicatorMonitor } from "./services/indicatorMonitor";
import { IndicatorLoader } from "./services/indicatorLoader";
import {
  getElementPath,
  injectStyles,
  pageIndicators,
} from "./services/indicatorService";
import { waitForIndicator } from "../utils/general";
import Swal from "sweetalert2";

// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement;
let innerModalContainer: HTMLElement;
export const allNetworkCalls: NetworkCall[] = [];


createContainers();
injectStyles();
IndicatorLoader.getInstance();

chrome.runtime.sendMessage({
  type: "DEVTOOLS_OPENED",
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

function createIndicator(data: any, item: any, element: any, name: string, description: string) {
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
      timing: selectedCall?.timing ?? "debug here!",
      timestamp: Date.now(),
      url: selectedCall.url,
    },
    position: {
      top: rect.top + window.scrollY,
      left: rect.right + window.scrollX,
    },
    calls: [selectedCall],
    hisDaddyElement: item,
    name: name || "API Indicator",
    description: description || "No description provided",
  };

  if (pattern !== null && pattern !== undefined) {
    indicatorData.pattern = pattern;
  }

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
              top: 10rem;
              left: 33%;
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

    const moveHandler = (e: KeyboardEvent) => {
      const step = 5; // פיקסלים לכל הזזה
      const currentTop = parseInt(indicator.style.top) || 0;
      const currentLeft = parseInt(indicator.style.left) || 0;

      // פעולה רק אם מקש Shift לחוץ יחד עם מקשי החצים
      if (e.shiftKey) {
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
      }
      // אם Shift לא לחוץ, לא מתבצעת שום פעולה
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
            // add a dialouge to ask for name and description use sweetalert2 modal
            // create a sweetalert2 modal
            Swal.fire({
              title: "Create Indicator",
              html: `
              <input type="text" id="indicator-name" class="swal2-input" placeholder="Indicator Name">
              <textarea id="indicator-description" class="swal2-textarea" placeholder="Indicator Description"></textarea>
              `,
              focusConfirm: false,
              preConfirm: () => {
                const name = (document.getElementById(
                  "indicator-name"
                ) as HTMLInputElement).value;
                const description = (document.getElementById(
                  "indicator-description"
                ) as HTMLTextAreaElement).value;
                if (!name) {
                  Swal.showValidationMessage("Name is required");
                  return false;
                }
                return { name, description };
              },
            }).then((result) => {
          if (result.isConfirmed) {
            const { name, description } = result.value;
            createIndicator(data, item, element, name, description);
          }})

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
        // add a dialouge to ask for name and description use sweetalert2 modal
        // create a sweetalert2 modal
        Swal.fire({
          title: "Create Indicator",
          html: `
          <input type="text" id="indicator-name" class="swal2-input" placeholder="Indicator Name">
          <textarea id="indicator-description" class="swal2-textarea" placeholder="Indicator Description"></textarea>
          `,
          focusConfirm: false,
          preConfirm: () => {
            const name = (document.getElementById(
              "indicator-name"
            ) as HTMLInputElement).value;
            const description = (document.getElementById(
              "indicator-description"
            ) as HTMLTextAreaElement).value;
            if (!name || !description) {
              Swal.showValidationMessage("Please enter both name and description");
              return false;
            }
            return { name, description };
          },
        }).then((result) => {
      if (result.isConfirmed) {
        const { name, description } = result.value;
        createIndicator(data, item, element, name, description);
      }})
        modalContent.remove(); // סגירת המודל אחרי בחירת קריאה
      }
    });
  });
}

export async function createJiraTicketFromIndicator(data: any) {
  console.log("Creating Jira ticket with data:", data);
  chrome.storage.local.get(['userData'], (result: any) => { 
    const userData = result.userData || {};
    chrome.runtime.sendMessage(
      {
        type: "CREATE_JIRA_TICKET",
        data: {userData, data},
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
  })
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener( async (message) => {
  switch (message.type) {
    case "START_INSPECT_MODE":
      enableInspectMode();
      break;

    case "NAVIGATE_TO_INDICATOR":
      const { data } = message;
      window.location.href = window.location.origin + data.baseUrl;
      const indicator = await waitForIndicator(data.id);
      
      // lets click the indicator to show the tooltip
      if (indicator) {
        (indicator as HTMLElement).click();
      } else {
        console.error("Indicator not found:", data.id);
      }
        

      break;

    
    case "NETWORK_IDLE": {
      console.log("network tab idle", message);
      if (message.requests.length === 0) {
        return;
      }
      const monitor = IndicatorMonitor.getInstance();

      allNetworkCalls.push(...message.requests);
      monitor.checkIndicatorsUpdate(
        pageIndicators,
        allNetworkCalls,
        message.requests
      );
      // lets check if we have any indicators that did not update
      const failedIndicators: any[] = [];
      const allIndicators = document.querySelectorAll(".indicator");
      allIndicators.forEach((indicator) => {
        const indicatorIsUpdated = indicator.getAttribute(
          "data-indicator-info"
        );
        if (!indicatorIsUpdated) {
          failedIndicators.push(indicator);
          if (failedIndicators.length > 0) {
            monitor.checkIndicatorsUpdate(pageIndicators, allNetworkCalls);
          }
          // chrome.runtime.sendMessage({
          //   type: "INDICATOR_FAILED",
          //   data: { failedIndicators, message },
          // });
        }
      });
      break;
    }

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
      Swal.fire({
        title: "Clear All Indicators",
        text: "Are you sure you want to clear all indicators? This action cannot be undone.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, clear them",
        cancelButtonText: "No, keep them",
      }).then((result) => {
        if (result.isConfirmed) {
          clearAllIndicators();
        }
      }
      );

      function clearAllIndicators() {
        document.querySelectorAll(".indicator")?.forEach((indicator) => {
          indicator.remove();
        });
        // lets check if the url has a uuid in it
  
        chrome.storage.local.get(["indicators"], (result) => {
          let indicators = result.indicators || {};
          // lets delete all the indicators in storage
          indicators = {};
          chrome.storage.local.set({ indicators });
        });
      }
      break;

    // case "NETWORK_RESPONSE":
    //   console.log("network response", message.data);
    //   break;

    case "CLEAR_CURRENT_URL_INDICATORS":
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        // console.log(
        //   indicators["Dashboard"],
        //   "this is the data i want to delete"
        // );
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

    case "TOGGLE_RECORD_BUTTON": {
      // console.log("toggle record button", message.data);
      const recordButton = document.getElementById("indi-recorder-button");
      if (recordButton) {
        // lets toggle the style display
        recordButton.style.display =
          recordButton.style.display === "none" ? "block" : "none";
      } else {
        console.error("Record button not found in the DOM.");
      }
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

    case "UPDATE_INDICATORS":
      // console.log("update indicators", message);
      updateRelevantIndicators(message.data);
      break;

    case "NEW_NETWORK_CALL":
      // console.log("new network call", message.data);
      updateRelevantIndicators(message.data);
      break;
  }

  return false;
});

function updateRelevantIndicators(newCall: NetworkCall) {
  const currentPageIndicators = pageIndicators || [];

  let hasUpdates = false;
  currentPageIndicators?.forEach(async (indicator: IndicatorData) => {
    try {
      const indicatorUrl = new URL(indicator?.lastCall?.url);
      const newCallUrl = new URL(newCall.url);

      // console.log("Comparing URLs:", {
      //   indicator: indicatorUrl.pathname,
      //   newCall: newCallUrl.pathname,
      // });

      // if (indicator.lastCall.url.includes("screening")) {
      //   console.log("screening indicator", indicator);
      // }

      if (
        indicator?.method === newCall.method &&
        generateStoragePath(indicator?.lastCall?.url) ===
          generateStoragePath(newCall.url)
      ) {
        // console.log("Found matching indicator:", indicator);
        // console.log(
        //   "comparison paths",
        //   generateStoragePath(indicator?.lastCall?.url),
        //   generateStoragePath(newCall.url)
        // );

        // עדכון המידע
        indicator.lastCall = {
          ...indicator.lastCall,
          status: newCall.status,
          timing: newCall.timing,
          timestamp: Date.now(),
          url: newCall.url, // שומרים את ה-URL המלא החדש,
          updatedInThisRound: true,
        };
        if (indicator.calls.length) {
          indicator.calls.push(newCall);
        } else {
          indicator.calls = [newCall];
        }

        // const indicatorElement = document.getElementById(
        //   `indi-${indicator.id}`
        // );

        const indicatorElement = await waitForIndicator(indicator.id);
        if (!indicatorElement) return;
        // console.log("Found indicator element:", indicatorElement);

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

          // console.log("Updated data in update relevant field:", updatedData);

          indicatorElement.setAttribute(
            "data-indicator-info",
            JSON.stringify(updatedData)
          );

          // עדכון הטולטיפ אם הוא פתוח
          const openTooltip = document.getElementById("indicator-tooltip");
          if (openTooltip) {
            updateTooltipContent(openTooltip, updatedData);
          }

          // console.log(
          //   { currentPageIndicators },
          //   "Current page indicators after update"
          // );

          // אנימציה
          (indicatorElement as HTMLElement).style.transform = "scale(1.2)";
          setTimeout(() => {
            (indicatorElement as HTMLElement).style.transform = "scale(1)";
          }, 200);

          hasUpdates = true;
        } else {
          // console.log("Indicator element not found:", indicator);
          const indicatorSecondAttempt = document.getElementById(
            `indi-${indicator.id}`
          );
          // console.log(
          //   "Indicator element second attempt:",
          //   !!indicatorSecondAttempt
          // );
        }
      }
    } catch (error) {
      console.error("Error processing indicator:", error);
    }
  });

  // console.log("Has updates:", hasUpdates);
  // console.log("Indicators after update:", currentPageIndicators);
}

// פונקציה חדשה לעדכון תוכן הטולטיפ
function updateTooltipContent(tooltip: HTMLElement, data: IndicatorData) {
  // console.log("lets update our indicator", data);
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
  chrome.storage.local.get(["userData"], (data) => {
    const user = data.userData;
    const location = window.location.host;
    const allowerdDomains = user?.domains ? [...user?.domains, { id: '0', isValid: true, value: 'localhost:3000' }] : [];
    const isAllowedDomain = allowerdDomains.some((domain: { id: number, isValid: boolean, value: string }) =>
      domain.value.includes(location)
    );
    if (isAllowedDomain) {
      isInspectMode = true;
      document.body.style.cursor = "crosshair";
      createHighlighter();
    
      document.addEventListener("mouseover", handleMouseOver);
      document.addEventListener("mouseout", handleMouseOut);
      document.addEventListener("click", handleClick, true);
    } else {
      Swal.fire({
        title: "Inspect Mode Disabled",
        text: "This domain is not allowed in your current license.",
        icon: "error",
        confirmButtonText: "Upgrade License",
        showCancelButton: true,
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = "https://indi-web.vercel.app/#pricing"; // Redirect to indi.dev
        }
      });
    }
  });
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

// content.ts

console.log("Content script loaded");
