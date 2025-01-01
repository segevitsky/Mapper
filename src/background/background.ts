// background.ts
console.log("Background script loaded");

const pendingRequests = new Map();

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
      details.initiator === "https://pre-prod-sleep.itamar-online.com"
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

        // if (request.requestBody.raw) {
        //   // המרה מ-ArrayBuffer לטקסט
        //   const decoder = new TextDecoder("utf-8");
        //   const rawData = request.requestBody.raw[0].bytes;
        //   const textData = decoder.decode(rawData);

        //   try {
        //     // ניסיון לפרסר כ-JSON
        //     parsedBody = JSON.parse(textData);
        //     console.log("Parsed request body:", parsedBody);
        //     fullRequest.requestBody = parsedBody;
        //   } catch (e) {
        //     console.log("Raw text data:", e, textData);
        //   }
        // }

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

// פונקציה לחיבור הדיבאגר
async function attachDebugger(tabId: number) {
  if (!debuggerTabs.get(tabId)) {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable");
      debuggerTabs.set(tabId, true);
    } catch (err) {
      console.error("Failed to attach debugger:", err);
    }
  }
}

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

      console.log("Response body:", responseBody);
    } catch (error) {
      console.error("Error getting response body:", error);
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
