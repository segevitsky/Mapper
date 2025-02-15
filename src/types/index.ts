export interface ApiMapping {
  id: string;
  elementSelector: string;
  apiEndpoint: string;
  method: string;
  lastResponse?: any;
}

export interface NetworkCall {
  id: string;
  url: string;
  method: string;
  timestamp: number;
  status: number;
  response?: any;
  timing: any;
}

export interface ElementMapping {
  id: string;
  elementPath: string;
  elementRect: DOMRect;
  apiCall: NetworkCall;
}

export type DynamicPattern = {
  dynamicParams: {
    type: "uuid" | "id";
    positions: number[];
  }[];
};
export interface IndicatorData {
  id: string;
  baseUrl: string;
  method: string;
  elementInfo: {
    path: string;
    rect: DOMRect;
  };
  position: {
    top: number;
    left: number;
  };
  lastCall: {
    status: number;
    timing: {
      startTime: number;
      endTime: number;
      duration: number;
    };
    timestamp: number;
    url: string;
    updatedInThisRound?: boolean;
  };
  pattern?: DynamicPattern;
  updatedPosition?: string;
  offset?: {
    top: number;
    left: number;
  };
  calls: NetworkCall[];
  hisDaddyElement?: any;
  body?: any;
  updatedThisRound?: boolean;
}

export type MovementObject = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type NetworkRequest = {
  failed?: boolean;
  errorText?: string;
  body: {
    base64Encoded: boolean;
    body: string;
  };
  headers: Record<string, string>;
  request: {
    documentURL: string;
    frameId: string;
    hasUserGesture: boolean;
    initiator: {
      type: string;
      stack?: {
        callFrames: Array<{
          functionName: string;
          scriptId: string;
          url: string;
          lineNumber: number;
          columnNumber: number;
        }>;
      };
    };
    loaderId: string;
    method: string;
    url: string;
  };
  response: {
    alternateProtocolUsage: string;
    charset: string;
    connectionId: number;
    connectionReused: boolean;
    encodedDataLength: number;
    status: number;
    timing: {
      sendStart: number;
      sendEnd: number;
      receiveHeadersEnd: number;
    };
    url: string;
    response: any;
  };
  timing: number;
  duration: number;
};
