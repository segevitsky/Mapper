// Console types for console capture system

export type ConsoleLogType = 'log' | 'info' | 'debug' | 'warn' | 'error' | 'exception' | 'rejection';

export interface ConsoleError {
  id: string;                    // Unique ID
  type: ConsoleLogType;          // log, info, debug, warn, error, exception, rejection
  message: string;               // Log message
  stack?: string;                // Stack trace (for errors)
  timestamp: number;             // When log occurred
  url?: string;                  // Script URL where log occurred
  line?: number;                 // Line number
  column?: number;               // Column number
  source?: string;               // Source of log (console.log, window.onerror, etc.)
}
