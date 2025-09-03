import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import JsonViewer from './JsonViewer';
import logoIcon from "../../assets/bug.png";
import { Panel } from '../../panel/Panel';


interface IndicatorData {
  id: string;
  url: string;
  method: string;
  status: number;
  timing?: {
    duration: number;
  };
  headers?: Record<string, string>;
  response?: any;
  body?: any;
  duration: number;
  request: any;
}

const IndicatorFloatingWindow: React.FC = () => {
  const [indicatorData, setIndicatorData] = useState<IndicatorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    console.log('🚀 Floating window loaded!');
    
    // קבלת הדאטה מה-URL
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get('data');
    
    console.log('🔍 URL Parameters:', dataParam?.substring(0, 100) + '...');
    
    if (dataParam) {
      try {
        // ניסיון ראשון - פרסור רגיל
        const parsedData = JSON.parse(decodeURIComponent(dataParam));
        console.log('📦 Received raw data:', parsedData);
        
        const actualIndicatorData = parsedData.indicatorData || parsedData;
        console.log('📊 Extracted indicator data:', actualIndicatorData);
        
        setIndicatorData(actualIndicatorData);
        setIsLoading(false);
        return;
        
      } catch (error) {
        console.error('❌ First parsing attempt failed:', error);
        
        try {
          // ניסיון שני - אולי הדאטה כבר decoded
          const parsedData = JSON.parse(dataParam);
          console.log('📦 Second attempt - parsed data:', parsedData);
          
          const actualIndicatorData = parsedData.indicatorData || parsedData;
          setIndicatorData(actualIndicatorData);
          setIsLoading(false);
          return;
          
        } catch (secondError) {
          console.error('❌ Second parsing attempt also failed:', secondError);
          
          // ניסיון שלישי - fallback לדאטה מוגבלת
          setIndicatorData({
            url: 'Data parsing failed',
            method: 'UNKNOWN',
            status: 0, // @ts-ignore
            error: 'Could not parse indicator data from URL'
          });
          setIsLoading(false);
        }
      }
    } else {
      console.warn('⚠️ No data parameter found in URL');
      setIndicatorData({
        url: 'No data provided',
        method: 'UNKNOWN', 
        status: 0,  // @ts-ignore
        error: 'No data parameter in URL'
      });
      setIsLoading(false);
    }
  }, []);

  const closeWindow = () => {
    console.log('🔴 Closing window');
    window.close();
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 300 && status < 400) return 'text-yellow-500';
    if (status >= 400) return 'text-red-500';
    return 'text-gray-500';
  };

  const handleReloadIndicator = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "RELOAD_INDICATORS" });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-50">
        <div className="text-center">
          <div className="bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent text-3xl font-bold mb-4">
            🚀 Loading...
          </div>
          <div className="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!indicatorData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-rose-50">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="text-red-500 text-3xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Data Found</h2>
          <p className="text-gray-600 mb-6">Could not load indicator data from URL parameters</p>
          <button 
            onClick={closeWindow}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  if (showPanel) {
    return (
      <div className="w-screen h-screen bg-white">
        <Panel />
      </div>
    );
   }

  return (
    <div className="w-screen max-w-screen min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              title='Reload Indicator'
              onClick={handleReloadIndicator}
            src={logoIcon} alt="Indi API" className="w-8 h-8 rounded drop-shadow-lg cursor-pointer" />
            <div>
              {/* // lets add a button to show our panel here */}
              <h1 className="text-2xl font-bold">🎯 Indicator Details</h1>
              <h3 onClick={() => setShowPanel(true)} className="cursor-pointer text-blue-500 hover:underline">Go back to panel</h3>
              <p className="text-pink-100">
                {indicatorData.method} • Status: {indicatorData.status}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
            📊 Request Information
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* URL */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">🌐 URL</label>
              <div className="p-3 bg-gray-50 rounded-lg font-mono text-sm break-all text-red-400">
                {indicatorData?.request?.request?.url ?? indicatorData?.url ?? 'Unknown URL'}
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🔧 Method</label>
              <div className="p-3 bg-blue-50 rounded-lg">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded font-medium">
                  {indicatorData?.method ?? 'Unknown Method'}
                </span>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">📈 Status</label>
              <div className="p-3 bg-green-50 rounded-lg">
                <span className={`px-3 py-1 rounded font-medium ${getStatusColor(indicatorData.status)}`}>
                  {indicatorData.status >= 200 && indicatorData.status < 300 && <CheckCircle className="w-4 h-4 inline mr-1" />}
                  {indicatorData.status >= 400 && <XCircle className="w-4 h-4 inline mr-1" />}
                  {indicatorData.status}
                </span>
              </div>
            </div>

            {/* Timing */}
            {indicatorData.timing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">⏱️ Duration</label>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
                    <Clock className="w-4 h-4 inline mr-1" />
                    {Math.round(indicatorData.duration)}ms
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Headers */}
          {indicatorData.headers && (
            <div className="mt-6">
              <JsonViewer 
                data={indicatorData.headers}
                viewerId="headers"
                title="📋 Headers"
                maxHeight="300px"
              />
            </div>
          )}

          {/* Response */}
         {indicatorData.body && (
            <div className="mt-6">
              <JsonViewer 
                data={(() => {
                  // ניסיון לפרסר את ה-body אם הוא string
                  if (indicatorData.body.body && typeof indicatorData.body.body === 'string') {
                    try {
                      return JSON.parse(indicatorData.body.body);
                    } catch (error) {
                      console.warn('Could not parse response body as JSON:', error);
                      return indicatorData.body.body;
                    }
                  }
                  // אם אין body, להציג את כל ה-response
                  return indicatorData.response.body || indicatorData.response;
                })()}
                viewerId="response"
                title="📄 Response Body"
                maxHeight="800px"
              />
            </div>
          )}

          {/* Raw Data Debug */}
          <div className="mt-8">
            <JsonViewer 
              data={indicatorData}
              viewerId="debug"
              title="🔍 All Data (Debug)"
              maxHeight="500px"
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default IndicatorFloatingWindow;