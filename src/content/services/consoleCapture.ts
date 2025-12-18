// Console Capture Service
// Intercepts all console methods (log, info, debug, warn, error) and window errors

import { ConsoleError, ConsoleLogType } from '../../types/console';

class ConsoleCapture {
  private errors: ConsoleError[] = [];
  private maxErrors = 50; // Limit for performance
  private originalConsoleLog: (...args: any[]) => void;
  private originalConsoleInfo: (...args: any[]) => void;
  private originalConsoleDebug: (...args: any[]) => void;
  private originalConsoleWarn: (...args: any[]) => void;
  private originalConsoleError: (...args: any[]) => void;
  private errorIdCounter = 0;

  constructor() {
    // Save original console methods
    this.originalConsoleLog = console.log.bind(console);
    this.originalConsoleInfo = console.info.bind(console);
    this.originalConsoleDebug = console.debug.bind(console);
    this.originalConsoleWarn = console.warn.bind(console);
    this.originalConsoleError = console.error.bind(console);

    // Initialize capture
    this.interceptConsole();
    this.setupErrorHandlers();
  }

  /**
   * Intercept all console methods
   */
  private interceptConsole(): void {
    // Override console.log
    console.log = (...args: any[]) => {
      this.captureLog('log', args);
      this.originalConsoleLog(...args);
    };

    // Override console.info
    console.info = (...args: any[]) => {
      this.captureLog('info', args);
      this.originalConsoleInfo(...args);
    };

    // Override console.debug
    console.debug = (...args: any[]) => {
      this.captureLog('debug', args);
      this.originalConsoleDebug(...args);
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      this.captureLog('warn', args);
      this.originalConsoleWarn(...args);
    };

    // Override console.error
    console.error = (...args: any[]) => {
      this.captureLog('error', args);
      this.originalConsoleError(...args);
    };
  }

  /**
   * Setup global error handlers
   */
  private setupErrorHandlers(): void {
    // Capture uncaught exceptions
    window.addEventListener('error', (event: ErrorEvent) => {
      this.captureException(event);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.captureRejection(event);
    });
  }

  /**
   * Capture any console log
   */
  private captureLog(type: ConsoleLogType, args: any[]): void {
    // Convert arguments to string message with length limits
    const message = args
      .map(arg => {
        if (arg instanceof Error) {
          return arg.message;
        }
        if (typeof arg === 'object') {
          try {
            const str = JSON.stringify(arg);
            // Limit object stringification to 500 chars
            return str.length > 500 ? str.substring(0, 500) + '... (truncated)' : str;
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ')
      .substring(0, 1000); // Limit total message to 1000 chars

    // Try to extract stack trace from Error objects
    let stack: string | undefined;
    const errorArg = args.find(arg => arg instanceof Error);
    if (errorArg && errorArg.stack) {
      stack = errorArg.stack;
    }

    const error: ConsoleError = {
      id: this.generateId(),
      type,
      message,
      stack,
      timestamp: Date.now(),
      source: `console.${type}`,
    };

    this.addError(error);
  }

  /**
   * Capture uncaught exception from window.onerror
   */
  private captureException(event: ErrorEvent): void {
    const error: ConsoleError = {
      id: this.generateId(),
      type: 'exception',
      message: event.message || 'Uncaught exception',
      stack: event.error?.stack,
      timestamp: Date.now(),
      url: event.filename,
      line: event.lineno,
      column: event.colno,
      source: 'window.onerror',
    };

    this.addError(error);
  }

  /**
   * Capture unhandled promise rejection
   */
  private captureRejection(event: PromiseRejectionEvent): void {
    let message = 'Unhandled Promise Rejection';
    let stack: string | undefined;

    if (event.reason) {
      if (event.reason instanceof Error) {
        message = event.reason.message || message;
        stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        message = event.reason;
      } else {
        try {
          message = JSON.stringify(event.reason);
        } catch {
          message = String(event.reason);
        }
      }
    }

    const error: ConsoleError = {
      id: this.generateId(),
      type: 'rejection',
      message,
      stack,
      timestamp: Date.now(),
      source: 'unhandledrejection',
    };

    this.addError(error);
  }

  /**
   * Add error to the collection (FIFO with max limit)
   */
  private addError(error: ConsoleError): void {
    this.errors.unshift(error); // Add to front (newest first)
    if (this.errors.length > this.maxErrors) {
      this.errors.pop(); // Remove oldest
    }
  }

  /**
   * Generate unique error ID
   */
  private generateId(): string {
    return `console-error-${Date.now()}-${this.errorIdCounter++}`;
  }

  /**
   * Get all captured errors
   */
  public getErrors(): ConsoleError[] {
    return this.errors;
  }

  /**
   * Clear all captured errors
   */
  public clearErrors(): void {
    this.errors = [];
  }

  /**
   * Restore original console methods (cleanup)
   */
  public destroy(): void {
    console.log = this.originalConsoleLog;
    console.info = this.originalConsoleInfo;
    console.debug = this.originalConsoleDebug;
    console.warn = this.originalConsoleWarn;
    console.error = this.originalConsoleError;
    this.errors = [];
  }
}

// Create and export singleton instance
export const consoleCapture = new ConsoleCapture();
