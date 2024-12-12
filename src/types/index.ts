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
  };
  pattern?: DynamicPattern;
  updatedPosition?: string;
  offset?: {
    top: number;
    left: number;
  };
}

export type MovementObject = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
