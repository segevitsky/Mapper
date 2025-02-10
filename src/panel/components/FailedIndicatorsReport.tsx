import React from "react";
import { X, AlertCircle } from "lucide-react";
import { generateStoragePath } from "./IndicatorsList";

interface Timing {
  duration: number;
  startTime?: number;
  endTime?: number;
}

interface LastCall {
  status: number;
  timing: Timing;
  timestamp: number;
  url: string;
  updatedInThisRound?: boolean;
}

interface ElementInfo {
  path: string;
  rect: DOMRect;
}

interface IndicatorData {
  id: string;
  baseUrl: string;
  method: string;
  elementInfo: ElementInfo;
  lastCall: LastCall;
  position: {
    top: number;
    left: number;
  };
  pattern?: string;
  calls?: any[];
  hisDaddyElement?: Element;
}

interface NetworkResponse {
  status: number;
  url: string;
  timing: {
    sendStart: number;
    sendEnd: number;
    receiveHeadersEnd: number;
  };
}

interface NetworkRequest {
  request: {
    request: {
      method: string;
      url: string;
    };
  };
  response?: NetworkResponse;
  error?: string;
}

interface FailedIndicatorsReportProps {
  failedIndicatorData: IndicatorData[];
  allNetworkCalls: any[];
  onClose: () => void;
  onDelete?: (id: string) => void;
}

const FailedIndicatorsReport: React.FC<FailedIndicatorsReportProps> = ({
  failedIndicatorData,
  allNetworkCalls,
  onClose,
  onDelete,
}) => {
  const findMatchingNetworkCall = (
    indicator: IndicatorData
  ): NetworkRequest | undefined => {
    return allNetworkCalls.find((call) => {
      const callUrl = call?.response?.url || call?.request?.request?.url;
      return (
        generateStoragePath(callUrl) ===
        generateStoragePath(indicator.lastCall?.url)
      );
    });
  };

  const getFailureReason = (networkCall?: NetworkRequest): string => {
    if (!networkCall) {
      return "Request was blocked or never initiated";
    }

    // חסימה על ידי הדפדפן
    if (networkCall.error?.includes("net::ERR_BLOCKED_BY_CLIENT")) {
      return "Request was blocked by the browser or an extension";
    }

    if (networkCall.error?.includes("blocked:devtools")) {
      return "Request was manually blocked through DevTools";
    }

    // חסימה על ידי CORS
    if (
      networkCall.error?.includes("net::ERR_FAILED") ||
      networkCall.error?.includes("CORS")
    ) {
      return "Request was blocked by CORS policy";
    }

    if (networkCall.response && networkCall.response.status >= 400) {
      return `Failed with status ${networkCall.response.status}`;
    }

    if (networkCall.error) {
      return `Network error: ${networkCall.error}`;
    }

    return "Unknown failure reason";
  };

  const formatDuration = (timing?: Timing): string => {
    if (!timing || typeof timing.duration !== "number") return "N/A";
    return `${Math.floor(timing.duration)}ms`;
  };

  const getStatusColor = (status?: number): string => {
    if (!status) return "text-gray-500";
    if (status >= 200 && status < 300) return "text-green-500";
    if (status >= 300 && status < 400) return "text-yellow-500";
    return "text-rose-500";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
              Failed Indicators Report
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6">
          <div className="space-y-6">
            {failedIndicatorData.map((indicator, index) => {
              const networkCall = findMatchingNetworkCall(indicator);
              const failureReason = getFailureReason(networkCall);

              return (
                <div
                  key={indicator.id || index}
                  className="border border-gray-200 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <AlertCircle
                          className={`w-4 h-4 ${
                            networkCall?.response?.status === 200
                              ? "text-green-500"
                              : "text-rose-500"
                          }`}
                        />
                        {indicator.method || "Unknown Method"}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1 break-all">
                        {indicator.lastCall?.url || "Unknown URL"}
                      </p>
                    </div>
                    <button
                      onClick={() => onDelete?.(indicator.id)}
                      className="text-rose-500 hover:text-rose-600 text-sm"
                    >
                      Remove Indicator
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Last Status:</p>
                      <p className={getStatusColor(indicator.lastCall?.status)}>
                        {indicator.lastCall?.status || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Last Response Time:</p>
                      <p>{formatDuration(indicator.lastCall?.timing)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Failure Reason:</p>
                      <p className="text-rose-500">{failureReason}</p>
                    </div>
                    {networkCall?.error && (
                      <div className="col-span-2">
                        <p className="text-gray-600">Error Details:</p>
                        <p className="text-rose-500">{networkCall.error}</p>
                      </div>
                    )}
                  </div>

                  {networkCall && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="font-medium mb-2">Network Call Details:</p>
                      <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
                        {JSON.stringify(
                          {
                            url:
                              networkCall.response?.url ||
                              networkCall.request?.request?.url,
                            status: networkCall.response?.status,
                            method: networkCall.request?.request?.method,
                            timing: networkCall.response?.timing,
                            error: networkCall.error,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FailedIndicatorsReport;
