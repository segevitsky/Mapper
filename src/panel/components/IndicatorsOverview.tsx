import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Clock, Shield, AlertTriangle, CheckCircle, XCircle, Eye, Trash2, Search, ArrowRight, Check, X, Grid3x3 } from 'lucide-react';

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
      className={`fixed inset-0 w-full max-w-full bg-gradient-to-br from-pink-50 via-rose-50 to-purple-50 z-50 transform transition-all duration-500 ease-out flex flex-col overflow-x-hidden ${
        isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      style={{
        animation: isAnimating ? 'slideInUp 0.5s ease-out forwards' : undefined
      }}
    >
      {/* Header */}
      <div className="w-full max-w-full bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 text-white p-6 shadow-2xl flex-shrink-0 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm animate-pulse">
              <Grid3x3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="font-headline text-3xl font-bold">🎯 Indicators Overview</h1>
              <p className="text-pink-100 text-sm mt-1">
                {totalIndicators} total • {errorCount} errors • {slowCount} slow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 hover:rotate-90"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-3 mt-6">
          {[
            { key: 'all', label: 'All', count: totalIndicators, icon: Grid3x3 },
            { key: 'errors', label: 'Errors', count: errorCount, icon: XCircle },
            { key: 'slow', label: 'Slow', count: slowCount, icon: Clock }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedTab(tab.key as any)}
                className={`px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 transform hover:scale-105 flex items-center gap-2 ${
                  selectedTab === tab.key
                    ? 'bg-white text-pink-600 shadow-xl scale-105'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="w-full max-w-full p-6 bg-white/50 backdrop-blur-sm border-b border-pink-200 flex-shrink-0 overflow-hidden">
        <div className="w-full max-w-full flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-center">
          <div className="flex-1 min-w-0 max-w-full">
            <div className="w-full max-w-full relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-pink-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search indicators..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-full pl-12 pr-4 py-3 border-2 border-pink-200 rounded-full focus:ring-4 focus:ring-pink-200 focus:border-pink-400 transition-all duration-300 bg-white shadow-lg"
              />
            </div>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-6 py-3 border-2 border-pink-200 rounded-full focus:ring-4 focus:ring-pink-200 focus:border-pink-400 bg-white font-semibold text-gray-700 shadow-lg cursor-pointer hover:border-pink-300 transition-all duration-300"
          >
            <option value="timestamp">⏰ Sort by Time</option>
            <option value="duration">⚡ Sort by Duration</option>
            <option value="status">📊 Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden p-6" style={{ minHeight: 0 }}>
        {filteredIndicators.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-pink-100 to-purple-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-pink-400" />
            </div>
            <p className="text-2xl font-bold text-gray-700 mb-2">No indicators found</p>
            <p className="text-gray-500">Try adjusting your filters or search term</p>
          </div>
        ) : (
          <div className="w-full max-w-full space-y-4">
            {Object.entries(
              filteredIndicators.reduce((acc, indicator) => {
                if (!acc[indicator.pagePath]) acc[indicator.pagePath] = [];
                acc[indicator.pagePath].push(indicator);
                return acc;
              }, {} as Record<string, (IndicatorData & { pagePath: string })[]>)
            ).map(([pagePath, pageIndicators]) => (
              <div key={pagePath} className="w-full max-w-full bg-white rounded-3xl shadow-xl border-2 border-pink-100 overflow-hidden hover:shadow-2xl transition-all duration-300">
                {/* Page Header */}
                <div
                  className="w-full max-w-full p-6 bg-gradient-to-r from-purple-100 to-pink-100 cursor-pointer hover:from-purple-200 hover:to-pink-200 transition-all duration-300 overflow-hidden"
                  onClick={() => togglePageExpansion(pagePath)}
                >
                  <div className="w-full max-w-full flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-r from-purple-400 to-pink-500 flex items-center justify-center shadow-lg transition-transform duration-300 ${
                        expandedPages.has(pagePath) ? 'rotate-180' : ''
                      }`}>
                        <ChevronDown className="w-6 h-6 text-white" strokeWidth={3} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className='flex justify-between items-center gap-4'>
                          <h3 className="font-bold text-xl text-gray-900 truncate">{splitSmart(pagePath)}</h3>
                          <button
                            className='flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-full font-semibold transition-all duration-300 hover:scale-105'
                            onClick={(e: any) => {
                              e.stopPropagation();
                              deleteCategory(pagePath);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 font-semibold">{pageIndicators.length} indicator{pageIndicators.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {pageIndicators.some(ind => ind?.lastCall?.status >= 400) && (
                      <span className="bg-red-200 text-red-800 text-xs px-4 py-2 rounded-full font-bold flex items-center gap-1">
                        <XCircle className="w-4 h-4" />
                        {pageIndicators.filter(ind => ind?.lastCall?.status >= 400).length} error{pageIndicators.filter(ind => ind?.lastCall?.status >= 400).length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {pageIndicators.some(ind => {
                      const timing = ind?.lastCall?.timing;
                      if (!timing) return false;
                      if (typeof timing === 'object' && typeof timing.duration === 'number') return timing.duration > 1000;
                      if (typeof timing === 'number') return timing > 1000;
                      return false;
                    }) && (
                      <span className="bg-yellow-200 text-yellow-800 text-xs px-4 py-2 rounded-full font-bold flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {pageIndicators.filter(ind => {
                          const timing = ind?.lastCall?.timing;
                          if (!timing) return false;
                          if (typeof timing === 'object' && typeof timing.duration === 'number') return timing.duration > 1000;
                          if (typeof timing === 'number') return timing > 1000;
                          return false;
                        }).length} slow
                      </span>
                    )}
                    {pageIndicators.every(ind => ind?.lastCall?.status >= 200 && ind?.lastCall?.status < 300) && (
                      <span className="bg-green-200 text-green-800 text-xs px-4 py-2 rounded-full font-bold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        All healthy
                      </span>
                    )}
                  </div>
                </div>

                {/* Page Indicators */}
                {expandedPages.has(pagePath) && (
                  <div className="w-full max-w-full p-4 space-y-3 bg-gradient-to-br from-gray-50 to-pink-50 overflow-hidden">
                    {pageIndicators.map((indicator, index: number) => (
                      <div
                        key={indicator.id}
                        className="w-full max-w-full bg-white rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:scale-[1.01] border-2 border-gray-100 hover:border-pink-200 overflow-hidden"
                      >
                        <div className="w-full max-w-full flex items-start justify-between gap-4 min-w-0">
                          <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                            <div className='flex items-center gap-3 mb-3'>
                              <div className="w-10 h-10 bg-gradient-to-r from-pink-400 to-rose-500 rounded-full flex items-center justify-center shadow-lg">
                                <span className="text-white font-bold text-lg">{index + 1}</span>
                              </div>
                              <h4 className='text-lg font-bold text-pink-600'>
                                {indicator?.name ?? `Indicator #${index + 1}`}
                              </h4>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800 border border-blue-200">
                                {indicator.method || 'GET'}
                              </span>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(indicator.lastCall?.status || 0)}
                                <span className={`text-sm font-bold ${getStatusColor(indicator.lastCall?.status || 0)}`}>
                                  {indicator.lastCall?.status || 'Unknown'}
                                </span>
                              </div>
                            </div>

                            <div
                              className="bg-gradient-to-r from-gray-50 to-pink-50 rounded-xl p-3 mb-3 border border-gray-200 cursor-help overflow-hidden"
                              title={indicator.lastCall?.url || 'No URL'}
                            >
                              <div className="text-xs text-gray-700 font-mono truncate">
                                {indicator.lastCall?.url || 'No URL'}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              <div className="flex items-center gap-1 px-3 py-1 bg-purple-100 rounded-full">
                                <Clock className="w-4 h-4 text-purple-600" />
                                <span className={`font-bold ${getDurationColor(indicator.lastCall?.timing?.duration || 0)}`}>
                                  {formatDuration(indicator.lastCall?.timing?.duration)}
                                </span>
                              </div>
                              <span className="text-gray-600 font-semibold">{formatTimestamp(indicator.lastCall?.timestamp)}</span>
                              <span className="text-xs bg-gray-100 px-3 py-1 rounded-full font-semibold text-gray-600 border border-gray-200">
                                {indicator.elementInfo?.path?.split(' > ').pop() || 'Unknown element'}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-2">
                            {/* Move Button */}
                            {/* {availableCategories.length > 1 && (
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMoveDropdown(
                                    openMoveDropdown === indicator.id ? null : indicator.id
                                  )}
                                  className="w-10 h-10 flex items-center justify-center text-blue-600 hover:bg-blue-100 rounded-full transition-all duration-300 hover:scale-110"
                                  title="Move to another category"
                                >
                                  <ArrowRight className="w-5 h-5" />
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
                            )} */}

                            <button
                              onClick={() => onNavigateToIndicator(indicator)}
                              className="w-10 h-10 flex items-center justify-center text-pink-600 hover:bg-pink-100 rounded-full transition-all duration-300 hover:scale-110"
                              title="Navigate to indicator"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteIndicator(indicator.id, pagePath)}
                              className="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-100 rounded-full transition-all duration-300 hover:scale-110"
                              title="Delete indicator"
                            >
                              <Trash2 className="w-5 h-5" />
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