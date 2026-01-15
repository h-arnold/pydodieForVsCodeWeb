# Step 3: Create the NotebookController

## Overview
Implement the NotebookController using VS Code's Notebook API to handle kernel lifecycle, cell execution, and communication with the Pyodide worker. This controller acts as the bridge between the Jupyter UI and the Python execution engine.

## Research Summary

### NotebookController API
Based on [VS Code Notebook API Documentation](https://code.visualstudio.com/api/extension-guides/notebook):

- `vscode.notebooks.createNotebookController()` creates a controller instance
- Controller must specify: ID, notebook type (`jupyter-notebook`), and label
- `executeHandler` is the core function that processes cell execution
- `NotebookCellExecution` manages execution lifecycle and outputs
- Controllers can be dynamically shown/hidden based on context

### Execution Lifecycle
1. User selects kernel → Controller associated with notebook
2. User runs cell → `executeHandler` invoked with cells array
3. Controller creates `NotebookCellExecution` for each cell
4. Execution starts → `execution.start(timestamp)`
5. Code sent to worker → outputs streamed back
6. Execution ends → `execution.end(success, timestamp)`

### Key API Methods
- `createNotebookController(id, viewType, label)`: Create controller
- `createNotebookCellExecution(cell)`: Start execution context
- `execution.start(startTime)`: Mark execution beginning
- `execution.replaceOutput(outputs)`: Set cell outputs
- `execution.appendOutput(output)`: Add incremental output
- `execution.end(success, endTime)`: Complete execution

## Dependencies

```json
{
  "dependencies": {
    // No additional runtime dependencies beyond @types/vscode
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0"
  }
}
```

## Code Implementation

### 1. src/web/notebookController.ts

```typescript
import * as vscode from 'vscode';
import { PyodideKernel } from './pyodideKernel';
import { CONTROLLER_ID, CONTROLLER_LABEL, NOTEBOOK_TYPE } from '../common/constants';

export class PyodideNotebookController {
    private controller: vscode.NotebookController;
    private kernel: PyodideKernel;
    private executionOrder = 0;

    constructor(context: vscode.ExtensionContext) {
        // Create the notebook controller
        this.controller = vscode.notebooks.createNotebookController(
            CONTROLLER_ID,
            NOTEBOOK_TYPE,
            CONTROLLER_LABEL
        );

        // Set supported languages
        this.controller.supportedLanguages = ['python'];
        
        // Set description and detail
        this.controller.description = 'Python kernel powered by Pyodide (WebAssembly)';
        this.controller.detail = 'Runs Python code directly in your browser';
        
        // Support execution for all cells
        this.controller.supportsExecutionOrder = true;
        
        // Set the execution handler
        this.controller.executeHandler = this.executeHandler.bind(this);
        
        // Optionally set an interrupt handler
        this.controller.interruptHandler = this.interruptHandler.bind(this);

        // Initialize the Pyodide kernel (lazy initialization in Step 4)
        this.kernel = new PyodideKernel(context);

        // Clean up on disposal
        context.subscriptions.push(this.controller);
        context.subscriptions.push(this.kernel);
    }

    /**
     * Main execution handler - called when user runs cells
     */
    private async executeHandler(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this.executeCell(cell, notebook);
        }
    }

    /**
     * Execute a single cell
     */
    private async executeCell(
        cell: vscode.NotebookCell,
        notebook: vscode.NotebookDocument
    ): Promise<void> {
        // Create execution context
        const execution = this.controller.createNotebookCellExecution(cell);
        
        // Start execution
        execution.executionOrder = ++this.executionOrder;
        execution.start(Date.now());

        try {
            // Clear previous outputs
            execution.clearOutput(cell);

            // Get cell source code
            const code = cell.document.getText();

            // Execute code in Pyodide kernel
            const result = await this.kernel.execute(code, (output) => {
                // Stream outputs as they arrive
                this.handleOutput(execution, output);
            });

            // Handle final result
            if (result.success) {
                // Add final result output if present
                if (result.output) {
                    this.appendOutput(execution, result.output);
                }
                execution.end(true, Date.now());
            } else {
                // Handle error
                if (result.error) {
                    this.appendErrorOutput(execution, result.error);
                }
                execution.end(false, Date.now());
            }
        } catch (error) {
            // Handle unexpected errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.appendErrorOutput(execution, errorMessage);
            execution.end(false, Date.now());
        }
    }

    /**
     * Handle interrupt request (Ctrl+C)
     */
    private async interruptHandler(notebook: vscode.NotebookDocument): Promise<void> {
        try {
            await this.kernel.interrupt();
            vscode.window.showInformationMessage('Pyodide kernel interrupted');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to interrupt kernel');
        }
    }

    /**
     * Handle streaming output from kernel
     */
    private handleOutput(
        execution: vscode.NotebookCellExecution,
        output: KernelOutput
    ): void {
        switch (output.type) {
            case 'stdout':
                this.appendStreamOutput(execution, output.text, 'stdout');
                break;
            case 'stderr':
                this.appendStreamOutput(execution, output.text, 'stderr');
                break;
            case 'display_data':
                this.appendDisplayOutput(execution, output.data);
                break;
            case 'error':
                this.appendErrorOutput(execution, output.message, output.traceback);
                break;
        }
    }

    /**
     * Append stream output (stdout/stderr)
     */
    private appendStreamOutput(
        execution: vscode.NotebookCellExecution,
        text: string,
        stream: 'stdout' | 'stderr'
    ): void {
        const output = new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(text, 'text/plain')
        ]);
        
        // Add metadata to distinguish stdout from stderr
        output.metadata = { outputType: stream };
        
        execution.appendOutput(output);
    }

    /**
     * Append display data (rich outputs)
     */
    private appendDisplayOutput(
        execution: vscode.NotebookCellExecution,
        data: Record<string, any>
    ): void {
        const items: vscode.NotebookCellOutputItem[] = [];

        // Convert MIME bundle to output items
        for (const [mimeType, value] of Object.entries(data)) {
            if (mimeType === 'text/plain') {
                items.push(vscode.NotebookCellOutputItem.text(value));
            } else if (mimeType === 'text/html') {
                items.push(vscode.NotebookCellOutputItem.text(value, 'text/html'));
            } else if (mimeType === 'application/json') {
                items.push(vscode.NotebookCellOutputItem.json(value));
            } else if (mimeType === 'image/png') {
                // Decode base64 image
                const imageData = this.decodeBase64(value);
                items.push(vscode.NotebookCellOutputItem.text(imageData, 'image/png'));
            } else if (mimeType === 'image/svg+xml') {
                items.push(vscode.NotebookCellOutputItem.text(value, 'image/svg+xml'));
            } else {
                // Generic MIME type
                items.push(vscode.NotebookCellOutputItem.text(value, mimeType));
            }
        }

        if (items.length > 0) {
            const output = new vscode.NotebookCellOutput(items);
            output.metadata = { outputType: 'display_data' };
            execution.appendOutput(output);
        }
    }

    /**
     * Append error output
     */
    private appendErrorOutput(
        execution: vscode.NotebookCellExecution,
        message: string,
        traceback?: string[]
    ): void {
        const output = new vscode.NotebookCellOutput(
            [
                vscode.NotebookCellOutputItem.error({
                    name: 'Error',
                    message: message,
                    stack: traceback?.join('\n') || message
                })
            ]
        );
        
        output.metadata = { outputType: 'error' };
        execution.appendOutput(output);
    }

    /**
     * Append generic output
     */
    private appendOutput(
        execution: vscode.NotebookCellExecution,
        output: any
    ): void {
        if (typeof output === 'string') {
            this.appendStreamOutput(execution, output, 'stdout');
        } else if (output && typeof output === 'object') {
            this.appendDisplayOutput(execution, output);
        }
    }

    /**
     * Decode base64 string to binary
     */
    private decodeBase64(base64: string): string {
        // Remove data URL prefix if present
        const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
        return cleanBase64;
    }

    /**
     * Restart the kernel
     */
    public async restart(): Promise<void> {
        await this.kernel.restart();
        this.executionOrder = 0;
        vscode.window.showInformationMessage('Pyodide kernel restarted');
    }

    /**
     * Dispose the controller
     */
    public dispose(): void {
        this.controller.dispose();
        this.kernel.dispose();
    }
}

/**
 * Kernel output interface
 */
interface KernelOutput {
    type: 'stdout' | 'stderr' | 'display_data' | 'error' | 'result';
    text?: string;
    data?: Record<string, any>;
    message?: string;
    traceback?: string[];
}
```

### 2. src/web/pyodideKernel.ts (Stub for Step 4)

```typescript
import * as vscode from 'vscode';

/**
 * Pyodide kernel interface
 * Full implementation in Step 4
 */
export class PyodideKernel implements vscode.Disposable {
    constructor(context: vscode.ExtensionContext) {
        // Initialize worker (Step 4)
    }

    /**
     * Execute Python code
     * @param code Python code to execute
     * @param onOutput Callback for streaming outputs
     */
    public async execute(
        code: string,
        onOutput: (output: any) => void
    ): Promise<ExecutionResult> {
        // TODO: Implement in Step 4
        return {
            success: true,
            output: `Executed: ${code.substring(0, 50)}...`
        };
    }

    /**
     * Interrupt running code
     */
    public async interrupt(): Promise<void> {
        // TODO: Implement in Step 4
    }

    /**
     * Restart the kernel
     */
    public async restart(): Promise<void> {
        // TODO: Implement in Step 4
    }

    public dispose(): void {
        // TODO: Implement in Step 4
    }
}

interface ExecutionResult {
    success: boolean;
    output?: any;
    error?: string;
}
```

### 3. Update src/web/extension.ts

```typescript
import * as vscode from 'vscode';
import { PyodideNotebookController } from './notebookController';

let controller: PyodideNotebookController | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pyodide Kernel extension is now active in web mode');

    // Create the notebook controller
    controller = new PyodideNotebookController(context);

    // Register restart command
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.restartKernel', async () => {
            if (controller) {
                await controller.restart();
            }
        })
    );

    // Register other commands (Step 11)
    registerCommands(context, controller);

    return {
        // Export API for other extensions
        getController: () => controller
    };
}

function registerCommands(
    context: vscode.ExtensionContext,
    controller: PyodideNotebookController
): void {
    // Additional commands will be implemented in Step 11
    
    // Clear outputs command
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.clearOutputs', async () => {
            const editor = vscode.window.activeNotebookEditor;
            if (editor) {
                // Clear all cell outputs
                const edit = new vscode.WorkspaceEdit();
                for (const cell of editor.notebook.getCells()) {
                    edit.replaceNotebookCellOutput(editor.notebook.uri, cell.index, []);
                }
                await vscode.workspace.applyEdit(edit);
            }
        })
    );
}

export function deactivate() {
    if (controller) {
        controller.dispose();
    }
}
```

## Test Cases

### 1. Controller Creation Test

```typescript
// test/controller.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('NotebookController Tests', () => {
    let controller: vscode.NotebookController | undefined;

    setup(async () => {
        const ext = vscode.extensions.getExtension('your-publisher.pyodide-vscode-web');
        await ext?.activate();
        
        // Get controller from extension API
        const api = ext?.exports;
        controller = api?.getController()?.controller;
    });

    test('Controller should be created', () => {
        assert.ok(controller, 'Controller not created');
        assert.strictEqual(controller.id, 'pyodide-kernel');
        assert.strictEqual(controller.label, 'Pyodide (Web)');
    });

    test('Controller should support Python', () => {
        assert.ok(controller);
        assert.ok(controller.supportedLanguages?.includes('python'));
    });

    test('Controller should support execution order', () => {
        assert.ok(controller);
        assert.strictEqual(controller.supportsExecutionOrder, true);
    });
});
```

### 2. Cell Execution Test

```typescript
suite('Cell Execution Tests', () => {
    test('Execute simple print statement', async () => {
        // Create a new notebook
        const notebook = await vscode.workspace.openNotebookDocument(
            'jupyter-notebook',
            new vscode.NotebookData([
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'print("Hello, Pyodide!")',
                    'python'
                )
            ])
        );

        // Show notebook
        const editor = await vscode.window.showNotebookDocument(notebook);
        
        // Execute cell
        const cell = notebook.cellAt(0);
        await vscode.commands.executeCommand('notebook.cell.execute', {
            ranges: [{ start: 0, end: 1 }],
            document: notebook.uri
        });

        // Wait for execution
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify output
        assert.strictEqual(cell.outputs.length, 1);
        const output = cell.outputs[0];
        assert.ok(output.items.length > 0);
        
        const textOutput = output.items.find(item => item.mime === 'text/plain');
        assert.ok(textOutput);
    });

    test('Execute expression returns value', async () => {
        const notebook = await vscode.workspace.openNotebookDocument(
            'jupyter-notebook',
            new vscode.NotebookData([
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    '2 + 2',
                    'python'
                )
            ])
        );

        await vscode.window.showNotebookDocument(notebook);
        const cell = notebook.cellAt(0);
        
        await vscode.commands.executeCommand('notebook.cell.execute', {
            ranges: [{ start: 0, end: 1 }],
            document: notebook.uri
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        assert.ok(cell.outputs.length > 0);
        // Should output '4'
    });

    test('Execute error shows traceback', async () => {
        const notebook = await vscode.workspace.openNotebookDocument(
            'jupyter-notebook',
            new vscode.NotebookData([
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'raise ValueError("Test error")',
                    'python'
                )
            ])
        );

        await vscode.window.showNotebookDocument(notebook);
        const cell = notebook.cellAt(0);
        
        await vscode.commands.executeCommand('notebook.cell.execute', {
            ranges: [{ start: 0, end: 1 }],
            document: notebook.uri
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        assert.ok(cell.outputs.length > 0);
        const output = cell.outputs[0];
        assert.strictEqual(output.metadata?.outputType, 'error');
    });
});
```

### 3. Multiple Cell Execution Test

```typescript
suite('Multiple Cell Execution', () => {
    test('Execute multiple cells in order', async () => {
        const notebook = await vscode.workspace.openNotebookDocument(
            'jupyter-notebook',
            new vscode.NotebookData([
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'x = 10',
                    'python'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'y = 20',
                    'python'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    'x + y',
                    'python'
                )
            ])
        );

        await vscode.window.showNotebookDocument(notebook);
        
        // Execute all cells
        await vscode.commands.executeCommand('notebook.execute');
        
        // Wait for all executions
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify execution order
        const cell1 = notebook.cellAt(0);
        const cell2 = notebook.cellAt(1);
        const cell3 = notebook.cellAt(2);

        // All cells should have executed
        assert.ok(cell1.executionSummary);
        assert.ok(cell2.executionSummary);
        assert.ok(cell3.executionSummary);

        // Last cell should output 30
        assert.ok(cell3.outputs.length > 0);
    });
});
```

### 4. Manual Testing Checklist

- [ ] **Controller Discovery**
  - [ ] Open .ipynb file in vscode.dev
  - [ ] Click "Select Kernel"
  - [ ] Verify "Pyodide (Web)" appears in list
  - [ ] Select kernel successfully

- [ ] **Basic Execution**
  - [ ] Execute `print("Hello")` → outputs "Hello"
  - [ ] Execute `2 + 2` → outputs "4"
  - [ ] Execute `x = 10` → no output
  - [ ] Execute `x` → outputs "10"

- [ ] **Output Streaming**
  - [ ] Execute code with multiple print statements
  - [ ] Verify outputs appear incrementally (if implemented)
  - [ ] Verify outputs are in correct order

- [ ] **Error Handling**
  - [ ] Execute `1/0` → shows ZeroDivisionError
  - [ ] Execute invalid syntax → shows SyntaxError
  - [ ] Verify traceback is displayed

- [ ] **Cell State**
  - [ ] Execute cell → shows running indicator
  - [ ] After completion → shows execution time
  - [ ] Shows execution order number

- [ ] **Interrupt**
  - [ ] Execute long-running code
  - [ ] Click interrupt button
  - [ ] Verify execution stops (if implemented)

## Common Issues and Solutions

### Issue 1: Controller not appearing in kernel picker
**Solution**: Verify controller is created with correct notebook type (`jupyter-notebook`)

### Issue 2: Execution never completes
**Solution**: Ensure `execution.end()` is called in all code paths (success, error, exception)

### Issue 3: Outputs not displaying
**Solution**: Check MIME types are correctly set in `NotebookCellOutputItem`

### Issue 4: Multiple outputs overwriting each other
**Solution**: Use `appendOutput()` instead of `replaceOutput()` for incremental outputs

### Issue 5: Execution order not incrementing
**Solution**: Increment `executionOrder` before each execution, not after

## Next Steps

After completing this step:
1. Proceed to **Step 4**: Add a Dedicated Pyodide Worker
2. Test controller creation and basic structure
3. Implement the full `PyodideKernel` class

## References

- [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)
- [NotebookController API Reference](https://code.visualstudio.com/api/references/vscode-api#NotebookController)
- [NotebookCellExecution API](https://code.visualstudio.com/api/references/vscode-api#NotebookCellExecution)
- [Jupyter MIME Types](https://ipython.readthedocs.io/en/stable/development/wrapperkernels.html#display-data)
