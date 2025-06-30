import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Clock, Shield, AlertTriangle, CheckCircle, XCircle, Eye, Trash2, Search } from 'lucide-react';

interface IndicatorData {
  id: string;
  baseUrl: string;
  method: string;
  elementInfo: {
    path: string;
    rect: any;
  };
  lastCall: {
    status: number;
    timing: {
      duration: number;
      startTime?: number;
      endTime?: number;
    };
    timestamp: number;
    url: string;
  };
  position: {
    top: number;
    left: number;
  };
  calls?: any[];
  pattern?: string;
  offset?: {
    top: number;
    left: number;
  };
  updatedPosition?: string;
}

interface IndicatorsOverviewProps {
  isVisible: boolean;
  indicators?: Record<string, IndicatorData[]>;
  onClose: () => void;
  onDeleteIndicator: (indicatorId: string) => void;
  onNavigateToIndicator: (indicator: IndicatorData) => void;
}

const IndicatorsOverview: React.FC<IndicatorsOverviewProps> = ({
  isVisible,
  indicators,
  onClose,
  onDeleteIndicator,
  onNavigateToIndicator
}) => {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<'all' | 'errors' | 'slow'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'duration' | 'status'>('timestamp');

  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
    }
  }, [isVisible]);

  const togglePageExpansion = (pagePath: string) => {
    const newExpanded = new Set(expandedPages);
    if (newExpanded.has(pagePath)) {
      newExpanded.delete(pagePath);
    } else {
      newExpanded.add(pagePath);
    }
    setExpandedPages(newExpanded);
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400) return 'text-red-600';
    if (status >= 300) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getStatusIcon = (status: number) => {
    if (status >= 200 && status < 300) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status >= 400) return <XCircle className="w-4 h-4 text-red-600" />;
    return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
  };

  const getDurationColor = (duration: number) => {
    if (duration < 300) return 'text-green-600';
    if (duration < 1000) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDuration = (duration: number | undefined) => {
    if (!duration || typeof duration !== 'number') return '0ms';
    if (duration < 1000) return `${Math.round(duration)}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: number | undefined) => {
    if (!timestamp || typeof timestamp !== 'number') return 'Unknown';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getAllIndicators = () => {
    const allIndicators: (IndicatorData & { pagePath: string })[] = [];
    if (!indicators || typeof indicators !== 'object') {
      return allIndicators;
    }
    
    Object.entries(indicators).forEach(([pagePath, pageIndicators]) => {
      if (Array.isArray(pageIndicators)) {
        pageIndicators.forEach(indicator => {
          if (indicator && indicator.id) {
            allIndicators.push({ ...indicator, pagePath });
          }
        });
      }
    });
    return allIndicators;
  };

  const filterIndicators = (allIndicators: (IndicatorData & { pagePath: string })[]) => {
    if (!Array.isArray(allIndicators)) {
      return [];
    }
    
    let filtered = allIndicators.filter(ind => 
      ind && 
      ind.lastCall && 
      typeof ind.lastCall.status === 'number' && 
      ind.lastCall.timing && 
      typeof ind.lastCall.timing.duration === 'number'
    );

    // Filter by tab
    if (selectedTab === 'errors') {
      filtered = filtered.filter(ind => ind.lastCall.status >= 400);
    } else if (selectedTab === 'slow') {
      filtered = filtered.filter(ind => ind.lastCall.timing.duration > 1000);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(ind => 
        (ind.lastCall.url && ind.lastCall.url.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ind.method && ind.method.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ind.pagePath && ind.pagePath.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'duration':
          return (b.lastCall?.timing?.duration || 0) - (a.lastCall?.timing?.duration || 0);
        case 'status':
          return (b.lastCall?.status || 0) - (a.lastCall?.status || 0);
        default:
          return (b.lastCall?.timestamp || 0) - (a.lastCall?.timestamp || 0);
      }
    });

    return filtered;
  };

  const allIndicators = getAllIndicators();
  const filteredIndicators = filterIndicators(allIndicators);
  const totalIndicators = allIndicators.length;
  const errorCount = allIndicators.filter(ind => ind?.lastCall?.status >= 400).length;
  const slowCount = allIndicators.filter(ind => ind?.lastCall?.timing?.duration > 1000).length;

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 bg-white z-50 transform transition-all duration-500 ease-out flex flex-col ${
        isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      style={{ 
        animation: isAnimating ? 'slideInUp 0.5s ease-out forwards' : undefined 
      }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-4 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Indicators Overview</h1>
            <p className="text-pink-100 text-sm">
              {totalIndicators} total indicators • {errorCount} errors • {slowCount} slow
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-pink-200 text-2xl font-bold p-2 hover:bg-pink-600 rounded-lg transition-colors"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mt-4">
          {[
            { key: 'all', label: 'All', count: totalIndicators },
            { key: 'errors', label: 'Errors', count: errorCount },
            { key: 'slow', label: 'Slow', count: slowCount }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTab === tab.key
                  ? 'bg-white text-pink-600 shadow-md'
                  : 'bg-pink-600 text-white hover:bg-pink-700'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search indicators..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
          >
            <option value="timestamp">Sort by Time</option>
            <option value="duration">Sort by Duration</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
        {filteredIndicators.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">No indicators found</p>
            <p className="text-sm">Try adjusting your filters or search term</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Group by page */}
            {Object.entries(
              filteredIndicators.reduce((acc, indicator) => {
                if (!acc[indicator.pagePath]) acc[indicator.pagePath] = [];
                acc[indicator.pagePath].push(indicator);
                return acc;
              }, {} as Record<string, (IndicatorData & { pagePath: string })[]>)
            ).map(([pagePath, pageIndicators]) => (
              <div key={pagePath} className="bg-white rounded-lg shadow-sm border border-gray-200">
                {/* Page Header */}
                <div
                  className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => togglePageExpansion(pagePath)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {expandedPages.has(pagePath) ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{pagePath}</h3>
                        <p className="text-sm text-gray-600">{pageIndicators.length} indicators</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {pageIndicators.some(ind => ind?.lastCall?.status >= 400) && (
                        <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                          {pageIndicators.filter(ind => ind?.lastCall?.status >= 400).length} errors
                        </span>
                      )}
                      {pageIndicators.some(ind => ind?.lastCall?.timing?.duration > 1000) && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                          {pageIndicators.filter(ind => ind?.lastCall?.timing?.duration > 1000).length} slow
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Page Indicators */}
                {expandedPages.has(pagePath) && (
                  <div className="divide-y divide-gray-100">
                    {pageIndicators.map((indicator) => (
                      <div
                        key={indicator.id}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {/* Method and URL */}
                            <div className="flex items-center space-x-3 mb-2">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {indicator.method || 'GET'}
                              </span>
                              {getStatusIcon(indicator.lastCall?.status || 0)}
                              <span className={`text-sm font-medium ${getStatusColor(indicator.lastCall?.status || 0)}`}>
                                {indicator.lastCall?.status || 'Unknown'}
                              </span>
                            </div>

                            <p className="text-sm text-gray-900 truncate mb-2" title={indicator.lastCall?.url || ''}>
                              {indicator.lastCall?.url || 'No URL'}
                            </p>

                            {/* Metrics */}
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span className={getDurationColor(indicator.lastCall?.timing?.duration || 0)}>
                                  {formatDuration(indicator.lastCall?.timing?.duration)}
                                </span>
                              </div>
                              <span>{formatTimestamp(indicator.lastCall?.timestamp)}</span>
                              <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {indicator.elementInfo?.path?.split(' > ').pop() || 'Unknown element'}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => onNavigateToIndicator(indicator)}
                              className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                              title="Navigate to indicator"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onDeleteIndicator(indicator.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete indicator"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default IndicatorsOverview;