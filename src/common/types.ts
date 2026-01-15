/**
 * Shared types for the Pyodide extension
 * @module common/types
 */

/**
 * Message types for communication between extension host and Pyodide worker
 */
export enum MessageType {
  INIT = 'init',
  RUN = 'run',
  STDOUT = 'stdout',
  STDERR = 'stderr',
  RESULT = 'result',
  ERROR = 'error',
  INTERRUPT = 'interrupt',
}

/**
 * Base message interface for worker communication
 */
export interface IWorkerMessage {
  type: MessageType;
  id?: string;
}

/**
 * Configuration for Pyodide initialization
 */
export interface IPyodideConfig {
  indexURL?: string;
  packages?: string[];
}

/**
 * Execution result from Pyodide
 */
export interface IExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Execution context with variables and state
 */
export interface IExecutionContext {
  variables?: Record<string, unknown>;
  workingDirectory?: string;
}
