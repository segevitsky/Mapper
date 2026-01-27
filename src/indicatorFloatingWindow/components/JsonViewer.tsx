import React, { useState, useCallback, useEffect, useMemo } from 'react';

interface JsonViewerProps {
  data: any;
  viewerId: string;
  title?: string;
  maxHeight?: string;
}

interface MatchInfo {
  path: string;
  type: 'key' | 'value';
  text: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  viewerId: _viewerId,
  title = "JSON Data",
  maxHeight = "500px"
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<boolean>(true); // true = filter, false = highlight only

  // Find all matches and their paths
  const matches = useMemo((): MatchInfo[] => {
    if (!searchTerm) return [];

    const results: MatchInfo[] = [];
    const searchLower = searchTerm.toLowerCase();

    const findMatches = (obj: any, path: string) => {
      if (typeof obj === 'string' && obj.toLowerCase().includes(searchLower)) {
        results.push({ path, type: 'value', text: obj });
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          findMatches(item, `${path}[${index}]`);
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
          const keyPath = path ? `${path}.${key}` : key;
          if (key.toLowerCase().includes(searchLower)) {
            results.push({ path: keyPath, type: 'key', text: key });
          }
          findMatches(value, keyPath);
        });
      }
    };

    findMatches(data, '');
    return results;
  }, [data, searchTerm]);

  // Paths that contain matches (for filtering)
  const pathsWithMatches = useMemo((): Set<string> => {
    const paths = new Set<string>();
    matches.forEach(match => {
      // Add the match path and all parent paths
      const parts = match.path.split(/\.|\[/).filter(Boolean);
      let currentPath = '';
      paths.add(''); // Root always visible
      parts.forEach((part) => {
        if (part.endsWith(']')) {
          currentPath = currentPath ? `${currentPath}[${part}` : `[${part}`;
        } else {
          currentPath = currentPath ? `${currentPath}.${part}` : part;
        }
        paths.add(currentPath);
      });
    });
    return paths;
  }, [matches]);

  // Auto-expand paths containing matches when search changes
  useEffect(() => {
    if (searchTerm && matches.length > 0) {
      const newExpanded = new Set(expandedPaths);
      pathsWithMatches.forEach(path => newExpanded.add(path));
      setExpandedPaths(newExpanded);
      setCurrentMatchIndex(0);
    }
  }, [searchTerm, matches.length]);

  const togglePath = useCallback((path: string) => {
    const newExpandedPaths = new Set(expandedPaths);
    if (newExpandedPaths.has(path)) {
      newExpandedPaths.delete(path);
    } else {
      newExpandedPaths.add(path);
    }
    setExpandedPaths(newExpandedPaths);
  }, [expandedPaths]);

  const expandAll = useCallback(() => {
    const allPaths = new Set<string>();

    const addAllPaths = (obj: any, currentPath: string) => {
      allPaths.add(currentPath);
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            addAllPaths(item, `${currentPath}[${index}]`);
          }
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          if (typeof value === 'object' && value !== null) {
            addAllPaths(value, currentPath ? `${currentPath}.${key}` : key);
          }
        });
      }
    };

    addAllPaths(data, '');
    setExpandedPaths(allPaths);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(['']));
  }, []);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [data]);

  const navigateMatch = useCallback((direction: 'prev' | 'next') => {
    if (matches.length === 0) return;

    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentMatchIndex + 1) % matches.length;
    } else {
      newIndex = currentMatchIndex === 0 ? matches.length - 1 : currentMatchIndex - 1;
    }
    setCurrentMatchIndex(newIndex);

    // Scroll to the match element
    setTimeout(() => {
      const matchElement = document.querySelector(`[data-match-index="${newIndex}"]`);
      if (matchElement) {
        matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [matches.length, currentMatchIndex]);

  const isHighlighted = useCallback((text: string, path: string, type: 'key' | 'value'): { highlighted: boolean; isCurrent: boolean; matchIndex: number } => {
    if (!searchTerm) return { highlighted: false, isCurrent: false, matchIndex: -1 };

    const isMatch = text.toLowerCase().includes(searchTerm.toLowerCase());
    if (!isMatch) return { highlighted: false, isCurrent: false, matchIndex: -1 };

    const matchIndex = matches.findIndex(m => m.path === path && m.type === type);
    return {
      highlighted: true,
      isCurrent: matchIndex === currentMatchIndex,
      matchIndex
    };
  }, [searchTerm, matches, currentMatchIndex]);

  // Check if a path should be visible (has matches or is parent of match)
  const shouldShowPath = useCallback((path: string): boolean => {
    if (!searchTerm || !filterMode) return true;
    if (pathsWithMatches.has(path)) return true;

    // Check if any child paths have matches
    return Array.from(pathsWithMatches).some(p => p.startsWith(path + '.') || p.startsWith(path + '['));
  }, [searchTerm, filterMode, pathsWithMatches]);

  const renderValue = (value: any, path: string): React.ReactNode => {
    if (value === null) {
      return <span className="text-gray-500 italic">null</span>;
    }

    if (value === undefined) {
      return <span className="text-gray-500 italic">undefined</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-orange-600 font-medium">{String(value)}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-blue-600 font-medium">{value}</span>;
    }

    if (typeof value === 'string') {
      const { highlighted, isCurrent, matchIndex } = isHighlighted(value, path, 'value');
      return (
        <span
          className={`text-green-600 ${highlighted ? (isCurrent ? 'bg-orange-400 text-white px-1 rounded font-bold' : 'bg-yellow-200 px-1 rounded') : ''}`}
          data-match-index={matchIndex >= 0 ? matchIndex : undefined}
        >
          "{value}"
        </span>
      );
    }

    return null;
  };

  const renderJsonNode = (obj: any, path: string = ''): React.ReactNode => {
    // Handle primitive values
    const primitiveValue = renderValue(obj, path);
    if (primitiveValue) {
      return primitiveValue;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      const isExpanded = expandedPaths.has(path);

      if (obj.length === 0) {
        return <span className="text-gray-600">[]</span>;
      }

      // Filter items if in filter mode
      const visibleIndices = obj.map((_, index) => index).filter(index =>
        shouldShowPath(`${path}[${index}]`)
      );

      const hiddenCount = obj.length - visibleIndices.length;

      return (
        <div>
          <span>
            <button
              onClick={() => togglePath(path)}
              className="text-gray-600 hover:text-gray-800 mr-2 cursor-pointer select-none"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <span className="text-gray-600 font-medium">[</span>
            {!isExpanded && (
              <span className="text-gray-500 italic ml-2">
                {obj.length} item{obj.length !== 1 ? 's' : ''}
                {searchTerm && filterMode && visibleIndices.length < obj.length && (
                  <span className="text-pink-500 ml-2">({visibleIndices.length} matching)</span>
                )}
              </span>
            )}
          </span>

          {isExpanded && (
            <div className="ml-6 mt-1">
              {visibleIndices.map((index, i) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500 mr-3 font-mono text-xs">
                    {index}:
                  </span>
                  {renderJsonNode(obj[index], `${path}[${index}]`)}
                  {i < visibleIndices.length - 1 && <span className="text-gray-600">,</span>}
                </div>
              ))}
              {hiddenCount > 0 && filterMode && (
                <div className="text-gray-400 italic text-xs py-1">
                  ... {hiddenCount} hidden item{hiddenCount !== 1 ? 's' : ''} (no matches)
                </div>
              )}
            </div>
          )}

          {isExpanded && <span className="text-gray-600 font-medium">]</span>}
          {!isExpanded && <span className="text-gray-600 font-medium">]</span>}
        </div>
      );
    }

    // Handle objects
    if (typeof obj === 'object' && obj !== null) {
      const allKeys = Object.keys(obj);
      const isExpanded = expandedPaths.has(path);

      if (allKeys.length === 0) {
        return <span className="text-gray-600">{'{}'}</span>;
      }

      // Filter keys if in filter mode
      const visibleKeys = allKeys.filter(key =>
        shouldShowPath(path ? `${path}.${key}` : key)
      );

      const hiddenCount = allKeys.length - visibleKeys.length;

      return (
        <div>
          <span>
            <button
              onClick={() => togglePath(path)}
              className="text-gray-600 hover:text-gray-800 mr-2 cursor-pointer select-none"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <span className="text-gray-600 font-medium">{'{'}</span>
            {!isExpanded && (
              <span className="text-gray-500 italic ml-2">
                {allKeys.length} propert{allKeys.length !== 1 ? 'ies' : 'y'}
                {searchTerm && filterMode && visibleKeys.length < allKeys.length && (
                  <span className="text-pink-500 ml-2">({visibleKeys.length} matching)</span>
                )}
              </span>
            )}
          </span>

          {isExpanded && (
            <div className="ml-6 mt-1">
              {visibleKeys.map((key, index) => {
                const keyPath = path ? `${path}.${key}` : key;
                const { highlighted, isCurrent, matchIndex } = isHighlighted(key, keyPath, 'key');

                return (
                  <div key={key} className="mb-1">
                    <span
                      className={`text-purple-600 font-medium mr-3 ${highlighted ? (isCurrent ? 'bg-orange-400 text-white px-1 rounded font-bold' : 'bg-yellow-200 px-1 rounded') : ''}`}
                      data-match-index={matchIndex >= 0 ? matchIndex : undefined}
                    >
                      "{key}":
                    </span>
                    {renderJsonNode(obj[key], keyPath)}
                    {index < visibleKeys.length - 1 && <span className="text-gray-600">,</span>}
                  </div>
                );
              })}
              {hiddenCount > 0 && filterMode && (
                <div className="text-gray-400 italic text-xs py-1">
                  ... {hiddenCount} hidden propert{hiddenCount !== 1 ? 'ies' : 'y'} (no matches)
                </div>
              )}
            </div>
          )}

          {isExpanded && <span className="text-gray-600 font-medium">{'}'}</span>}
          {!isExpanded && <span className="text-gray-600 font-medium">{'}'}</span>}
        </div>
      );
    }

    return <span className="text-gray-500">Unknown type</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm" style={{ maxHeight }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-50 to-rose-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
        {title && (
          <h3 className="text-lg font-semibold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent mb-3">
            {title}
          </h3>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="🔍 Search keys and values..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent pr-20"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Match navigation */}
          {matches.length > 0 && (
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <button
                onClick={() => navigateMatch('prev')}
                className="text-gray-600 hover:text-pink-600 p-1"
                title="Previous match"
              >
                ▲
              </button>
              <span className="text-xs font-medium text-gray-700 min-w-[60px] text-center">
                {currentMatchIndex + 1} / {matches.length}
              </span>
              <button
                onClick={() => navigateMatch('next')}
                className="text-gray-600 hover:text-pink-600 p-1"
                title="Next match"
              >
                ▼
              </button>
            </div>
          )}
        </div>

        {/* Filter toggle and result info */}
        {searchTerm && (
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filterMode}
                onChange={(e) => setFilterMode(e.target.checked)}
                className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
              />
              <span className="text-gray-700">Filter view (hide non-matching)</span>
            </label>
            <span className={`text-sm font-medium ${matches.length > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {matches.length === 0 ? 'No results found' : `${matches.length} match${matches.length !== 1 ? 'es' : ''} found`}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            Collapse All
          </button>
          <button
            onClick={copyToClipboard}
            className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
          >
            📋 Copy JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="p-4 overflow-auto font-mono text-sm leading-relaxed"
        style={{ maxHeight: `calc(${maxHeight} - 180px)` }}
      >
        {renderJsonNode(data, '')}
      </div>
    </div>
  );
};

export default JsonViewer;
