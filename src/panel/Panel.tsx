import React, { useEffect, useState } from "react";
import { NetworkList } from "./components/NetworkList";
import { MappingsList } from "./components/MappingsList";
import { Toolbar } from "./components/Toolbar";
import { useNetworkCalls } from "./hooks/useNetworkCalls";
import { useMappings } from "./hooks/useMappings";
import ApiMappingModal from "./components/ApiMappingModal";
import "../index.css";
import { ElementMapping, NetworkCall } from "../types";
import { StatusIndicator } from "./components/StatusIndicator";
import ApiDetailsModal from "./components/ApiDetailsModal";
import { GrClear } from "react-icons/gr";

export const Panel: React.FC = () => {
  const { networkCalls } = useNetworkCalls();
  const { mappings, addMapping, removeMapping } = useMappings();
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<ElementMapping | null>(
    null
  );

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

  const handleApiCallSelect = (call: NetworkCall, element: any) => {
    // שליחת הודעה לcontent script להוספת אינדיקטור
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "ADD_INDICATOR",
          data: {
            rect: element.rect,
            status: call.status,
          },
        });
      }
    });

    // שמירת המיפוי
    const newMapping: ElementMapping = {
      id: Date.now().toString(),
      elementPath: element.path,
      elementRect: element.rect,
      apiCall: call,
    };
    addMapping(newMapping as any);
  };

  const handleIndicatorClick = (mapping: ElementMapping) => {
    setSelectedMapping(mapping);
    // כאן אפשר לפתוח מודל חדש שמציג את פרטי הקריאה
  };

  console.log(
    networkCalls,
    mappings,
    addMapping,
    removeMapping,
    "initial values"
  );

  return (
    <div
      style={{
        backgroundImage:
          "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
        minWidth: "100vw",
      }}
      className="w-full min-h-screen bg-gray-100"
    >
      <h1 className="font-thin drop-shadow-lg text-center pt-6  text-white">
        API Mapper Panel
      </h1>
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 p-4 overflow-auto">
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
          <NetworkList
            calls={networkCalls}
            onSelectCall={(call) => console.log("Selected:", call)}
          />
        </div>
        <div className="w-1/2 p-4 overflow-auto border-l border-gray-200">
          <h2 className="color-white text-lg font-thin mb-4">Mappings</h2>
          <MappingsList mappings={mappings} onRemoveMapping={removeMapping} />
        </div>
      </div>

      <ApiMappingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedElement={selectedElement}
        networkCalls={networkCalls}
        onSelectCall={handleApiCallSelect}
      />

      <ApiDetailsModal
        mapping={selectedMapping}
        onClose={() => setSelectedMapping(null)}
      />

      {mappings.map((mapping: any) => (
        <StatusIndicator
          key={mapping.id}
          mapping={mapping}
          onClick={() => handleIndicatorClick(mapping)}
        />
      ))}
    </div>
  );
};
