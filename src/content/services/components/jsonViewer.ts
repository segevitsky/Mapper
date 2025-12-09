// src/content/components/JsonViewer.ts

interface JsonViewerState {
  expandedPaths: Set<string>;
  searchTerm: string;
  searchResults: string[];
  currentSearchIndex: number;
  matchingPaths: Set<string>;
}

const jsonViewerStates = new Map<string, JsonViewerState>();

export function createInteractiveJsonViewer(data: any, viewerId: string): string {
  // Initialize state for this viewer
  if (!jsonViewerStates.has(viewerId)) {
    jsonViewerStates.set(viewerId, {
      expandedPaths: new Set(['']), // Root expanded by default
      searchTerm: '',
      searchResults: [],
      currentSearchIndex: 0,
      matchingPaths: new Set()
    });
  }

  return `
    <div class="json-viewer-container" data-viewer-id="${viewerId}">
      <div class="json-viewer-controls">
        <div class="search-box">
          <input 
            type="text" 
            class="json-search-input" 
            placeholder="Search..." 
            data-viewer-id="${viewerId}"
          />
          <span class="search-results-count"></span>
          <button class="search-prev" title="Previous result">↑</button>
          <button class="search-next" title="Next result">↓</button>
        </div>
        <div class="json-actions">
          <button class="expand-all-btn" data-viewer-id="${viewerId}">Expand All</button>
          <button class="collapse-all-btn" data-viewer-id="${viewerId}">Collapse All</button>
          <button class="copy-json-btn" data-viewer-id="${viewerId}">Copy JSON</button>
          <button class="copy-text-btn" data-viewer-id="${viewerId}">Copy as Text</button>
        </div>
      </div>
      <div class="json-viewer" id="json-viewer-${viewerId}" data-json='${JSON.stringify(data)}'>
        ${renderJsonTree(data, '', viewerId)}
      </div>
    </div>
  `;
}

function renderJsonTree(data: any, path: string, viewerId: string, isFiltering: boolean = false): string {
  const state = jsonViewerStates.get(viewerId)!;
  
  // If we're filtering and this item doesn't match, return empty
  if (isFiltering && state.searchTerm && !doesPathMatch(data, path, state)) {
    return '';
  }
  
  if (data === null) {
    return '<span class="json-null">null</span>';
  }
  
  if (data === undefined) {
    return '<span class="json-undefined">undefined</span>';
  }
  
  if (typeof data === 'boolean') {
    return `<span class="json-boolean">${data}</span>`;
  }
  
  if (typeof data === 'number') {
    return `<span class="json-number">${data}</span>`;
  }
  
  if (typeof data === 'string') {
    const displayValue = escapeHtml(data);
    const isHighlighted = state.searchTerm && data.toLowerCase().includes(state.searchTerm.toLowerCase());
    return `<span class="json-string ${isHighlighted ? 'search-highlight' : ''}">${displayValue}</span>`;
  }
  
  if (Array.isArray(data)) {
    const isExpanded = state.expandedPaths.has(path) || (state.searchTerm !== '');
    
    // Filter array items when searching
    const filteredItems = state.searchTerm 
      ? data.map((item, index) => ({ item, index }))
          .filter(({ item }) => doesItemMatchSearch(item, state.searchTerm))
      : data.map((item, index) => ({ item, index }));
    
    const itemCount = filteredItems.length;
    
    if (itemCount === 0 && state.searchTerm) {
      return ''; // Don't show empty arrays when filtering
    }
    
    if (data.length === 0) {
      return '<span class="json-array">[]</span>';
    }
    
    return `
      <span class="json-array">
        <span 
          class="json-toggle ${isExpanded ? 'expanded' : ''}" 
          data-path="${path}" 
          data-viewer-id="${viewerId}"
        >
          ${isExpanded ? '▼' : '▶'}
        </span>
        <span class="json-bracket">[</span>
        <span class="json-preview ${isExpanded ? 'hidden' : ''}">
          ${state.searchTerm && itemCount < data.length 
            ? `${itemCount} of ${data.length} items` 
            : `${data.length} items`}
        </span>
        <div class="json-content ${isExpanded ? '' : 'hidden'}">
          ${filteredItems.map(({ item, index }, displayIndex) => {
            const itemPath = `${path}[${index}]`;
            return `
              <div class="json-item">
                <span class="json-index">${index}</span>
                <span class="json-colon">:</span>
                ${renderJsonTree(item, itemPath, viewerId)}
                ${displayIndex < filteredItems.length - 1 ? '<span class="json-comma">,</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        <span class="json-bracket ${isExpanded ? '' : 'hidden'}">]</span>
      </span>
    `;
  }
  
  if (typeof data === 'object') {
    const isExpanded = state.expandedPaths.has(path) || (state.searchTerm !== '');
    const keys = Object.keys(data);
    
    // Check if we should show the full object (when any property matches)
    const showFullObject = shouldShowFullObject(data, state.searchTerm);
    
    // Filter object properties when searching (unless showing full object)
    const filteredKeys = state.searchTerm && !showFullObject
      ? keys.filter(key => {
          const keyMatches = key.toLowerCase().includes(state.searchTerm.toLowerCase());
          const valueMatches = doesItemMatchSearch(data[key], state.searchTerm);
          return keyMatches || valueMatches;
        })
      : keys;
    
    const itemCount = filteredKeys.length;
    
    if (itemCount === 0 && state.searchTerm && !showFullObject) {
      return ''; // Don't show empty objects when filtering
    }
    
    if (keys.length === 0) {
      return '<span class="json-object">{}</span>';
    }
    
    const objectClass = showFullObject && state.searchTerm ? 'matching-object' : '';
    
    return `
      <span class="json-object ${objectClass}">
        <span 
          class="json-toggle ${isExpanded ? 'expanded' : ''}" 
          data-path="${path}" 
          data-viewer-id="${viewerId}"
        >
          ${isExpanded ? '▼' : '▶'}
        </span>
        <span class="json-bracket">{</span>
        <span class="json-preview ${isExpanded ? 'hidden' : ''}">
          ${state.searchTerm && itemCount < keys.length && !showFullObject
            ? `${itemCount} of ${keys.length} properties` 
            : `${keys.length} properties`}
          ${showFullObject && state.searchTerm ? ' (matched)' : ''}
        </span>
        <div class="json-content ${isExpanded ? '' : 'hidden'}">
          ${filteredKeys.map((key, index) => {
            const keyPath = path ? `${path}.${key}` : key;
            const isKeyHighlighted = state.searchTerm && key.toLowerCase().includes(state.searchTerm.toLowerCase());
            const isValueHighlighted = state.searchTerm && typeof data[key] === 'string' && 
                                     data[key].toLowerCase().includes(state.searchTerm.toLowerCase());
            return `
              <div class="json-item">
                <span class="json-key ${isKeyHighlighted ? 'search-highlight' : ''}">${escapeHtml(key)}</span>
                <span class="json-colon">:</span>
                ${renderJsonTree(data[key], keyPath, viewerId)}
                ${index < filteredKeys.length - 1 ? '<span class="json-comma">,</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        <span class="json-bracket ${isExpanded ? '' : 'hidden'}">}</span>
      </span>
    `;
  }
  
  return '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Add new search helper functions
function doesItemMatchSearch(item: any, searchTerm: string): boolean {
  if (!searchTerm) return true;
  
  const searchLower = searchTerm.toLowerCase();
  
  if (item === null || item === undefined) {
    return String(item).toLowerCase().includes(searchLower);
  }
  
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item).toLowerCase().includes(searchLower);
  }
  
  if (Array.isArray(item)) {
    return item.some(subItem => doesItemMatchSearch(subItem, searchTerm));
  }
  
  if (typeof item === 'object') {
    return Object.entries(item).some(([key, value]) => {
      const keyMatches = key.toLowerCase().includes(searchLower);
      const valueMatches = doesItemMatchSearch(value, searchTerm);
      return keyMatches || valueMatches;
    });
  }
  
  return false;
}

function doesPathMatch(data: any, path: string, state: JsonViewerState): boolean {
  if (!path) {
    console.log({ path });
  }
  if (!state.searchTerm) return true;
  return doesItemMatchSearch(data, state.searchTerm);
}

function countMatches(data: any, searchTerm: string): number {
  if (!searchTerm) return 0;
  
  let count = 0;
  
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (doesItemMatchSearch(item, searchTerm)) {
        count++;
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    Object.entries(data).forEach(([key, value]) => {
      if (key.toLowerCase().includes(searchTerm.toLowerCase()) || 
          doesItemMatchSearch(value, searchTerm)) {
        count++;
      }
    });
  }
  
  return count;
}

// Function to check if we should show the entire object
function shouldShowFullObject(data: any, searchTerm: string): boolean {
  if (!searchTerm || typeof data !== 'object' || data === null) return false;
  
  // For objects, if ANY property matches, show the whole object
  if (!Array.isArray(data)) {
    return Object.entries(data).some(([key, value]) => {
      return key.toLowerCase().includes(searchTerm.toLowerCase()) || 
             doesItemMatchSearch(value, searchTerm);
    });
  }
  
  return false;
}


export function setupJsonViewerListeners(tooltip: HTMLElement) {
  // Toggle expand/collapse
  tooltip.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    if (target.classList.contains('json-toggle')) {
      const path = target.dataset.path || '';
      const viewerId = target.dataset.viewerId!;
      const state = jsonViewerStates.get(viewerId)!;
      
      if (state.expandedPaths.has(path)) {
        state.expandedPaths.delete(path);
      } else {
        state.expandedPaths.add(path);
      }
      
      // Re-render the JSON viewer
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        viewerContainer.innerHTML = renderJsonTree(data, '', viewerId);
      }
    }
  });

  // Search functionality
  const searchInputs = tooltip.querySelectorAll('.json-search-input');
  searchInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const viewerId = target.dataset.viewerId!;
      const state = jsonViewerStates.get(viewerId)!;
      state.searchTerm = target.value;
      
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        
        // Count matches
        const matchCount = countMatches(data, state.searchTerm);
        
        // Update search count
        const searchCount = tooltip.querySelector('.search-results-count');
        if (searchCount) {
          if (state.searchTerm) {
            if (matchCount === 0) {
              searchCount.textContent = 'No results found';
              (searchCount as HTMLElement).style.color = '#f44336';
            } else {
              searchCount.textContent = `${matchCount} result${matchCount !== 1 ? 's' : ''}`;
              (searchCount as HTMLElement).style.color = '#4CAF50';
            }
          } else {
            searchCount.textContent = '';
            (searchCount as HTMLElement).style.color = '#666';
          }
        }
        
        // Re-render with filtering
        const content = renderJsonTree(data, '', viewerId);
        if (state.searchTerm && !content) {
          viewerContainer.innerHTML = '<div class="no-results">No matching results found</div>';
        } else {
          viewerContainer.innerHTML = content;
        }
      }
    });
  });

  // Expand/Collapse all buttons
  tooltip.querySelectorAll('.expand-all-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewerId = btn.getAttribute('data-viewer-id')!;
      const state = jsonViewerStates.get(viewerId)!;
      
      // Find all possible paths and add them
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        expandAllPaths(data, '', state.expandedPaths);
        viewerContainer.innerHTML = renderJsonTree(data, '', viewerId);
      }
    });
  });

  tooltip.querySelectorAll('.collapse-all-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewerId = btn.getAttribute('data-viewer-id')!;
      const state = jsonViewerStates.get(viewerId)!;
      state.expandedPaths.clear();
      state.expandedPaths.add(''); // Keep root expanded
      
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        viewerContainer.innerHTML = renderJsonTree(data, '', viewerId);
      }
    });
  });

  // Copy JSON button
  tooltip.querySelectorAll('.copy-json-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewerId = btn.getAttribute('data-viewer-id')!;
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        
        // Show feedback
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }
    });
  });

  // Copy as text button
  tooltip.querySelectorAll('.copy-text-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewerId = btn.getAttribute('data-viewer-id')!;
      const viewerContainer = tooltip.querySelector(`#json-viewer-${viewerId}`);
      if (viewerContainer) {
        const data = JSON.parse(viewerContainer.getAttribute('data-json') || '{}');
        const textContent = jsonToPlainText(data);
        navigator.clipboard.writeText(textContent);
        
        // Show feedback
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
      }
    });
  });
}

function expandAllPaths(data: any, path: string, expandedPaths: Set<string>) {
  expandedPaths.add(path);
  
  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      if (typeof item === 'object' && item !== null) {
        expandAllPaths(item, `${path}[${index}]`, expandedPaths);
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (typeof value === 'object' && value !== null) {
        expandAllPaths(value, path ? `${path}.${key}` : key, expandedPaths);
      }
    });
  }
}

function jsonToPlainText(data: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (data === null || data === undefined) {
    return String(data);
  }
  
  if (typeof data !== 'object') {
    return String(data);
  }
  
  if (Array.isArray(data)) {
    return data.map((item, index) => 
      `${spaces}[${index}]: ${typeof item === 'object' ? '\n' + jsonToPlainText(item, indent + 1) : item}`
    ).join('\n');
  }
  
  return Object.entries(data).map(([key, value]) => 
    `${spaces}${key}: ${typeof value === 'object' ? '\n' + jsonToPlainText(value, indent + 1) : value}`
  ).join('\n');
}

// CSS styles for the JSON viewer
export const jsonViewerStyles = `
  .json-viewer-container {
    max-height: 500px;
    overflow-y: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
  }

  .json-viewer-controls {
    position: sticky;
    top: 0;
    background: #f5f5f5;
    padding: 8px;
    border-bottom: 1px solid #ddd;
    z-index: 10;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .json-search-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
  }

  .search-results-count {
    font-size: 11px;
    color: #666;
    min-width: 80px;
  }

  .search-prev, .search-next {
    padding: 2px 8px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }

  .json-actions {
    display: flex;
    gap: 8px;
  }

  .json-actions button {
    padding: 4px 12px;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .json-actions button:hover {
    background: #e8e8e8;
    border-color: #999;
  }

  .json-viewer {
    padding: 12px;
    line-height: 1.5;
  }

  .json-toggle {
    cursor: pointer;
    user-select: none;
    display: inline-block;
    width: 12px;
    margin-right: 4px;
    color: #666;
    transition: transform 0.2s;
  }

  .json-toggle.expanded {
    transform: rotate(0deg);
  }

  .json-item {
    margin-left: 20px;
    position: relative;
  }
  
  .json-item.matching-item {
    background-color: rgba(255, 235, 59, 0.1);
    margin-left: 16px;
    padding-left: 4px;
    border-left: 3px solid #ffc107;
  }

  .json-key {
    color: #881391;
    font-weight: 500;
  }

  .json-string {
    color: #0B7500;
  }

  .json-number {
    color: #1C00CF;
  }

  .json-boolean {
    color: #D73502;
  }

  .json-null {
    color: #808080;
  }

  .json-undefined {
    color: #808080;
    font-style: italic;
  }

  .json-index {
    color: #666;
    font-style: italic;
  }

  .json-colon {
    margin: 0 4px;
    color: #666;
  }

  .json-comma {
    color: #666;
  }

  .json-bracket {
    color: #666;
    font-weight: 500;
  }

  .json-preview {
    color: #999;
    font-style: italic;
    margin-left: 4px;
  }

  .json-content {
    display: block;
  }

  .hidden {
    display: none !important;
  }

  .search-highlight {
    background-color: #ffeb3b;
    padding: 1px 2px;
    border-radius: 2px;
    font-weight: bold;
  }
  
  .matching-container > .json-preview {
    color: #f57c00;
    font-weight: 500;
  }
  
  .matching-object {
    background-color: rgba(255, 235, 59, 0.05);
    border-left: 3px solid #ffc107;
    padding-left: 4px;
    margin-left: -4px;
  }

  .url-text {
    color: #0066cc;
    word-break: break-all;
  }

  .status-ok {
    color: #0B7500;
    font-weight: 500;
  }

  .status-error {
    color: #D73502;
    font-weight: 500;
  }
  
  .no-results {
    text-align: center;
    padding: 20px;
    color: #666;
    font-style: italic;
  }
`;