/**
 * Extension constants
 * @module common/constants
 */

/**
 * Extension identifiers
 */
export const EXTENSION_ID = 'pyodide-vscode-web';
export const CONTROLLER_ID = 'pyodide-kernel';
export const CONTROLLER_LABEL = 'Pyodide (Web)';
export const NOTEBOOK_TYPE = 'jupyter-notebook';

/**
 * Pyodide CDN URLs
 * Using v0.25.0 for stability (can be updated to v0.29.1 later)
 */
export const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';
export const PYODIDE_VERSION = '0.25.0';

/**
 * Execution limits
 */
export const MAX_EXECUTION_TIME_MS = 30000; // 30 seconds
export const MAX_OUTPUT_LENGTH = 100000; // 100KB
