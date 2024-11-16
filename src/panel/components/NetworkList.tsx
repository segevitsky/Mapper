// src/panel/components/NetworkList.tsx
export const NetworkList: React.FC<{
    calls: any[];
    onSelectCall: (call: any) => void;
   }> = ({ calls, onSelectCall }) => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {calls.map((call, index) => (
          <div 
            key={index} 
            onClick={() => onSelectCall(call)}
            className="p-4 border rounded-lg shadow hover:shadow-md transition-shadow duration-200 cursor-pointer"
          >
            <div className="font-medium">{call.method}</div>
            <div className="text-sm text-gray-600 truncate">{call.url}</div>
            <div className="text-xs text-gray-500">
              {new Date(call.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    );
   };