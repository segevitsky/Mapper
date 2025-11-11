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
    <div className="p-4 border-b bg-gradient-to-r from-pink-50 via-rose-50 to-purple-50">
      <button
        onClick={toggleInspecting}
        className={`
          flex items-center justify-center gap-2
          fixed bottom-4 right-4 z-50
          px-4 py-2.5
          bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600
          hover:from-pink-600 hover:via-rose-600 hover:to-pink-700
          text-white font-semibold text-sm
          rounded-full shadow-xl
          transition-all duration-300
          hover:scale-105 hover:shadow-pink-400/50
          active:scale-95
          border-2 border-white
          ${isInspecting ? 'animate-pulse' : ''}
        `}
      >
        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
          <LuInspect className="w-4 h-4" />
        </div>
        <span>{isInspecting ? 'Stop Inspecting' : 'Create Indicator'}</span>
      </button>
    </div>
  );
};
