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

// useNetworkCalls.ts
export const useNetworkCalls = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [networkCallsAll, setNetworkCallsAll] = useState<NetworkCall[]>([]);
  const [networkCalls, setNetworkCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    const handleNetworkCall = (message: any) => {
      console.log("Network call received:", message);
      if (message.type === "NEW_NETWORK_CALL") {
        setNetworkCalls((prev) => [...prev, message.data]);
        setNetworkCallsAll((prev) => [...prev, message.data]);

        chrome.runtime.sendMessage({
          type: "RELAY_TO_CONTENT",
          data: message.data,
        });
      }
    };

    console.log({ networkCallsAll });

    // נוסיף שמירה וטעינה מהסטור
    chrome.storage.local.get(["networkCalls"], (result) => {
      if (result.networkCalls) {
        console.log("Loading saved network calls:", result.networkCalls);
        setNetworkCalls(result.networkCalls);
        setNetworkCallsAll(result.networkCalls);
      }
    });

    chrome.runtime.onMessage.addListener(handleNetworkCall);
    return () => chrome.runtime.onMessage.removeListener(handleNetworkCall);
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "ALL_NETWORK_CALLS",
          data: {
            networkCalls: networkCalls,
          },
        });
      }
    });
  }, [networkCalls, networkCallsAll.length]);

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
      console.log("Element selected, current network calls:", networkCalls);
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
