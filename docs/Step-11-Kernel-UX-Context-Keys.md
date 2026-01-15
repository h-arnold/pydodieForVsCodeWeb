# Step 11: Kernel UX and Context Keys

## Overview
Implement user-facing kernel management commands and leverage VS Code's context key system to provide a polished, Jupyter-compatible experience. This includes kernel lifecycle controls (restart, interrupt, clear globals), context-aware UI elements, and proper integration with the official Jupyter extension's UX patterns.

## Research Summary

### VS Code Context Keys
Based on [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook) and [Jupyter Extensibility Wiki](https://github.com/microsoft/vscode-jupyter/wiki/Extensibility-for-other-extensions):
- Context keys are boolean/string values that control UI visibility and behavior
- Set via `vscode.commands.executeCommand('setContext', key, value)`
- Used in `when` clauses for commands, menus, keybindings
- Jupyter extension exposes specific context keys for third-party integration

### Jupyter Extension Context Keys
From [Extensibility for other extensions](https://github.com/microsoft/vscode-jupyter/wiki/Extensibility-for-other-extensions):
- `jupyter.webExtension`: true when running in web (vscode.dev/github.dev)
- `jupyter.ispythonnotebook`: true when active notebook has Python kernel
- `jupyter.kernel.isjupyter`: true when kernel comes from Jupyter extension
- `jupyter.isnativeactive`: true when active editor is a Jupyter Notebook
- `jupyter.hascodecells`: true when notebook has at least one code cell

### Kernel Lifecycle Management
According to [Notebook API Documentation](https://code.visualstudio.com/api/extension-guides/notebook):
- **Restart**: Clear Python globals, reinitialize Pyodide
- **Interrupt**: Stop currently executing cell
- **Clear Outputs**: Remove all cell outputs
- **Soft Reset**: Free memory without full restart

## Dependencies

### VS Code API
```typescript
import * as vscode from 'vscode';
```

### No Additional Dependencies
All functionality uses built-in VS Code APIs.

## Code Implementation

### 1. Context Key Manager (src/web/contextKeyManager.ts)

```typescript
import * as vscode from 'vscode';

/**
 * Manages VS Code context keys for kernel state
 */
export class ContextKeyManager {
    private static readonly KEYS = {
        // Custom keys for Pyodide kernel
        KERNEL_READY: 'pyodide.kernelReady',
        KERNEL_BUSY: 'pyodide.kernelBusy',
        KERNEL_IDLE: 'pyodide.kernelIdle',
        KERNEL_ERROR: 'pyodide.kernelError',
        IS_PYTHON_NOTEBOOK: 'jupyter.ispythonnotebook',
        IS_WEB_EXTENSION: 'jupyter.webExtension',
        IS_NATIVE_ACTIVE: 'jupyter.isnativeactive',
        HAS_CODE_CELLS: 'jupyter.hascodecells'
    };

    /**
     * Initialize context keys on activation
     */
    static async initialize(): Promise<void> {
        await this.setContext(this.KEYS.KERNEL_READY, false);
        await this.setContext(this.KEYS.KERNEL_BUSY, false);
        await this.setContext(this.KEYS.KERNEL_IDLE, true);
        await this.setContext(this.KEYS.KERNEL_ERROR, false);
        await this.setContext(this.KEYS.IS_WEB_EXTENSION, true);
    }

    /**
     * Update kernel state
     */
    static async setKernelReady(ready: boolean): Promise<void> {
        await this.setContext(this.KEYS.KERNEL_READY, ready);
    }

    static async setKernelBusy(busy: boolean): Promise<void> {
        await this.setContext(this.KEYS.KERNEL_BUSY, busy);
        await this.setContext(this.KEYS.KERNEL_IDLE, !busy);
    }

    static async setKernelError(error: boolean): Promise<void> {
        await this.setContext(this.KEYS.KERNEL_ERROR, error);
    }

    /**
     * Update when active notebook changes
     */
    static async updateForNotebook(notebook: vscode.NotebookDocument | undefined): Promise<void> {
        if (!notebook) {
            await this.setContext(this.KEYS.IS_NATIVE_ACTIVE, false);
            await this.setContext(this.KEYS.HAS_CODE_CELLS, false);
            await this.setContext(this.KEYS.IS_PYTHON_NOTEBOOK, false);
            return;
        }

        const isJupyterNotebook = notebook.notebookType === 'jupyter-notebook';
        await this.setContext(this.KEYS.IS_NATIVE_ACTIVE, isJupyterNotebook);

        // Check if notebook has code cells
        const hasCodeCells = notebook.getCells().some(cell => cell.kind === vscode.NotebookCellKind.Code);
        await this.setContext(this.KEYS.HAS_CODE_CELLS, hasCodeCells);

        // Check if it's a Python notebook (look at metadata or first cell language)
        const isPython = this.isPythonNotebook(notebook);
        await this.setContext(this.KEYS.IS_PYTHON_NOTEBOOK, isPython);
    }

    /**
     * Helper to determine if notebook is Python
     */
    private static isPythonNotebook(notebook: vscode.NotebookDocument): boolean {
        // Check notebook metadata
        const metadata = notebook.metadata;
        if (metadata?.language_info?.name === 'python') {
            return true;
        }

        // Check first code cell language
        const firstCodeCell = notebook.getCells().find(cell => cell.kind === vscode.NotebookCellKind.Code);
        if (firstCodeCell?.document.languageId === 'python') {
            return true;
        }

        return false;
    }

    /**
     * Set a context key value
     */
    private static async setContext(key: string, value: any): Promise<void> {
        await vscode.commands.executeCommand('setContext', key, value);
    }
}
```

### 2. Kernel Commands (src/web/commands/kernelCommands.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideKernel } from '../pyodideKernel';
import { ContextKeyManager } from '../contextKeyManager';

/**
 * Register kernel management commands
 */
export function registerKernelCommands(
    context: vscode.ExtensionContext,
    kernel: PyodideKernel
): void {
    // Command: Restart Kernel
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.restartKernel', async () => {
            const choice = await vscode.window.showWarningMessage(
                'Restart Pyodide kernel? All variables will be lost.',
                { modal: true },
                'Restart',
                'Cancel'
            );

            if (choice !== 'Restart') {
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Restarting Pyodide kernel...',
                    cancellable: false
                }, async () => {
                    await kernel.restart();
                });

                vscode.window.showInformationMessage('Kernel restarted successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to restart kernel: ${error}`);
            }
        })
    );

    // Command: Interrupt Kernel
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.interruptKernel', async () => {
            try {
                await kernel.interrupt();
                vscode.window.showInformationMessage('Kernel interrupted');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to interrupt kernel: ${error}`);
            }
        })
    );

    // Command: Clear Python Globals
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.clearGlobals', async () => {
            const choice = await vscode.window.showWarningMessage(
                'Clear all Python variables? This cannot be undone.',
                'Clear',
                'Cancel'
            );

            if (choice !== 'Clear') {
                return;
            }

            try {
                await kernel.clearGlobals();
                vscode.window.showInformationMessage('Python globals cleared');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to clear globals: ${error}`);
            }
        })
    );

    // Command: Soft Reset (clear globals and free memory)
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.softReset', async () => {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Performing soft reset...',
                    cancellable: false
                }, async () => {
                    await kernel.softReset();
                });

                vscode.window.showInformationMessage('Soft reset complete');
            } catch (error) {
                vscode.window.showErrorMessage(`Soft reset failed: ${error}`);
            }
        })
    );

    // Command: Show Kernel Status
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.showKernelStatus', async () => {
            const status = await kernel.getStatus();
            
            const items: vscode.QuickPickItem[] = [
                { label: '$(info) Status', detail: status.state },
                { label: '$(package) Installed Packages', detail: `${status.packagesCount} packages` },
                { label: '$(symbol-variable) Global Variables', detail: `${status.globalsCount} variables` },
                { label: '$(database) Memory Usage', detail: status.memoryUsage },
                { label: '$(history) Execution Count', detail: `${status.executionCount} cells executed` }
            ];

            const quickPick = vscode.window.createQuickPick();
            quickPick.items = items;
            quickPick.title = 'Pyodide Kernel Status';
            quickPick.canSelectMany = false;
            quickPick.show();
        })
    );

    // Command: List Global Variables
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.listGlobals', async () => {
            try {
                const globals = await kernel.listGlobals();
                
                if (globals.length === 0) {
                    vscode.window.showInformationMessage('No global variables defined');
                    return;
                }

                const items: vscode.QuickPickItem[] = globals.map(g => ({
                    label: `$(symbol-${g.type}) ${g.name}`,
                    detail: `${g.valueType}${g.size ? ` (${g.size})` : ''}`
                }));

                const quickPick = vscode.window.createQuickPick();
                quickPick.items = items;
                quickPick.title = 'Python Global Variables';
                quickPick.placeholder = 'Search variables...';
                quickPick.show();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list globals: ${error}`);
            }
        })
    );
}
```

### 3. Kernel Status Provider (src/web/pyodideKernel.ts additions)

```typescript
/**
 * Extended PyodideKernel with status and management methods
 */
export class PyodideKernel {
    private executionCount = 0;
    private state: KernelState = KernelState.Idle;

    /**
     * Restart the kernel
     */
    async restart(): Promise<void> {
        this.state = KernelState.Restarting;
        await ContextKeyManager.setKernelBusy(true);

        try {
            // Terminate existing worker
            this.worker.terminate();

            // Create new worker
            this.worker = new Worker(/* worker URL */);
            await this.initializeWorker();

            // Reset counters
            this.executionCount = 0;

            this.state = KernelState.Idle;
            await ContextKeyManager.setKernelReady(true);
        } finally {
            await ContextKeyManager.setKernelBusy(false);
        }
    }

    /**
     * Interrupt current execution
     */
    async interrupt(): Promise<void> {
        if (this.state !== KernelState.Busy) {
            return;
        }

        await this.interruptHandler.interrupt();
    }

    /**
     * Clear Python global variables
     */
    async clearGlobals(): Promise<void> {
        await this.worker.executeCode(`
# Clear all user-defined variables
_builtins = dir(__builtins__)
_to_delete = [name for name in dir() if name not in _builtins and not name.startswith('_')]
for name in _to_delete:
    del globals()[name]

import gc
gc.collect()

print(f"Cleared {len(_to_delete)} variables")
        `);
    }

    /**
     * Soft reset: clear globals and run garbage collection
     */
    async softReset(): Promise<void> {
        await this.clearGlobals();
        
        // Force garbage collection
        await this.worker.executeCode(`
import gc
collected = gc.collect()
print(f"Garbage collected {collected} objects")
        `);
    }

    /**
     * Get kernel status
     */
    async getStatus(): Promise<KernelStatus> {
        const result = await this.worker.executeCode(`
import json
import sys

# Count packages
import sys
packages = len(sys.modules)

# Count globals
globals_count = len([k for k in globals().keys() if not k.startswith('_')])

# Memory (if available)
memory = "N/A"
try:
    import psutil
    memory = f"{psutil.virtual_memory().percent}%"
except:
    pass

print(json.dumps({
    'packages': packages,
    'globals': globals_count,
    'memory': memory
}))
        `);

        const data = JSON.parse(result.output);

        return {
            state: this.state,
            packagesCount: data.packages,
            globalsCount: data.globals,
            memoryUsage: data.memory,
            executionCount: this.executionCount
        };
    }

    /**
     * List global variables with type information
     */
    async listGlobals(): Promise<GlobalVariable[]> {
        const result = await this.worker.executeCode(`
import json
import sys

variables = []
for name in dir():
    if not name.startswith('_'):
        obj = globals()[name]
        var_type = type(obj).__name__
        
        # Get size for certain types
        size = None
        if hasattr(obj, '__len__'):
            try:
                size = len(obj)
            except:
                pass
        
        variables.append({
            'name': name,
            'type': var_type,
            'size': size
        })

print(json.dumps(variables))
        `);

        const data = JSON.parse(result.output);
        return data.map((v: any) => ({
            name: v.name,
            valueType: v.type,
            type: this.getIconType(v.type),
            size: v.size ? `${v.size} items` : undefined
        }));
    }

    private getIconType(pythonType: string): string {
        const typeMap: { [key: string]: string } = {
            'int': 'number',
            'float': 'number',
            'str': 'string',
            'bool': 'boolean',
            'list': 'array',
            'dict': 'object',
            'tuple': 'array',
            'set': 'array',
            'function': 'method',
            'type': 'class',
            'module': 'namespace'
        };

        return typeMap[pythonType] || 'variable';
    }

    /**
     * Update execution count
     */
    incrementExecutionCount(): void {
        this.executionCount++;
    }
}

export enum KernelState {
    Idle = 'idle',
    Busy = 'busy',
    Restarting = 'restarting',
    Error = 'error'
}

export interface KernelStatus {
    state: KernelState;
    packagesCount: number;
    globalsCount: number;
    memoryUsage: string;
    executionCount: number;
}

export interface GlobalVariable {
    name: string;
    valueType: string;
    type: string;
    size?: string;
}
```

### 4. Status Bar Integration (src/web/statusBarProvider.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideKernel, KernelState } from './pyodideKernel';

/**
 * Provides kernel status in VS Code status bar
 */
export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private kernel: PyodideKernel;

    constructor(kernel: PyodideKernel) {
        this.kernel = kernel;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'pyodide.showKernelStatus';
    }

    /**
     * Initialize and show status bar
     */
    show(): void {
        this.update(KernelState.Idle);
        this.statusBarItem.show();
    }

    /**
     * Update status bar based on kernel state
     */
    update(state: KernelState): void {
        switch (state) {
            case KernelState.Idle:
                this.statusBarItem.text = '$(notebook-state-idle) Pyodide Idle';
                this.statusBarItem.tooltip = 'Pyodide kernel is idle\nClick for details';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case KernelState.Busy:
                this.statusBarItem.text = '$(loading~spin) Pyodide Busy';
                this.statusBarItem.tooltip = 'Pyodide kernel is executing';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case KernelState.Restarting:
                this.statusBarItem.text = '$(sync~spin) Pyodide Restarting';
                this.statusBarItem.tooltip = 'Pyodide kernel is restarting';
                this.statusBarItem.backgroundColor = undefined;
                break;

            case KernelState.Error:
                this.statusBarItem.text = '$(error) Pyodide Error';
                this.statusBarItem.tooltip = 'Pyodide kernel encountered an error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.errorBackground'
                );
                break;
        }
    }

    /**
     * Dispose status bar item
     */
    dispose(): void {
        this.statusBarItem.dispose();
    }
}
```

### 5. Package.json Command Contributions

```json
{
  "contributes": {
    "commands": [
      {
        "command": "pyodide.restartKernel",
        "title": "Restart Kernel",
        "category": "Pyodide",
        "icon": "$(debug-restart)"
      },
      {
        "command": "pyodide.interruptKernel",
        "title": "Interrupt Kernel",
        "category": "Pyodide",
        "icon": "$(debug-stop)",
        "enablement": "pyodide.kernelBusy"
      },
      {
        "command": "pyodide.clearGlobals",
        "title": "Clear Python Globals",
        "category": "Pyodide"
      },
      {
        "command": "pyodide.softReset",
        "title": "Soft Reset (Clear & Free Memory)",
        "category": "Pyodide"
      },
      {
        "command": "pyodide.showKernelStatus",
        "title": "Show Kernel Status",
        "category": "Pyodide"
      },
      {
        "command": "pyodide.listGlobals",
        "title": "List Global Variables",
        "category": "Pyodide",
        "enablement": "jupyter.ispythonnotebook"
      }
    ],
    "menus": {
      "commandPalette": [
        {
          "command": "pyodide.restartKernel",
          "when": "jupyter.ispythonnotebook"
        },
        {
          "command": "pyodide.interruptKernel",
          "when": "pyodide.kernelBusy"
        },
        {
          "command": "pyodide.clearGlobals",
          "when": "jupyter.ispythonnotebook"
        },
        {
          "command": "pyodide.softReset",
          "when": "jupyter.ispythonnotebook"
        },
        {
          "command": "pyodide.showKernelStatus",
          "when": "jupyter.ispythonnotebook"
        },
        {
          "command": "pyodide.listGlobals",
          "when": "jupyter.ispythonnotebook"
        }
      ],
      "notebook/toolbar": [
        {
          "command": "pyodide.restartKernel",
          "when": "notebookType == jupyter-notebook && jupyter.ispythonnotebook",
          "group": "navigation@1"
        },
        {
          "command": "pyodide.interruptKernel",
          "when": "notebookType == jupyter-notebook && pyodide.kernelBusy",
          "group": "navigation@2"
        }
      ]
    },
    "keybindings": [
      {
        "command": "pyodide.interruptKernel",
        "key": "ctrl+c",
        "mac": "cmd+c",
        "when": "notebookType == jupyter-notebook && pyodide.kernelBusy"
      }
    ]
  }
}
```

### 6. Active Notebook Tracking (src/web/extension.ts)

```typescript
export async function activate(context: vscode.ExtensionContext) {
    // Initialize context keys
    await ContextKeyManager.initialize();

    // Track active notebook changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveNotebookEditor(async (editor) => {
            await ContextKeyManager.updateForNotebook(editor?.notebook);
        })
    );

    // Track notebook document changes
    context.subscriptions.push(
        vscode.workspace.onDidOpenNotebookDocument(async (notebook) => {
            const activeNotebook = vscode.window.activeNotebookEditor?.notebook;
            if (activeNotebook === notebook) {
                await ContextKeyManager.updateForNotebook(notebook);
            }
        })
    );

    // Initialize kernel and status bar
    const kernel = new PyodideKernel();
    const statusBar = new StatusBarProvider(kernel);
    statusBar.show();

    // Register commands
    registerKernelCommands(context, kernel);

    context.subscriptions.push(statusBar);
}
```

## Test Cases

### Manual Testing Checklist

1. **Kernel Restart**
   - [ ] Open a Jupyter notebook
   - [ ] Execute cells to define variables
   - [ ] Run command "Pyodide: Restart Kernel"
   - [ ] Confirm restart dialog
   - [ ] Verify variables are cleared
   - [ ] Verify status bar shows "Restarting" then "Idle"
   - [ ] Execute new code successfully

2. **Kernel Interrupt**
   - [ ] Execute infinite loop: `while True: pass`
   - [ ] Click interrupt button in toolbar
   - [ ] Verify execution stops
   - [ ] Verify status bar changes from "Busy" to "Idle"
   - [ ] Verify cell shows as interrupted

3. **Clear Globals**
   - [ ] Define several variables
   - [ ] Run "Pyodide: Clear Python Globals"
   - [ ] Verify variables are undefined
   - [ ] Verify imports are cleared
   - [ ] Verify kernel still works

4. **Show Kernel Status**
   - [ ] Run "Pyodide: Show Kernel Status"
   - [ ] Verify status shows:
     - Current state (idle/busy)
     - Number of packages
     - Number of global variables
     - Memory usage
     - Execution count
   - [ ] Execute some cells
   - [ ] Check status again, verify counts updated

5. **List Global Variables**
   - [ ] Define various types of variables:
     ```python
     x = 42
     name = "test"
     data = [1, 2, 3]
     info = {"key": "value"}
     ```
   - [ ] Run "Pyodide: List Global Variables"
   - [ ] Verify all variables shown with correct types
   - [ ] Verify sizes shown for collections

6. **Context Keys**
   - [ ] Open Python notebook
   - [ ] Verify commands appear in Command Palette
   - [ ] Open non-Python file
   - [ ] Verify Python-specific commands hidden
   - [ ] Start cell execution
   - [ ] Verify interrupt button appears in toolbar

7. **Status Bar**
   - [ ] Verify status bar shows "Idle" initially
   - [ ] Execute a cell
   - [ ] Verify status bar shows "Busy" with spinner
   - [ ] After execution, verify returns to "Idle"
   - [ ] Click status bar
   - [ ] Verify status dialog appears

## Common Issues and Solutions

### Issue 1: Commands Not Appearing in Palette
**Symptom**: Kernel commands don't show in Command Palette.

**Solution**:
- Check context keys are set correctly
- Verify `when` clauses in package.json
- Ensure notebook is of type `jupyter-notebook`
- Check extension is activated

### Issue 2: Restart Doesn't Clear All State
**Symptom**: Some variables or imports persist after restart.

**Solution**:
- Ensure worker is fully terminated
- Create completely new worker instance
- Don't reuse any Pyodide state
- Verify restart code:
  ```typescript
  this.worker.terminate();
  this.worker = new Worker(workerUrl);
  ```

### Issue 3: Status Bar Not Updating
**Symptom**: Status bar stuck on "Busy" or doesn't reflect state.

**Solution**:
- Ensure state transitions call `statusBar.update()`
- Check for unhandled exceptions preventing updates
- Verify execution completion handlers are called
- Add logging to track state changes

### Issue 4: Clear Globals Removes Built-ins
**Symptom**: After clearing globals, imports don't work.

**Solution**:
- Filter out built-in names when clearing
- Preserve `__builtins__`, `_`, etc.
- Use code that checks `dir(__builtins__)`:
  ```python
  _builtins = dir(__builtins__)
  _to_delete = [name for name in dir() 
                if name not in _builtins 
                and not name.startswith('_')]
  ```

### Issue 5: Memory Not Freed After Reset
**Symptom**: Soft reset doesn't reduce memory usage.

**Solution**:
- Call Python garbage collector explicitly: `gc.collect()`
- Clear large objects before reset
- Full restart may be needed for significant memory recovery
- Browser may not release memory immediately

### Issue 6: Context Keys Not Working in Web
**Symptom**: `when` clauses don't work in vscode.dev.

**Solution**:
- Verify context keys are set via `setContext` command
- Check for typos in context key names
- Use exact key names from Jupyter extension
- Test in desktop VS Code first to isolate web issues

## Development Workflow

### 1. Testing Context Keys

```typescript
// Debug context key values
async function debugContextKeys() {
    const keys = [
        'pyodide.kernelReady',
        'pyodide.kernelBusy',
        'jupyter.ispythonnotebook',
        'jupyter.webExtension'
    ];

    for (const key of keys) {
        const value = await vscode.commands.executeCommand('getContext', key);
        console.log(`${key}: ${value}`);
    }
}
```

### 2. Logging State Transitions

```typescript
class PyodideKernel {
    private setState(newState: KernelState) {
        console.log(`[Kernel] State transition: ${this.state} -> ${newState}`);
        this.state = newState;
        this.statusBar.update(newState);
    }
}
```

### 3. Testing Commands Programmatically

```typescript
// Test command in development
async function testRestartCommand() {
    await vscode.commands.executeCommand('pyodide.restartKernel');
}
```

### 4. Monitoring Execution Count

```typescript
// Log execution count
execution.start();
this.kernel.incrementExecutionCount();
console.log(`[Kernel] Execution count: ${this.kernel.getExecutionCount()}`);
```

## Next Steps

After completing this step:
1. Proceed to **Step 12**: Build and Test Flow
2. Add telemetry for command usage
3. Implement keyboard shortcuts for common operations
4. Consider adding variable inspector panel

## References

- [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)
- [VS Code Context Keys](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Jupyter Extension Extensibility](https://github.com/microsoft/vscode-jupyter/wiki/Extensibility-for-other-extensions)
- [VS Code Commands](https://code.visualstudio.com/api/extension-guides/command)
- [VS Code Menus](https://code.visualstudio.com/api/references/contribution-points#contributes.menus)
