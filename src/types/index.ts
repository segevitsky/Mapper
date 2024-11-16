export interface ApiMapping {
    id: string
    elementSelector: string
    apiEndpoint: string
    method: string
    lastResponse?: any
  }
  
  export interface NetworkCall {
    id: string
    url: string
    method: string
    timestamp: number
    status?: number
    response?: any
  }

  export interface ElementMapping {
    id: string;
    elementPath: string;
    elementRect: DOMRect;
    apiCall: NetworkCall;
  }