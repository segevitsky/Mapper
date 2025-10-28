import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Clock, Shield, AlertTriangle, CheckCircle, XCircle, Eye, Trash2, Search, ArrowRight, Check, X } from 'lucide-react';

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
  name?: string;
  description?: string;
}

interface IndicatorsOverviewProps {
  isVisible: boolean;
  indicators?: Record<string, IndicatorData[]>;
  onClose: () => void;
  onNavigateToIndicator: (indicator: IndicatorData) => void;
}

// Move Dropdown Component
const MoveDropdown = ({ 
  indicator, 
  currentCategory, 
  availableCategories, 
  onMove, 
  isOpen, 
  onClose 
}: { 
  indicator: IndicatorData, 
  currentCategory: string, 
  availableCategories: string[], 
  onMove: (indicatorId: string, fromCategory: string, toCategory: string) => void, 
  isOpen: boolean, 
  onClose: () => void 
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px]"
    >
      <div className="p-2">
        <div className="text-xs font-medium text-gray-500 mb-2 px-2">
          Move to category:
        </div>
        {availableCategories
          .filter(category => category !== currentCategory)
          .map(category => (
            <button
              key={category}
              onClick={() => {
                if (category === 'Create New') {
                  // on click needs to become an input field to create a new category with a button to save or we should open a modal
                  return;
                }
                onMove(indicator.id, currentCategory, category)
              }}
              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-gray-100 flex items-center justify-between group transition-colors"
            >
              <span className='group-hover:text-pink-500'>{splitSmart(category)}</span>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-pink-500" />
            </button>
          ))}
      </div>
    </div>
  );
};

function splitSmart(input: string): string {
  return input
    .split(/[-_.]/)
    .flatMap(part =>
      part.split(/(?=[A-Z])/)
    )
    .filter(Boolean).join(" ");
}

const IndicatorsOverview: React.FC<IndicatorsOverviewProps> = ({
  isVisible,
  indicators,
  onClose,
  onNavigateToIndicator
}) => {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<'all' | 'errors' | 'slow'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'duration' | 'status'>('timestamp');
  const [openMoveDropdown, setOpenMoveDropdown] = useState<string | null>(null);
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

const handleDeleteIndicator = (indicatorId: string, fromCategory: string) => {
  if (!indicators || !indicators[fromCategory]) return;

  const updatedIndicators = { ...indicators };
  
  updatedIndicators[fromCategory] = updatedIndicators[fromCategory].filter(
    ind => ind.id !== indicatorId
  );

  if (updatedIndicators[fromCategory].length === 0) {
    delete updatedIndicators[fromCategory];
  }

  chrome.storage.local.set({ indicators: updatedIndicators }, () => {
    console.log(`Indicator ${indicatorId} deleted from ${fromCategory}`);
  });
};


  // Move indicator between categories
  const handleMoveIndicator = (indicatorId: string, fromCategory: string, toCategory: string) => {
    if (!indicators) return;

    const indicatorToMove = indicators[fromCategory]?.find(ind => ind.id === indicatorId);
    if (!indicatorToMove) return;

    const updatedIndicators = { ...indicators };
    
    // הסרה מהקטגוריה הישנה
    updatedIndicators[fromCategory] = updatedIndicators[fromCategory].filter(
      ind => ind.id !== indicatorId
    );

    // הוספה לקטגוריה החדשה
    if (!updatedIndicators[toCategory]) {
      updatedIndicators[toCategory] = [];
    }
    
    // עדכון baseUrl של האינדיקטור לקטגוריה החדשה
    const movedIndicator = {
      ...indicatorToMove,
      baseUrl: toCategory
    };
    
    updatedIndicators[toCategory].push(movedIndicator);

    // עדכון ה-storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ indicators: updatedIndicators }, () => {
        console.log(`Indicator ${indicatorId} moved from ${fromCategory} to ${toCategory}`);
      });
    }

    // סגירת הדרופדאון
    setOpenMoveDropdown(null);
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
    return new Date(timestamp).toLocaleTimeString() + ' ' + new Date(timestamp).toLocaleDateString();
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

    // More lenient filter - only require basic structure, not perfect timing data
    let filtered = allIndicators.filter(ind =>
      ind &&
      ind.lastCall
      // Don't require timing.duration - some indicators might not have it yet
    );

    if (selectedTab === 'errors') {
      filtered = filtered.filter(ind => ind.lastCall.status >= 400);
    } else if (selectedTab === 'slow') {
      // Safely check for slow APIs - handle different timing structures
      filtered = filtered.filter(ind => {
        const timing = ind.lastCall?.timing;
        if (!timing) return false;

        // Handle timing as object with duration
        if (typeof timing === 'object' && typeof timing.duration === 'number') {
          return timing.duration > 1000;
        }

        // Handle timing as number directly
        if (typeof timing === 'number') {
          return timing > 1000;
        }

        return false;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter(ind => 
        (ind.lastCall.url && ind.lastCall.url.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ind.method && ind.method.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ind.pagePath && ind.pagePath.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

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

  const deleteCategory = (pagePath: string) => {
    if (!indicators || !indicators[pagePath]) return;
    const updatedIndicators = { ...indicators };
    delete updatedIndicators[pagePath];
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ indicators: updatedIndicators }, () => {
        console.log(`Category ${pagePath} deleted successfully.`);
      });
    }
  };

  const allIndicators = getAllIndicators();
  const filteredIndicators = filterIndicators(allIndicators);
  const totalIndicators = allIndicators.length;
  const errorCount = allIndicators.filter(ind => ind?.lastCall?.status >= 400).length;

  // Safely count slow indicators - handle different timing structures
  const slowCount = allIndicators.filter(ind => {
    const timing = ind?.lastCall?.timing;
    if (!timing) return false;

    // Handle timing as object with duration
    if (typeof timing === 'object' && typeof timing.duration === 'number') {
      return timing.duration > 1000;
    }

    // Handle timing as number directly
    if (typeof timing === 'number') {
      return timing > 1000;
    }

    return false;
  }).length;

  const availableCategories = indicators ? [...Object.keys(indicators), 'global', 'Create New'] : ['global', 'Create New'];

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
      <div className="bg-gradient-to-r from-[#ff8177] via-[#f99185] to-[#b12a5b] text-white p-4 shadow-lg flex-shrink-0">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Indicators Overview</h1>
            <p className="text-pink-100 text-sm">
              {totalIndicators} total indicators • {errorCount} errors • {slowCount} slow
            </p>
          </div>
          <button
            onClick={onClose}
            className="shadow-sm bg-none hover:text-pink-200 text-2xl font-bold p-2 hover:bg-pink-600 rounded-lg transition-colors "
          >
            <X />
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
                        <div className='flex justify-between items-center text-gray-600 w-[80vw]'> 
                          <h3 className="font-semibold text-gray-900">{splitSmart(pagePath)}</h3>
                          <div 
                            className='flex items-center hover:text-red-600 cursor-pointer' 
                            onClick={(e: any) => {
                              e.stopPropagation();
                              deleteCategory(pagePath);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            <p>Delete Category</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">{pageIndicators.length} indicators</p>
                      </div>
                    </div>
                  </div>
                  <br />
                    <div className="flex space-x-2">
                      {pageIndicators.some(ind => ind?.lastCall?.status >= 400) && (
                        <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                          {pageIndicators.filter(ind => ind?.lastCall?.status >= 400).length} errors
                        </span>
                      )}
                      {pageIndicators.some(ind => {
                        const timing = ind?.lastCall?.timing;
                        if (!timing) return false;
                        if (typeof timing === 'object' && typeof timing.duration === 'number') return timing.duration > 1000;
                        if (typeof timing === 'number') return timing > 1000;
                        return false;
                      }) && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                          {pageIndicators.filter(ind => {
                            const timing = ind?.lastCall?.timing;
                            if (!timing) return false;
                            if (typeof timing === 'object' && typeof timing.duration === 'number') return timing.duration > 1000;
                            if (typeof timing === 'number') return timing > 1000;
                            return false;
                          }).length} slow
                        </span>
                      )}
                    </div>
                </div>

                {/* Page Indicators */}
                {expandedPages.has(pagePath) && (
                  <div className="divide-y divide-gray-100">
                    {pageIndicators.map((indicator, index: number) => (
                      <div
                        key={indicator.id}
                        className="p-4 hover:bg-gray-50 transition-colors relative"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className='text-[#f43f5e] mb-2 font-bold'>
                              {indicator?.name ?? `Indicator #${index}`}
                            </div>
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
                            {/* Move Button */}
                            {availableCategories.length > 1 && (
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMoveDropdown(
                                    openMoveDropdown === indicator.id ? null : indicator.id
                                  )}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Move to another category"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                                
                                <MoveDropdown
                                  indicator={indicator}
                                  currentCategory={pagePath}
                                  availableCategories={availableCategories}
                                  onMove={handleMoveIndicator}
                                  isOpen={openMoveDropdown === indicator.id}
                                  onClose={() => setOpenMoveDropdown(null)}
                                />
                              </div>
                            )}

                            <button
                              onClick={() => onNavigateToIndicator(indicator)}
                              className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                              title="Navigate to indicator"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteIndicator(indicator.id, pagePath)}
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