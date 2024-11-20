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

export interface IndicatorData {
  id: string;
  baseUrl: string; // URL מנורמל
  method: string;
  elementInfo: {
    path: string;
    rect: DOMRect;
  };
  position: {
    top: number;
    left: number;
  };
  apiCall?: {
    url: string;
    method: string;
    timing?: {
      duration?: number;
    };
  };
  lastCall: {
    status: number;
    timing: number;
    timestamp: number;
    url?: string;
  };
}
