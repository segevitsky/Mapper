import { IndicatorData } from "../../types";
import {
  getBorderByTiming,
  waitForElement,
  waitForIndicator,
} from "../../utils/general";
import { generateStoragePath } from "../../utils/storage";
import { extractUUIDFromUrl, updateUrlWithNewUUID } from "../../utils/urlUrils";
import { allNetworkCalls } from "../content";

export let pageIndicators: IndicatorData[] = [];

export function loadIndicators() {
  // send a message to attach our debugger
  chrome.runtime.sendMessage({
    type: "DEVTOOLS_OPENED",
  });

  console.log({ allNetworkCalls }, "all network calls");
  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    console.log("All saved indicators:", result.indicators);

    const indicators = result.indicators || {};
    const currentPageIndicators = indicators[storagePath] || [];
    pageIndicators = currentPageIndicators.slice();

    console.log(storagePath, "storage path");
    console.log(pageIndicators, "page indicators");
    if (currentPageIndicators.length === 0) {
      return;
    }
    currentPageIndicators?.forEach(createIndicatorFromData);

    // Make sure we have all indicators
    currentPageIndicators?.forEach(async (indicator: any) => {
      //   const indicatorElement = document.getElementById(`indi-${indicator.id}`);
      const indicatorElement = await waitForIndicator(indicator.id);
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
      if (
        !currentPageIndicatorsUuuidArray.includes(indicator.dataset.indicatorId)
      ) {
        indicator.remove();
      }
    });
  });

  // add a monitor here to update the indicators?!
}

export async function createIndicatorFromData(
  indicatorData: IndicatorData,
  isAuto?: boolean
) {
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

    indicatorData.updatedThisRound = false;

    // lets update the current indicator with the updated uuid in the storage
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
        ? // || autoIndicatorData?.status === 200
          "rgba(25,200, 50, .75)"
        : "#f44336"
    };
    cursor: pointer;
    z-index: 999998;
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
    border: ${getBorderByTiming(
      indicatorData?.lastCall?.timing?.duration
      // ?? autoIndicatorData?.duration
    )};
  `;

  if (isAuto) {
    indicator.setAttribute(
      "data-indicator-info",
      JSON.stringify(indicatorData)
    );
  }

  addIndicatorEvents(indicator, indicatorData);

  // only insert the indicator if no indicator is already attached to the element to avoid network idling for a couple of times
  if (
    elementByPath?.previousElementSibling &&
    elementByPath?.previousElementSibling.getAttribute("data-indicator-info")
  ) {
    return;
  }
  elementByPath?.insertAdjacentElement("beforebegin", indicator);
}

function addIndicatorEvents(
  indicator: HTMLElement,
  indicatorData: IndicatorData
) {
  indicator.addEventListener("click", async () => {
    const dataFromAttr = indicator.getAttribute("data-indicator-info");
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

    const currentData = pageIndicators.filter(
      (el: IndicatorData) => el.id === indicatorData.id
    )[0];

    const parsedDataFromAttr = dataFromAttr
      ? JSON.parse(dataFromAttr)
      : indicatorData;
    console.log(
      { parsedDataFromAttr },
      "parsed data from attr - this is suppose to be the tooltip data"
    );

    const tooltip = document.createElement("div");
    tooltip.id = "indicator-tooltip";
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
      parsedDataFromAttr.duration < 300 ? "#4CAF50" : "#f44336";
    // data.lastCall?.timing ||
    // data.lastCall?.timing?.duration ||
    // data?.duration < 300
    //   ? "#4CAF50"
    //   : data?.lastCall?.timing ||
    //     data?.lastCall?.timing?.duration ||
    //     data?.duration < 1000
    //   ? "#FFC107"
    //   : "#f44336";

    tooltip.innerHTML = `
    <div 
      class='tooltip-header' 
      style="text-align: right; margin-bottom: 1rem; font-weight: bold; width: 100%; height: 1rem"
      > DRAG ME
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${parsedDataFromAttr.method ?? currentData?.method}</strong>
        <span id='tooltip-duration' style="color: ${durationColor}; font-weight: bold;">
          ${Math.floor(parsedDataFromAttr.duration ?? currentData?.duration)}ms
        </span>
      </div>
      <div class='indi-url' style="color: #666; word-break: break-all; margin: 8px 0;">
        ${
          currentData?.lastCall?.url ??
          parsedDataFromAttr?.request?.reqyest?.url
        }
      </div>
      <div style="color: ${
        parsedDataFromAttr?.status === 200 ||
        currentData?.lastCall?.status === 200
          ? "#4CAF50"
          : "#f44336"
      }">
        Status: ${
          parsedDataFromAttr?.status === 200 || currentData?.lastCall?.status
        }
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
      <button class="show-response action-button"> Show Response </button>
      <button class="change-position change-indicator-position"> Stick </button>
      <button class="close-indicator-tooltip"> Close </button>
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        Use arrow keys to fine tune your indi's position
      </div>
      <div class="response-container" style="display: none;">
         <div class="response-tabs">
             <button class="tab-button active" data-tab="security">Security</button>
             <button class="tab-button" data-tab="performance">Performance</button>
             <button class="tab-button" data-tab="request">Request/Response</button>
         </div>
         <div class="tab-content">
             <div id="security" class="tab-pane active"></div>
             <div id="performance" class="tab-pane"></div>
             <div id="request" class="tab-pane"></div>
         </div>
      </div>
    `;

    const cleanup = makeDraggable(tooltip, {
      handle: ".tooltip-header",
      bounds: false,
      onDragEnd: (position) => {
        // אפשר לשמור את המיקום האחרון
        console.log("Final position:", position);
      },
    });

    tooltip
      .querySelector(".remove-indicator")
      ?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        removeIndicatorFromStorage(currentData.id);
      });

    tooltip
      .querySelector(".close-indicator-tooltip")
      ?.addEventListener("click", () => {
        if (cleanup) cleanup(); // מנקה את כל ה-event listeners
        tooltip.remove();
      });

    tooltip.querySelector(".show-response")?.addEventListener("click", () => {
      const responsePanel = tooltip.querySelector(".response-container");
      if (!responsePanel) return;

      // lets get the data from the attribute data-indicator-info
      const allIndicatorData = JSON.parse(
        indicator.getAttribute("data-indicator-info") || "{}"
      );

      // Toggle display of the panel regardless of data
      const isHidden = (responsePanel as HTMLElement).style.display === "none";
      (responsePanel as HTMLElement).style.display = isHidden
        ? "block"
        : "none";

      // If we're hiding the panel, no need to load data
      if (!isHidden) return;

      // Set up tab click handlers
      responsePanel.querySelectorAll(".tab-button").forEach(() => {
        responsePanel.addEventListener("click", (e) => {
          handleTabClick(e, responsePanel as HTMLElement);
        });
      });
      const isAutoIndicator =
        Object.keys(allIndicatorData)?.length > 0
          ? allIndicatorData.id.includes("auto")
          : false;

      // Check if we need to get more data
      if (
        !allIndicatorData.body ||
        !allIndicatorData.request ||
        (!allIndicatorData.response && !isAutoIndicator)
      ) {
        // We need more data - get it from storage
        chrome.storage.local.get(["indicators"], (result) => {
          const indies = result.indicators || {};
          const pathWereAt = generateStoragePath(window.location.href);
          const relevantIndies = indies[pathWereAt] || [];
          const indicatorsDataFromStorage = relevantIndies.filter(
            (el: IndicatorData) => el.lastCall.url === currentData.lastCall.url
          );
          if (indicatorsDataFromStorage.length > 0) {
            const indicatorDataFromStorage =
              indicatorsDataFromStorage[indicatorsDataFromStorage.length - 1];
            indicator.setAttribute(
              "data-indicator-info",
              JSON.stringify(indicatorDataFromStorage)
            );
            const tooltipDurationElement =
              document.querySelector("#tooltip-duration");
            if (tooltipDurationElement) {
              tooltipDurationElement.innerHTML = `${Math.floor(
                indicatorDataFromStorage?.duration ??
                  indicatorDataFromStorage?.lastCal.timinig.duration ??
                  0
              )}ms`;
            }
            populatePanels(indicatorDataFromStorage);
          } else {
            // Use whatever data we have
            populatePanels(allIndicatorData);
          }
        });
      } else {
        // We already have all the data we need
        populatePanels(allIndicatorData);
      }

      // Helper function to avoid code duplication
      function populatePanels(data: any) {
        // Load Security Tab
        const securityPane = (responsePanel as HTMLElement).querySelector(
          "#security"
        );
        (securityPane as HTMLElement).innerHTML = generateSecurityContent(data);

        // Load Performance Tab
        const performancePane = (responsePanel as HTMLElement).querySelector(
          "#performance"
        );
        (performancePane as HTMLElement).innerHTML =
          generatePerformanceContent(data);

        // Load Request/Response Tab
        const requestPane = (responsePanel as HTMLElement).querySelector(
          "#request"
        );
        (requestPane as HTMLElement).innerHTML = generateRequestContent(data);
      }
    });

    tooltip.querySelector(".indi-url")?.addEventListener("click", () => {
      const dataIndicatorInfo = JSON.parse(
        indicator.getAttribute("data-indicator-info") || "{}"
      );
      console.log({ dataIndicatorInfo }, "restOfData");
      // send message to the panel to print the response of all network calls perhaps find this one using the url
      chrome.runtime.sendMessage({
        type: "SHOW_REQUEST_REPONSE",
        data: {
          url: currentData.lastCall.url,
          timiing: currentData?.lastCall?.timing?.duration,
          // send the data-indicator-info as well
          restOfData: dataIndicatorInfo ?? currentData,
        },
      });
      tooltip.remove();
      removeIndicatorFromStorage(currentData.id);
    });

    // הוספת האזנה לכפתור החדש
    tooltip
      .querySelector(".create-jira-ticket")
      ?.addEventListener("click", () => {
        console.log("lets create a jira ticket with this data", currentData);
        // createJiraTicketFromIndicator(currentData);
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

function generateSecurityContent(data: any) {
  const securityHeaders = filterSecurityHeaders(data?.headers);
  const cert = data.response?.securityDetails;
  if (!securityHeaders && !cert)
    return `<div class="security-section"> No security headers found </div>`;
  return `
    <div class="security-section">
      <h4>Security Headers</h4>
      <div class="security-headers">
        ${Object.entries(securityHeaders)
          .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
          .join("")}
      </div>

      ${
        cert
          ? `
        <h4>Certificate Details</h4>
        <div class="cert-details">
          <div>Issuer: ${cert.issuer}</div>
          <div>Protocol: ${cert.protocol}</div>
          <div>Valid Until: ${new Date(
            cert.validTo * 1000
          ).toLocaleDateString()}</div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function generatePerformanceContent(data: any) {
  const timing =
    data.duration ??
    data?.lastCall?.timing ??
    data.lastCall?.timing?.duration ??
    data?.timing;

  return `
    <div class="performance-section">
      <div class="timing">
        <h4>Response Time</h4>
        <div>Total Duration: ${timing ?? "timing issue"}ms</div>
        <div>Start Time: ${
          data?.lastCall.timing?.startTime ?? "timing issue"
        }ms</div>
        <div>End Time: ${
          data?.lastCall.timing?.endTime ?? "timing issue"
        }ms</div>
      </div>
    </div>
  `;
}

function generateRequestContent(data: any) {
  return `
    <div class="request-section">
      <h4>Request Details</h4>
      <div class="request-details">
        <div>Method: ${data?.method}</div>
        <div>URL: ${data?.lastCall?.url}</div>
      </div>
      
      ${
        data.body
          ? `
        <h4>Response Body</h4>
        <pre style="max-width: 50vw" class="response-body">${formatBody(
          data.body.body
        )}</pre>
      `
          : ""
      }
    </div>
  `;
}

function filterSecurityHeaders(headers: any) {
  const securityHeaderPrefixes = [
    "x-",
    "content-security-",
    "strict-transport-",
    "access-control-",
  ];
  return Object.entries(headers || {})
    .filter(([key]) =>
      securityHeaderPrefixes.some((prefix) =>
        key.toLowerCase().startsWith(prefix)
      )
    )
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
}

function formatBody(body: string) {
  try {
    const parsed = JSON.parse(body);
    return syntaxHighlightJson(JSON.stringify(parsed, null, 2));
  } catch {
    return body;
  }
}

function syntaxHighlightJson(json: string) {
  if (!json) return "";

  // החלפת תווים מיוחדים
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // הוספת צבעים לסינטקס
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    function (match) {
      let cls = "json-number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "json-key";
        } else {
          cls = "json-string";
        }
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// function sanitizeHTML(str: string) {
//   return str.replace(
//     /[&<>"']/g,
//     (match) =>
//       ({
//         "&": "&amp;",
//         "<": "&lt;",
//         ">": "&gt;",
//         '"': "&quot;",
//         "'": "&#39;",
//       }[match] || "")
//   );
// }

// function formatBytes(bytes: number) {
//   if (bytes === 0) return "0 Bytes";
//   const k = 1024;
//   const sizes = ["Bytes", "KB", "MB", "GB"];
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
//   return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
// }

function handleTabClick(e: Event, responsePanel: HTMLElement) {
  const target = e.target as HTMLElement;
  const tabName = target.dataset.tab;
  if (!tabName) return;
  responsePanel
    .querySelectorAll(".tab-button")
    .forEach((btn) => btn.classList.remove("active"));
  responsePanel
    .querySelectorAll(".tab-pane")
    .forEach((pane) => pane.classList.remove("active"));

  target.classList.add("active");
  responsePanel.querySelector(`#${tabName}`)?.classList.add("active");
}

interface DraggableOptions {
  handle?: string; // CSS selector for drag handle
  bounds?: boolean; // Whether to constrain to window bounds
  onDragEnd?: (position: { x: number; y: number }) => void; // Callback when drag ends
}

function makeDraggable(element: HTMLElement, options: DraggableOptions = {}) {
  // problem here
  const { handle = null, bounds = true, onDragEnd = null } = options;

  let isDragging = false;
  let currentX: number;
  let currentY: number;
  let initialX: number;
  let initialY: number;

  const handleElement = handle ? element.querySelector(handle) : element;
  if (!handleElement) return;

  (handleElement as HTMLElement).style.cursor = "move";
  (handleElement as HTMLElement).style.userSelect = "none";

  function startDragging(e: MouseEvent) {
    isDragging = true;

    const rect = element.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;

    element.style.transition = "none"; // Disable transitions while dragging
    element.style.zIndex = "100000"; // Bring to front while dragging
  }

  function drag(e: MouseEvent) {
    if (!isDragging) return;

    e.preventDefault();

    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    // Constrain to window bounds if enabled
    if (bounds) {
      const rect = element.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      currentX = Math.min(Math.max(0, currentX), maxX);
      currentY = Math.min(Math.max(0, currentY), maxY);
    }

    // Apply smooth movement
    requestAnimationFrame(() => {
      element.style.left = `${currentX}px`;
      element.style.top = `${currentY}px`;
    });
  }

  function stopDragging() {
    if (!isDragging) return;

    isDragging = false;
    element.style.transition = "box-shadow 0.3s ease"; // Restore transitions
    element.style.zIndex = "99999";

    // Save final position if callback provided
    if (onDragEnd) {
      onDragEnd({ x: currentX, y: currentY });
    }
  }

  // Add event listeners
  (handleElement as HTMLElement).addEventListener("mousedown", startDragging);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", stopDragging);

  // Return cleanup function
  return () => {
    (handleElement as HTMLElement).removeEventListener(
      "mousedown",
      startDragging
    );
    document.removeEventListener("mousemove", drag);
    document.removeEventListener("mouseup", stopDragging);
  };
}

export function getElementPath(element: Element): string {
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

export function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #api-mapper-modal-container {
      pointer-events: none;  // חשוב! מאפשר קליקים לעבור דרכו
      position: fixed;
      z-index: 999999;
    }

    .indi-url {
      max-width: '50vw';
    }
    
    .security-headers {
      max-width: '50vw';
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

    .close-indicator-tooltip {
      margin-top: 8px;
      padding: 4px 8px;
      background: #028391;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .show-response {
      margin-top: 8px;
      padding: 4px 8px;
      background: #FAA968;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-left: .5rem;
      
    }

    .change-indicator-position {
        border: 0;
        padding: 0.25rem;
        color: white;
        background: rgb(95, 2, 31);
        border-radius: 3px;
        margin: 0 0.3rem;
      }

     .response-container {
   margin-top: 16px;
   border-top: 1px solid #eee;
   padding-top: 16px;x
 }

 .response-tabs {
   display: flex;
   gap: 8px;
   margin-bottom: 12px;
 }

 .tab-button {
   padding: 6px 12px;
   border: none;
   border-radius: 4px;
   background: #f5f5f5;
   cursor: pointer;
   font-size: 13px;
 }

 .tab-button.active {
   background: #cf556c;
   color: white;
 }

 .tab-pane {
   display: none;
   padding: 12px;
   background: #f9f9f9;
   border-radius: 4px;
 }

 .tab-pane.active {
   display: block;
 }

 .security-section,
 .performance-section,
 .request-section {
   margin-bottom: 16px;
 }

 h4 {
   margin: 0 0 8px 0;
   font-size: 14px;
 }

 pre {
   background: #f5f5f5;
   padding: 8px;
   border-radius: 4px;
   overflow-x: auto;
   max-height: 300px;
   margin: 8px 0;
   font-size: 12px;
 }

.json-key {
  color: #7952b3;
}
.json-string {
  color: #28a745;
}
.json-number {
  color: #1e88e5;
}
.json-boolean {
  color: #ff5722;
}
.json-null {
  color: #757575;
}

 
  `;
  document.head.appendChild(style);
}
