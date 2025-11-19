import { useState, useEffect, useCallback } from "react";
import { NetworkCall } from "../../types";
// import { debounce } from "../../utils/general";

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Helper function to check if a URL is a static asset (not an API call)
 */
function isStaticAsset(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const staticExtensions = [
      '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg',
      '.woff', '.woff2', '.ttf', '.eot', '.ico', '.map',
      '.webp', '.avif', '.mp4', '.webm', '.mp3', '.wav',
      '.pdf', '.zip', '.tar', '.gz'
    ];
    return staticExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Get configured backend URL for current domain
 */
async function getConfiguredBackendUrl(): Promise<string | null> {
  // Get current tab's hostname
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.url) return null;

  const hostname = new URL(tabs[0].url).hostname;
  const key = `indi_onboarding_${hostname}`;

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const state = result[key];
      resolve(state?.selectedBackendUrl || null);
    });
  });
}

/**
 * Check if a network call should be displayed based on backend config
 */
async function shouldDisplayCall(url: string): Promise<boolean> {
  // Filter out static assets immediately
  if (isStaticAsset(url)) {
    return false;
  }

  // Get configured backend URL
  const backendUrl = await getConfiguredBackendUrl();

  // If no backend configured, don't show anything (onboarding not complete)
  if (!backendUrl) {
    return false;
  }

  // Only display if URL starts with configured backend
  return url.startsWith(backendUrl);
}

// useNetworkCalls.ts
export const useNetworkCalls = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [networkCallsAll, setNetworkCallsAll] = useState<NetworkCall[]>([]);
  const [networkCalls, setNetworkCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    const handleNetworkCall = async (message: any) => {
      if (message.type === "NEW_NETWORK_CALL") {
        // FILTERING: Check if this call should be displayed
        const shouldDisplay = await shouldDisplayCall(message.data.url);

        if (shouldDisplay) {
          setNetworkCalls((prev) => [...prev, message.data]);
          setNetworkCallsAll((prev) => [...prev, message.data]);
        }

        // Always relay to content (content script does its own filtering)
        chrome.runtime.sendMessage({
          type: "RELAY_TO_CONTENT",
          data: message.data,
        });
      }
    };


    // נוסיף שמירה וטעינה מהסטור
    chrome.storage.local.get(["networkCalls"], (result) => {
      if (result.networkCalls) {
        setNetworkCalls(result.networkCalls);
        setNetworkCallsAll(result.networkCalls);
      }
    });

    chrome.runtime.onMessage.addListener(handleNetworkCall);
    return () => chrome.runtime.onMessage.removeListener(handleNetworkCall);
  }, []);

  // useEffect(() => {
  //   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  //     if (tabs[0]?.id) {
  //       chrome.tabs.sendMessage(tabs[0].id, {
  //         type: "ALL_NETWORK_CALLS",
  //         data: {
  //           networkCalls: networkCalls,
  //         },
  //       });
  //     }
  //   });
  // }, [networkCalls, networkCallsAll.length]);

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      if (!term.trim()) {
        setNetworkCalls(networkCallsAll);
        return;
      }

      const searchTerms = term.toLowerCase().split(" ").filter(Boolean);

      const filteredCalls = networkCallsAll.filter((call) => {
        const url = call.url.toLowerCase();
        const method = call.method.toLowerCase();

        return searchTerms.every(
          (term) => url.includes(term) || method.includes(term)
        );
      });

      setNetworkCalls(filteredCalls);
    }, 300),
    [networkCallsAll]
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setSearchTerm(newTerm);
    debouncedSearch(newTerm);
  };

  // נעדכן את הפאנל
  const handleElementSelected = useCallback(
    (message: any) => {
      if (message.type === "ELEMENT_SELECTED") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "SHOW_API_MODAL",
              data: {
                element: message.data,
                networkCalls: networkCalls, // עכשיו זה אמור להיות מעודכן
              },
            });
          }
        });
      }
    },
    [networkCalls]
  ); // תלוי בnetworkCalls

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleElementSelected);
    return () => chrome.runtime.onMessage.removeListener(handleElementSelected);
  }, [handleElementSelected]);

  const clearAllNewtworkCalls = () => {
    setNetworkCalls([]);
    chrome.storage.local.set({ networkCalls: [] });
  };

  return { networkCalls, clearAllNewtworkCalls, handleSearch, searchTerm };
};
