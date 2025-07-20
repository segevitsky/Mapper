import React, { useEffect, useRef, useState } from "react";
import { NetworkList } from "./components/NetworkList";
import { Toolbar } from "./components/Toolbar";
import { useNetworkCalls } from "./hooks/useNetworkCalls";
import "../index.css";
import { NetworkCall } from "../types";
import { GrClear } from "react-icons/gr";
import { LuToggleLeft, LuToggleRight } from "react-icons/lu";
import ApiResponsePanel from "./components/ResponseModal";
import FailedIndicatorsReport from "./components/FailedIndicatorsReport";
import IndicatorsOverview from "./components/IndicatorsOverview";
import { findKeyById } from "./utils";
import logoIcon from "../assets/bug.png";

const MAX_NETWORK_RESPONSES = 50;

export const Panel: React.FC = () => {
  const networkResponsesRef = useRef<any[]>([]);
  const { networkCalls, handleSearch, searchTerm } = useNetworkCalls();
  const [setSelectedElement] = useState<any>(null);
  const [networkResponses, setNetworkResponses] = useState<any[]>([]);

  const [showIndicators, setShowIndicators] = useState(true);
  const [showRecordButton, setShowRecordButton] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const [selectedNetworkResponse, setSelectedNetworkResponse] = useState<any>();
  const [userDetails, setUserDetails] = useState<any>(null);

  const [showFailedIndicatorsReport, setShowFailedIndicatorsReport] =
    useState(false);
  const [failedIndicatorData, setFailedIndicatorData] = useState<any>();
  const [allNetworkCalls, setAllNetworkCalls] = useState<NetworkCall[]>([]);
  const [showOverview, setShowOverview] = useState(false);
  const [indicators, setIndicators] = useState<Record<string, any>>({});

  // useEffect(() => {
  //   // lets fetch the indicators from storage
  //   chrome.storage.local.get(["indicators", "userData"], (result) => {
  //     if (result.indicators) {
  //       setIndicators(result.indicators);
  //     }
  //     console.log({ userData: result.userData }, 'user data from storage');
  //     setUserDetails(result.userData);  
  //   }); 
  // }, []);

  useEffect(() => {
  // Initial fetch of data from storage
  chrome.storage.local.get(["indicators", "userData"], (result) => {
    if (result.indicators) {
      setIndicators(result.indicators);
    }
    console.log({ userData: result.userData }, 'user data from storage');
    setUserDetails(result.userData);  
  });

  // Listen for changes in Chrome storage
  const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'local') {
      // Check if indicators changed
      if (changes.indicators) {
        setIndicators(changes.indicators.newValue);
      }
      
      // Check if userData changed
      if (changes.userData) {
        console.log({ userData: changes.userData.newValue }, 'user data updated from storage');
        setUserDetails(changes.userData.newValue);
      }
    }
  };

  // Add the storage listener
  chrome.storage.onChanged.addListener(handleStorageChange);

  // Cleanup: remove the listener when component unmounts
  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}, []);


  



  // NEW USE-EFFECT
  useEffect(() => {
    const messageHandler = (message: any) => {
      switch (message.type) {
        case "SHOW_REQUEST_REPONSE": {
          const responses = networkResponsesRef.current;
          const selectedResponses = responses.filter(
            (response) => response.url === message.data.url
          );
          const selectedResponse = selectedResponses[
            selectedResponses.length - 1
          ] || { data: message.data };
          setSelectedNetworkResponse(selectedResponse);
          break;
        }

        case "NETWORK_RESPONSE":
          if (
            message.url.includes(
              "https://pre-prod-sleep.itamar-online.com/backend/"
            ) &&
            !message.data.body?.includes("Error")
          ) {
            // הגבלת מספר התגובות השמורות
            networkResponsesRef.current = [
              ...networkResponsesRef.current,
              message,
            ].slice(-MAX_NETWORK_RESPONSES);

            setNetworkResponses(networkResponsesRef.current);
          }
          break;

        case "ELEMENT_SELECTED":
          // טיפול באלמנט נבחר
          console.log("Network calls in panel:", networkCalls);
          setSelectedElement(message.data); // אפשר לשמור את זה למקרה שנצטרך

          // שליחת הודעה לcontent script במקום פתיחת המודל בפאנל
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "SHOW_API_MODAL",
                data: {
                  networkCalls: networkCalls,
                  element: message.data,
                  position: {
                    top: message.data.rect.top,
                    left: message.data.rect.right + 20,
                  },
                },
              });
            }
          });
          break;

        case "INDICATOR_FAILED":
          // טיפול באינדיקטורים שנכשלו
          break;

        case "URL_CHANGED" : {
          setCurrentUrl(message.url);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    return () => {
      chrome.runtime.onMessage.removeListener(messageHandler);
    };
  }, []);

  // 4. שליחת הודעת DEVTOOLS_OPENED פעם אחת בלבד
  // useEffect(() => {
  //   if (chrome.devtools) {
  //     const tabId = chrome.devtools.inspectedWindow.tabId;
  //     chrome.runtime.sendMessage({
  //       type: "DEVTOOLS_OPENED",
  //       tabId,
  //     });
  //   }
  // }, []);

  const toggleIndiators = () => {
    setShowIndicators(!showIndicators);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_INDICATORS" });
      }
    });
  };

  const toggleRecordButton = () => {
    setShowRecordButton(!showRecordButton);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_RECORD_BUTTON" });
      }
    });
  }

  const clearIndicator = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "CLEAR_INDICATORS" });
      }
    });
  };

  const handleIndicatorsLoad = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "RELOAD_INDICATORS" });
      }
    });
  };

  return (
    <div
      style={{
        backgroundImage:
          "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
        minWidth: "100vw",
      }}
      className="w-full min-h-[100dvh]  max-h-[100dvh] overflow-y-auto bg-gray-100"
    >
      { userDetails?.displayName && <div className="text-center text-white font-bold text-2xl p-4">
        Welcome, {userDetails.displayName}! 
      </div> }
      
      
    <div className="flex items-center justify-center gap-3 pt-6">
      <img src={logoIcon} alt="Indi API" className="w-8 h-8 rounded drop-shadow-lg" />
      <h1 className="font-thin drop-shadow-lg text-white text-2xl">
        INDI API
      </h1>
    </div>
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[50vw] p-4 overflow-auto">
          <div className="text-white flex flex-1 justify-between items-center">
            <h2 className="text-lg font-thin mb-4">Network Calls</h2>
            <div className="flex items-center cursor-pointer">
              <GrClear
                // onClick={() => clearAllNewtworkCalls()}
                style={{ marginRight: ".25rem" }}
              />
              Clear
            </div>
          </div>
          <input
            onChange={(e) => {
              console.log({ e });
              handleSearch(e);
            }}
            type="text"
            value={searchTerm}
            placeholder="Search..."
            className=" mb-2 w-full pl-10 pr-4 py-2 bg-white rounded-full shadow-sm border border-gray-300 focus:ring focus:ring-blue-300 focus:border-blue-500 transition duration-300 focus:outline-none text-sm text-gray-700"
          />

          <NetworkList
            calls={networkCalls}
            onSelectCall={(call: any) =>
              console.log(
                "we need to add here something that would show the data of the selected network call", call
              )
            }
          />
        </div>

        <div className="w-[50vw] p-4 overflow-auto border-l border-gray-200">
          <h2 className="color-white text-lg font-thin mb-4 text-white">
            Mappings
          </h2>
          <div> {JSON.stringify(selectedNetworkResponse)} </div>
          <div className="flex justify-start align-middle">
            {!showIndicators ? (
              <LuToggleLeft
                className="mt-1 text-1xl text-white"
                onClick={toggleIndiators}
              />
            ) : (
              <LuToggleRight
                className="mt-1 text-1xl text-white"
                onClick={toggleIndiators}
              />
            )}
            {showIndicators ? (
              <span className="ml-1 text-1xl">Hide Indicators</span>
            ) : (
              <span className="ml-1 text-1xl">Show Indicators</span>
            )}
          </div>
          <br />

          <div
            onClick={toggleRecordButton}
            className="flex justify-start align-middle" style={{ cursor: "pointer" }}> 
            {!showRecordButton ? (
              <LuToggleLeft
                className="mt-1 text-1xl text-white"
              />
            ) : (
              <LuToggleRight
                className="mt-1 text-1xl text-white"
              />
            )}
            <span className="ml-1 text-1xl"> Toggle Record button  </span>
          </div>
          <br />

          <div className="flex justify-start align-middle">
            {" "}
            <GrClear
              onClick={clearIndicator}
              className="text-1xl mt-[.25rem] text-white"
            />
            <span className="ml-1 text-1xl">Clear Indicators</span>
          </div>
          <br />
          <button 
            className="flex-1 items-center justify-center border-radius-6 bg-gradient-to-r from-[#f857a6] to-[#ff5858] px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            onClick={() => setShowOverview(true)}
          >
            Show All Indicators
          </button>


          <br />
          {/* <IndicatorsList currentUrl={currentUrl} /> */}
        </div>
      </div>
      <ApiResponsePanel
        isVisible={!!selectedNetworkResponse}
        response={selectedNetworkResponse}
        onClose={() => setSelectedNetworkResponse(undefined)}
      />
      {showFailedIndicatorsReport && (
        <FailedIndicatorsReport
          failedIndicatorData={failedIndicatorData}
          allNetworkCalls={allNetworkCalls}
          onClose={() => setShowFailedIndicatorsReport(false)}
          onDelete={(id) => console.log("Delete indicator with id:", id)}
        />
      )}

      <IndicatorsOverview
        isVisible={showOverview}
        indicators={indicators} // המבנה מה-storage שלך
        onClose={() => setShowOverview(false)}
        onDeleteIndicator={(id, indicators) => {
          console.log({ id, indicators }, 'delete indicator');
          console.log({ currentUrl }, 'current url we are in');
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: "DELETE_INDICATOR", data: id });
            }
          });
          const itemsCategory = findKeyById(indicators, id);
          console.log("Items category found:", itemsCategory);
          if (!itemsCategory) {
            console.warn("No category found for indicator with id:", id);
            return;
          }
          setIndicators((prevIndicators) => {
            const newIndicators = { ...prevIndicators };
            const indicatorsArray = newIndicators[itemsCategory];
            if (indicatorsArray) {
              newIndicators[itemsCategory] = indicatorsArray.filter(
                (indicator: any) => indicator.id !== id
              );
            };
            return newIndicators;
          });
        }}
        onNavigateToIndicator={(indicator) => {
          console.log("Navigating to indicator:", indicator);
          const extractedUrl = new URL(indicator.baseUrl);
          const urlToSend = extractedUrl.pathname + extractedUrl?.search;
          // lets send the indicator base url to the content script
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "NAVIGATE_TO_INDICATOR",
                data: { baseUrl: urlToSend, id: indicator.id },
              });
            }
          });
          
        }}
      />
    </div>
  );
};
