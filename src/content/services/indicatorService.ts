import Swal from "sweetalert2";
import { IndicatorData } from "../../types";
import {
  getBorderByTiming,
  waitForElement,
  waitForIndicator,
} from "../../utils/general";
import { generateStoragePath } from "../../utils/storage";
import { extractUUIDFromUrl, updateUrlWithNewUUID } from "../../utils/urlUrils";
import { createJiraTicketFromIndicator, recentCallsCache  } from "../content";

import initFloatingButton from "../floatingRecorderButton";
import SchemaValidationService from "./schemaValidationService";
import { createInteractiveJsonViewer, jsonViewerStyles, setupJsonViewerListeners } from "./components/jsonViewer";
import { modalStyles } from "./components/networkModalStyles";
import { IndicatorCache } from "./indicatorCache";
import { IndicatorMonitor } from "./indicatorMonitor";

export let pageIndicators: IndicatorData[] = [];

// Track indicators currently being created to prevent race conditions
const creatingIndicators = new Set<string>();

type Domain = {
  value: string;
  isValid: boolean;
  id: string
}

type TooltipContent = {
  label1: string;
  label2: string;
  description: string;
};


export function loadIndicators() {
  const storagePath = generateStoragePath(window.location.href);

  // Use memory cache instead of storage for faster access
  const cache = IndicatorCache.getInstance();
  const currentPageIndicators = cache.get(storagePath) || [];

  pageIndicators = currentPageIndicators.slice();

  if (currentPageIndicators.length === 0) {
    return;
  }

  // Create all indicators (in-flight tracking prevents duplicates)
  currentPageIndicators?.forEach((indicator) => {
    createIndicatorFromData(indicator);
  });

  // Make sure we have all indicators with better error handling
  currentPageIndicators?.forEach(async (indicator: any, index: number) => {
    try {
      const indicatorElement = await waitForIndicator(indicator.id, 5000); // Increased to 5s
      if (!indicatorElement && !creatingIndicators.has(indicator.id)) {
        // Only retry if not currently being created and not in DOM
        const stillNotInDom = !document.getElementById(`indi-${indicator.id}`);
        if (stillNotInDom) {
          setTimeout(() => {
            createIndicatorFromData(indicator);
          }, 500 + (index * 200)); // Stagger indicator creation
        }
      }
    } catch (error) {
      // Only retry if not currently being created
      if (!creatingIndicators.has(indicator.id)) {
        const stillNotInDom = !document.getElementById(`indi-${indicator.id}`);
        if (stillNotInDom) {
          setTimeout(() => {
            createIndicatorFromData(indicator);
          }, 1000 + (index * 200));
        }
      }
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

  // FIX: Update indicators from recent network calls (for tab switching)
  // When user switches tabs, indicators are created but no new network calls happen
  // Check recentCallsCache for existing data and populate indicators
  setTimeout(() => {
    if (currentPageIndicators.length > 0) {
      const monitor = IndicatorMonitor.getInstance();
      monitor.checkIndicatorsUpdate(currentPageIndicators, recentCallsCache);
    }
  }, 50); // Small delay to let DOM settle

  // initFloatingButton();
}



export async function createIndicatorFromData(
  indicatorData: IndicatorData,
  isAuto?: boolean
) {

  // Already being created? Skip to prevent race conditions
  if (creatingIndicators.has(indicatorData.id)) {
    return;
  }

  // Mark as in-flight
  creatingIndicators.add(indicatorData.id);

  // Check if already exists in DOM (outside try to ensure cleanup)
  const indicatorElement = document.getElementById(`indi-${indicatorData.id}`);
  const currentPageUUID = extractUUIDFromUrl(window.location.href);
  if (indicatorElement) {
    creatingIndicators.delete(indicatorData.id);
    return;
  }

  try {
  if (indicatorData?.pattern) {
    indicatorData.baseUrl = window.location.href;
    indicatorData.lastCall.url = updateUrlWithNewUUID(
      indicatorData.lastCall.url,
      currentPageUUID
    );

    indicatorData.updatedThisRound = false;

    // lets update the current indicator with the updated uuid in the storage
    try {
      const result = await chrome.storage.local.get(["indicators"]);
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
      await chrome.storage.local.set({ indicators });
    } catch (error) {
      console.error('Storage error:', error);
    }
  }


  // Check if indicator belongs to current page with more flexible matching
  const currentPagePath = generateStoragePath(window.location.href);
  const indicatorPagePath = generateStoragePath(
    currentPageUUID
      ? updateUrlWithNewUUID(indicatorData?.request?.documentURL || indicatorData.baseUrl, currentPageUUID)
      : indicatorData?.request?.documentURL || indicatorData.baseUrl
  );

  if (indicatorPagePath !== currentPagePath && indicatorData.baseUrl !== 'global') {
    return;
  }
  
  // claude code addition
  // const indicatorUrl = currentPageUUID ? updateUrlWithNewUUID(indicatorData?.request?.documentURL, currentPageUUID) : indicatorData?.request?.documentURL;
  // const indicatorStoragePath = generateStoragePath(indicatorUrl);
  // const currentStoragePath = generateStoragePath(window.location.href);
  
  // if (indicatorStoragePath !== currentStoragePath && indicatorData.baseUrl !== 'global') { 
  //   return; 
  // }


  const elementByPath = await waitForElement(indicatorData.elementInfo.path);
  if (!elementByPath) {
    return;
  }
  
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
      indicatorData.lastCall.status === 200 || indicatorData?.status === 200
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

  // add a tooltip to the indicator showing its name and description

  addIndicatorEvents(indicator, indicatorData);

  // only insert the indicator if no indicator is already attached to the element to avoid network idling for a couple of times
  if (
    elementByPath?.previousElementSibling &&
    elementByPath?.previousElementSibling.getAttribute("data-indicator-info")
  ) {
    return;
  }
  
  if (isAuto) {
    const elementsToBeInsertedBefore = document.querySelectorAll("[data-indi]");
    if (elementsToBeInsertedBefore.length === 1) {
      elementsToBeInsertedBefore[0]?.insertAdjacentElement(
        "beforebegin",
        indicator
      );
    } else {
      const arrayOfTheseGuy = Array.from(elementsToBeInsertedBefore);
      const suitedElement = arrayOfTheseGuy.find((el) => {
        const elPath = el.getAttribute("data-indi");
        if (elPath === null) return;
        const parsedElPath = JSON.parse(elPath);
        const url = parsedElPath.url;
        return url === indicatorData.lastCall.url;
      });
      if (suitedElement) {
        suitedElement?.insertAdjacentElement("beforebegin", indicator);
      }
    }
  } else {
    elementByPath?.insertAdjacentElement("beforebegin", indicator);
  }
  } catch (error) {
    console.error('Error creating indicator:', error);
  } finally {
    // Cleanup in-flight tracking
    creatingIndicators.delete(indicatorData.id);
  }
}

function addIndicatorEvents(
  indicator: HTMLElement,
  indicatorData: IndicatorData
) {
  // Dragging state
  let isDragging = false;
  let hasDragged = false; // Track if actually moved
  let dragStartX = 0;
  let dragStartY = 0;
  let indicatorStartLeft = 0;
  let indicatorStartTop = 0;
  let dragTimeout: number | null = null;

  // Make indicator draggable
  indicator.style.cursor = 'grab';

  const handleMouseDown = (e: MouseEvent) => {
    // Only drag with left mouse button and only if target is the indicator
    if (e.button !== 0 || e.target !== indicator) return;

    // Record starting positions
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    indicatorStartLeft = parseInt(indicator.style.left) || 0;
    indicatorStartTop = parseInt(indicator.style.top) || 0;
    hasDragged = false;

    // Attach move and up listeners when starting drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Start dragging after small delay to distinguish from click
    dragTimeout = window.setTimeout(() => {
      isDragging = true;
      indicator.style.cursor = 'grabbing';
      indicator.style.zIndex = '1000000'; // Bring to front while dragging
    }, 150);

    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) {
      // Check if we're moving enough to start dragging immediately
      const deltaX = Math.abs(e.clientX - dragStartX);
      const deltaY = Math.abs(e.clientY - dragStartY);
      if (deltaX > 5 || deltaY > 5) {
        // User is dragging, start immediately
        if (dragTimeout) {
          clearTimeout(dragTimeout);
          dragTimeout = null;
        }
        isDragging = true;
        indicator.style.cursor = 'grabbing';
        indicator.style.zIndex = '1000000';
      } else {
        return;
      }
    }

    hasDragged = true;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    const newLeft = indicatorStartLeft + deltaX;
    const newTop = indicatorStartTop + deltaY;

    indicator.style.left = `${newLeft}px`;
    indicator.style.top = `${newTop}px`;

    e.preventDefault();
  };

  const handleMouseUp = (e: MouseEvent) => {
    // Clear timeout if clicking without dragging
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }

    // Remove listeners immediately
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    if (!isDragging) {
      isDragging = false;
      return;
    }

    isDragging = false;
    indicator.style.cursor = 'grab';
    indicator.style.zIndex = '999998'; // Reset z-index

    // Only save if actually dragged
    if (hasDragged) {
      const currentLeft = parseInt(indicator.style.left) || 0;
      const currentTop = parseInt(indicator.style.top) || 0;

      chrome.storage.local.get(["indicators"], (result) => {
        const indicators = result.indicators || {};
        const pathToUpdate = generateStoragePath(window.location.href);
        const currentPageIndicators = indicators[pathToUpdate] || [];
        const ind = currentPageIndicators.find(
          (i: IndicatorData) => i.id === indicator.dataset.indicatorId
        );
        if (ind) {
          ind.offset = {
            top: currentTop,
            left: currentLeft,
          };
          chrome.storage.local.set({ indicators }, () => {
            // console.log('✅ Indicator position saved:', { top: currentTop, left: currentLeft });
          });
        }
      });
    }

    e.preventDefault();
  };

  // Only attach mousedown to the indicator
  indicator.addEventListener('mousedown', handleMouseDown);

  function calculateTooltipPosition(indicator: any) {
    const rect = indicator.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // const TOOLTIP_WIDTH = 200;
    const TOOLTIP_HEIGHT = 100;
    const EDGE_THRESHOLD = 100; // 100 פיקסל מהצד
    
    // בדיקת קרבה לקצוות
    const isNearTop = rect.top < (TOOLTIP_HEIGHT + EDGE_THRESHOLD);
    const isNearBottom = rect.bottom > (viewportHeight - TOOLTIP_HEIGHT - EDGE_THRESHOLD);
    const isNearLeft = rect.left < EDGE_THRESHOLD;
    const isNearRight = rect.right > (viewportWidth - EDGE_THRESHOLD);
    
    return {
      showBelow: true,
      showAbove: false,
      showRight: isNearLeft,
      showLeft: isNearRight
    };
  }

indicator.addEventListener('mouseenter', () => {
    const dataAttribute = indicator.getAttribute('data-indicator-info');
    if (!document.getElementById('tooltip-styles')) {
        const style = document.createElement('style');
        style.id = 'tooltip-styles';
        style.textContent = `
            .indi-tooltip {
                position: fixed;
                background: linear-gradient(to right, rgb(255, 129, 119) 0%, rgb(255, 134, 122) 0%, rgb(255, 140, 127) 21%, rgb(249, 145, 133) 52%, rgb(207, 85, 108) 78%, rgb(177, 42, 91) 100%);
                color: #ffffff !important;
                padding: 12px 20px;
                border-radius: 10px;
                max-width: 200px;
                text-align: center;
                line-height: 1.4;
                font-size: 14px !important;
                font-weight: 700 !important;
                z-index: 999999;
                box-shadow: 0 4px 15px rgba(177, 42, 91, 0.3);
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                white-space: pre-line;
                word-wrap: break-word;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            .indi-tooltip * {
                color: #ffffff !important;
                font-weight: 700 !important;
            }
        `;
        document.head.appendChild(style);
    }

    const key = generateStoragePath(indicatorData.lastCall?.url) + '|' + indicatorData.method;
    const recentCalls = recentCallsCache.get(key) || [];
    const netWorkData = recentCalls[0]; // Newest first since we unshift

    let tooltipContent;
    // Merge indicatorData with network data for complete tooltip info (name, description, duration, etc.)
    const data = dataAttribute ? JSON.parse(dataAttribute) : {
      ...netWorkData,
      ...indicatorData,
      duration: netWorkData?.timing?.duration || indicatorData?.lastCall?.timing?.duration || 0,
      timestamp: netWorkData?.timestamp || indicatorData?.lastCall?.timestamp || Date.now()
    };
    if (!data) {
        console.warn("No data found in data-indicator-info attribute");
        tooltipContent = "No data available for this indicator. please refresh the page.";
    } else {
        const { duration, name, description, timestamp, bodyError } = data;
        const schemaStatus = indicator.getAttribute('data-schema-status');

        // If there's a bodyError, show it instead of the regular tooltip content
        if (bodyError) {
            tooltipContent = `Body Error: ${bodyError}`;
        } else {
            // lets update to local time and date
            const localDate = new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString();
            tooltipContent = `Last Updated: ${localDate}\nDuration: ${Math.floor(duration)} seconds\nName: ${name || '-'}`;
            if (schemaStatus) {
                tooltipContent += `\nSchema Status: ${schemaStatus}`;
            }
        }
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'indi-tooltip';
    tooltip.textContent = tooltipContent;

    const position = calculateTooltipPosition(indicator);
    const rect = indicator.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2);
    let top = rect.top - 10; // ברירת מחדל: למעלה
    let transform = 'translateX(-50%) translateY(-100%)'; // ברירת מחדל
    
    // החלת המיקום לפי הפונקציה שלנו
    if (position.showBelow) {
        top = rect.bottom + 10;
        transform = 'translateX(-50%) translateY(0)';
    }
    
    if (position.showRight) {
        left = rect.right + 10;
        top = rect.top + (rect.height / 2);
        transform = 'translateX(0) translateY(-50%)';
    }
    
    if (position.showLeft) {
        left = rect.left - 10;
        top = rect.top + (rect.height / 2);
        transform = 'translateX(-100%) translateY(-50%)';
    }
    
    // מקרים משולבים (פינות)
    if (position.showBelow && position.showRight) {
        left = rect.right + 10;
        top = rect.bottom + 10;
        transform = 'translateX(0) translateY(0)';
    }
    
    if (position.showBelow && position.showLeft) {
        left = rect.left - 10;
        top = rect.bottom + 10;
        transform = 'translateX(-100%) translateY(0)';
    }
    
    if (position.showAbove && position.showRight) {
        left = rect.right + 10;
        top = rect.top - 10;
        transform = 'translateX(0) translateY(-100%)';
    }
    
    if (position.showAbove && position.showLeft) {
        left = rect.left - 10;
        top = rect.top - 10;
        transform = 'translateX(-100%) translateY(-100%)';
    }
    
    // הגדרת המיקום הסופי
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.transform = transform;

    // הוספה לדף
    document.body.appendChild(tooltip);
    
    // אנימציה להופעה
    setTimeout(() => tooltip.style.opacity = '1', 10);

    // הסרה ב-mouseleave
    const removeTooltip = () => {
        tooltip.style.opacity = '0';
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }, 300);
    };
    
    indicator.addEventListener('mouseleave', removeTooltip, { once: true });
});

let clickTimeout: string | number | NodeJS.Timeout | undefined;
indicator.addEventListener("click", async () => {
    // Don't open tooltip if user was dragging
    if (hasDragged) {
      hasDragged = false; // Reset for next interaction
      return;
    }

    clearTimeout(clickTimeout);
    clickTimeout = setTimeout(async () => {
          const tooltipId = `indicator-tooltip-${indicatorData.id}`;
    const tooltipInstance = document.getElementById(tooltipId);
    if (tooltipInstance) {
      return;
    }
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

    const tooltip = document.createElement("div");
    tooltip.id = `indicator-tooltip-${indicatorData.id}`;
    tooltip.style.cssText = `
        position: fixed;
        top: 10rem;
        left: 33%;
        background: #ffffff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px !important;
        line-height: 1.4;
        color: #1f2937 !important;
        font-weight: 500 !important;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        border-left: 3px solid #cf556c;
        transform-origin: center;
        direction: ltr;
    `;

    tooltip.innerHTML = `
  <div 
    class='tooltip-header' 
    style="
      background: linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%);
      height: 6px;
      width: calc(100% + 32px);
      border-radius: 3px;
      margin: -16px -16px 20px -16px;
      cursor: grab;
      position: relative;
      box-shadow: 0 2px 8px rgba(255, 129, 119, 0.3);
    "
  >
    <div style="
      position: absolute;
      right: 12px;
      top: -6px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 1px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    ">
      DRAG ME
    </div>
  </div>

  <div style="
    display: flex; 
    justify-content: space-between; 
    align-items: center;
    margin-bottom: 16px;
  ">
    <strong style="
      font-weight: 700;
      font-size: 18px;
      background: linear-gradient(to right, #ff8177, #cf556c);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: pulse 3s ease-in-out infinite;
    ">
      ${parsedDataFromAttr.method ?? currentData?.method}
    </strong>
    <span id='tooltip-duration' style="
      background: linear-gradient(135deg, #f99185, #cf556c);
      color: white;
      padding: 6px 12px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(255, 129, 119, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      ${Math.floor(parsedDataFromAttr?.lastCall?.timing?.duration ?? parsedDataFromAttr?.duration ?? currentData?.duration)}ms
      <div style="
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        animation: shimmer 2s infinite;
      "></div>
    </span>
  </div>

  <div id='top-part'>
  <div style="margin-bottom: 16px;">
    <div style="margin-bottom: 12px;">
      <div style="
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #cf556c !important;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      ">
        Name:
      </div>
      <input
        class="indi-name-input"
        type="text"
        value="${currentData?.name || parsedDataFromAttr?.name || ''}"
        placeholder="Enter indicator name..."
        style="
          width: 100%;
          font-size: 14px !important;
          color: #1f2937 !important;
          font-weight: 500 !important;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 8px;
          border: 1px solid rgba(255, 129, 119, 0.2);
          outline: none;
          transition: all 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        "
      />
    </div>
    <div style="margin-bottom: 12px;">
      <div style="
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #cf556c !important;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
      ">
        Description:
      </div>
      <textarea
        class="indi-description-input"
        placeholder="Enter indicator description..."
        style="
          width: 100%;
          font-size: 14px !important;
          color: #1f2937 !important;
          font-weight: 500 !important;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 8px;
          border: 1px solid rgba(255, 129, 119, 0.2);
          outline: none;
          transition: all 0.2s;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          resize: vertical;
          min-height: 60px;
        "
      >${currentData?.description || parsedDataFromAttr?.description || ''}</textarea>
    </div>
  </div>

  <div class='indi-url' style="
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 14px;
    border-radius: 12px;
    color: #1f2937 !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    word-break: break-all;
    margin: 8px 0 16px 0;
    border: 1px solid rgba(255, 129, 119, 0.3);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  ">
    ${currentData?.lastCall?.url ?? parsedDataFromAttr?.request?.request?.url}
  </div>

  <div style="
    color: ${
      parsedDataFromAttr?.status === 200 || currentData?.lastCall?.status === 200
        ? "#059669"
        : "#dc2626"
    } !important;
    margin-bottom: 20px;
    font-weight: 700 !important;
    font-size: 15px !important;
    display: flex;
    align-items: center;
    gap: 8px;
  ">
    <span>Status: ${parsedDataFromAttr?.status || currentData?.lastCall?.status}</span>
    <span>✨</span>
  </div>
  </div>

  <div style="
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  ">
    <button class="create-jira-ticket btn-primary" disabled style="
      padding: 10px 14px;
      background: linear-gradient(135deg, #ff8177, #cf556c);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(255, 129, 119, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      🎫 Jira Ticket (Coming Soon)
    </button>
    <button class="remove-indicator btn-danger" style="
      padding: 10px 14px;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      🗑️ Remove
    </button>
  </div>

  <div style="
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
  ">
    <button class='check-schema btn-secondary' style="
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(10px);
      color: #374151;
      border: 1px solid rgba(255, 129, 119, 0.2);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
      position: relative;
      overflow: hidden;
    ">
      🔍 Schema
    </button>
    <button class="show-response btn-info" style="
      padding: 10px 14px;
      background: linear-gradient(135deg, #0ea5e9, #0284c7);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      📊 Response
    </button>
    <button class="pop-out-window btn-success" style="
      padding: 10px 14px;
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      📤 Pop Out
    </button>
    <button class="change-position btn-warning" style="
      padding: 10px 14px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      position: relative;
      overflow: hidden;
    ">
      📌 Stick
    </button>
  </div>

  <div style="
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  ">
    <button class="close-indicator-tooltip btn-secondary" style="
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(10px);
      color: #374151;
      border: 1px solid rgba(255, 129, 119, 0.2);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
      position: relative;
      overflow: hidden;
      flex: 1;
    ">
      ✨ Close
    </button>
  </div>

  <div style="
    color: #6b7280 !important;
    font-size: 11px !important;
    text-align: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 129, 119, 0.1);
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 1px;
  ">
    ← ↑ ↓ → Use arrow keys to fine tune your indi's position
  </div>

  <div class="response-container" style="display: none;">
    <div class="response-tabs" style="
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      margin-top: 16px;
    ">
      <button class="tab-button active" data-tab="security" style="
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #ff8177, #cf556c);
        color: white;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 8px rgba(255, 129, 119, 0.3);
      ">
        Security
      </button>
      <button class="tab-button" data-tab="performance" style="
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.8);
        color: #374151;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border: 1px solid rgba(255, 129, 119, 0.2);
      ">
        Performance
      </button>
      <button class="tab-button" data-tab="request" style="
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.8);
        color: #374151;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border: 1px solid rgba(255, 129, 119, 0.2);
      ">
        Request/Response
      </button>
    </div>
    <div class="tab-content">
      <div id="security" class="tab-pane active"></div>
      <div id="performance" class="tab-pane"></div>
      <div id="request" class="tab-pane"></div>
    </div>
  </div>

  <style>
    @keyframes shimmer {
      0% { left: -100%; }
      100% { left: 100%; }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
    
    .btn-primary:hover, .btn-danger:hover, .btn-info:hover, .btn-warning:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    }
    
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.95);
      border-color: rgba(255, 129, 119, 0.3);
      transform: translateY(-2px) scale(1.02);
    }
    
    .indi-url:hover {
      background: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 129, 119, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(255, 129, 119, 0.15);
    }
    
    .tab-button.active {
      background: linear-gradient(135deg, #ff8177, #cf556c) !important;
      color: white !important;
    }
  </style>
`;

    const cleanup = makeDraggable(tooltip, {
      handle: ".tooltip-header",
      bounds: false,
      onDragEnd: (position) => {
        // Think about an option to save the position in storage
        // console.log("Final position:", position);
        return position;
      },
    });

    tooltip.querySelector(".remove-indicator")?.addEventListener("click", () => {
        indicator.remove();
        tooltip.remove();
        removeIndicatorFromStorage(currentData);
      });

    tooltip.querySelector(".check-schema")?.addEventListener("click", () => {
      // Compare the new body with the schema from our storage
      const dataIndicatorInfo = JSON.parse(indicator.getAttribute("data-indicator-info") || "{}");
      const {body} = dataIndicatorInfo?.body
      if (body) {
        chrome.storage.local.get(["indicators"], (result) => {
          const indicators = result.indicators || {};
          const pathToUpdate = generateStoragePath(window.location.href);
          const currentPageIndicators = indicators[pathToUpdate] || [];
          const ind = currentPageIndicators.find(
            (i: IndicatorData) => i.id === indicator.dataset.indicatorId
          );
          if (ind && ind.body.body && ind.schema) {
            const schemaService = new SchemaValidationService();
            const incomingRequestSchema = schemaService.generateTypeDefinition(body, dataIndicatorInfo?.name ?? 'Unnamed', { format: 'inline' });
            const schemaDiff = schemaService.compareTypeSchemas(ind.schema, incomingRequestSchema);

            if (schemaDiff.added.length > 0 || schemaDiff.removed.length > 0 || schemaDiff.changed.length > 0) {
              indicator.style.border = "2px solid #f44336";

              // Generate detailed diff HTML
              const diffHTML = schemaService.generateSchemaDiffHTML(schemaDiff, ind.schema, incomingRequestSchema);

              // Show detailed sweet alert with update option
              tooltip.remove();
              Swal.fire({
                title: '⚠️ Schema Changed',
                html: diffHTML + '<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">Would you like to update the stored schema to match the new response?</div>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Update Schema',
                cancelButtonText: 'Keep Current Schema',
                allowOutsideClick: false,
                draggable: true,
                customClass: {
                  popup: 'jira-popup'
                }
              }).then((result) => {
                if (result.isConfirmed) {
                  // Update the schema in storage
                  ind.schema = incomingRequestSchema;
                  indicators[pathToUpdate] = currentPageIndicators;
                  chrome.storage.local.set({ indicators }, () => {
                    // Also update the indicator element's data attribute
                    dataIndicatorInfo.schema = incomingRequestSchema;
                    indicator.setAttribute("data-indicator-info", JSON.stringify(dataIndicatorInfo));

                    // Clear schema error classes
                    indicator.classList.remove('schema-error');
                    indicator.removeAttribute('data-schema-diff');

                    Swal.fire({
                      icon: 'success',
                      title: 'Schema Updated',
                      text: 'The indicator schema has been updated successfully.',
                      timer: 2000,
                      timerProgressBar: true,
                      showConfirmButton: false,
                      customClass: {
                        popup: 'jira-popup'
                      }
                    });
                    indicator.style.border = "2px solid #4CAF50";
                  });
                }
              });
            } else {
              // Schema is valid - no changes
              tooltip.remove();
              Swal.fire({
                icon: 'success',
                title: 'Schema Valid',
                text: 'The response matches the schema perfectly.',
                timer: 2000,
                timerProgressBar: true,
                showConfirmButton: false,
                customClass: {
                  popup: 'jira-popup'
                }
              });
              indicator.style.border = "2px solid #4CAF50";
            }

          } else {
            tooltip.remove();
            Swal.fire({
              icon: 'info',
              title: 'No Schema Found',
              text: 'This indicator does not have a stored schema yet.',
              timer: 2000,
              timerProgressBar: true,
              showConfirmButton: false,
              customClass: {
                popup: 'jira-popup'
              }
            });
          }
        });
      }
    });

    tooltip.querySelector(".close-indicator-tooltip")?.addEventListener("click", () => {
        if (cleanup) cleanup(); // מנקה את כל ה-event listeners
        tooltip.remove();
      });

    // Function to save name/description changes
    const saveIndicatorMetadata = (field: 'name' | 'description', value: string) => {
      const currentPath = generateStoragePath(window.location.href);

      chrome.storage.local.get(["indicators"], (result) => {
        const indies = result.indicators as { [key: string]: IndicatorData[] } || {};

        if (!indies[currentPath]) {
          indies[currentPath] = [];
        }

        const index = indies[currentPath].findIndex((el) => el.id === currentData.id);

        if (index !== -1) {
          // Update the field
          indies[currentPath][index][field] = value;

          // Also update currentData reference
          currentData[field] = value;

          // Update storage
          chrome.storage.local.set({ indicators: indies }, () => {
            // Update the indicator element's data attribute
            const updatedData = indies[currentPath][index];
            indicator.setAttribute("data-indicator-info", JSON.stringify(updatedData));

            // Show visual feedback
            const inputElement = field === 'name'
              ? tooltip.querySelector(".indi-name-input") as HTMLInputElement
              : tooltip.querySelector(".indi-description-input") as HTMLTextAreaElement;

            if (inputElement) {
              // Flash green border to show save success
              inputElement.style.borderColor = '#10b981';
              inputElement.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';

              setTimeout(() => {
                inputElement.style.borderColor = 'rgba(255, 129, 119, 0.2)';
                inputElement.style.boxShadow = 'none';
              }, 500);
            }
          });
        }
      });
    };

    // Name input event listeners
    const nameInput = tooltip.querySelector(".indi-name-input") as HTMLInputElement;
    if (nameInput) {
      // Save on blur (when user clicks away)
      nameInput.addEventListener("blur", () => {
        const newName = nameInput.value.trim();
        saveIndicatorMetadata('name', newName);
      });

      // Save on Enter key
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const newName = nameInput.value.trim();
          saveIndicatorMetadata('name', newName);
          nameInput.blur(); // Remove focus
        }
      });
    }

    // Description textarea event listeners
    const descriptionInput = tooltip.querySelector(".indi-description-input") as HTMLTextAreaElement;
    if (descriptionInput) {
      // Save on blur (when user clicks away)
      descriptionInput.addEventListener("blur", () => {
        const newDescription = descriptionInput.value.trim();
        saveIndicatorMetadata('description', newDescription);
      });

      // Save on Ctrl+Enter (common pattern for multiline inputs)
      descriptionInput.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          const newDescription = descriptionInput.value.trim();
          saveIndicatorMetadata('description', newDescription);
          descriptionInput.blur(); // Remove focus
        }
      });
    }

    // Pop Out button - only opens floating window
    tooltip.querySelector(".pop-out-window")?.addEventListener("click", () => {
      // lets get the data from the attribute data-indicator-info
      const allIndicatorData = JSON.parse(
        indicator.getAttribute("data-indicator-info") || "{}"
      );

      if (!allIndicatorData || Object.keys(allIndicatorData).length === 0) {
          const key = generateStoragePath(indicatorData.lastCall?.url) + '|' + indicatorData.method;
          const recentCalls = recentCallsCache.get(key) || [];
          if (recentCalls.length > 0) {
            const dataToSend = recentCalls[0];
            chrome.runtime.sendMessage({
              type: "OPEN_FLOATING_WINDOW",
              data: {
                indicatorData: dataToSend,
                networkCall: dataToSend,
              }
            });
          }
          return;
      }

      chrome.runtime.sendMessage({
        type: "OPEN_FLOATING_WINDOW",
        data: {
          indicatorData: allIndicatorData,
          networkCall: allIndicatorData,
        }
      });
    });

    // Response button - only toggles response panel display
    tooltip.querySelector(".show-response")?.addEventListener("click", () => {
        // toggle the display from block to none
        const topPart = tooltip.querySelector("#top-part");
        if (topPart) {
          (topPart as HTMLElement).style.display = (topPart as HTMLElement).style.display === "none" ? "block" : "none";
        }
      const responsePanel = tooltip.querySelector(".response-container");
      if (!responsePanel) return;

      // lets get the data from the attribute data-indicator-info
      const allIndicatorData = JSON.parse(
        indicator.getAttribute("data-indicator-info") || "{}"
      );
      if (!allIndicatorData || Object.keys(allIndicatorData).length === 0) {
          const key = generateStoragePath(indicatorData.lastCall?.url) + '|' + indicatorData.method;
          const recentCalls = recentCallsCache.get(key) || [];
          if (recentCalls.length > 0) {
            const allIndicatorData = recentCalls[0];
          }
      }

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
                  indicatorDataFromStorage?.lastCal.timing.duration ??
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


      function populatePanels(data: any) {
        // Store the original data for the viewer
        const viewerContainer = (responsePanel as HTMLElement).querySelector("#request");
        if (viewerContainer && data.body) {
          try {
            const parsedBody = typeof data.body.body === 'string' 
              ? JSON.parse(data.body.body) 
              : data.body.body;
            
            // Store the parsed data as an attribute for later use
            viewerContainer.setAttribute('data-json', JSON.stringify(parsedBody));
          } catch (e) {
            console.error('Failed to parse body:', e);
          }
        }
      
        // Load Security Tab
        const securityPane = (responsePanel as HTMLElement).querySelector("#security");
        (securityPane as HTMLElement).innerHTML = generateSecurityContent(data);
      
        // Load Performance Tab
        const performancePane = (responsePanel as HTMLElement).querySelector("#performance");
        (performancePane as HTMLElement).innerHTML = generatePerformanceContent(data);
      
        // Load Request/Response Tab with the new interactive viewer
        const requestPane = (responsePanel as HTMLElement).querySelector("#request");
        (requestPane as HTMLElement).innerHTML = generateRequestContent(data);
        
        // Set up the JSON viewer listeners after content is loaded
        setupJsonViewerListeners(tooltip);
      }



    });

    tooltip.querySelector(".indi-url")?.addEventListener("click", () => {
      const dataIndicatorInfo = JSON.parse(
        indicator.getAttribute("data-indicator-info") || "{}"
      );
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
      removeIndicatorFromStorage(currentData);
    });

    // הוספת האזנה לכפתור החדש
    tooltip.querySelector(".create-jira-ticket")?.addEventListener("click", () => {
    tooltip.remove();
    Swal.fire({
      title: '<span style="color: #cf556c;">Create Jira Ticket</span>',
      html: `
        <style>
          .jira-form-container {
            text-align: left;
            padding: 20px;
          }
          .jira-form-group {
            margin-bottom: 20px;
          }
          .jira-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 14px;
          }
          .jira-input, .jira-textarea, .jira-select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.3s ease;
            box-sizing: border-box;
          }
          .jira-input:focus, .jira-textarea:focus, .jira-select:focus {
            outline: none;
            border-color: #cf556c;
            box-shadow: 0 0 0 3px rgba(207, 85, 108, 0.1);
          }
          .jira-textarea {
            min-height: 150px;
            resize: vertical;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
          }
          .jira-select {
            cursor: pointer;
            background-color: white;
          }
          .jira-priority-high {
            color: #e74c3c;
          }
          .jira-priority-medium {
            color: #f39c12;
          }
          .jira-priority-low {
            color: #27ae60;
          }
          .jira-checkbox-group {
            display: flex;
            align-items: center;
            padding: 15px;
            background: linear-gradient(135deg, rgba(255, 129, 119, 0.1) 0%, rgba(207, 85, 108, 0.1) 100%);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
          }
          .jira-checkbox-group:hover {
            background: linear-gradient(135deg, rgba(255, 129, 119, 0.15) 0%, rgba(207, 85, 108, 0.15) 100%);
          }
          .jira-checkbox {
            width: 20px;
            height: 20px;
            margin-right: 10px;
            cursor: pointer;
            accent-color: #cf556c;
          }
          .jira-info-badge {
            background: linear-gradient(to right, rgb(255, 129, 119) 0%, rgb(255, 134, 122) 0%, rgb(255, 140, 127) 21%, rgb(249, 145, 133) 52%, rgb(207, 85, 108) 78%, rgb(177, 42, 91) 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: inline-block;
            margin-bottom: 15px;
          }
          .swal2-popup {
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
          }
          .swal2-title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 10px;
          }
          .swal2-confirm {
            background: linear-gradient(to right, rgb(255, 129, 119) 0%, rgb(255, 134, 122) 0%, rgb(255, 140, 127) 21%, rgb(249, 145, 133) 52%, rgb(207, 85, 108) 78%, rgb(177, 42, 91) 100%);
            border: none;
            font-weight: 600;
            padding: 12px 30px;
            font-size: 16px;
            border-radius: 8px;
            transition: all 0.3s ease;
          }
          .swal2-confirm:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(207, 85, 108, 0.3);
          }
          .swal2-cancel {
            background: #f5f5f5;
            color: #666;
            border: none;
            font-weight: 600;
            padding: 12px 30px;
            font-size: 16px;
            border-radius: 8px;
          }
          .api-details {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 6px;
            margin-top: 10px;
            font-size: 12px;
            color: #666;
          }
        </style>
        
        <div class="jira-form-container">
          <div class="jira-info-badge">
            ${currentData.method} • ${currentData.lastCall.status} • ms
          </div>
          
          <div class="jira-form-group">
            <label class="jira-label">Summary *</label>
            <input id="swal-summary" class="jira-input" placeholder="Brief description of the issue" 
              value="API Issue: ${currentData.method} ${new URL(currentData.lastCall.url).pathname}">
          </div>
          
          <div class="jira-form-group">
            <label class="jira-label">Description *</label>
            <textarea id="swal-description" class="jira-textarea" placeholder="Detailed description">API Call Details:
              ================
              Method: ${currentData.method}
              URL: ${currentData.lastCall.url}
              Status: ${currentData.lastCall.status}
              Response Time: ${currentData.lastCall?.timing?.duration || currentData.duration}ms
              Timestamp: ${new Date(currentData.lastCall.timestamp).toLocaleString()}

              Element Path: ${currentData.elementInfo.path}
              Page URL: ${currentData.baseUrl}

              ${currentData.body ? `Response Preview:
              ${JSON.stringify(JSON.parse(currentData.body.body), null, 2).substring(0, 300)}...` : ''}</textarea>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="jira-form-group">
              <label class="jira-label">Priority</label>
              <select id="swal-priority" class="jira-select">
                <option value="Low" class="jira-priority-low">🟢 Low</option>
                <option value="Medium" class="jira-priority-medium" ${currentData.lastCall.status !== 200 ? '' : 'selected'}>🟡 Medium</option>
                <option value="High" class="jira-priority-high" ${currentData.lastCall.status !== 200 ? 'selected' : ''}>🔴 High</option>
                <option value="Critical" class="jira-priority-high">🚨 Critical</option>
              </select>
            </div>
            
            <div class="jira-form-group">
              <label class="jira-label">Issue Type</label>
              <select id="swal-issue-type" class="jira-select">
                <option value="Bug">🐛 Bug</option>
                <option value="Task">📋 Task</option>
                <option value="Story">📖 Story</option>
                <option value="Improvement">✨ Improvement</option>
              </select>
            </div>
          </div>
          
          <div class="jira-checkbox-group">
            <input type="checkbox" id="swal-screenshot" class="jira-checkbox">
            <label for="swal-screenshot" style="cursor: pointer; user-select: none;">
              📸 Include screenshot of current page
            </label>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Create Ticket',
      cancelButtonText: 'Cancel',
      width: '650px',
      customClass: {
        popup: 'jira-popup',
        confirmButton: 'jira-confirm-btn',
        cancelButton: 'jira-cancel-btn'
      },
      preConfirm: () => {
        const summary = (document.getElementById('swal-summary') as HTMLInputElement)?.value || '';
        const description = (document.getElementById('swal-description') as HTMLTextAreaElement)?.value || '';
        const priority = (document.getElementById('swal-priority') as HTMLSelectElement)?.value || 'Medium';
        const issueType = (document.getElementById('swal-issue-type') as HTMLSelectElement)?.value || 'Bug';
        const includeScreenshot = (document.getElementById('swal-screenshot') as HTMLInputElement)?.checked || false;
        
        if (!summary.trim() || !description.trim()) {
          Swal.showValidationMessage('Please fill in all required fields');
          return false;
        }
        
        return {
          summary,
          description,
          priority,
          issueType,
          includeScreenshot,
          indicatorData: currentData
        };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const ticketData = result.value;
        
        if (ticketData.includeScreenshot) {
          chrome.runtime.sendMessage({
            type: "CAPTURE_SCREENSHOT"
          }, (screenshotUrl) => {
            ticketData.screenshot = screenshotUrl;
            createJiraTicketFromIndicator(ticketData);
          });
        } else {
          createJiraTicketFromIndicator(ticketData);
        }
        
        Swal.fire({
          icon: 'success',
          title: 'Ticket Created!',
          text: 'Your Jira ticket is being processed...',
          timer: 2000,
          showConfirmButton: false,
          customClass: {
            popup: 'jira-popup'
          }
        });
      }
    });
  });

    tooltip.querySelector(".close-indicator-tooltip")
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
    
    }, 300);
  });

  indicator.addEventListener('dblclick', () => {
    clearTimeout(clickTimeout); // ביטול ה-single click
    // lets send a message to the background script to open the floating window
    const dataAttribute = indicator.getAttribute('data-indicator-info');
    const body = JSON.parse(dataAttribute || '{}')?.body;
    if (!dataAttribute || !body) {
        const key = generateStoragePath(indicatorData.lastCall?.url) + '|' + indicatorData.method;
        const recentCalls = recentCallsCache.get(key) || [];
        if (recentCalls.length > 0) {
          const allIndicatorData = recentCalls[0]; // Newest first

          // lets send the message to the background script to open the floating window
        chrome.runtime.sendMessage({
        type: "OPEN_FLOATING_WINDOW",
        data: {
          indicatorData: allIndicatorData,
          networkCall: allIndicatorData,
            }
          });
        }
        return;
    }
    
    const allIndicatorData = JSON.parse(dataAttribute);
        chrome.runtime.sendMessage({
        type: "OPEN_FLOATING_WINDOW",
        data: {
          indicatorData: allIndicatorData,
          networkCall: allIndicatorData,
        }
      });
  })
}

function removeIndicatorFromStorage(indicatorData: IndicatorData) {
  chrome.storage.local.get(["indicators"], (result) => {
    const indicators = result.indicators || {};
    const pathToUpdate = generateStoragePath(window.location.href);
    if (indicators[pathToUpdate]) {
      indicators[pathToUpdate] = indicators[pathToUpdate].filter(
        (ind: IndicatorData) => ind.id !== indicatorData.id
      );
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
    data.lastCall?.timing?.duration ??
    data.duration ??
    data?.lastCall?.timing ??
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
  const viewerId = `viewer-${Date.now()}`;
  
  let bodyContent = '';
  if (data.body) {
    try {
      const parsedBody = typeof data.body.body === 'string' 
        ? JSON.parse(data.body.body) 
        : data.body.body;
      
      bodyContent = `
        <h4>Response Body</h4>
        ${createInteractiveJsonViewer(parsedBody, viewerId)}
      `;
    } catch {
      // Fallback to the original format if parsing fails
      bodyContent = `
        <h4>Response Body</h4>
        <pre class="response-body">${formatBody(data.body.body)}</pre>
      `;
    }
  }

  return `
    <div class="request-section">
      <h4>Request Details</h4>
      <div class="request-details">
        <div><strong>Method:</strong> ${data?.method}</div>
        <div><strong>URL:</strong> <span class="url-text">${data?.lastCall?.url}</span></div>
        <div><strong>Status:</strong> <span class="${data?.lastCall?.status === 200 ? 'status-ok' : 'status-error'}">${data?.lastCall?.status}</span></div>
      </div>
      ${bodyContent}
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
  handle?: string;
  bounds?: boolean;
  lockDimensions?: boolean; // Lock width/height and convert right/bottom to left/top
  onDragStart?: (position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onDragEnd?: (position: { x: number; y: number }) => void;
}

interface DragState {
  isDragging: boolean;
  offsetX: number;
  offsetY: number;
}

export function makeDraggable(element: HTMLElement, options: DraggableOptions = {}): () => void {
  const {
    handle = null,
    bounds = true,
    lockDimensions = false,
    onDragStart = null,
    onDrag = null,
    onDragEnd = null
  } = options;

  const state: DragState = {
    isDragging: false,
    offsetX: 0,
    offsetY: 0
  };

  // Get handle element or use the element itself
  const handleElement = handle 
    ? element.querySelector<HTMLElement>(handle) 
    : element;

  if (!handleElement) {
    console.warn('Draggable handle not found');
    return () => {}; // Return empty cleanup function
  }

  // Setup handle styles
  setupHandleStyles(handleElement);

  // Ensure element is positioned
  ensurePositioned(element, lockDimensions);

  // Event handlers
  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();

    const rect = element.getBoundingClientRect();
    state.isDragging = true;
    state.offsetX = e.clientX - rect.left;
    state.offsetY = e.clientY - rect.top;

    // Prepare element for dragging
    element.style.transition = 'none';
    element.style.zIndex = '100000';
    handleElement.style.cursor = 'grabbing';

    if (onDragStart) {
      onDragStart({ x: rect.left, y: rect.top });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state.isDragging) return;
    e.preventDefault();

    // Calculate new position
    let x = e.clientX - state.offsetX;
    let y = e.clientY - state.offsetY;

    // Apply bounds if enabled
    if (bounds) {
      const constrained = constrainToBounds(element, x, y);
      x = constrained.x;
      y = constrained.y;
    }

    // Update position
    updatePosition(element, x, y);

    if (onDrag) {
      onDrag({ x, y });
    }
  };

  const handleMouseUp = () => {
    if (!state.isDragging) return;

    state.isDragging = false;
    element.style.transition = 'box-shadow 0.3s ease';
    element.style.zIndex = '99999';
    handleElement.style.cursor = 'grab';

    const rect = element.getBoundingClientRect();
    if (onDragEnd) {
      onDragEnd({ x: rect.left, y: rect.top });
    }
  };

  const handleSelectStart = (e: Event) => {
    if (state.isDragging) {
      e.preventDefault();
    }
  };

  // Attach listeners
  handleElement.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectstart', handleSelectStart);

  // Return cleanup function
  return () => {
    handleElement.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('selectstart', handleSelectStart);
  };
}

// Helper functions
function setupHandleStyles(element: HTMLElement): void {
  element.style.cursor = 'grab';
  element.style.userSelect = 'none';
}

function ensurePositioned(element: HTMLElement, lockDimensions: boolean = false): void {
  const computed = window.getComputedStyle(element);
  if (computed.position === 'static') {
    element.style.position = 'fixed';
  }

  // Only apply dimension locking and position conversion if explicitly requested
  if (lockDimensions) {
    // Convert right/bottom positioning to left/top to avoid conflicts during drag
    const rect = element.getBoundingClientRect();

    // If element has 'right' set, convert it to 'left'
    if (element.style.right && !element.style.left) {
      element.style.left = `${rect.left}px`;
      element.style.right = 'auto';
    }

    // If element has 'bottom' set, convert it to 'top'
    if (element.style.bottom && !element.style.top) {
      element.style.top = `${rect.top}px`;
      element.style.bottom = 'auto';
    }

    // Lock the element's width and height to prevent distortion
    if (!element.style.width) {
      element.style.width = `${rect.width}px`;
    }
    if (!element.style.height) {
      element.style.height = `${rect.height}px`;
    }
  }
}

function constrainToBounds(element: HTMLElement, x: number, y: number): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  
  const minX = 0;
  const minY = 0;
  const maxX = window.innerWidth - rect.width;
  const maxY = window.innerHeight - rect.height;

  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y))
  };
}

function updatePosition(element: HTMLElement, x: number, y: number): void {
  requestAnimationFrame(() => {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  });
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

  /* ==================== INDI CSS RESET ==================== */
  /* Force LTR and consistent styling across all websites */

  #api-mapper-modal-container,
  #api-mapper-indicators-container,
  .indicator,
  .modal-content,
  .indi-blob-container,
  .indi-speech-bubble,
  .indi-summary-tooltip,
  .swal2-popup,
  .jira-popup,
  [id^="indi-"],
  [class*="indi-"] {
    /* Direction and Text */
    direction: ltr !important;
    text-align: left !important;
    unicode-bidi: normal !important;

    /* Font Override */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    line-height: 1.5 !important;

    /* Reset common inherited properties */
    color: #1f2937 !important;
    letter-spacing: normal !important;
    word-spacing: normal !important;
    text-transform: none !important;
    text-decoration: none !important;
    white-space: normal !important;

    /* Box model */
    box-sizing: border-box !important;
  }

  /* Ensure all child elements inherit LTR */
  #api-mapper-modal-container *,
  #api-mapper-indicators-container *,
  .indicator *,
  .indi-blob-container *,
  .indi-speech-bubble *,
  .swal2-popup *,
  [id^="indi-"] *,
  [class*="indi-"] * {
    direction: ltr !important;
    text-align: inherit !important;
    font-family: inherit !important;
    box-sizing: border-box !important;
  }

  /* ==================== END CSS RESET ==================== */

  // network modal styles

   ${jsonViewerStyles}

   ${modalStyles}

      @keyframes shimmer {
      0% { left: -100%; }
      100% { left: 100%; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }


    .schema-valid {
      border: 2px solid #4caf50 !important;
      box-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
    }

    .schema-success-pulse {
      animation: successPulse 0.5s ease-in-out;
    }

    @keyframes successPulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); box-shadow: 0 0 10px rgba(76, 175, 80, 0.8); }
      100% { transform: scale(1); }
    }


  
    .schema-error {
      background-color: #ff4444 !important;
      color: white !important;
      border: 2px solid #cc0000;
    }

    .schema-error:hover {
      background-color: #cc0000 !important;
    }

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

    .check-schema {
      margin-top: 8px;
      padding: 4px 8px;
      background: #cf556c;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-left: .5rem;
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


      .indi-floating-button {
        position: fixed;
        bottom: 1.5rem;
        right: 7.5rem !important;
        background: white;
        border-radius: 50px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        z-index: 999999;
        padding: 10px;
        display: flex;
        align-items: center;
        cursor: move;
        user-select: none;
        
      }
      
      .indi-record-button {
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #cf556c;
        border: 1px solid;
        box-shadow: 2px 3px 5px;
        margin-left: 1rem;
        background: #fff;
      }
      
      .indi-record-button.recording {
        color: #f44336;
      }
      
      .indi-timer {
        margin-left: 10px;
        font-family: monospace;
      }

 
  `;
  document.head.appendChild(style);
}
