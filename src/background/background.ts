// background.ts
console.log("Background script loaded");

const pendingRequests = new Map();

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
    if (details.type === "xmlhttprequest") {
      console.log("Request completed:", details);

      const request = pendingRequests.get(details.requestId);
      if (request) {
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

        console.log("Sending complete request:", fullRequest);
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
