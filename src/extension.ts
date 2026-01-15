/**
 * VS Code extension entry point for Pyodide-powered Python kernel
 * @module extension
 */

import * as vscode from 'vscode';

/**
 * Activates the extension
 * @param context - The extension context provided by VS Code
 */
export function activate(context: vscode.ExtensionContext): void {
  // Extension is now active - using VS Code's output channel for logging if needed

  // Register restart kernel command
  const restartCommand = vscode.commands.registerCommand('pyodide.restartKernel', () => {
    void vscode.window.showInformationMessage('Pyodide kernel restart - not yet implemented');
  });

  // Register install package command
  const installCommand = vscode.commands.registerCommand('pyodide.installPackage', async () => {
    const packageName = await vscode.window.showInputBox({
      prompt: 'Enter package name to install',
      placeHolder: 'e.g., numpy, pandas, matplotlib',
    });

    if (packageName !== undefined && packageName.trim() !== '') {
      void vscode.window.showInformationMessage(
        `Installing package: ${packageName} - not yet implemented`
      );
    }
  });

  context.subscriptions.push(restartCommand, installCommand);
}

/**
 * Deactivates the extension
 */
export function deactivate(): void {
  // Extension is now deactivated - cleanup completed
}
