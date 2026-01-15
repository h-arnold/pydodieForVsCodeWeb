# Step 5: Wire Controller Execution to Worker

## Overview
Connect the NotebookController's execution handler to the Pyodide worker, implementing the full execution lifecycle: cell queuing, code transmission, output streaming, and completion signaling. This step transforms the registered controller from a passive declaration into an active execution engine.

## Research Summary

### NotebookCellExecution Lifecycle
Based on [VS Code Notebook API Documentation](https://code.visualstudio.com/api/extension-guides/notebook):

The execution lifecycle follows this pattern:
```
User triggers cell execution
    ↓
executeHandler called with cells array
    ↓
Create NotebookCellExecution for each cell
    ↓
execution.start(startTime) - marks cell as running
    ↓
Send code to Pyodide worker
    ↓
Receive outputs via worker messages
    ↓
execution.replaceOutput() or appendOutput() - display results
    ↓
execution.end(success, endTime) - mark complete/failed
```

### Key API Methods

1. **NotebookCellExecution Creation**
   - `notebooks.createNotebookCellExecution(cell)` - Creates execution handle
   - Returns a NotebookCellExecution object tied to specific cell

2. **Execution Control**
   - `execution.start(startTime?)` - Begin execution, show spinner
   - `execution.end(success, endTime?)` - Complete execution, remove spinner
   - Must call both start() and end() for proper UI feedback

3. **Output Management**
   - `execution.replaceOutput(output)` - Replace all existing outputs
   - `execution.appendOutput(output)` - Add output to existing
   - `execution.clearOutput()` - Remove all outputs
   - Outputs are NotebookCellOutput arrays containing NotebookCellOutputItem

4. **Execution Token**
   - `execution.token` - CancellationToken for this execution
   - Monitor `token.isCancellationRequested` to handle interrupts

### Message Flow Architecture

```
NotebookController (Extension Host Worker)
        ↓ postMessage(RUN)
Pyodide Worker
        ↓ execute code
        ↓ postMessage(STDOUT) - continuous
        ↓ postMessage(STDERR) - on errors
        ↓ postMessage(RESULT) - final value
        ↑
NotebookController receives messages
        ↓ execution.appendOutput()
        ↓ execution.end()
```

## Dependencies

### VS Code API
```typescript
import * as vscode from 'vscode';

// Key types:
- NotebookController
- NotebookCell
- NotebookCellExecution
- NotebookCellOutput
- NotebookCellOutputItem
- CancellationToken
```

### Internal Dependencies
```typescript
import { PyodideWorkerManager } from './workerManager';
import { MessageType } from '../common/types';
import { CONTROLLER_ID, CONTROLLER_LABEL, NOTEBOOK_TYPE } from '../common/constants';
```

## Code Implementation

### 1. PyodideKernel Class (src/web/pyodideKernel.ts)

```typescript
/**
 * PyodideKernel - Manages execution of notebook cells via Pyodide worker
 */

import * as vscode from 'vscode';
import { PyodideWorkerManager } from './workerManager';

export class PyodideKernel {
    private workerManager: PyodideWorkerManager;
    private executionOrder = 0;

    constructor(private context: vscode.ExtensionContext) {
        this.workerManager = new PyodideWorkerManager(context);
    }

    /**
     * Execute a single notebook cell
     */
    async executeCell(
        cell: vscode.NotebookCell,
        controller: vscode.NotebookController
    ): Promise<void> {
        // Create execution handle
        const execution = controller.createNotebookCellExecution(cell);
        
        // Increment execution order
        execution.executionOrder = ++this.executionOrder;
        
        // Start execution (show spinner, set state to running)
        execution.start(Date.now());

        try {
            // Ensure worker is initialized
            await this.workerManager.initialize();

            // Get cell code
            const code = cell.document.getText();

            // Track outputs
            const outputs: string[] = [];
            const errors: string[] = [];

            // Execute code with callbacks for streaming output
            await this.workerManager.executeCode(code, {
                onStdout: (content: string) => {
                    // Append stdout to outputs
                    outputs.push(content);
                    this.appendTextOutput(execution, content, 'stdout');
                },
                onStderr: (content: string) => {
                    // Append stderr to errors
                    errors.push(content);
                    this.appendTextOutput(execution, content, 'stderr');
                },
                onResult: (result: any, resultType?: string) => {
                    // Display final result if not None/undefined
                    if (result !== undefined && result !== null) {
                        this.appendResultOutput(execution, result, resultType);
                    }
                },
                onError: (error: string, traceback?: string) => {
                    // Display error output
                    this.appendErrorOutput(execution, error, traceback);
                }
            });

            // End execution successfully
            execution.end(true, Date.now());

        } catch (error) {
            // Execution failed
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Show error in cell output
            const errorOutput = new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.error(new Error(errorMessage))
            ]);
            execution.replaceOutput([errorOutput]);

            // End execution with failure
            execution.end(false, Date.now());
        }
    }

    /**
     * Execute multiple cells
     */
    async executeCells(
        cells: vscode.NotebookCell[],
        controller: vscode.NotebookController
    ): Promise<void> {
        // Execute cells sequentially
        for (const cell of cells) {
            await this.executeCell(cell, controller);
        }
    }

    /**
     * Append text output (stdout/stderr)
     */
    private appendTextOutput(
        execution: vscode.NotebookCellExecution,
        content: string,
        stream: 'stdout' | 'stderr'
    ): void {
        const outputItem = vscode.NotebookCellOutputItem.text(
            content,
            'text/plain'
        );

        const output = new vscode.NotebookCellOutput([outputItem], {
            ['outputType']: stream // Metadata to distinguish stdout vs stderr
        });

        execution.appendOutput([output]);
    }

    /**
     * Append result output (return value)
     */
    private appendResultOutput(
        execution: vscode.NotebookCellExecution,
        result: any,
        resultType?: string
    ): void {
        // Convert result to appropriate format
        let outputItems: vscode.NotebookCellOutputItem[] = [];

        if (resultType === 'string') {
            outputItems.push(
                vscode.NotebookCellOutputItem.text(result, 'text/plain')
            );
        } else if (resultType === 'number' || resultType === 'boolean') {
            outputItems.push(
                vscode.NotebookCellOutputItem.text(String(result), 'text/plain')
            );
        } else if (resultType === 'object') {
            // Try to serialize as JSON
            try {
                const json = JSON.stringify(result, null, 2);
                outputItems.push(
                    vscode.NotebookCellOutputItem.text(json, 'application/json')
                );
            } catch {
                // Fallback to string representation
                outputItems.push(
                    vscode.NotebookCellOutputItem.text(String(result), 'text/plain')
                );
            }
        } else {
            // Unknown type, use string representation
            outputItems.push(
                vscode.NotebookCellOutputItem.text(String(result), 'text/plain')
            );
        }

        const output = new vscode.NotebookCellOutput(outputItems);
        execution.appendOutput([output]);
    }

    /**
     * Append error output
     */
    private appendErrorOutput(
        execution: vscode.NotebookCellExecution,
        error: string,
        traceback?: string
    ): void {
        // Create error object
        const errorObj = new Error(error);
        
        // Add traceback to stack if available
        if (traceback) {
            errorObj.stack = traceback;
        }

        const output = new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(errorObj)
        ]);

        execution.appendOutput([output]);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.workerManager.dispose();
    }
}
```

### 2. NotebookController Registration (src/web/notebookController.ts)

```typescript
/**
 * Register and configure the Pyodide notebook controller
 */

import * as vscode from 'vscode';
import { PyodideKernel } from './pyodideKernel';
import { CONTROLLER_ID, CONTROLLER_LABEL, NOTEBOOK_TYPE } from '../common/constants';

export function registerNotebookController(
    context: vscode.ExtensionContext
): vscode.NotebookController {
    // Create kernel instance
    const kernel = new PyodideKernel(context);

    // Create notebook controller
    const controller = vscode.notebooks.createNotebookController(
        CONTROLLER_ID,
        NOTEBOOK_TYPE,
        CONTROLLER_LABEL
    );

    // Configure controller
    controller.supportedLanguages = ['python'];
    controller.supportsExecutionOrder = true;
    controller.description = 'Run Python code in the browser using Pyodide (WebAssembly)';

    // Set execution handler
    controller.executeHandler = async (
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController
    ) => {
        // Execute cells via kernel
        await kernel.executeCells(cells, controller);
    };

    // Add interrupt handler (if supported)
    controller.interruptHandler = async (notebook: vscode.NotebookDocument) => {
        // TODO: Implement interruption via worker
        vscode.window.showWarningMessage(
            'Interruption not fully supported in web environment without SharedArrayBuffer'
        );
    };

    // Register for disposal
    context.subscriptions.push(controller);
    context.subscriptions.push({
        dispose: () => kernel.dispose()
    });

    return controller;
}
```

### 3. Updated Extension Entry Point (src/web/extension.ts)

```typescript
import * as vscode from 'vscode';
import { registerNotebookController } from './notebookController';

let controller: vscode.NotebookController;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pyodide Kernel extension is now active in web mode');

    // Register notebook controller
    controller = registerNotebookController(context);

    // Register restart kernel command
    const restartCommand = vscode.commands.registerCommand(
        'pyodide-kernel.restartKernel',
        async () => {
            // Dispose and recreate controller
            controller.dispose();
            controller = registerNotebookController(context);
            vscode.window.showInformationMessage('Pyodide kernel restarted');
        }
    );
    context.subscriptions.push(restartCommand);

    return {
        controller
    };
}

export function deactivate() {
    console.log('Pyodide Kernel extension deactivated');
}
```

### 4. Update Constants (src/common/constants.ts)

```typescript
/**
 * Extension constants
 */
export const EXTENSION_ID = 'pyodide-vscode-web';
export const CONTROLLER_ID = 'pyodide-kernel';
export const CONTROLLER_LABEL = 'Pyodide (Web)';
export const NOTEBOOK_TYPE = 'jupyter-notebook';

/**
 * Pyodide configuration
 */
export const PYODIDE_VERSION = '0.25.0';
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * Execution settings
 */
export const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB max per output
export const EXECUTION_TIMEOUT = 30000; // 30 seconds default timeout
```

### 5. Enhanced Worker Manager with Timeout Support (src/web/workerManager.ts - Addition)

```typescript
// Add to PyodideWorkerManager class

/**
 * Execute code with timeout
 */
async executeCodeWithTimeout(
    code: string,
    callbacks?: WorkerCallbacks,
    timeoutMs: number = 30000
): Promise<any> {
    return Promise.race([
        this.executeCode(code, callbacks),
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Execution timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        })
    ]);
}
```

### 6. Package.json Updates

```json
{
  "contributes": {
    "commands": [
      {
        "command": "pyodide-kernel.restartKernel",
        "title": "Restart Pyodide Kernel",
        "category": "Pyodide"
      }
    ],
    "menus": {
      "notebook/toolbar": [
        {
          "command": "pyodide-kernel.restartKernel",
          "when": "jupyter.webExtension && notebookKernel == pyodide-kernel"
        }
      ]
    }
  }
}
```

## Test Cases

### Automated Tests

```typescript
// test/suite/execution.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Cell Execution Tests', () => {
    let notebook: vscode.NotebookDocument;
    let controller: vscode.NotebookController;

    setup(async () => {
        // Create test notebook
        notebook = await vscode.workspace.openNotebookDocument(
            'jupyter-notebook',
            { cells: [] }
        );

        // Get controller
        const extension = vscode.extensions.getExtension('your-publisher.pyodide-vscode-web');
        const api = await extension?.activate();
        controller = api.controller;
    });

    test('Execute simple expression', async () => {
        const cell = notebook.cellAt(0);
        await controller.executeHandler([cell], notebook, controller);
        
        // Check execution order was set
        assert.ok(cell.executionSummary?.executionOrder);
        
        // Check success
        assert.strictEqual(cell.executionSummary?.success, true);
    });

    test('Execute with stdout output', async () => {
        // Create cell with print statement
        const cell = createCell('print("Hello, World!")');
        
        await controller.executeHandler([cell], notebook, controller);
        
        // Verify output
        assert.strictEqual(cell.outputs.length, 1);
        assert.ok(cell.outputs[0].items[0].data.toString().includes('Hello'));
    });

    test('Execute with error', async () => {
        const cell = createCell('1 / 0');
        
        await controller.executeHandler([cell], notebook, controller);
        
        // Verify error output
        assert.strictEqual(cell.executionSummary?.success, false);
        assert.ok(cell.outputs.length > 0);
    });

    test('Sequential cell execution', async () => {
        const cell1 = createCell('x = 5');
        const cell2 = createCell('x + 3');
        
        await controller.executeHandler([cell1, cell2], notebook, controller);
        
        // Verify both executed
        assert.ok(cell1.executionSummary?.success);
        assert.ok(cell2.executionSummary?.success);
        
        // Verify execution order
        assert.ok(cell1.executionSummary!.executionOrder! < 
                  cell2.executionSummary!.executionOrder!);
    });
});
```

### Manual Testing Checklist

1. **Basic Execution**
   - [ ] Open a .ipynb file in vscode.dev
   - [ ] Select "Pyodide (Web)" kernel from picker
   - [ ] Create cell with `2 + 2`
   - [ ] Run cell (Shift+Enter or Run button)
   - [ ] Verify output shows `4`
   - [ ] Verify cell has green checkmark (success)
   - [ ] Verify execution order appears (e.g., [1])

2. **Output Streaming**
   - [ ] Cell: `print("Line 1")\nprint("Line 2")`
   - [ ] Verify both lines appear in output
   - [ ] Verify outputs appear incrementally (not all at once)

3. **Error Handling**
   - [ ] Cell: `undefined_variable`
   - [ ] Verify error output appears
   - [ ] Verify cell shows red X (failure)
   - [ ] Verify traceback is readable

4. **State Persistence**
   - [ ] Cell 1: `x = 10`
   - [ ] Cell 2: `y = 20`
   - [ ] Cell 3: `x + y`
   - [ ] Verify Cell 3 outputs `30`
   - [ ] Verify variables persist across cells

5. **Multiple Cell Execution**
   - [ ] Select multiple cells
   - [ ] Run all (Run → Run All)
   - [ ] Verify cells execute sequentially
   - [ ] Verify execution orders increment correctly

6. **Execution Order**
   - [ ] Execute Cell 3, then Cell 1, then Cell 2
   - [ ] Verify execution order is [1], [2], [3]
   - [ ] Re-execute Cell 1
   - [ ] Verify execution order updates to [4]

7. **Long-Running Code**
   - [ ] Cell: `import time\ntime.sleep(2)\nprint("Done")`
   - [ ] Verify spinner shows during execution
   - [ ] Verify "Done" appears after 2 seconds

8. **Restart Kernel**
   - [ ] Define variable: `x = 100`
   - [ ] Run restart kernel command
   - [ ] Try to access `x`
   - [ ] Verify NameError (variable no longer exists)

## Common Issues and Solutions

### Issue 1: Cells execute but no output appears
**Cause**: Execution handler not properly calling appendOutput()

**Solution**:
- Verify callbacks are passed to worker manager
- Check that onStdout/onResult are being called
- Add logging to trace output flow
- Ensure NotebookCellOutput is created correctly

### Issue 2: Execution order not incrementing
**Cause**: Not setting executionOrder on NotebookCellExecution

**Solution**:
```typescript
execution.executionOrder = ++this.executionOrder;
```

### Issue 3: Cell stays in "running" state forever
**Cause**: execution.end() not called on error

**Solution**:
- Wrap execution in try/catch
- Always call execution.end() in finally block
- Set success=false on error

### Issue 4: Variables don't persist between cells
**Cause**: Worker is restarting between executions

**Solution**:
- Ensure single PyodideWorkerManager instance
- Don't dispose worker after each execution
- Verify worker stays alive in manager

### Issue 5: Outputs appear out of order
**Cause**: Async race condition with appendOutput

**Solution**:
- Ensure sequential execution of cells
- Use await for all async operations
- Consider queueing outputs if needed

### Issue 6: Error outputs not formatted correctly
**Cause**: NotebookCellOutputItem.error() not used properly

**Solution**:
```typescript
const errorObj = new Error(errorMessage);
if (traceback) {
    errorObj.stack = traceback;
}
const output = new vscode.NotebookCellOutput([
    vscode.NotebookCellOutputItem.error(errorObj)
]);
```

### Issue 7: Interrupt doesn't work
**Cause**: SharedArrayBuffer not available in vscode.dev

**Solution**:
- Document limitation
- Provide restart kernel as alternative
- Consider timeout-based termination
- Show warning when interrupt attempted

## Development Workflow

### 1. Test Execution Flow
```typescript
// In browser console
const ext = vscode.extensions.getExtension('your-publisher.pyodide-vscode-web');
const api = await ext.activate();

// Test single cell execution
const notebook = vscode.window.activeNotebookEditor?.notebook;
const cell = notebook.cellAt(0);
await api.controller.executeHandler([cell], notebook, api.controller);
```

### 2. Debug Output Handling
```typescript
// Add debug logging to PyodideKernel
private appendTextOutput(execution, content, stream) {
    console.log(`[${stream}]`, content);
    // ... rest of implementation
}
```

### 3. Monitor Execution State
```javascript
// In DevTools console
// Check active executions
vscode.notebooks.notebookDocuments.forEach(nb => {
    console.log('Notebook:', nb.uri.toString());
    nb.getCells().forEach(cell => {
        console.log('Cell:', cell.index, 
                    'Order:', cell.executionSummary?.executionOrder,
                    'Success:', cell.executionSummary?.success);
    });
});
```

### 4. Performance Testing
```typescript
// Time cell execution
const startTime = Date.now();
await controller.executeHandler([cell], notebook, controller);
const duration = Date.now() - startTime;
console.log(`Execution took ${duration}ms`);
```

### 5. Test Error Scenarios
```python
# Test various error types

# Syntax error
x = 

# Runtime error
1 / 0

# Name error
undefined_var

# Import error
import nonexistent_module

# Type error
"string" + 123
```

## Next Steps

After completing this step:

1. **Proceed to Step 6**: Implement stdout/stderr capture in the worker
2. **Verify Execution Flow**:
   - Test various code patterns
   - Verify output ordering
   - Test error handling thoroughly
3. **Optimize Performance**:
   - Profile execution times
   - Reduce message passing overhead
   - Implement output batching
4. **Enhance UX**:
   - Add progress indicators
   - Show initialization status
   - Provide better error messages

## References

- [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook) - Complete notebook API documentation
- [NotebookController API](https://code.visualstudio.com/api/references/vscode-api#NotebookController) - Controller interface reference
- [NotebookCellExecution API](https://code.visualstudio.com/api/references/vscode-api#NotebookCellExecution) - Execution lifecycle management
- [Jupyter Extension Wiki](https://github.com/microsoft/vscode-jupyter/wiki) - Integration patterns with Jupyter extension
- [Native Notebooks Introduction](https://github.com/microsoft/vscode-jupyter/wiki/Introducing-Native-Notebooks) - Background on VS Code notebook architecture
- [Accessing Jupyter Kernels](https://github.com/microsoft/vscode-jupyter/wiki/Accessing-Jupyter-Kernels-from-3rd-party-extensions) - Third-party kernel integration guide
