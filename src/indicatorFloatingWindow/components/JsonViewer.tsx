import React, { useState, useCallback } from 'react';

interface JsonViewerProps {
  data: any;
  viewerId: string;
  title?: string;
  maxHeight?: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({ 
  data, 
  viewerId, 
  title = "JSON Data",
  maxHeight = "500px" 
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));
  const [searchTerm, setSearchTerm] = useState<string>('');

    console.log({ viewerId });

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

  const isHighlighted = useCallback((text: string) => {
    return searchTerm && text.toLowerCase().includes(searchTerm.toLowerCase());
  }, [searchTerm]);

  const countMatches = useCallback((obj: any): number => {
    if (!searchTerm) return 0;
    
    let count = 0;
    const searchLower = searchTerm.toLowerCase();
    
    const countInObject = (item: any) => {
      if (typeof item === 'string' && item.toLowerCase().includes(searchLower)) {
        count++;
      } else if (Array.isArray(item)) {
        item.forEach(countInObject);
      } else if (typeof item === 'object' && item !== null) {
        Object.entries(item).forEach(([key, value]) => {
          if (key.toLowerCase().includes(searchLower)) count++;
          countInObject(value);
        });
      }
    };
    
    countInObject(obj);
    return count;
  }, [searchTerm]);

  const renderValue = (value: any): React.ReactNode => {
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
      const highlighted = isHighlighted(value);
      return (
        <span className={`text-green-600 ${highlighted ? 'bg-yellow-200 px-1 rounded' : ''}`}>
          "{value}"
        </span>
      );
    }
    
    return null;
  };

  const renderJsonNode = (obj: any, path: string = ''): React.ReactNode => {
    // Handle primitive values
    const primitiveValue = renderValue(obj);
    if (primitiveValue) {
      return primitiveValue;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      const isExpanded = expandedPaths.has(path);
      
      if (obj.length === 0) {
        return <span className="text-gray-600">[]</span>;
      }
      
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
              </span>
            )}
          </span>
          
          {isExpanded && (
            <div className="ml-6 mt-1">
              {obj.map((item, index) => (
                <div key={index} className="mb-1">
                  <span className="text-gray-500 mr-3 font-mono text-xs">
                    {index}:
                  </span>
                  {renderJsonNode(item, `${path}[${index}]`)}
                  {index < obj.length - 1 && <span className="text-gray-600">,</span>}
                </div>
              ))}
            </div>
          )}
          
          {isExpanded && <span className="text-gray-600 font-medium">]</span>}
          {!isExpanded && <span className="text-gray-600 font-medium">]</span>}
        </div>
      );
    }
    
    // Handle objects
    if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj);
      const isExpanded = expandedPaths.has(path);
      
      if (keys.length === 0) {
        return <span className="text-gray-600">{}</span>;
      }
      
      return (
        <div>
          <span>
            <button
              onClick={() => togglePath(path)}
              className="text-gray-600 hover:text-gray-800 mr-2 cursor-pointer select-none"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <span className="text-gray-600 font-medium"></span>
            {!isExpanded && (
              <span className="text-gray-500 italic ml-2">
                {keys.length} propert{keys.length !== 1 ? 'ies' : 'y'}
              </span>
            )}
          </span>
          
          {isExpanded && (
            <div className="ml-6 mt-1">
              {keys.map((key, index) => {
                const keyPath = path ? `${path}.${key}` : key;
                const keyHighlighted = isHighlighted(key);
                
                return (
                  <div key={key} className="mb-1">
                    <span className={`text-purple-600 font-medium mr-3 ${keyHighlighted ? 'bg-yellow-200 px-1 rounded' : ''}`}>
                      "{key}":
                    </span>
                    {renderJsonNode(obj[key], keyPath)}
                    {index < keys.length - 1 && <span className="text-gray-600">,</span>}
                  </div>
                );
              })}
            </div>
          )}
          
          {isExpanded && <span className="text-gray-600 font-medium"></span>}
          {!isExpanded && <span className="text-gray-600 font-medium"></span>}
        </div>
      );
    }
    
    return <span className="text-gray-500">Unknown type</span>;
  };

  const matchCount = countMatches(data);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm" style={{ maxHeight }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-50 to-rose-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
        <h3 className="text-lg font-semibold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent mb-3">
          {title}
        </h3>
        
        {/* Search */}
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            placeholder="Search keys and values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
          <span className="text-xs text-gray-600 min-w-24">
            {searchTerm ? (
              matchCount === 0 ? (
                <span className="text-red-500">No results</span>
              ) : (
                <span className="text-green-600">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
              )
            ) : (
              ''
            )}
          </span>
        </div>

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
            Copy JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        className="p-4 overflow-auto font-mono text-sm leading-relaxed" 
        style={{ maxHeight: `calc(${maxHeight} - 140px)` }}
      >
        {renderJsonNode(data, '')}
      </div>
    </div>
  );
};

export default JsonViewer;