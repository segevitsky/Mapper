import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Calendar,
  X,
  Copy,
  Code,
  Eye,
} from "lucide-react";

// Types and Interfaces
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
  // State
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"data" | "headers" | "schema">(
    "data"
  );
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Helper Functions
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const cleanAndParseJSON = (str: any): any => {
    try {
      // First, parse the outer JSON
      const parsed = typeof str === "string" ? JSON.parse(str) : str;

      // If we have a body field that's a string and looks like JSON, parse it
      if (parsed.body && typeof parsed.body === "string") {
        try {
          // Clean up the body string
          const cleanBody = parsed.body
            .trim()
            // Remove escaped quotes
            .replace(/\\\"/g, '"')
            // Handle unescaped quotes
            .replace(/([{,]\s*)([a-zA-Z0-9_]+?):/g, '$1"$2":')
            // Clean up any remaining issues
            .replace(/\n/g, "")
            .replace(/\r/g, "");

          // Parse the body
          parsed.body = JSON.parse(cleanBody);
        } catch (bodyError) {
          console.error("Error parsing body:", bodyError);
        }
      }

      return parsed;
    } catch (e) {
      console.error("Error parsing JSON:", e);
      return str;
    }
  };

  const generateTypeScriptInterface = (
    obj: any,
    interfaceName: string = "ResponseType"
  ): string => {
    const seen = new Set<any>();

    const generateType = (value: any, propertyPath: string[] = []): string => {
      if (value === null) return "null";
      if (value === undefined) return "undefined";

      // Handle circular references
      if (typeof value === "object" && seen.has(value)) {
        return "any // Circular reference detected";
      }

      if (typeof value === "object") {
        seen.add(value);
      }

      if (Array.isArray(value)) {
        if (value.length === 0) return "any[]";
        const itemType = generateType(value[0]);
        return `${itemType}[]`;
      }

      if (value instanceof Date) return "Date";

      if (typeof value === "object" && value !== null) {
        const interfaceName =
          propertyPath
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join("") || "Interface";

        const properties = Object.entries(value)
          .map(([key, val]) => {
            const propType = generateType(val, [...propertyPath, key]);
            return `  ${key}: ${propType};`;
          })
          .join("\n");

        return `{\n${properties}\n}`;
      }

      return typeof value;
    };

    const interfaces: string[] = [];
    const processedObjects = new Map<string, any>();

    const generateInterfaces = (
      obj: any,
      name: string,
      path: string[] = []
    ): void => {
      if (typeof obj !== "object" || obj === null) return;

      // Generate interface for current object
      const interfaceContent = generateType(obj, path);
      interfaces.push(`interface ${name} ${interfaceContent}`);

      // Process nested objects
      Object.entries(obj).forEach(([key, value]) => {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const nestedName = path
            .concat([key])
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join("");

          if (!processedObjects.has(nestedName)) {
            processedObjects.set(nestedName, value);
            generateInterfaces(value, nestedName, path.concat([key]));
          }
        }
      });
    };

    generateInterfaces(obj, interfaceName);
    return interfaces.reverse().join("\n\n");
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const renderContent = () => {
    try {
      // Parse the data
      const parsedData = cleanAndParseJSON(response?.data);

      // Format the output depending on whether parsed successfully
      const formattedData =
        typeof parsedData.body === "object"
          ? {
              ...parsedData,
              body: parsedData.body, // Already parsed body
            }
          : parsedData;


      if (activeTab === "headers") {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {Object.entries(response.headers || {}).map(([key, value]) => (
              <div key={key} className="flex flex-col">
                <span className="font-medium text-gray-600">{key}:</span>
                <span className="text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        );
      }

      if (activeTab === "schema") {
        // @ts-ignore
        const schema = response.data.restOfData.schema
        generateTypeScriptInterface(parsedData);
        return (
          <div className="relative">
            <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg overflow-x-auto font-mono">
              {schema}
            </pre>
            <button
              onClick={() => copyToClipboard(schema)}
              className="absolute top-2 right-2 p-2 rounded-md hover:bg-gray-200 transition-colors"
            >
              {copySuccess ? (
                <span className="text-green-500 text-sm">Copied!</span>
              ) : (
                <Copy className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
        );
      }

      // Data tab
      const formattedJSON = JSON.stringify(parsedData, null, 2);
      return (
        <div className="relative">
          <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg overflow-x-auto font-mono">
            {formattedJSON}
          </pre>
          <button
            onClick={() => copyToClipboard(formattedJSON)}
            className="absolute top-2 right-2 p-2 rounded-md hover:bg-gray-200 transition-colors"
          >
            {copySuccess ? (
              <span className="text-green-500 text-sm">Copied!</span>
            ) : (
              <Copy className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      );
    } catch (e) {
      return (
        <div className="text-red-500 p-4">
          Error parsing response data: {(e as Error).message}
        </div>
      );
    }
  };

  const getStatusColor = (status: number): string => {
    if (status >= 200 && status < 300) return "bg-green-500";
    if (status >= 400 && status < 500) return "bg-yellow-500";
    if (status >= 500) return "bg-red-500";
    return "bg-gray-500";
  };

  if (!isVisible) return null;

  const positionClasses = {
    "top-right": "top-4 right-4",
    "bottom-right": "bottom-4 right-4",
  };

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
          bg-gray-50 rounded-lg border border-gray-200 
          transform transition-all duration-300 ease-in-out
          ${isExpanded ? "w-[90vw] max-w-4xl shadow-xl" : "w-80 shadow-lg"}
          ${isExpanded ? "max-h-[90vh]" : "max-h-24"}
          overflow-hidden text-pink-500
        `}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 bg-white border-b border-gray-200 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-3 flex-grow min-w-0">
            <div
              className={`w-2 h-2 rounded-full ${getStatusColor(
                response.status
              )}`}
            />
            <span className="font-medium">{response.method}</span>
            <span className="text-gray-600 truncate">{response.url}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{response.timing?.duration}ms</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Hash className="w-4 h-4" />
              <span>{response.status}</span>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "calc(90vh - 130px)" }}
          >
            {/* Tabs */}
            <div className="flex space-x-4 p-4">
              {(["data", "headers", "schema"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`
                    px-3 py-1 rounded-md text-sm font-medium transition-colors
                    flex items-center space-x-2
                    ${
                      activeTab === tab
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }
                  `}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "data" && <Eye className="w-4 h-4" />}
                  {tab === "headers" && <Hash className="w-4 h-4" />}
                  {tab === "schema" && <Code className="w-4 h-4" />}
                  <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="px-4 pb-4">{renderContent()}</div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white mt-4">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(response.timestamp)}</span>
                </div>
                {response.cache && (
                  <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                    Cached
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ApiResponsePanel;
