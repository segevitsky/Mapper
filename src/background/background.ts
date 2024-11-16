// background.ts
console.log('Background script loaded');

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('Intercepted request:', details);
    
    if (details.type === 'xmlhttprequest') {
      console.log('Sending network call to panel:', details);
      
      chrome.runtime.sendMessage({
        type: 'NEW_NETWORK_CALL',
        data: {
          id: details.requestId,
          url: details.url,
          method: details.method,
          timestamp: Date.now()
        }
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);