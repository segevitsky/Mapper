import { IndicatorData } from "../../types";
import {
  getBorderByTiming,
  waitForElement,
  waitForIndicator,
} from "../../utils/general";
import { generateStoragePath } from "../../utils/storage";
import { extractUUIDFromUrl, updateUrlWithNewUUID } from "../../utils/urlUrils";

export let pageIndicators: IndicatorData[] = [];

export function loadIndicators() {
  const storagePath = generateStoragePath(window.location.href);

  chrome.storage.local.get(["indicators"], (result) => {
    console.log("All saved indicators:", result.indicators);

    const indicators = result.indicators || {};
    const currentPageIndicators = indicators[storagePath] || [];
    pageIndicators = currentPageIndicators.slice();

    console.log(storagePath, "storage path");
    console.log(pageIndicators, "page indicators");

    currentPageIndicators?.forEach(createIndicatorFromData);

    // Make sure we have all indicators
    currentPageIndicators?.forEach((indicator: any) => {
      //   const indicatorElement = document.getElementById(`indi-${indicator.id}`);
      const indicatorElement = waitForIndicator(indicator.id);
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
