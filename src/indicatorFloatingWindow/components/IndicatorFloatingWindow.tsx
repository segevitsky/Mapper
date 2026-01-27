import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
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
  schema?: string;
}

const IndicatorFloatingWindow: React.FC = () => {
  const [indicatorData, setIndicatorData] = useState<IndicatorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);

  // Accordion state for each section
  const [expandedSections, setExpandedSections] = useState({
    body: true,      // Body starts open
    overview: true,  // Overview starts open
    headers: false,
    debug: false,
    schema: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    
    // קבלת הדאטה מה-URL
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get('data');

    if (dataParam) {
      try {
        // ניסיון ראשון - פרסור רגיל
        const parsedData = JSON.parse(decodeURIComponent(dataParam));

        let actualIndicatorData = parsedData.indicatorData || parsedData;

        // Normalize body structure - extract from nested locations
        // Note: response field contains CDP metadata (alternateProtocolUsage, etc.), NOT the body
        // The actual body is in the 'body' field, which is { base64Encoded: boolean, body: string }
        if (!actualIndicatorData.body) {
          // Try to get body from calls array if available
          if (actualIndicatorData.calls?.length > 0) {
            const lastCall = actualIndicatorData.calls[actualIndicatorData.calls.length - 1];
            if (lastCall?.body) {
              actualIndicatorData.body = lastCall.body;
            }
          }
          // Note: Do NOT fallback to response.body or response.response
          // as 'response' contains CDP metadata, not the actual response body
        }

        // Unwrap nested body structure: { base64Encoded: false, body: "..." }
        if (actualIndicatorData.body && typeof actualIndicatorData.body === 'object' && actualIndicatorData.body.body) {
          let bodyContent = actualIndicatorData.body.body;

          // Decode base64 if needed
          if (actualIndicatorData.body.base64Encoded && typeof bodyContent === 'string') {
            try {
              bodyContent = atob(bodyContent);
            } catch (e) {
              console.error('Failed to decode base64:', e);
            }
          }

          // Try to parse JSON string
          if (typeof bodyContent === 'string') {
            try {
              bodyContent = JSON.parse(bodyContent);
            } catch {
              // Not JSON, keep as string
            }
          }

          actualIndicatorData.body = bodyContent;
        }

        setIndicatorData(actualIndicatorData);
        setIsLoading(false);
        return;

      } catch (error) {
        console.error('❌ First parsing attempt failed:', error);

        try {
          // ניסיון שני - אולי הדאטה כבר decoded
          const parsedData = JSON.parse(dataParam);

          let actualIndicatorData = parsedData.indicatorData || parsedData;

          // Normalize body structure here too
          // Note: response field contains CDP metadata, NOT the body
          if (!actualIndicatorData.body) {
            // Try to get body from calls array if available
            if (actualIndicatorData.calls?.length > 0) {
              const lastCall = actualIndicatorData.calls[actualIndicatorData.calls.length - 1];
              if (lastCall?.body) {
                actualIndicatorData.body = lastCall.body;
              }
            }
          }

          // Unwrap nested body structure: { base64Encoded: false, body: "..." }
          if (actualIndicatorData.body && typeof actualIndicatorData.body === 'object' && actualIndicatorData.body.body) {
            let bodyContent = actualIndicatorData.body.body;

            // Decode base64 if needed
            if (actualIndicatorData.body.base64Encoded && typeof bodyContent === 'string') {
              try {
                bodyContent = atob(bodyContent);
              } catch (e) {
                console.error('Failed to decode base64:', e);
              }
            }

            // Try to parse JSON string
            if (typeof bodyContent === 'string') {
              try {
                bodyContent = JSON.parse(bodyContent);
              } catch {
                // Not JSON, keep as string
              }
            }

            actualIndicatorData.body = bodyContent;
          }

          setIndicatorData(actualIndicatorData);
          setIsLoading(false);
          return;
          
        } catch (secondError) {
          // ניסיון שלישי - fallback לדאטה מוגבלת
          console.error('❌ All parsing attempts failed:', secondError);
          setIndicatorData({
            url: 'Data parsing failed',
            method: 'ERROR',
            status: 0,
            duration: 0,
            request: {},
            id: 'error',
            // @ts-ignore
            error: 'Could not parse indicator data from URL'
          });
          setIsLoading(false);
        }
      }
    } else {
      console.warn('⚠️ No data parameter found in URL');
      setIndicatorData({
        url: 'No data provided',
        method: 'ERROR',
        status: 0,
        duration: 0,
        request: {},
        id: 'error',
        // @ts-ignore
        error: 'No data parameter in URL'
      });
      setIsLoading(false);
    }
  }, []);

  const closeWindow = () => {
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
              <h1 className="font-headline text-2xl font-bold">🎯 Indicator Details</h1>
              <h3 onClick={() => setShowPanel(true)} className="cursor-pointer text-white hover:underline">Go back to panel</h3>
              <p className="text-pink-100">
                {indicatorData.method} • Status: {indicatorData.status}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(indicatorData as any).error && (
        <div className="mx-6 mt-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <h3 className="text-red-800 font-bold mb-1">Error Loading Data</h3>
              <p className="text-red-600 text-sm">{(indicatorData as any).error}</p>
              <p className="text-red-500 text-xs mt-2">
                Try clicking the indicator again, or check if the API call completed successfully.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Blobi Blob Style! */}
      <div className="p-6 space-y-4">

        {/* 🎯 RESPONSE BODY ACCORDION - The Star! */}
        <div className="group">
          <button
            onClick={() => toggleSection('body')}
            className="w-full bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 hover:from-pink-500 hover:via-rose-500 hover:to-pink-600 text-white rounded-3xl shadow-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-pink-300/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                  <span className="text-3xl">📄</span>
                </div>
                <div className="text-left">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    Response Body
                    <span className="px-3 py-1 bg-white/30 backdrop-blur-sm rounded-full text-xs font-semibold animate-pulse">
                      ⭐ MAIN
                    </span>
                  </h2>
                  <p className="text-pink-100 text-sm">
                    {indicatorData.body ? 'The juicy data you\'re looking for!' : 'No body data available'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-8 h-8 transition-all duration-500 ease-in-out ${
                  expandedSections.body ? 'rotate-180 scale-110' : 'scale-100'
                }`}
                strokeWidth={3}
              />
            </div>
          </button>

          <div className={`overflow-hidden transition-all duration-500 ${expandedSections.body ? 'max-h-[800px] mt-3' : 'max-h-0'}`}>
            <div className="bg-white rounded-2xl shadow-xl p-6 border-4 border-pink-200">
              {indicatorData.body ? (
                <JsonViewer
                  data={indicatorData.body}
                  viewerId="response"
                  title=""
                  maxHeight="700px"
                />
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <h3 className="text-xl font-bold text-gray-700 mb-2">No Response Body</h3>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    This API call didn't return a response body, or it wasn't captured.
                    This can happen with 204 responses, errors, or if the call was made before the extension started monitoring.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className='group'>
          <button
            onClick={() => toggleSection('schema')}
            className="w-full bg-gradient-to-r from-yellow-400 via-violet-400 to-pink-500 hover:from-purple-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-3xl shadow-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-purple-300/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-3xl">📊</span>
                </div>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">Request Schema</h2>
                  <p className="text-purple-100 text-sm">Find out the structure of the request body</p>
                </div>
              </div>
              <ChevronDown
                className={`w-8 h-8 transition-all duration-500 ease-in-out ${
                  expandedSections?.schema ? 'rotate-180 scale-110' : 'scale-100'
                }`}
                strokeWidth={3}
              />
            </div>
          </button>


          {/* // Schema Accordion Content */}
          <div className={`overflow-hidden transition-all duration-500 ${expandedSections.schema ? 'max-h-[600px] mt-3' : 'max-h-0'}`}>
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="grid grid-cols-1 gap-4 mb-6">
                { indicatorData?.schema && (
                  <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6 border-2 border-yellow-300">
                    <div className="text-sm font-bold text-yellow-700 mb-3 flex items-center gap-2">
                      <span>🧩</span>
                      <span>RESPONSE SCHEMA</span>
                    </div>
                    <pre className="text-xs font-mono text-yellow-900 whitespace-pre-wrap overflow-x-auto bg-white p-4 rounded-lg border border-yellow-200">
                      {indicatorData?.schema}
                    </pre>
                  </div>
                )}
                { !indicatorData?.schema && (
                  <div className="bg-gray-100 rounded-2xl p-6 border-2 border-gray-300 text-center">
                    <div className="text-sm text-gray-500">No schema available</div>
                  </div>
                )}
              </div>
            </div>
          </div>


        </div>

        {/* 📊 REQUEST OVERVIEW ACCORDION */}
        <div className="group">
          <button
            onClick={() => toggleSection('overview')}
            className="w-full bg-gradient-to-r from-purple-400 via-violet-400 to-purple-500 hover:from-purple-500 hover:via-violet-500 hover:to-purple-600 text-white rounded-3xl shadow-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-purple-300/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-3xl">📊</span>
                </div>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">Request Overview</h2>
                  <p className="text-purple-100 text-sm">Method, Status, Timing & URL</p>
                </div>
              </div>
              <ChevronDown
                className={`w-8 h-8 transition-all duration-500 ease-in-out ${
                  expandedSections.overview ? 'rotate-180 scale-110' : 'scale-100'
                }`}
                strokeWidth={3}
              />
            </div>
          </button>

          <div className={`overflow-hidden transition-all duration-500 ${expandedSections.overview ? 'max-h-[600px] mt-3' : 'max-h-0'}`}>
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Method Card */}
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-6 border-2 border-blue-300 transform hover:scale-105 transition-transform">
                  <div className="text-xs font-bold text-blue-700 mb-2">🔧 METHOD</div>
                  <div className="text-2xl font-black text-blue-900">{indicatorData?.method ?? 'UNKNOWN'}</div>
                </div>

                {/* Status Card */}
                <div className={`bg-gradient-to-br rounded-2xl p-6 border-2 transform hover:scale-105 transition-transform ${
                  indicatorData.status >= 200 && indicatorData.status < 300
                    ? 'from-green-100 to-green-200 border-green-300'
                    : indicatorData.status >= 400
                    ? 'from-red-100 to-red-200 border-red-300'
                    : 'from-yellow-100 to-yellow-200 border-yellow-300'
                }`}>
                  <div className={`text-xs font-bold mb-2 ${
                    indicatorData.status >= 200 && indicatorData.status < 300 ? 'text-green-700' :
                    indicatorData.status >= 400 ? 'text-red-700' : 'text-yellow-700'
                  }`}>📈 STATUS</div>
                  <div className="flex items-center gap-2">
                    {indicatorData.status >= 200 && indicatorData.status < 300 && <CheckCircle className="w-6 h-6 text-green-600" />}
                    {indicatorData.status >= 400 && <XCircle className="w-6 h-6 text-red-600" />}
                    <span className="text-2xl font-black text-gray-900">{indicatorData.status}</span>
                  </div>
                </div>

                {/* Duration Card */}
                {indicatorData.timing && (
                  <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl p-6 border-2 border-purple-300 transform hover:scale-105 transition-transform">
                    <div className="text-xs font-bold text-purple-700 mb-2">⏱️ DURATION</div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-6 h-6 text-purple-600" />
                      <span className="text-2xl font-black text-purple-900">{Math.round(indicatorData.duration)}ms</span>
                    </div>
                  </div>
                )}
              </div>

              {/* URL Bubble */}
              <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-2xl p-5 border-2 border-pink-200">
                <div className="text-xs font-bold text-pink-700 mb-2">🌐 ENDPOINT</div>
                <div className="font-mono text-sm break-all text-pink-600 font-semibold">
                  {indicatorData?.request?.request?.url ?? indicatorData?.url ?? 'Unknown URL'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 📋 HEADERS ACCORDION */}
        {indicatorData.headers && (
          <div className="group">
            <button
              onClick={() => toggleSection('headers')}
              className="w-full bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 hover:from-blue-500 hover:via-cyan-500 hover:to-blue-600 text-white rounded-3xl shadow-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-blue-300/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-3xl">📋</span>
                  </div>
                  <div className="text-left">
                    <h2 className="text-2xl font-bold">Headers</h2>
                    <p className="text-blue-100 text-sm">Request & Response headers</p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-8 h-8 transition-all duration-500 ease-in-out ${
                    expandedSections.headers ? 'rotate-180 scale-110' : 'scale-100'
                  }`}
                  strokeWidth={3}
                />
              </div>
            </button>

            <div className={`overflow-hidden transition-all duration-500 ${expandedSections.headers ? 'max-h-[500px] mt-3' : 'max-h-0'}`}>
              <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-blue-200">
                <JsonViewer
                  data={indicatorData.headers}
                  viewerId="headers"
                  title=""
                  maxHeight="400px"
                />
              </div>
            </div>
          </div>
        )}

        {/* 🔍 DEBUG ACCORDION */}
        <div className="group">
          <button
            onClick={() => toggleSection('debug')}
            className="w-full bg-gradient-to-r from-gray-400 via-slate-400 to-gray-500 hover:from-gray-500 hover:via-slate-500 hover:to-gray-600 text-white rounded-3xl shadow-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-gray-300/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-3xl">🔍</span>
                </div>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">Debug Data</h2>
                  <p className="text-gray-100 text-sm">All raw data for troubleshooting</p>
                </div>
              </div>
              <ChevronDown
                className={`w-8 h-8 transition-all duration-500 ease-in-out ${
                  expandedSections.debug ? 'rotate-180 scale-110' : 'scale-100'
                }`}
                strokeWidth={3}
              />
            </div>
          </button>

          <div className={`overflow-hidden transition-all duration-500 ${expandedSections.debug ? 'max-h-[600px] mt-3' : 'max-h-0'}`}>
            <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-gray-200">
              <JsonViewer
                data={indicatorData}
                viewerId="debug"
                title=""
                maxHeight="500px"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IndicatorFloatingWindow;