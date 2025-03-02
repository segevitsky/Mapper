import React, { useEffect, useState } from "react";
import { NetworkList } from "./components/NetworkList";
import IndicatorsList from "./components/IndicatorsList";
import { Toolbar } from "./components/Toolbar";
import { useNetworkCalls } from "./hooks/useNetworkCalls";
import "../index.css";
import { NetworkCall } from "../types";
import { GrClear } from "react-icons/gr";
import { LuToggleLeft, LuToggleRight } from "react-icons/lu";
import { ImSpinner } from "react-icons/im";
import { flexContStart } from "./styles";
import ApiResponsePanel from "./components/ResponseModal";
import FailedIndicatorsReport from "./components/FailedIndicatorsReport";

export const Panel: React.FC = () => {
  const { networkCalls, handleSearch, searchTerm } = useNetworkCalls();
  const [setSelectedElement] = useState<any>(null);
  const [networkResponses, setNetworkResponses] = useState<any[]>([]);

  const [showIndicators, setShowIndicators] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const [selectedNetworkResponse, setSelectedNetworkResponse] = useState<any>();

  // FAILED INDICATORS STATE

  const [showFailedIndicatorsReport, setShowFailedIndicatorsReport] =
    useState(false);
  const [failedIndicatorData, setFailedIndicatorData] = useState<any>();
  const [allNetworkCalls, setAllNetworkCalls] = useState<NetworkCall[]>([]);

  console.log({ networkResponses }, "our network responses");

  useEffect(() => {
    const handleSelectedNetworkResponse = (message: {
      type: string;
      data: { url: string; timing: string };
    }) => {
      if (message.type === "SHOW_REQUEST_REPONSE") {
        // שימוש בפונקציית עדכון שתמיד תקבל את הערך העדכני
        setSelectedNetworkResponse(() => {
          const selectedResponses = networkResponses.filter(
            (response) => response.url === message.data.url
          );
          const selectedResponse =
            selectedResponses[selectedResponses.length - 1];
          return selectedResponse ?? { networkResponses, data: message.data };
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleSelectedNetworkResponse);
    return () =>
      chrome.runtime.onMessage.removeListener(handleSelectedNetworkResponse);
  }, [networkResponses]); // אין צורך בתלויות

  useEffect(() => {
    const handleArrivingNetworkResponse = (message: {
      type: string;
      data: any;
      url: string;
    }) => {
      if (
        message.type === "NETWORK_RESPONSE" &&
        message.url.includes(
          "https://pre-prod-sleep.itamar-online.com/backend/"
        ) &&
        !message.data.body.includes("Error")
      ) {
        console.log({ message }, "A NEW NETWORK RESPONSE IN THE PANEL!!");
        const networkResponsesCopy = [...networkResponses];
        networkResponsesCopy.push(message);
        setNetworkResponses(networkResponsesCopy);
      }
    };

    chrome.runtime.onMessage.addListener(handleArrivingNetworkResponse);
    return () => {
      chrome.runtime.onMessage.removeListener(handleArrivingNetworkResponse);
    };
  }, [networkResponses]);

  useEffect(() => {
    const handleElementSelected = (message: any) => {
      if (message.type === "ELEMENT_SELECTED") {
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
      }
    };

    chrome.runtime.onMessage.addListener(handleElementSelected);
    return () => chrome.runtime.onMessage.removeListener(handleElementSelected);
  }, []);

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "REFRESH_PANEL") {
        setCurrentUrl(message.url);
      }
      if (message.type === "INDICATOR_FAILED") {
        const { failedIndicators } = message.data;
        alert("indicator failed got here");
        const requests = message.data.message;
        setFailedIndicatorData(failedIndicators);
        setAllNetworkCalls(requests);
        if (failedIndicators.length > 0) {
          setShowFailedIndicatorsReport(true);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  useEffect(() => {
    console.log("Panel mounted"); // נוודא שהקומפוננטה נטענת

    // וודא שיש גישה ל-chrome.devtools
    if (chrome.devtools) {
      const tabId = chrome.devtools.inspectedWindow.tabId;
      console.log("Current tab ID:", tabId);

      chrome.runtime.sendMessage(
        {
          type: "DEVTOOLS_OPENED",
          tabId,
        },
        (response) => {
          // בדיקה אם ההודעה נשלחה בהצלחה
          console.log("Message sent, got response:", response);
        }
      );
    }
  }, []);

  const toggleIndiators = () => {
    setShowIndicators(!showIndicators);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_INDICATORS" });
      }
    });
  };

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

  // Remove this function after cleaning the unneeded indi's data
  // const clearCurrentUrlIndi = () => {
  //   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  //     if (tabs[0]?.id) {
  //       chrome.tabs.sendMessage(tabs[0].id, {
  //         type: "CLEAR_CURRENT_URL_INDICATORS",
  //         data: "_tab_",
  //       });
  //     }
  //   });
  // };

  return (
    <div
      style={{
        backgroundImage:
          "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
        minWidth: "100vw",
      }}
      className="w-full min-h-[100dvh]  max-h-[100dvh] overflow-y-auto bg-gray-100"
    >
      <h1 className="font-thin drop-shadow-lg text-center pt-6  text-white">
        INDI API
      </h1>
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
            onSelectCall={() =>
              console.log(
                "we need to add here something that would show the data of the selected network call"
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
          <div className="flex justify-start align-middle">
            {" "}
            <GrClear
              onClick={clearIndicator}
              className="text-1xl mt-[.25rem] text-white"
            />
            <span className="ml-1 text-1xl">Clear Indicators</span>
          </div>
          <br />
          <div className={flexContStart}>
            <ImSpinner
              className="text-1xl mt-[.25rem] text-white"
              onClick={handleIndicatorsLoad}
            />
            <span className="ml-1 text-1xl">Load Indicators</span>
          </div>
          <br />
          <IndicatorsList currentUrl={currentUrl} />
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
    </div>
  );
};
