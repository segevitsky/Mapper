import { NetworkCall } from "../../types";

interface ApiMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedElement: {
      tagName: string;
      path: string;
      rect: DOMRect;
    } | null;
    networkCalls: NetworkCall[];
    onSelectCall: (call: NetworkCall, element?: any) => void;  // הוספנו את זה
  }
  
  const ApiMappingModal: React.FC<ApiMappingModalProps> = ({
    isOpen,
    onClose,
    selectedElement,
    networkCalls,
    onSelectCall   // הוספנו את זה
  }) => {
    if (!isOpen || !selectedElement) return null;
  
    const position = {
      top: `${selectedElement.rect.top + window.scrollY}px`,
      left: `${selectedElement.rect.right + window.scrollX + 20}px`
    };
  
    const parseUrl = (url: string) => {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const searchParams = Object.fromEntries(urlObj.searchParams);
        
        return {
          path: pathname,
          params: searchParams
        };
      } catch (e) {
        return {
          path: url,
          params: {}
        };
      }
    };
  
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div 
          style={position}
          className="absolute bg-white rounded-lg p-6 w-[400px] shadow-xl"
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Map API to Element</h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
  
          <div className="mb-4">
            <h3 className="font-medium">Selected Element:</h3>
            <div className="bg-gray-100 p-2 rounded">
              <code>{selectedElement.path}</code>
            </div>
          </div>
  
          <div className="space-y-4 max-h-[400px] overflow-auto">
            {networkCalls.map((call) => {
              const { path, params } = parseUrl(call.url);
              
              return (
                <div 
                  key={call.id} 
                  className="border rounded p-4 hover:border-blue-500 cursor-pointer"
                  onClick={() => {
                    onSelectCall(call);  // השתמשנו בcallback
                    onClose();
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`
                      w-3 h-3 rounded-full
                      ${call.status === 200 ? 'bg-green-500' : 'bg-red-500'}
                    `} />
                    <span className="font-medium">{call.method}</span>
                    <span className="text-gray-600">{path}</span>
                  </div>
                  
                  {Object.keys(params).length > 0 && (
                    <div className="mt-2 pl-5">
                      <div className="text-sm text-gray-500">Parameters:</div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {Object.entries(params).map(([key, value]) => (
                          <div key={key} className="text-sm">
                            <span className="font-medium">{key}:</span> {value}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
  
  export default ApiMappingModal;