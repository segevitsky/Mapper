/**
 * Import/Export utilities for Indi indicators
 */

export interface IndicatorExport {
  version: string;
  exportedAt: string;
  source: string;
  indicators: Record<string, any[]>;
}

export interface ImportValidationResult {
  isValid: boolean;
  error?: string;
  data?: IndicatorExport;
  summary?: {
    totalPaths: number;
    totalIndicators: number;
    paths: { path: string; count: number }[];
  };
}

export interface ImportOptions {
  selectedPaths: string[];
  mode: 'overwrite' | 'merge';
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  message: string;
}

const CURRENT_VERSION = '1.0';

/**
 * Export all indicators to a downloadable JSON file
 */
export async function exportIndicators(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['indicators'], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const indicators = result.indicators || {};

      const exportData: IndicatorExport = {
        version: CURRENT_VERSION,
        exportedAt: new Date().toISOString(),
        source: window.location.origin,
        indicators
      };

      // Create and download the file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const date = new Date().toISOString().split('T')[0];
      const filename = `indi-indicators-${date}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      resolve();
    });
  });
}

/**
 * Validate an imported JSON file
 */
export function validateImportFile(fileContent: string): ImportValidationResult {
  try {
    const data = JSON.parse(fileContent);

    // Check if it's a valid Indi export
    if (!data.version || !data.indicators) {
      // Try to detect if it's just raw indicators (backwards compatibility)
      if (typeof data === 'object' && !Array.isArray(data)) {
        const hasIndicatorArrays = Object.values(data).every(
          val => Array.isArray(val) && val.every(item => item && typeof item === 'object' && item.id)
        );

        if (hasIndicatorArrays) {
          // Wrap in proper format
          const wrappedData: IndicatorExport = {
            version: '0.0',
            exportedAt: 'unknown',
            source: 'legacy',
            indicators: data
          };
          return validateAndSummarize(wrappedData);
        }
      }

      return {
        isValid: false,
        error: 'Invalid file format. This doesn\'t appear to be an Indi indicators export file.'
      };
    }

    return validateAndSummarize(data as IndicatorExport);
  } catch (e) {
    return {
      isValid: false,
      error: 'Failed to parse JSON file. Please ensure it\'s a valid JSON file.'
    };
  }
}

function validateAndSummarize(data: IndicatorExport): ImportValidationResult {
  const indicators = data.indicators;

  if (!indicators || typeof indicators !== 'object') {
    return {
      isValid: false,
      error: 'No indicators found in the file.'
    };
  }

  const paths: { path: string; count: number }[] = [];
  let totalIndicators = 0;

  for (const [path, pathIndicators] of Object.entries(indicators)) {
    if (!Array.isArray(pathIndicators)) {
      return {
        isValid: false,
        error: `Invalid indicator data for path: ${path}`
      };
    }

    // Validate each indicator has required fields
    for (const indicator of pathIndicators) {
      if (!indicator.id) {
        return {
          isValid: false,
          error: `Found indicator without ID in path: ${path}`
        };
      }
    }

    paths.push({ path, count: pathIndicators.length });
    totalIndicators += pathIndicators.length;
  }

  return {
    isValid: true,
    data,
    summary: {
      totalPaths: paths.length,
      totalIndicators,
      paths: paths.sort((a, b) => b.count - a.count) // Sort by count descending
    }
  };
}

/**
 * Import indicators with the given options
 */
export async function importIndicators(
  importData: IndicatorExport,
  options: ImportOptions
): Promise<ImportResult> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['indicators'], (result) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          imported: 0,
          skipped: 0,
          message: `Storage error: ${chrome.runtime.lastError.message}`
        });
        return;
      }

      const existingIndicators = result.indicators || {};
      let newIndicators: Record<string, any[]>;
      let imported = 0;
      let skipped = 0;

      if (options.mode === 'overwrite') {
        // Start fresh with only selected paths from import
        newIndicators = { ...existingIndicators };

        for (const path of options.selectedPaths) {
          const pathIndicators = importData.indicators[path] || [];
          newIndicators[path] = pathIndicators;
          imported += pathIndicators.length;
        }
      } else {
        // Merge mode - add new indicators, skip duplicates
        newIndicators = { ...existingIndicators };

        for (const path of options.selectedPaths) {
          const importPathIndicators = importData.indicators[path] || [];
          const existingPathIndicators = newIndicators[path] || [];
          const existingIds = new Set(existingPathIndicators.map(ind => ind.id));

          for (const indicator of importPathIndicators) {
            if (existingIds.has(indicator.id)) {
              skipped++;
            } else {
              existingPathIndicators.push(indicator);
              imported++;
            }
          }

          newIndicators[path] = existingPathIndicators;
        }
      }

      chrome.storage.local.set({ indicators: newIndicators }, () => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            imported: 0,
            skipped: 0,
            message: `Failed to save: ${chrome.runtime.lastError.message}`
          });
          return;
        }

        const skippedMsg = skipped > 0 ? ` (${skipped} skipped - already exist)` : '';
        resolve({
          success: true,
          imported,
          skipped,
          message: `Successfully imported ${imported} indicators${skippedMsg}`
        });
      });
    });
  });
}

/**
 * Read a file and return its content as string
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
