import { useState } from "react";
import { LuInspect } from "react-icons/lu";

export const Toolbar: React.FC = () => {
  const [isInspecting, setIsInspecting] = useState(false);

  const toggleInspecting = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        // Determine the message type based on current state
        const messageType = isInspecting
          ? "STOP_INSPECT_MODE"
          : "START_INSPECT_MODE";

        chrome.tabs.sendMessage(tabs[0].id, { type: messageType }, () => {
          // Toggle the state after the message is sent
          setIsInspecting(!isInspecting);
        });
      }
    });
  };

  return (
    <div className="p-4 border-b">
      <button
        onClick={toggleInspecting}
        style={{ display: "flex" }}
        className="flex-1 items-center justify-center border-radius-6 fixed bottom-4 right-6 bg-gradient-to-r from-[#f857a6] to-[#ff5858] px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
      >
        <LuInspect style={{ marginRight: ".25rem" }} />
        Select Element
      </button>
    </div>
  );
};
