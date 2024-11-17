import { useState, useEffect, useCallback } from "react";
import { NetworkCall } from "../../types";

// useNetworkCalls.ts
export const useNetworkCalls = () => {
  const [networkCalls, setNetworkCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    console.log("Setting up network calls listener");

    const handleNetworkCall = (message: any) => {
      console.log("Network call received:", message);
      if (message.type === "NEW_NETWORK_CALL") {
        setNetworkCalls((prev) => [...prev, message.data]);
      }
    };

    // נוסיף שמירה וטעינה מהסטור
    chrome.storage.local.get(["networkCalls"], (result) => {
      if (result.networkCalls) {
        console.log("Loading saved network calls:", result.networkCalls);
        setNetworkCalls(result.networkCalls);
      }
    });

    chrome.runtime.onMessage.addListener(handleNetworkCall);
    return () => chrome.runtime.onMessage.removeListener(handleNetworkCall);
  }, []);

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

  return { networkCalls, clearAllNewtworkCalls };
};
