// components/NetworkList.tsx
interface NetworkCall {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  error?: string;
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  responseHeaders?: any[];
}

export const NetworkList: React.FC<{
  calls: NetworkCall[];
  onSelectCall: (call: NetworkCall) => void;
}> = ({ calls, onSelectCall }) => {
  const filteredCalls = calls.filter((call) => call.method !== "OPTIONS");
  return (
    <div className="grid grid-cols-1 gap-4">
      {filteredCalls.map((call) => (
        <div
          key={call.id}
          onClick={() => onSelectCall(call)}
          className={`
            p-4 rounded-lg border cursor-pointer 
            transition-all duration-200
            hover:shadow-md hover:border-blue-500
            ${
              call.error
                ? "border-red-300 bg-red-50"
                : call.status === 200
                ? "border-green-300 bg-green-50"
                : "border-yellow-300 bg-yellow-50"
            }
          `}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span
                className={`
                px-2 py-1 rounded text-sm font-medium
                ${
                  call.error
                    ? "bg-red-200 text-red-800"
                    : call.status === 200
                    ? "bg-green-200 text-green-800"
                    : "bg-yellow-200 text-yellow-800"
                }
              `}
              >
                {call.status || "Error"}
              </span>
              <span className="font-bold">{call.method}</span>
            </div>
            {call.timing && (
              <span className="text-sm text-gray-500">
                {Math.round(call.timing.duration)}ms
              </span>
            )}
          </div>

          <div className="text-sm text-gray-600 truncate">
            {call.url.split("/backend")[1]}
          </div>

          {call.error && (
            <div className="mt-2 text-sm text-red-600">Error: {call.error}</div>
          )}

          {/* Optional expanded view with headers */}
          {/* {isExpanded && call.responseHeaders && (
            <div className="mt-2 text-sm">
              <div className="font-medium mb-1">Headers:</div>
              {call.responseHeaders.map((header, idx) => (
                <div key={idx} className="text-gray-600">
                  {header.name}: {header.value}
                </div>
              ))}
            </div>
          )} */}
        </div>
      ))}
    </div>
  );
};
