import { LuInspect } from "react-icons/lu";

export const Toolbar: React.FC = () => {
  const startInspecting = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "START_INSPECT_MODE" });
      }
    });
  };

  return (
    <div className="p-4 border-b">
      {/* <button
        style={{
          backgroundImage:
            "linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
        }}
        className="fixed bottom-4 right-6 p-4 px-3 bg-pink-500 border-0 rounded-xl text-white shadow-md py-2"
      >
        Start Mapping
      </button> */}
      <button
        onClick={startInspecting}
        style={{ display: "flex" }}
        className="flex-1 items-center justify-center border-radius-6 fixed bottom-4 right-6 bg-gradient-to-r from-[#f857a6] to-[#ff5858] px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
      >
        <LuInspect style={{ marginRight: ".25rem" }} />
        Select Element
      </button>
    </div>
  );
};
