import React, { useState } from "react";
import { Clock, Hash, Calendar, X } from "lucide-react";

interface Pagination {
  page: number;
  ofPage: number | null;
  count: number | null;
}

interface TimingInfo {
  duration: number;
  startTime?: number;
  endTime?: number;
}

interface ApiResponse {
  method: string;
  url: string;
  status: number;
  timing: TimingInfo;
  data: string | Record<string, any>;
  headers?: Record<string, string>;
  timestamp: string;
  cache?: boolean;
}

interface ApiResponsePanelProps {
  response: ApiResponse;
  onClose?: () => void;
  position?: "top-right" | "bottom-right";
  isVisible: boolean;
}

interface ParsedApiData {
  pagination?: Pagination;
  data?: any[];
  [key: string]: any;
}

const ApiResponsePanel: React.FC<ApiResponsePanelProps> = ({
  response,
  onClose,
  position = "bottom-right",
  isVisible,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"data" | "headers">("data");

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const renderData = (data: string | Record<string, any>): React.ReactNode => {
    if (!data) return null;

    try {
      const parsedData: ParsedApiData =
        typeof data === "string" ? JSON.parse(data) : data;

      if (parsedData.pagination) {
        return (
          <div className="space-y-2">
            <div className="text-sm text-gray-600">
              Page {parsedData.pagination.page} of{" "}
              {parsedData.pagination.ofPage || "N/A"}
              {parsedData.pagination.count && (
                <span> • Total: {parsedData.pagination.count}</span>
              )}
            </div>

            {parsedData.data && Array.isArray(parsedData.data) && (
              <div className="space-y-2">
                {parsedData.data.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white rounded-lg shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
                  >
                    {Object.entries(item).map(([key, value]) => (
                      <div key={key} className="flex items-start text-sm">
                        <span className="font-medium text-gray-600 min-w-32">
                          {key}:
                        </span>
                        <span className="text-gray-800 ml-2">
                          {value?.toString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                {parsedData.data.length > 5 && (
                  <div className="text-sm text-gray-500 text-center">
                    + {parsedData.data.length - 5} more items
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      return (
        <pre className="text-sm whitespace-pre-wrap">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      );
    } catch (e) {
      return <div className="text-red-500">Error parsing response data</div>;
    }
  };

  const getStatusColor = (status: number): string => {
    if (status >= 200 && status < 300) return "bg-green-500";
    if (status >= 400 && status < 500) return "bg-yellow-500";
    if (status >= 500) return "bg-red-500";
    return "bg-gray-500";
  };

  const getStatusIndicator = (status: number): React.ReactNode => (
    <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
  );

  const positionClasses = {
    "top-right": "top-4 right-4",
    "bottom-right": "bottom-4 right-4",
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[999]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`
          fixed ${positionClasses[position]} z-[1000]
          w-[90vw] max-w-2xl
          bg-gray-50 rounded-lg border border-gray-200 
          transform transition-all duration-300 ease-in-out
          ${isExpanded ? "shadow-xl" : "shadow-lg"}
          max-h-[90vh] overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div className="flex items-center space-x-3 flex-grow min-w-0">
            {getStatusIndicator(response.status)}
            <span className="font-medium">{response.method}</span>
            <span className="text-gray-600 truncate">{response.url}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{response.timing.duration}ms</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Hash className="w-4 h-4" />
              <span>{response.status}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className="p-4 overflow-y-auto"
          style={{ maxHeight: "calc(90vh - 130px)" }}
        >
          {/* Tabs */}
          <div className="flex space-x-4 mb-4">
            {(["data", "headers"] as const).map((tab) => (
              <button
                key={tab}
                className={`
                  px-3 py-1 rounded-md text-sm font-medium transition-colors
                  ${
                    activeTab === tab
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }
                `}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "data" ? "Response Data" : "Headers"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg p-4 overflow-x-auto">
            {activeTab === "data" ? (
              renderData(response.data)
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(response.headers || {}).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium text-gray-600">{key}:</span>
                    <span className="text-gray-800 ml-2">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(response.timestamp)}</span>
            </div>
            {response.cache && (
              <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                Cached
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ApiResponsePanel;
