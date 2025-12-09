import React, { useEffect, useRef, useState } from "react";
import { NetworkList } from "./components/NetworkList";
import { Toolbar } from "./components/Toolbar";
import { useNetworkCalls } from "./hooks/useNetworkCalls";
import "../index.css";
import { NetworkCall } from "../types";
import { Trash2, RefreshCw, Eye, EyeOff, Circle, Grid3x3, Search, ChevronDown } from "lucide-react";
import ApiResponsePanel from "./components/ResponseModal";
import FailedIndicatorsReport from "./components/FailedIndicatorsReport";
import IndicatorsOverview from "./components/IndicatorsOverview";
import CleanHeaderDemo from "./Header";

const MAX_NETWORK_RESPONSES = 50;

export const Panel: React.FC = () => {
  const networkResponsesRef = useRef<any[]>([]);
  const { networkCalls, handleSearch, searchTerm } = useNetworkCalls();
  const [, setSelectedElement] = useState<any>(null);
  const [, setNetworkResponses] = useState<any[]>([]);

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
  const [isNetworkCallsExpanded, setIsNetworkCallsExpanded] = useState(true);

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
    // console.log({ userData: result.userData }, 'user data from storage');
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
        // console.log({ userData: changes.userData.newValue }, 'user data updated from storage');
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
          // console.log("Network calls in panel:", networkCalls);
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
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gradient-to-br from-pink-50 via-rose-50 to-purple-50">
      <CleanHeaderDemo userDetails={userDetails} />
      <Toolbar />

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 lg:p-6 overflow-y-auto lg:overflow-hidden">
        {/* LEFT PANEL - Network Calls */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4 flex-shrink-0 lg:min-h-0 lg:overflow-hidden">
          {/* Network Calls Header Card */}
          <button
            onClick={() => setIsNetworkCallsExpanded(!isNetworkCallsExpanded)}
            className="w-full bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 hover:from-pink-500 hover:via-rose-500 hover:to-pink-600 rounded-3xl shadow-2xl p-6 transition-all duration-300 overflow-hidden flex-shrink-0 hover:scale-[1.02]"
          >
            <div className="flex justify-between items-center overflow-hidden">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                  <Circle className="w-6 h-6 text-white fill-white animate-pulse" />
                </div>
                <h2 className="font-headline text-2xl font-bold text-white truncate">Network Calls</h2>
              </div>
              <ChevronDown
                className={`w-8 h-8 text-white transition-all duration-500 ease-in-out ${
                  isNetworkCallsExpanded ? 'rotate-180 scale-110' : 'scale-100'
                }`}
                strokeWidth={3}
              />
            </div>
          </button>

          {/* Collapsible Content */}
          <div className={`overflow-hidden transition-all duration-500 ${isNetworkCallsExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
            {/* Search Bar */}
            <div className="w-full mb-4 relative overflow-hidden">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-400 flex-shrink-0" />
              <input
                onChange={(e) => handleSearch(e)}
                type="text"
                value={searchTerm}
                placeholder="Search network calls..."
                className="w-full pl-12 pr-4 py-3 bg-white rounded-full shadow-lg border-2 border-transparent focus:border-pink-300 focus:ring-4 focus:ring-pink-200 transition-all duration-300 focus:outline-none text-gray-700 placeholder-gray-400"
              />
            </div>

            {/* Network List Card */}
            <div className="w-full flex-1 bg-white rounded-3xl shadow-xl p-6 overflow-hidden min-h-[300px] lg:min-h-0">
              <NetworkList
                calls={networkCalls}
                onSelectCall={(call: any) =>
                  console.log("Selected network call:", call)
                }
              />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Controls & Mappings */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4 flex-shrink-0 lg:min-h-0 lg:overflow-y-auto p-4">
          {/* Mappings Header */}
          <div className="w-full bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500 rounded-3xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Grid3x3 className="w-6 h-6 text-white" />
              </div>
              <h2 className="font-headline text-2xl font-bold text-white">Controls</h2>
            </div>
          </div>

          {/* Control Buttons Cards */}
          <div className="w-full space-y-3 overflow-hidden">
            {/* Toggle Indicators */}
            <button
              onClick={toggleIndiators}
              className="w-full bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all duration-300 group overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    showIndicators
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                      : 'bg-gradient-to-r from-gray-300 to-gray-400'
                  }`}>
                    {showIndicators ? (
                      <Eye className="w-5 h-5 text-white" />
                    ) : (
                      <EyeOff className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-gray-900">
                      {showIndicators ? 'Hide' : 'Show'} Indicators
                    </h3>
                    <p className="text-sm text-gray-500">Toggle visibility on page</p>
                  </div>
                </div>
                <div className={`w-14 h-8 rounded-full transition-all duration-300 ${
                  showIndicators ? 'bg-green-500' : 'bg-gray-300'
                } p-1`}>
                  <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                    showIndicators ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </button>

            {/* Toggle Record Button */}
            {/* <button
              onClick={toggleRecordButton}
              className="w-full bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    showRecordButton
                      ? 'bg-gradient-to-r from-red-400 to-rose-500'
                      : 'bg-gradient-to-r from-gray-300 to-gray-400'
                  }`}>
                    <Circle className={`w-5 h-5 ${showRecordButton ? 'fill-white text-white' : 'text-white'}`} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-gray-900">Record Button</h3>
                    <p className="text-sm text-gray-500">Toggle recording controls</p>
                  </div>
                </div>
                <div className={`w-14 h-8 rounded-full transition-all duration-300 ${
                  showRecordButton ? 'bg-red-500' : 'bg-gray-300'
                } p-1`}>
                  <div className={`w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                    showRecordButton ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </button> */}

            {/* Clear Indicators */}
            <button
              onClick={clearIndicator}
              className="w-full bg-gradient-to-r from-red-100 to-rose-100 hover:from-red-200 hover:to-rose-200 rounded-2xl shadow-lg p-5 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border-2 border-red-200 overflow-hidden"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gradient-to-r from-red-400 to-rose-500 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-bold text-red-900">Clear Indicators</h3>
                  <p className="text-sm text-red-600">Remove all indicators from page</p>
                </div>
              </div>
            </button>

            {/* Reload Indicators */}
            {/* <button
              onClick={handleIndicatorsLoad}
              className="w-full bg-gradient-to-r from-blue-100 to-cyan-100 hover:from-blue-200 hover:to-cyan-200 rounded-2xl shadow-lg p-5 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 border-2 border-blue-200 overflow-hidden"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-bold text-blue-900">Reload Indicators</h3>
                  <p className="text-sm text-blue-600">Refresh all indicators</p>
                </div>
              </div>
            </button> */}

            {/* Show All Indicators - Featured */}
            <button
              onClick={() => setShowOverview(true)}
              className="w-full bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:via-rose-600 hover:to-pink-700 rounded-2xl shadow-2xl p-6 hover:shadow-pink-300/50 hover:scale-[1.03] transition-all duration-300 group overflow-hidden"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:rotate-12 transition-transform duration-300">
                  <Grid3x3 className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white">Show All Indicators</h3>
                  <p className="text-sm text-pink-100">View complete overview</p>
                </div>
              </div>
            </button>
          </div>
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
        onNavigateToIndicator={(indicator) => {
          chrome.runtime.sendMessage({
              type: "OPEN_FLOATING_WINDOW",
              data: {
                indicatorData: indicator,
                networkCall: indicator,
              }
            });   
        }}
      />
    </div>
  );
};
