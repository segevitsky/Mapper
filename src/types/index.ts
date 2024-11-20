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
  status?: number;
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
  pageUrl: string;
  position: {
    top: number;
    left: number;
  };
  element: {
    path: string;
    rect: DOMRect;
  };
  apiCall: {
    id: string;
    method: string;
    url: string;
    status: number;
    timing: {
      duration: number;
    };
  };
}
