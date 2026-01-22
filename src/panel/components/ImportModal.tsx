import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileJson, Check, AlertCircle, FolderOpen, Layers } from 'lucide-react';
import {
  ImportValidationResult,
  IndicatorExport,
  ImportOptions,
  ImportResult,
  validateImportFile,
  importIndicators,
  readFileAsText
} from '../utils/indicatorTransfer';

interface ImportModalProps {
  isVisible: boolean;
  onClose: () => void;
  onImportComplete: (result: ImportResult) => void;
}

type ImportStep = 'upload' | 'select' | 'importing' | 'complete';

const ImportModal: React.FC<ImportModalProps> = ({ isVisible, onClose, onImportComplete }) => {
  const [step, setStep] = useState<ImportStep>('upload');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [importData, setImportData] = useState<IndicatorExport | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<'overwrite' | 'merge'>('merge');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isVisible) {
      setStep('upload');
      setValidationResult(null);
      setImportData(null);
      setSelectedPaths(new Set());
      setImportMode('merge');
      setImportResult(null);
      setError(null);
    }
  }, [isVisible]);

  const handleFileSelect = async (file: File) => {
    setError(null);

    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    try {
      const content = await readFileAsText(file);
      const result = validateImportFile(content);

      setValidationResult(result);

      if (result.isValid && result.data) {
        setImportData(result.data);
        // Select all paths by default
        setSelectedPaths(new Set(result.summary?.paths.map(p => p.path) || []));
        setStep('select');
      } else {
        setError(result.error || 'Invalid file');
      }
    } catch (e) {
      setError('Failed to read file');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const togglePath = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  };

  const selectAll = () => {
    setSelectedPaths(new Set(validationResult?.summary?.paths.map(p => p.path) || []));
  };

  const selectNone = () => {
    setSelectedPaths(new Set());
  };

  const handleImport = async () => {
    if (!importData || selectedPaths.size === 0) return;

    setStep('importing');

    const options: ImportOptions = {
      selectedPaths: Array.from(selectedPaths),
      mode: importMode
    };

    const result = await importIndicators(importData, options);
    setImportResult(result);
    setStep('complete');
    onImportComplete(result);
  };

  const formatPath = (path: string): string => {
    // Make paths more readable
    return path
      .split(/[-_.]/)
      .flatMap(part => part.split(/(?=[A-Z])/))
      .filter(Boolean)
      .join(' ');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 via-violet-500 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Import Indicators</h2>
                <p className="text-purple-100 text-sm">
                  {step === 'upload' && 'Select a JSON file to import'}
                  {step === 'select' && 'Choose which indicators to import'}
                  {step === 'importing' && 'Importing...'}
                  {step === 'complete' && 'Import complete'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className={`border-3 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
                  dragOver
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleInputChange}
                />
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-purple-100 to-violet-100 rounded-full flex items-center justify-center">
                  <FileJson className="w-10 h-10 text-purple-500" />
                </div>
                <p className="text-xl font-bold text-gray-700 mb-2">
                  Drop your file here
                </p>
                <p className="text-gray-500">
                  or click to browse
                </p>
                <p className="text-sm text-gray-400 mt-4">
                  Accepts .json files exported from Indi
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select */}
          {step === 'select' && validationResult?.summary && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-100">
                <div className="flex items-center gap-3 mb-2">
                  <Layers className="w-5 h-5 text-purple-500" />
                  <span className="font-bold text-gray-800">
                    {validationResult.summary.totalIndicators} indicators in {validationResult.summary.totalPaths} paths
                  </span>
                </div>
                {validationResult.data?.exportedAt && validationResult.data.exportedAt !== 'unknown' && (
                  <p className="text-sm text-gray-600">
                    Exported: {new Date(validationResult.data.exportedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Path Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">Select paths to import:</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-sm text-purple-600 hover:text-purple-700 font-semibold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={selectNone}
                      className="text-sm text-purple-600 hover:text-purple-700 font-semibold"
                    >
                      Select None
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {validationResult.summary.paths.map(({ path, count }) => (
                    <label
                      key={path}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                        selectedPaths.has(path)
                          ? 'bg-purple-100 border-2 border-purple-300'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                        selectedPaths.has(path)
                          ? 'bg-purple-500'
                          : 'bg-white border-2 border-gray-300'
                      }`}>
                        {selectedPaths.has(path) && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(path)}
                        onChange={() => togglePath(path)}
                        className="hidden"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-800 truncate" title={path}>
                            {formatPath(path)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">{path}</p>
                      </div>
                      <span className="bg-purple-200 text-purple-700 text-xs font-bold px-2 py-1 rounded-full">
                        {count}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Import Mode */}
              <div>
                <h3 className="font-bold text-gray-800 mb-3">Import mode:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex flex-col p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                      importMode === 'merge'
                        ? 'bg-green-100 border-2 border-green-300'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="hidden"
                    />
                    <span className="font-bold text-gray-800">Merge</span>
                    <span className="text-sm text-gray-600">Add new, skip duplicates</span>
                  </label>
                  <label
                    className={`flex flex-col p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                      importMode === 'overwrite'
                        ? 'bg-orange-100 border-2 border-orange-300'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="overwrite"
                      checked={importMode === 'overwrite'}
                      onChange={() => setImportMode('overwrite')}
                      className="hidden"
                    />
                    <span className="font-bold text-gray-800">Overwrite</span>
                    <span className="text-sm text-gray-600">Replace existing paths</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-xl font-bold text-gray-700">Importing indicators...</p>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && importResult && (
            <div className="text-center py-8">
              <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
                importResult.success
                  ? 'bg-green-100'
                  : 'bg-red-100'
              }`}>
                {importResult.success ? (
                  <Check className="w-10 h-10 text-green-600" />
                ) : (
                  <AlertCircle className="w-10 h-10 text-red-600" />
                )}
              </div>
              <p className="text-2xl font-bold text-gray-800 mb-2">
                {importResult.success ? 'Import Successful!' : 'Import Failed'}
              </p>
              <p className="text-gray-600">{importResult.message}</p>
              {importResult.skipped > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {importResult.skipped} indicator(s) were skipped because they already exist
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          <div className="flex justify-end gap-3">
            {step === 'select' && (
              <>
                <button
                  onClick={() => setStep('upload')}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 font-semibold transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedPaths.size === 0}
                  className={`px-8 py-3 rounded-xl font-bold transition-all duration-300 ${
                    selectedPaths.size > 0
                      ? 'bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white shadow-lg hover:shadow-xl'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Import {selectedPaths.size > 0 ? `(${selectedPaths.size} paths)` : ''}
                </button>
              </>
            )}
            {step === 'complete' && (
              <button
                onClick={onClose}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
