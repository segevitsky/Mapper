// background.ts

interface NetworkIdleMessage {
  type: "NETWORK_IDLE";
  requests: NetworkRequestInfo[];
}

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
}

interface IdleCheckState {
  requestCount: number;
  timeout: NodeJS.Timeout | undefined;
  lastActivityTimestamp: number;
}

const pendingRequests = new Map();
const envsArray: string[] = [
  "https://pre-prod-sleep.itamar-online.com",
  "https://staging-sleep.itamar-online.com",
];

//JIRA START
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
});

async function createJiraTicket(data: any) {
  const host = "";
  const email = "";

  // add the api token back when you are ready to test
  const apiToken = null;

  console.log("About to make Jira API call with:", {
    url: `https://${host}/rest/api/3/issue`,
    headers: {
      Authorization: "Basic " + btoa(email + ":" + apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: {
      fields: {
        project: { key: "CCS" },
        summary: data.summary,
        description: data.description,
        issuetype: { name: data.issueType || "Bug" },
      },
    },
  });

  const response = await fetch(`https://${host}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(email + ":" + apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: {
          key: "CCS",
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

// This is for the payload of the body of the request
chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log("Request completed:", details);
    console.log("initiator", details.initiator);
    if (
      details.type === "xmlhttprequest" &&
      !!details.initiator &&
      envsArray.includes(details.initiator)
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
      chrome.debugger.onEvent.removeListener(debuggerListener);
      chrome.debugger.onDetach.removeListener(detachListener);
      chrome.webNavigation.onBeforeNavigate.removeListener(navigationListener);
      debuggerTabs.delete(tabId);
    }

    function checkIdle(): void {
      idleCheckState.lastActivityTimestamp = Date.now();

      // if (idleCheckState.requestCount === 0) {
      if (idleCheckState.timeout) {
        clearTimeout(idleCheckState.timeout);
      }

      idleCheckState.timeout = setTimeout(() => {
        if (
          // idleCheckState.requestCount === 0 &&
          Date.now() - idleCheckState.lastActivityTimestamp >=
          500
        ) {
          const message: NetworkIdleMessage = {
            type: "NETWORK_IDLE",
            requests: Array.from(requestData.values()),
          };

          chrome.tabs.sendMessage(tabId, message).catch((error) => {
            console.error("Failed to send NETWORK_IDLE message:", error);
          });
          requestData.clear();
        }
      }, 500);
      // }
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
            requestInfo.response = params;
            requestInfo.headers = params.response.headers;
            requestInfo.status = params.response.status;
            requestInfo.statusText = params.response.statusText;

            try {
              // קבלת מידע על זמנים מהדפדפן
              if (params.response.timing) {
                requestInfo.duration =
                  params.response.timing.receiveHeadersEnd -
                  params.response.timing.sendStart;
              }

              // קבלת ה-body
              const responseBody = (await chrome.debugger.sendCommand(
                { tabId },
                "Network.getResponseBody",
                { requestId: params.requestId }
              )) as { body: string; base64Encoded: boolean };

              if (responseBody) {
                requestInfo.body = responseBody;
              }
            } catch (error) {
              console.error("Failed to get timing or response body:", error);
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
    chrome.debugger.onEvent.addListener(debuggerListener);
    chrome.debugger.onDetach.addListener(detachListener);
    chrome.webNavigation.onBeforeNavigate.addListener(navigationListener);
    chrome.tabs.onRemoved.addListener((closedTabId: number) => {
      if (closedTabId === tabId) {
        cleanup();
      }
    });

    debuggerTabs.set(tabId, true);
  } catch (err) {
    console.error("Failed to attach debugger:", err);
    debuggerTabs.delete(tabId);
    throw err;
  }
}

// END NEW DEBUGGER => 12.2.2025

// כשה-DevTools נפתחים
chrome.runtime.onMessage.addListener(async (message, sender) => {
  console.log("Received message about the devtools opened:", message, sender);
  if (message.type === "DEVTOOLS_OPENED") {
    // const tab = sender.tab;
    if (message?.tabId) {
      await attachDebugger(message.tabId);
    }
  }
});

// מעקב אחרי תגובות רשת
chrome.debugger.onEvent.addListener(async (source, method, params: any) => {
  if (method === "Network.responseReceived") {
    const { requestId } = params;

    try {
      // קבלת הבודי של התשובה
      const responseBody = await chrome.debugger.sendCommand(
        source,
        "Network.getResponseBody",
        { requestId }
      );

      // lets also send the url of the request

      console.log("Response body:", responseBody);
      chrome.runtime.sendMessage({
        type: "NETWORK_RESPONSE",
        data: responseBody,
        url: params.response.url,
      });
    } catch (error) {
      console.error("Error getting response body:", error);
      chrome.runtime.sendMessage({
        type: "NETWORK_RESPONSE",
        data: { body: "Error getting response body" },
        url: params.response.url,
      });
    }
  }
});

// ניקוי כשטאב נסגר
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerTabs.get(tabId)) {
    chrome.debugger.detach({ tabId });
    debuggerTabs.delete(tabId);
  }
});
