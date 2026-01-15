/**
 * Main activation function for the web extension
 * Called when the extension is activated
 * @module web/extension
 */

import * as vscode from 'vscode';

/**
 * Activates the extension
 * @param context - The extension context provided by VS Code
 * @param _context
 * @returns Extension API object (currently empty)
 */
export function activate(_context: vscode.ExtensionContext): Record<string, unknown> {
  console.log('Pyodide Kernel extension is now active in web mode');

  // Register the notebook controller (implemented in Step 3)
  // const controller = registerNotebookController(context);

  // Register commands (implemented in Step 11)
  // registerCommands(context, controller);

  return {
    // Export API if needed by other extensions
  };
}

/**
 * Deactivation function
 * Called when the extension is deactivated
 */
export function deactivate(): void {
  console.log('Pyodide Kernel extension deactivated');
}
