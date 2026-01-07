// background.ts
// import { IndiAIAssistant } from "../content/aiAssistant";

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
  mimeType?: string;
}

interface IdleCheckState {
  requestCount: number;
  timeout: ReturnType<typeof setTimeout> | undefined;
  lastActivityTimestamp: number;
  navigationOccurred?: boolean;
  sentIdle?: boolean;
  lastIdleSentTimestamp?: number;
}


// // Global AI instance
// let aiAssistant: IndiAIAssistant | null = null;

// // Initialize AI when extension starts
// async function initializeAI() {
//   aiAssistant = new IndiAIAssistant();
//   const success = await aiAssistant.initialize();
  
//   if (success) {
//     console.log('🤖 Indi AI Assistant initialized successfully');
//   } else {
//     console.log('⚠️ AI not available, falling back to basic functionality');
//     aiAssistant = null;
//   }
// }

// // Call this when your extension loads
// initializeAI();


const pendingRequests = new Map();
let envsArray: string[] = [];

//JIRA START + MESSAGES LISTENER
chrome.runtime.onMessage.addListener(async  (message, _sender, sendResponse) => {
  if (message.type === "CREATE_JIRA_TICKET") {
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
    return true; // חשוב בשביל sendResponse אסינכרוני
  }

  // Handle minimize - detach debugger
  if (message.type === 'DETACH_DEBUGGER') {
    // Get tabId from sender instead of message (content scripts can't easily get tab ID)
    const tabId = _sender?.tab?.id;

    if (!tabId) {
      console.error('❌ No tab ID available in sender');
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }

    console.log('📨 DETACH_DEBUGGER received for tab:', tabId);

    try {
      if (debuggerTabs.get(tabId)) {
        await chrome.debugger.detach({ tabId });
        debuggerTabs.delete(tabId);
        console.log('✅ Debugger detached from tab:', tabId);
        sendResponse({ success: true });
      } else {
        console.log('⚠️ No debugger attached to tab:', tabId);
        sendResponse({ success: false, error: 'No debugger attached' });
      }
    } catch (error) {
      console.error('❌ Failed to detach debugger:', error);
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

  // Handle restore - re-attach debugger
  if (message.type === 'REATTACH_DEBUGGER') {
    // Get tabId from sender instead of message
    const tabId = _sender?.tab?.id;

    if (!tabId) {
      console.error('❌ No tab ID available in sender');
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }

    console.log('📨 REATTACH_DEBUGGER received for tab:', tabId);

    try {
      if (!debuggerTabs.get(tabId)) {
        await attachDebugger(tabId);
        console.log('✅ Debugger re-attached to tab:', tabId);
        sendResponse({ success: true });
      } else {
        console.log('⚠️ Debugger already attached to tab:', tabId);
        sendResponse({ success: true, alreadyAttached: true });
      }
    } catch (error) {
      console.error('❌ Failed to re-attach debugger:', error);
      sendResponse({ success: false, error: String(error) });
    }
    return true;
  }

//  if (message.type === "ANALYZE_API_CALL") {
//     if (aiAssistant) {
//       try {
//         const analysis = await aiAssistant.analyzeAPICall(message.data);
//         sendResponse({ success: true, analysis });
//       } catch (error: any) {
//         sendResponse({ success: false, error: error.message });
//       }
//     } else {
//       sendResponse({ success: false, error: "AI not available" });
//     }
//     return true; // Keep message channel open for async response
//   }
  
//   if (message.type === "GET_API_HEALTH_SUMMARY") {
//     if (aiAssistant) {
//       try {
//         const summary = await aiAssistant.summarizeAPIHealth(message.data.calls);
//         sendResponse({ success: true, summary });
//       } catch (error: any) {
//         sendResponse({ success: false, error: error.message });
//       }
//     } else {
//       sendResponse({ success: false, error: "AI not available" });
//     }
//     return true;
//   }
  
//   if (message.type === "ASK_AI_QUESTION") {
//     if (aiAssistant) {
//       try {
//         const answer = await aiAssistant.answerQuestion(message.question, message.context);
//         sendResponse({ success: true, answer });
//       } catch (error: any) {
//         sendResponse({ success: false, error: error.message });
//       }
//     } else {
//       sendResponse({ success: false, error: "AI not available" });
//     }
//     return true;
//   }


});

async function createJiraTicket(messageData: any) {
  const { userData, data } = messageData;
  const { domain, email, apiToken, projectKey } = userData.jiraConfig || {};

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
      const request = {
        id: details.requestId,
        method: details.method,
        url: details.url,
        timestamp: details.timeStamp,
        requestBody: details.requestBody,
      };

      pendingRequests.set(details.requestId, request);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
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

    const cleanupInterval = createPeriodicCleanup(requestData);

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

      // Stop periodic cleanup
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }

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
    // async function sendNetworkIdleMessage(requests: any) {
    //   try {
    //     // בדיקה שהטאב עדיין קיים
    //     const tab = await chrome.tabs.get(tabId).catch(() => null);
    //     if (!tab) {
    //       console.log("Tab no longer exists, not sending message");
    //       return false;
    //     }

    //     await chrome.tabs
    //       .sendMessage(tabId, {
    //         type: "NETWORK_IDLE",
    //         requests: requests,
    //       }
    //     )
    //       .catch((error) => {
    //         if (
    //           error?.message?.includes("message channel is closed") ||
    //           error?.message?.includes("Receiving end does not exist")
    //         ) {
    //           console.log("Message channel closed, normal during navigation");
    //           return false;
    //         } else {
    //           throw error; // זריקת שגיאות אחרות להמשך הטיפול
    //         }
    //       });

    //     console.log("NETWORK_IDLE message sent successfully");
    //     return true;
    //   } catch (error) {
    //     console.error("Failed to send NETWORK_IDLE message:", error);
    //     return false;
    //   }
    // }

    async function sendNetworkIdleMessage(requests: any) {
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
          return false;
        }

        // Send the network data to content script
        await chrome.tabs.sendMessage(tabId, {
          type: "NETWORK_IDLE",
          requests: requests,
        });

        // If AI is available, also send AI insights
        // if (aiAssistant && requests.length > 0) {
        //   try {
        //     const healthSummary = await aiAssistant.summarizeAPIHealth(requests);
        //     await chrome.tabs.sendMessage(tabId, {
        //       type: "AI_HEALTH_SUMMARY",
        //       summary: healthSummary,
        //     });
        //   } catch (error) {
        //     console.error('Failed to generate AI summary:', error);
        //   }
        // }

        return true;
      } catch (error) {
        console.error('Error in sendNetworkIdleMessage:', error);
        return false;
      }
    }

    // פונקציית checkIdle משופרת שמשתמשת בפונקציה לעיל
    function checkIdle(): void {
      const MAX_ENTRIES = 2000;
      if (requestData.size > MAX_ENTRIES) {
        console.warn(`⚠️ requestData exceeded ${MAX_ENTRIES} entries (currently ${requestData.size}), force cleaning`);
        
        // Sort by timestamp, keep newest 500, delete rest
        const entries = Array.from(requestData.entries());
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        
        // Delete oldest entries
        const toDelete = entries.slice(500);
        toDelete.forEach(([id]) => requestData.delete(id));
      }

      // עדכון זמן הפעילות האחרון
      idleCheckState.lastActivityTimestamp = Date.now();

      // ביטול טיימר קודם אם קיים
      if (idleCheckState.timeout) {
        clearTimeout(idleCheckState.timeout);
      }

      // הגדרת טיימר חדש
      idleCheckState.timeout = setTimeout(async () => {
        try {
          const timeSinceActivity =
            Date.now() - idleCheckState.lastActivityTimestamp;

          if (idleCheckState.requestCount === 0 || timeSinceActivity > 2000) {

            if (requestData.size > 0) {
              const allRequests = Array.from(requestData.values());
              const completedRequests = allRequests.filter(req =>
                req.response || req.failed || req.cancelled
              );

              // Send all requests, delete only completed ones
              const success = await sendNetworkIdleMessage(allRequests);
              if (success) {
                completedRequests.forEach(req => {
                  if (req.request?.requestId) {
                    requestData.delete(req.request.requestId);
                  }
                });
              }
            } else {
              console.log("No request data to send, skipping NETWORK_IDLE");
            }
          } else {
            const allRequests = Array.from(requestData.values());

            // Separate completed from pending requests
            const completedRequests = allRequests.filter(req =>
              req.response || req.failed || req.cancelled
            );
            const pendingRequests = allRequests.filter(req =>
              !req.response && !req.failed && !req.cancelled
            );

            // Send all requests (for UI updates), but only delete completed ones
            const success = await sendNetworkIdleMessage(allRequests);
            if (success) {
              // Only delete completed requests from map
              completedRequests.forEach(req => {
                if (req.request?.requestId) {
                  requestData.delete(req.request.requestId);
                }
              });
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

          // Orphan detection - delete if no response after 30 seconds
          setTimeout(() => {
            const req = requestData.get(params.requestId);
            if (req && !req.response && !req.failed && !req.cancelled) {
              console.log(`Cleaning orphaned request: ${params.requestId}`);
              requestData.delete(params.requestId);
              idleCheckState.requestCount = Math.max(0, idleCheckState.requestCount - 1);
            }
          }, 30000);

          break;

        case "Network.responseReceived": {
          const requestInfo = requestData.get(params.requestId);
          if (requestInfo && params.response) {
            requestInfo.response = params;
            requestInfo.headers = params.response.headers;
            requestInfo.status = params.response.status;
            requestInfo.statusText = params.response.statusText;
            requestInfo.mimeType = params.response.mimeType;

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

            try {
              const responseBody = (await chrome.debugger.sendCommand(
                { tabId },
                "Network.getResponseBody",
                { requestId: params.requestId }
              )) as { body: string; base64Encoded: boolean };

              if (responseBody) {
                requestInfo.body = responseBody;
              }
            } catch (error: any) {
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

// Periodic cleanup - runs every 2 minutes to remove old data
function createPeriodicCleanup(requestDataMap: Map<string, NetworkRequestInfo>) {
  const cleanup = () => {
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const TWO_MINUTES = 2 * 60 * 1000;
    
    let deletedCount = 0;
    
    for (const [id, req] of requestDataMap.entries()) {
      const age = now - (req.timestamp || 0);
      
      // Delete old completed requests (have response and body)
      if (req.response && req.body && age > FIVE_MINUTES) {
        requestDataMap.delete(id);
        deletedCount++;
        continue;
      }
      
      // Delete old errors (keep them longer for debugging)
      if (req.failed && age > TWO_MINUTES) {
        requestDataMap.delete(id);
        deletedCount++;
        continue;
      }
      
      // Delete old cancelled requests
      if (req.cancelled && age > TWO_MINUTES) {
        requestDataMap.delete(id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🧹 Periodic cleanup: removed ${deletedCount} old entries, ${requestDataMap.size} remaining`);
    }
  };
  
  // Run every 2 minutes
  return setInterval(cleanup, 2 * 60 * 1000);
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



