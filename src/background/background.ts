// background.ts

interface NetworkRequestInfo {
  request: any;
  response?: any;
  headers?: Record<string, string>;
  body?: { base64Encoded: boolean; body: string };
  timing?: number;
  cancelled?: boolean;
  cancelReason?: string;
  failed?: boolean;
  errorText?: string;
  blockedReason?: string;
  status?: number;
  statusText?: string;
  timestamp?: number;
  duration?: number;
  requestInfo?: any;
  bodyError?: string;
  processed?: boolean;
}

interface IdleCheckState {
  requestCount: number;
  timeout: ReturnType<typeof setTimeout> | undefined;
  lastActivityTimestamp: number;
  navigationOccurred?: boolean;
  sentIdle?: boolean;
  lastIdleSentTimestamp?: number;
}

const pendingRequests = new Map();
let envsArray: string[] = [];

//JIRA START + MESSAGES LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log({ message, sender }, "this is the message in background.ts");
  if (message.type === "CREATE_JIRA_TICKET") {
    console.log("Creating Jira ticket with data:", message.data);
    createJiraTicket(message.data)
      .then((response) => sendResponse({ success: true, data: response }))
      .catch((error) =>
        sendResponse({ success: false, error: error.toString() })
      );
    return true; // חשוב בשביל sendResponse אסינכרוני
  }

  if (message.type === 'USER_AUTHENTICATED') {
    const allowedDomains = message.data.domains.map((el: any) => el.value) || [];
    envsArray = [...envsArray, ...allowedDomains];
    envsArray = Array.from(new Set(envsArray)); // להסיר כפילויות
    console.log("Updated envsArray with authenticated user domains:", envsArray);
    return true; // חשוב בשביל sendResponse אסינכרוני
  }

});

async function createJiraTicket(messageData: any) {
  const { userData, data } = messageData;
  const { domain, email, apiToken, projectKey } = userData.jiraConfig || {};
  

  console.log("About to make Jira API call with:", {
    url: `https://${domain}/rest/api/3/issue`,
    headers: {
      Authorization: "Basic " + btoa(email + ":" + apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: {
      fields: {
        project: { key: projectKey },
        summary: data.summary,
        description: data.description,
        issuetype: { name: data.issueType || "Bug" },
      },
    },
  });

  const response = await fetch(`https://${domain}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(email + ":" + apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: {
          key: projectKey,
        },
        summary: data.summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  text: data.description,
                  type: "text",
                },
              ],
            },
          ],
        },
        issuetype: {
          id: "10001",
        },
      },
    }),
  });

  // נוסיף טיפול שגיאות מפורט יותר
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error response:", {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(`Jira API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}
// END JIRA

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "URL_CHANGED") {
    console.log("URL changed to:", message.url);
    // שליחת הודעה לפאנל (אם הוא פתוח)
    chrome.runtime.sendMessage({
      type: "REFRESH_PANEL",
      url: message.url,
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "RELAY_TO_CONTENT") {
    console.log("Relaying message to content script:", message.data);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "UPDATE_INDICATORS",
          data: message.data,
        });
      }
    });
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type === "xmlhttprequest") {
      console.log("Request started:", details);

      const request = {
        id: details.requestId,
        method: details.method,
        url: details.url,
        timestamp: details.timeStamp,
        requestBody: details.requestBody,
      };

      console.log("Storing request:", request);
      pendingRequests.set(details.requestId, request);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log("Request completed:", details);
    console.log("initiator", details.initiator);
    const initiatorExistsInEnvs = envsArray.some((env) =>
      details.initiator && env.includes(details.initiator)
    );
    if (
      details.type === "xmlhttprequest"
      //  &&
      // initiatorExistsInEnvs
    ) {
      const request = pendingRequests.get(details.requestId);
      if (request) {
        // let parsedBody = null;

        const fullRequest = {
          ...request,
          status: details.statusCode,
          statusText: details.statusLine,
          responseHeaders: details.responseHeaders,
          timing: {
            startTime: request.timestamp,
            endTime: details.timeStamp,
            duration: details.timeStamp - request.timestamp,
          },
        };

        chrome.runtime.sendMessage({
          type: "NEW_NETWORK_CALL",
          data: fullRequest,
        });

        pendingRequests.delete(details.requestId);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.type === "xmlhttprequest") {
      console.log("Request error:", details);

      const request = pendingRequests.get(details.requestId);
      if (request) {
        const errorRequest = {
          ...request,
          status: 0,
          error: details.error,
          timing: {
            startTime: request.timestamp,
            endTime: details.timeStamp,
            duration: details.timeStamp - request.timestamp,
          },
        };

        console.log("Sending error request:", errorRequest);
        chrome.runtime.sendMessage({
          type: "NEW_NETWORK_CALL",
          data: errorRequest,
        });

        pendingRequests.delete(details.requestId);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

/// DEBUGGER ISSUES FOR FULL RESPONSE => TESTING! WORKING! WILL FINISH THIS ON ANOTHER BRANCH
console.log("Background script loaded");

// מעקב אחרי טאבים שמחוברים לדיבאגר
const debuggerTabs = new Map<number, boolean>();

// END NEW DEBUGGER => 12.2.2025

// כשה-DevTools נפתחים

// best one yet that doesnt crash

async function attachDebugger(tabId: number): Promise<void> {
  if (debuggerTabs.get(tabId)) {
    console.warn("Debugger already attached to tab:", tabId);
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");

    const requestData = new Map<string, NetworkRequestInfo>();
    let idleCheckState: IdleCheckState = {
      requestCount: 0,
      timeout: undefined,
      lastActivityTimestamp: Date.now(),
    };

    function resetIdleCheck(): void {
      if (idleCheckState.timeout) {
        clearTimeout(idleCheckState.timeout);
      }
      idleCheckState = {
        requestCount: 0,
        timeout: undefined,
        lastActivityTimestamp: Date.now(),
      };
      requestData.clear();
    }

    function cleanup(): void {
      resetIdleCheck();

      // הסרת מאזינים עם בדיקות הגנה
      chrome.debugger.onEvent.removeListener(debuggerListener);
      chrome.debugger.onDetach.removeListener(detachListener);

      // בדיקה שהאובייקט קיים לפני הסרה
      if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
        chrome.webNavigation.onBeforeNavigate.removeListener(
          navigationListener
        );
      }

      debuggerTabs.delete(tabId);
    }

    // Helper for idling
    // הוספה לקוד - פונקציה לשליחת הודעת NETWORK_IDLE באופן יותר עמיד
    async function sendNetworkIdleMessage(requests: any) {
      try {
        // בדיקה שהטאב עדיין קיים
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
          console.log("Tab no longer exists, not sending message");
          return false;
        }

        // ניסיון לשלוח הודעה עם טיפול בשגיאות
        await chrome.tabs
          .sendMessage(tabId, {
            type: "NETWORK_IDLE",
            requests: requests,
          })
          .catch((error) => {
            if (
              error?.message?.includes("message channel is closed") ||
              error?.message?.includes("Receiving end does not exist")
            ) {
              console.log("Message channel closed, normal during navigation");
              return false;
            } else {
              throw error; // זריקת שגיאות אחרות להמשך הטיפול
            }
          });

        console.log("NETWORK_IDLE message sent successfully");
        return true;
      } catch (error) {
        console.error("Failed to send NETWORK_IDLE message:", error);
        return false;
      }
    }

    // פונקציית checkIdle משופרת שמשתמשת בפונקציה לעיל
    function checkIdle(): void {
      console.log(
        "checkIdle called, requestCount:",
        idleCheckState.requestCount
      );

      // עדכון זמן הפעילות האחרון
      idleCheckState.lastActivityTimestamp = Date.now();

      // ביטול טיימר קודם אם קיים
      if (idleCheckState.timeout) {
        clearTimeout(idleCheckState.timeout);
      }

      // הגדרת טיימר חדש
      idleCheckState.timeout = setTimeout(async () => {
        try {
          console.log("Idle timeout fired, checking network status");
          const timeSinceActivity =
            Date.now() - idleCheckState.lastActivityTimestamp;

          if (idleCheckState.requestCount === 0 || timeSinceActivity > 2000) {
            if (idleCheckState.requestCount > 0) {
              console.log(
                `Force sending NETWORK_IDLE despite requestCount=${idleCheckState.requestCount}, ${timeSinceActivity}ms elapsed`
              );
            } else {
              console.log("Normal NETWORK_IDLE send, no pending requests");
            }

            // שליחת הנתונים רק אם יש בקשות לשלוח
            if (requestData.size > 0) {
              const requestsToSend = Array.from(requestData.values());
              console.log(
                `Sending ${requestsToSend.length} requests in NETWORK_IDLE message`
              );

              const success = await sendNetworkIdleMessage(requestsToSend);
              if (success) {
                requestData.clear();
              }
            } else {
              console.log("No request data to send, skipping NETWORK_IDLE");
            }
          } else {
            console.log(
              `Not sending NETWORK_IDLE: ${idleCheckState.requestCount} requests still pending, last activity ${timeSinceActivity}ms ago`
            );
            console.log("lets try to send what we have until now");
            const requestsToSend = Array.from(requestData.values());
            const success = await sendNetworkIdleMessage(requestsToSend);
            if (success) {
              requestData.clear();
            }
          }
        } catch (error) {
          console.error("Error in idle timeout handler:", error);
        }
      }, 800);
    }

    const debuggerListener = async (
      source: chrome.debugger.Debuggee,
      method: string,
      params: any
    ): Promise<void> => {
      if (source.tabId !== tabId) return;

      switch (method) {
        case "Network.requestWillBeSent":
          idleCheckState.requestCount++;
          if (idleCheckState.timeout) {
            clearTimeout(idleCheckState.timeout);
          }
          requestData.set(params.requestId, {
            request: params,
            timestamp: Date.now(),
          });
          break;

        case "Network.responseReceived": {
          const requestInfo = requestData.get(params.requestId);
          if (requestInfo && params.response) {
            console.log(
              `Response received for ${params.requestId}, URL: ${params.response.url}`
            );

            requestInfo.response = params;
            requestInfo.headers = params.response.headers;
            requestInfo.status = params.response.status;
            requestInfo.statusText = params.response.statusText;

            // חישוב זמנים - משאירים את זה כאן כי המידע כבר זמין
            if (params.response.timing) {
              requestInfo.duration =
                params.response.timing.receiveHeadersEnd -
                params.response.timing.sendStart;
            }
          }
          break;
        }

        case "Network.requestWillBeCancelled": {
          const cancelledRequest = requestData.get(params.requestId);
          if (cancelledRequest) {
            cancelledRequest.cancelled = true;
            cancelledRequest.cancelReason = params.reason;
          }
          idleCheckState.requestCount = Math.max(
            0,
            idleCheckState.requestCount - 1
          );
          checkIdle();
          break;
        }

        case "Network.loadingFailed": {
          const failedRequest = requestData.get(params.requestId);
          if (failedRequest) {
            failedRequest.failed = true;
            failedRequest.errorText = params.errorText;
            failedRequest.blockedReason = params.blockedReason;
          }
          idleCheckState.requestCount = Math.max(
            0,
            idleCheckState.requestCount - 1
          );
          checkIdle();
          break;
        }

        case "Network.loadingFinished": {
          const requestInfo = requestData.get(params.requestId);
          if (requestInfo) {
            requestInfo.timing = params.timestamp;
            console.log(
              `Loading finished for ${params.requestId}, URL: ${
                requestInfo.request?.url || "unknown"
              }`
            );



            // כעת מנסים לקבל את ה-body
            try {
              const responseBody = (await chrome.debugger.sendCommand(
                { tabId },
                "Network.getResponseBody",
                { requestId: params.requestId }
              )) as { body: string; base64Encoded: boolean };

              if (responseBody) {
                console.log(
                  `Got body for ${params.requestId}, size: ${responseBody.body.length} and this is the base64Encoded: ${responseBody.base64Encoded} and the body is: ${responseBody.body}`
                );
                console.log(params, 'this is the response when loading finished');

                requestInfo.body = responseBody;
              } else {
                console.log(`No body returned for ${params.requestId}`);
              }
            } catch (error: any) {
              console.log(`Failed to get body for ${params.requestId}:`, error);
              // שומרים מידע על שגיאת ה-body לצורך ניסיון מאוחר יותר
              requestInfo.bodyError = error.toString();
            }
          }

          idleCheckState.requestCount = Math.max(
            0,
            idleCheckState.requestCount - 1
          );
          checkIdle();
          break;
        }

        case "Page.frameNavigated":
          if (!params.frame?.parentId) {
            resetIdleCheck();
          }
          break;

        case "Page.reloadRequested":
          resetIdleCheck();
          break;
      }
    };

    const detachListener = (debuggee: chrome.debugger.Debuggee): void => {
      if (debuggee.tabId === tabId) {
        cleanup();
      }
    };

    const navigationListener = (
      details: chrome.webNavigation.WebNavigationFramedCallbackDetails
    ): void => {
      if (details.tabId === tabId && details.frameId === 0) {
        resetIdleCheck();
      }
    };

    // Register all listeners
    // רישום מאזינים עם בדיקות הגנה
    chrome.debugger.onEvent.addListener(debuggerListener);
    chrome.debugger.onDetach.addListener(detachListener);

    // בדיקת קיום האובייקט webNavigation לפני רישום מאזינים
    if (chrome.webNavigation && chrome.webNavigation.onBeforeNavigate) {
      chrome.webNavigation.onBeforeNavigate.addListener(navigationListener);
    } else {
      console.warn(
        "webNavigation API not available, navigation events will not be tracked"
      );
    }

    // רישום מאזין לסגירת טאב - תמיד זמין
    chrome.tabs.onRemoved.addListener((closedTabId: number) => {
      if (closedTabId === tabId) {
        cleanup();
      }
    });

    debuggerTabs.set(tabId, true);
  } catch (err: any) {
    // If debugger is already attached, just continue
    if (
      err.message &&
      err.message.includes("Another debugger is already attached")
    ) {
      console.log("Debugger already attached, continuing with execution");
      debuggerTabs.set(tabId, true);
      // Continue with normal flow, considering debugger as attached
    } else {
      // For other errors, log and rethrow
      console.error("Failed to attach debugger:", err);
      debuggerTabs.delete(tabId);
      throw err;
    }
  }
}

let floatingWindowId: number | null = null;

function openOrUpdateFloatingWindow(data: unknown): void {
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const newUrl = `src/indicatorFloatingWindow/floating-window.html?data=${encodedData}`;

  if (floatingWindowId !== null) {
    chrome.windows.get(floatingWindowId, { populate: true }, (existingWindow) => {
      if (chrome.runtime.lastError || !existingWindow) {
        createFloatingWindow(newUrl);
      } else {
        const tab = existingWindow.tabs?.[0];
        if (tab?.id !== undefined) {
          chrome.tabs.update(tab.id, { url: newUrl });
        }

        chrome.windows.update(floatingWindowId!, { focused: true });
      }
    });
  } else {
    createFloatingWindow(newUrl);
  }
}
function createFloatingWindow(url: string): void {
  chrome.windows.create(
    {
      url,
      type: 'popup',
      width: 1200,
      height: 800,
      focused: true,
    },
    (newWindow) => {
      if (newWindow?.id !== undefined) {
        floatingWindowId = newWindow.id;
      }
    }
  );
}

chrome.windows.onRemoved.addListener((closedWindowId: number) => {
  if (closedWindowId === floatingWindowId) {
    floatingWindowId = null;
  }
});


chrome.runtime.onMessage.addListener(async (message, sender) => {
  console.log("Received message:", message, sender);

  if (message.type === "DEVTOOLS_OPENED") {
    let tabId;
    if (sender.tab) {
      tabId = sender.tab.id;
    }
    else if (message.tabId) {
      tabId = message.tabId;
    }

    if (tabId) {
      console.log(`Attaching debugger to tab ${tabId}`);
      await attachDebugger(tabId);
    } else {
      console.error("No tab ID found");
    }
  }

  if (message.type === "OPEN_FLOATING_WINDOW") {
    openOrUpdateFloatingWindow(message.data);
  }
});

// ניקוי כשטאב נסגר
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerTabs.get(tabId)) {
    chrome.debugger.detach({ tabId });
    debuggerTabs.delete(tabId);
  }
});



