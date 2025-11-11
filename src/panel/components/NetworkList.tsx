import { BLOCKED_BY_CLIENT } from "../../commonConts";
import { Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
  request?: any;
  response?: any;
}

export const NetworkList: React.FC<{
  calls: NetworkCall[];
  onSelectCall: any;
}> = ({ calls, onSelectCall }) => {
  const filteredCalls = calls
    .filter((call) => call.method !== "OPTIONS")
    .filter((call) => call.error !== BLOCKED_BY_CLIENT);

  const getStatusInfo = (call: NetworkCall) => {
    if (call.error) {
      return {
        gradient: "from-red-100 to-rose-100",
        border: "border-red-300",
        badge: "bg-gradient-to-r from-red-400 to-rose-500",
        icon: <XCircle className="w-5 h-5 text-white" />,
        hover: "hover:border-red-400 hover:shadow-red-200"
      };
    }
    if (call.status && call.status >= 200 && call.status < 300) {
      return {
        gradient: "from-green-100 to-emerald-100",
        border: "border-green-300",
        badge: "bg-gradient-to-r from-green-400 to-emerald-500",
        icon: <CheckCircle className="w-5 h-5 text-white" />,
        hover: "hover:border-green-400 hover:shadow-green-200"
      };
    }
    return {
      gradient: "from-yellow-100 to-amber-100",
      border: "border-yellow-300",
      badge: "bg-gradient-to-r from-yellow-400 to-amber-500",
      icon: <AlertCircle className="w-5 h-5 text-white" />,
      hover: "hover:border-yellow-400 hover:shadow-yellow-200"
    };
  };

  if (filteredCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Clock className="w-8 h-8" />
        </div>
        <p className="text-lg font-semibold">No network calls yet</p>
        <p className="text-sm">Waiting for activity...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col-reverse gap-3 overflow-y-auto overflow-x-hidden">
      {filteredCalls?.map((call) => {
        const statusInfo = getStatusInfo(call);
        return (
          <div
            key={call.id}
            onClick={() => onSelectCall(call)}
            className={`
              w-full
              bg-gradient-to-r ${statusInfo.gradient}
              rounded-2xl border-2 ${statusInfo.border}
              p-4 cursor-pointer
              transition-all duration-300
              hover:shadow-xl ${statusInfo.hover}
              overflow-hidden
            `}
          >
            <div className="w-full flex items-start justify-between gap-2 mb-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <div className={`${statusInfo.badge} w-10 h-10 rounded-full flex items-center justify-center shadow-lg flex-shrink-0`}>
                  {statusInfo.icon}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="font-bold text-gray-900 text-base whitespace-nowrap flex-shrink-0">
                      {call.method}
                    </span>
                    <span className={`
                      px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0
                      ${call.error
                        ? "bg-red-200 text-red-800"
                        : call.status && call.status >= 200 && call.status < 300
                        ? "bg-green-200 text-green-800"
                        : "bg-yellow-200 text-yellow-800"
                      }
                    `}>
                      {call.status || "ERROR"}
                    </span>
                  </div>
                </div>
              </div>

              {call.timing && (
                <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm px-2 py-1 rounded-full flex-shrink-0">
                  <Clock className="w-3 h-3 text-gray-600 flex-shrink-0" />
                  <span className={`text-xs font-semibold whitespace-nowrap ${
                    call.timing.duration > 1000 ? 'text-red-600' :
                    call.timing.duration > 300 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {Math.round(call?.timing?.duration)}ms
                  </span>
                </div>
              )}
            </div>

            <div
              className="w-full bg-white/50 backdrop-blur-sm rounded-xl p-3 text-xs text-gray-700 font-mono cursor-help overflow-hidden"
              title={call.url}
            >
              <div className="truncate">
                {call.url.split("/backend")[1] || call.url}
              </div>
            </div>

            {call.error && (
              <div className="w-full mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold overflow-hidden">
                <div className="break-words">⚠️ {call.error}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
