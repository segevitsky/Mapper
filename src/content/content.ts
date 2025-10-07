import { JiraTicketData } from "../services/jiraService";
import { IndicatorData, NetworkCall } from "../types";
import { analyzeSecurityIssues } from "../utils/securityAnalyzer";
import { generatePatternBasedStoragePath, generateStoragePath } from "../utils/storage";
import { identifyDynamicParams } from "../utils/urlUrils";
import { IndicatorMonitor } from "./services/indicatorMonitor";
import { IndicatorLoader } from "./services/indicatorLoader";
import {
  getElementPath,
  injectStyles,
  pageIndicators,
  createIndicatorFromData,
} from "./services/indicatorService"
import { waitForIndicator } from "../utils/general";
import Swal from "sweetalert2";
// import { createAIChatInterface } from './aiChatComponent';

// אחרי שכל הדף נטען, פשוט להוסיף:
// createAIChatInterface();


// content.ts
let isInspectMode = false;
let hoveredElement: Element | null = null;
let highlighter: HTMLElement | null = null;
// content.ts - נוסיף את הלוגיקה למודל ולאינדיקטורים
let modalContainer: HTMLElement;
let innerModalContainer: HTMLElement;


// export const allNetworkCalls: NetworkCall[] = [];
// content.ts - REPLACE allNetworkCalls array with this:
export const recentCallsCache = new Map<string, NetworkCall[]>();
const MAX_CALLS_PER_ENDPOINT = 50;

function addToCache(calls: NetworkCall[]) {
  calls.forEach(call => {
    try {
      // Extract URL from various possible locations
      const url = call?.response?.response?.url ?? 
                  call?.response?.url ?? 
                  call?.request?.request?.url ?? 
                  call?.url;
      
      // Extract method
      const method = call?.request?.request?.method ?? 
                     call?.method ?? 
                     'GET';
      
      if (!url) {
        console.warn('Call without URL, skipping cache', call);
        return;
      }
      
      // Strategy 1: Simple path (ignores most params)
      const simpleKey = generateStoragePath(url) + '|' + method;
      addToCacheKey(simpleKey, call);
      
      // Strategy 2: Pattern-based (includes param names)
      const patternKey = generatePatternBasedStoragePath(url) + '|' + method;
      addToCacheKey(patternKey, call);
      
    } catch (error) {
      console.error('Error adding to cache:', error, call);
    }
  });
}

function addToCacheKey(key: string, call: NetworkCall) {
  const existing = recentCallsCache.get(key) || [];
  
  // Add to front (newest first)
  existing.unshift(call);
  
  // Keep only last 50
  if (existing.length > MAX_CALLS_PER_ENDPOINT) {
    existing.pop(); // Remove oldest
  }
  
  recentCallsCache.set(key, existing);
}

function clearCache() {
  recentCallsCache.clear();
  console.log('🧹 Cache cleared');
}

// Clear cache on navigation
window.addEventListener('beforeunload', clearCache);

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

  // Clear previous content
  innerModalContainer.innerHTML = "";

  // Create modal overlay
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "api-modal-overlay";

  // Create modal content
  const modalContent = document.createElement("div");
  modalContent.className = "api-modal-content";

  // Create header
  const header = createModalHeader();
  modalContent.appendChild(header);

  // Create search section
  const searchSection = createSearchSection(data.networkCalls);
  modalContent.appendChild(searchSection);

  // Create calls list
  const callsList = createCallsList(data.networkCalls);
  modalContent.appendChild(callsList);

  // Create form section (initially hidden)
  const formSection = createFormSection();
  modalContent.appendChild(formSection);

  modalOverlay.appendChild(modalContent);
  innerModalContainer.appendChild(modalOverlay);

  // Setup event listeners
  setupModalEventListeners(modalOverlay, searchSection, callsList, formSection, data.networkCalls, element, data);
}

function createModalHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "api-modal-header";

  header.innerHTML = `
    <div>
      <h3 class="api-modal-title">Select API Call for Element</h3>
      <p class="api-modal-subtitle">Choose which network request to associate with this element</p>
    </div>
    <button class="api-modal-close" id="close-modal">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  return header;
}

function createSearchSection(networkCalls: NetworkCall[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "api-modal-search-section";

  section.innerHTML = `
    <div class="api-modal-search-container" id="search-container">
      <svg class="api-modal-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input 
        type="text" 
        class="api-modal-search-input" 
        id="search-calls"
        placeholder="Search API calls..." 
      />
    </div>
    <div class="api-modal-results-count" id="results-count">
      Showing ${networkCalls.length} of ${networkCalls.length} API calls
    </div>
  `;

  return section;
}

function createCallsList(networkCalls: NetworkCall[]): HTMLElement {
  const listContainer = document.createElement("div");
  listContainer.className = "api-modal-calls-list";
  listContainer.id = "calls-list";

  if (networkCalls.length === 0) {
    listContainer.innerHTML = `
      <div class="api-modal-empty-state">
        <svg class="api-modal-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <p style="font-size: 18px; margin-bottom: 8px;">No API calls found</p>
        <p style="font-size: 14px;">Try adjusting your search or filters</p>
      </div>
    `;
  } else {
    renderCallItems(listContainer, networkCalls);
  }

  return listContainer;
}

function renderCallItems(container: HTMLElement, calls: NetworkCall[]) {
  container.innerHTML = calls.map(call => createCallItemHTML(call)).join('');
}

function createCallItemHTML(call: NetworkCall): string {
  const isSuccess = call.status >= 200 && call.status < 300;
  const methodClass = `api-call-badge-${call.method.toLowerCase()}`;
  const statusClass = isSuccess ? 'api-call-badge-success' : 'api-call-badge-error';
  const indicatorClass = isSuccess ? 'api-call-status-success' : 'api-call-status-error';
  
  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + urlObj.search;
    } catch {
      return url;
    }
  };

  return `
    <div class="api-call-item" data-call-id="${call.id}">
      <div class="api-call-content">
        <div class="api-call-info">
          <div class="api-call-badges">
            <span class="api-call-badge ${methodClass}">${call.method}</span>
            <span class="api-call-badge ${statusClass}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isSuccess 
                  ? '<path d="M9 12l2 2 4-4"></path><circle cx="12" cy="12" r="10"></circle>'
                  : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
                }
              </svg>
              ${call.status}
            </span>
          </div>
          <div class="api-call-url-main">${formatUrl(call.url)}</div>
          <div class="api-call-url-full">${call.url}</div>
        </div>
        <div class="api-call-status-indicator ${indicatorClass}"></div>
      </div>
    </div>
  `;
}

function createFormSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "api-modal-form-section";
  section.id = "form-section";

  section.innerHTML = `
    <input 
      type="text" 
      class="api-modal-form-input" 
      id="indicator-name"
      placeholder="Indicator Name *" 
    />
    <textarea 
      class="api-modal-form-textarea" 
      id="indicator-description"
      placeholder="Indicator Description"
    ></textarea>
    <div class="api-modal-form-buttons">
      <button class="api-modal-btn api-modal-btn-secondary" id="form-cancel">Cancel</button>
      <button class="api-modal-btn api-modal-btn-primary" id="form-create">Create Indicator</button>
    </div>
  `;

  return section;
}

// Setup event listeners
function setupModalEventListeners(
  modalOverlay: HTMLElement,
  searchSection: HTMLElement, 
  callsList: HTMLElement,
  formSection: HTMLElement,
  networkCalls: NetworkCall[],
  element: any,
  data: any
) {
  // Close modal
  const closeBtn = modalOverlay.querySelector('#close-modal');
  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    modalOverlay.remove();
  });

  // Click outside to close - only on the overlay itself, not its children
  modalOverlay.addEventListener('click', (e) => {
    // Only close if clicking directly on the overlay (not bubbled from children)
    if (e.target === modalOverlay) {
      modalOverlay.remove();
    }
  });

  // Prevent clicks inside modal from closing it
  const modalContent = modalOverlay.querySelector('.api-modal-content');
  modalContent?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Search functionality
  const searchInput = searchSection.querySelector('#search-calls') as HTMLInputElement;
  const searchContainer = searchSection.querySelector('#search-container');
  const resultsCount = searchSection.querySelector('#results-count');

  searchInput?.addEventListener('focus', () => {
    searchContainer?.classList.add('focused');
  });

  searchInput?.addEventListener('blur', () => {
    searchContainer?.classList.remove('focused');
  });

  searchInput?.addEventListener('input', (e) => {
    const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
    const filteredCalls = networkCalls.filter(call =>
      call.url.toLowerCase().includes(searchTerm) ||
      call.method.toLowerCase().includes(searchTerm)
    );

    renderCallItems(callsList, filteredCalls);
    if (resultsCount) {
      resultsCount.textContent = `Showing ${filteredCalls.length} of ${networkCalls.length} API calls`;
    }

    // Re-attach click listeners to new items
    attachCallItemListeners(callsList, networkCalls, formSection, element, data);
  });

  // Initial call item listeners
  attachCallItemListeners(callsList, networkCalls, formSection, element, data);

  // Form listeners
  setupFormListeners(formSection, modalOverlay);
}

function attachCallItemListeners(
  callsList: HTMLElement, 
  networkCalls: NetworkCall[], 
  formSection: HTMLElement,
  element: any,
  data: any,
) {
  const callItems = callsList.querySelectorAll('.api-call-item');
  callItems.forEach(item => {
    item.addEventListener('click', () => {
      const callId = item.getAttribute('data-call-id');
      const selectedCall = networkCalls.find(call => call.id === callId);
      
      if (selectedCall) {
        // Store selected call data for form submission
        formSection.setAttribute('data-selected-call', JSON.stringify(selectedCall));
        formSection.setAttribute('data-element', JSON.stringify(element));
        formSection.setAttribute('data-data', JSON.stringify(data));
        
        // Show form section
        formSection.classList.add('show');
        
        // Focus on name input
        const nameInput = formSection.querySelector('#indicator-name') as HTMLInputElement;
        setTimeout(() => nameInput?.focus(), 100);
      }
    });
  });
}

function setupFormListeners(formSection: HTMLElement, modalOverlay: HTMLElement) {
  const cancelBtn = formSection.querySelector('#form-cancel');
  const createBtn = formSection.querySelector('#form-create');
  const nameInput = formSection.querySelector('#indicator-name') as HTMLInputElement;
  const descInput = formSection.querySelector('#indicator-description') as HTMLTextAreaElement;

  cancelBtn?.addEventListener('click', () => {
    formSection.classList.remove('show');
    nameInput.value = '';
    descInput.value = '';
  });

  createBtn?.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    if (!name) {
      nameInput.style.borderColor = '#dc2626';
      nameInput.focus();
      return;
    }

    // Get stored data
    const selectedCall = JSON.parse(formSection.getAttribute('data-selected-call') || '{}');
    const element = JSON.parse(formSection.getAttribute('data-element') || '{}');
    const data = JSON.parse(formSection.getAttribute('data-data') || '{}');

    // Create indicator (your existing function)
    createIndicator(data, { getAttribute: () => selectedCall.id }, element, name, description);

    // Close modal
    modalOverlay.remove();
  });

  // Enter key to submit
  nameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      (createBtn as HTMLElement)?.click();
    }
  });
}


export async function createJiraTicketFromIndicator(data: any) {
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
          Swal.fire({
            title: "Ticket Created",
            text: `Ticket created successfully! ID: ${response.data.key}`,
            icon: "success",
            confirmButtonText: "OK",
          });

        } else {
          Swal.fire({
            title: "Error",
            text: `Failed to create ticket: ${response?.error}`,
            icon: "error",
            confirmButtonText: "OK",
          });
        }
      }
    );
  })
}

// האזנה להודעות מהפאנל
chrome.runtime.onMessage.addListener( async (message, sender, sendResponse) => {
  console.log({ message, sender, sendResponse }, "message from panel to content script");
  switch (message.type) {
    case "START_INSPECT_MODE":
      enableInspectMode();
      break;

    case "RELOAD_INDICATORS": 
      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const path = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[path] || [];
        // Do something with currentPageIndicators
        // console.log({ currentPageIndicators }, "currentPageIndicators on reload");
        currentPageIndicators.forEach((indicator: IndicatorData) => {
          createIndicatorFromData(indicator);
        });

        // lets also check if we have any indicators that did not update
        // const monitor = IndicatorMonitor.getInstance();
        // monitor.checkIndicatorsUpdate(
        //   currentPageIndicators,
        //   allNetworkCalls,
        // );

      });
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
      if (message.requests.length === 0) {
        return;
      }
      const monitor = IndicatorMonitor.getInstance();

        // Add to cache instead of array
        addToCache(message.requests);

      monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache, message.requests);
      
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
            monitor.checkIndicatorsUpdate(pageIndicators, recentCallsCache, message.requests);
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
      const path = generateStoragePath(message.data);
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
