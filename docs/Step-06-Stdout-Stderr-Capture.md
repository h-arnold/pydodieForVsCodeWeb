# Step 6: Capture and Stream stdout/stderr

## Overview
Implement comprehensive output capture in the Pyodide worker using `pyodide.setStdout()` and `pyodide.setStderr()` to intercept all print statements, error messages, and tracebacks. This step enables real-time streaming of console output to notebook cells, creating an authentic interactive Python experience.

## Research Summary

### Pyodide Stream Redirection
Based on [Pyodide Stream Redirection Documentation](https://pyodide.org/en/stable/usage/streams.html):

- **pyodide.setStdout(callback)**: Redirects stdout to a custom JavaScript callback
- **pyodide.setStderr(callback)**: Redirects stderr to a custom JavaScript callback
- **Batching**: Callbacks receive buffered characters, not individual bytes
- **Flushing**: Explicit flush() calls or newlines trigger callback invocation
- **Persistence**: Redirection persists across multiple code executions

### Output Batching Strategy

To reduce message overhead between worker and extension host:

```
Python code executes → Output generated
    ↓
Accumulate in buffer
    ↓
Flush on newline OR buffer full OR execution complete
    ↓
Single postMessage to extension host
    ↓
Display in notebook cell
```

**Benefits:**
- Reduces postMessage calls by 10-100x
- Improves performance for code with heavy output
- Maintains output ordering
- Prevents UI thrashing from rapid updates

### Final Expression Capture

In Jupyter, the last expression's value is automatically displayed:

```python
x = 5
y = 10
x + y  # This will display "15"
```

Pyodide's `runPythonAsync()` returns this value, which must be:
1. Captured after execution
2. Converted to appropriate MIME type
3. Displayed as cell output (separate from stdout)

## Dependencies

### Pyodide APIs
```javascript
// Available after loadPyodide()
pyodide.setStdout(callback: (text: string) => void)
pyodide.setStderr(callback: (text: string) => void)
pyodide.runPythonAsync(code: string): Promise<any>
```

### Message Protocol Extensions
```typescript
// Already defined in src/common/types.ts
interface StdoutMessage {
    type: MessageType.STDOUT;
    id: string;
    content: string;
    batch?: boolean;  // NEW: Indicates batched output
}

interface StderrMessage {
    type: MessageType.STDERR;
    id: string;
    content: string;
    batch?: boolean;  // NEW: Indicates batched output
}
```

## Code Implementation

### 1. Enhanced Pyodide Worker with Stream Capture (src/web/pyodideWorker.ts)

```typescript
/**
 * Pyodide Web Worker with stdout/stderr capture
 */

import { MessageType, WorkerMessage, InitMessage, RunMessage } from '../common/types';

// Global Pyodide instance
let pyodide: any = null;
let isInitialized = false;
let isInitializing = false;

// Output buffering
let stdoutBuffer: string[] = [];
let stderrBuffer: string[] = [];
let currentExecutionId: string | null = null;

// Batching configuration
const BATCH_DELAY_MS = 50; // Wait up to 50ms before flushing
const BATCH_SIZE_CHARS = 1000; // Flush if buffer exceeds 1000 chars
let flushTimeout: number | null = null;

/**
 * Pyodide CDN configuration
 */
const PYODIDE_VERSION = '0.25.0';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

function log(message: string, ...args: any[]) {
    console.log(`[PyodideWorker] ${message}`, ...args);
}

function sendMessage(message: WorkerMessage) {
    self.postMessage(message);
}

/**
 * Flush stdout buffer
 */
function flushStdout() {
    if (stdoutBuffer.length === 0) return;
    if (!currentExecutionId) return;

    const content = stdoutBuffer.join('');
    stdoutBuffer = [];

    sendMessage({
        type: MessageType.STDOUT,
        id: currentExecutionId,
        content: content,
        batch: true
    });
}

/**
 * Flush stderr buffer
 */
function flushStderr() {
    if (stderrBuffer.length === 0) return;
    if (!currentExecutionId) return;

    const content = stderrBuffer.join('');
    stderrBuffer = [];

    sendMessage({
        type: MessageType.STDERR,
        id: currentExecutionId,
        content: content,
        batch: true
    });
}

/**
 * Schedule automatic flush
 */
function scheduleFlush() {
    if (flushTimeout !== null) {
        clearTimeout(flushTimeout);
    }

    flushTimeout = setTimeout(() => {
        flushStdout();
        flushStderr();
        flushTimeout = null;
    }, BATCH_DELAY_MS) as unknown as number;
}

/**
 * Stdout callback - called by Pyodide when print() or sys.stdout.write() executes
 */
function handleStdout(text: string) {
    if (!currentExecutionId) return;

    stdoutBuffer.push(text);

    // Flush immediately on newline or if buffer is large
    if (text.includes('\n') || stdoutBuffer.join('').length > BATCH_SIZE_CHARS) {
        flushStdout();
    } else {
        // Schedule delayed flush for partial lines
        scheduleFlush();
    }
}

/**
 * Stderr callback - called by Pyodide for errors and warnings
 */
function handleStderr(text: string) {
    if (!currentExecutionId) return;

    stderrBuffer.push(text);

    // Flush immediately on newline or if buffer is large
    if (text.includes('\n') || stderrBuffer.join('').length > BATCH_SIZE_CHARS) {
        flushStderr();
    } else {
        // Schedule delayed flush for partial lines
        scheduleFlush();
    }
}

/**
 * Initialize Pyodide runtime with stream redirection
 */
async function initializePyodide(config?: { indexURL?: string; packages?: string[] }) {
    if (isInitialized) {
        log('Pyodide already initialized');
        return;
    }

    if (isInitializing) {
        log('Pyodide initialization already in progress');
        return;
    }

    isInitializing = true;
    log('Starting Pyodide initialization...');

    try {
        const indexURL = config?.indexURL || PYODIDE_CDN;
        log(`Loading Pyodide from ${indexURL}`);
        
        importScripts(`${indexURL}pyodide.js`);
        const loadPyodide = (self as any).loadPyodide;
        
        if (!loadPyodide) {
            throw new Error('loadPyodide not available after importing script');
        }

        pyodide = await loadPyodide({ indexURL });
        log(`Pyodide ${pyodide.version} loaded successfully`);

        // Configure stdout/stderr redirection
        log('Setting up stdout/stderr redirection...');
        pyodide.setStdout({ batched: handleStdout });
        pyodide.setStderr({ batched: handleStderr });
        log('Stream redirection configured');

        // Load essential packages
        log('Loading micropip...');
        await pyodide.loadPackage('micropip');
        log('micropip loaded');

        // Additional packages if specified
        if (config?.packages && config.packages.length > 0) {
            log(`Loading additional packages: ${config.packages.join(', ')}`);
            await pyodide.loadPackage(config.packages);
        }

        isInitialized = true;
        isInitializing = false;

        sendMessage({
            type: MessageType.INIT_SUCCESS,
            id: 'init',
            pyodideVersion: pyodide.version
        });

        log('Pyodide initialization complete');

    } catch (error) {
        isInitializing = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('Initialization failed:', errorMessage);
        
        sendMessage({
            type: MessageType.INIT_ERROR,
            id: 'init',
            error: errorMessage
        });
    }
}

/**
 * Execute Python code with output capture
 */
async function executeCode(id: string, code: string) {
    if (!isInitialized) {
        sendMessage({
            type: MessageType.ERROR,
            id: id,
            error: 'Pyodide not initialized. Call init first.'
        });
        return;
    }

    // Set current execution context
    currentExecutionId = id;
    stdoutBuffer = [];
    stderrBuffer = [];

    try {
        log(`Executing code (ID: ${id})`);

        // Execute the code
        // runPythonAsync returns the value of the last expression
        const result = await pyodide.runPythonAsync(code);

        // Flush any remaining buffered output
        flushStdout();
        flushStderr();

        // Clear flush timeout
        if (flushTimeout !== null) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }

        // Send result if not None
        // In Python, None is represented as undefined in JavaScript
        if (result !== undefined && result !== null) {
            // Determine result type
            let resultType = typeof result;
            let serializedResult = result;

            // Special handling for Python objects
            try {
                // If it's a Python proxy object, convert to JS
                if (result && typeof result.toJs === 'function') {
                    serializedResult = result.toJs();
                    resultType = typeof serializedResult;
                }
            } catch (e) {
                // Conversion failed, use string representation
                serializedResult = String(result);
                resultType = 'string';
            }

            sendMessage({
                type: MessageType.RESULT,
                id: id,
                result: serializedResult,
                resultType: resultType
            });
        } else {
            // No result (None or undefined)
            sendMessage({
                type: MessageType.RESULT,
                id: id,
                result: null,
                resultType: 'none'
            });
        }

        log(`Execution complete (ID: ${id})`);

    } catch (error) {
        log(`Execution error (ID: ${id}):`, error);

        // Flush any buffered output before sending error
        flushStdout();
        flushStderr();

        // Clear flush timeout
        if (flushTimeout !== null) {
            clearTimeout(flushTimeout);
            flushTimeout = null;
        }

        // Extract Python traceback
        let traceback = '';
        let errorMessage = '';

        try {
            if (error && typeof error === 'object') {
                // Pyodide wraps Python exceptions
                errorMessage = String(error);
                
                // Try to get formatted traceback
                if ('message' in error) {
                    traceback = String(error);
                }
            } else {
                errorMessage = String(error);
            }
        } catch (e) {
            errorMessage = 'Unknown error during execution';
        }

        sendMessage({
            type: MessageType.ERROR,
            id: id,
            error: errorMessage,
            traceback: traceback
        });

    } finally {
        // Clear execution context
        currentExecutionId = null;
    }
}

/**
 * Handle incoming messages from extension host
 */
function handleMessage(message: WorkerMessage) {
    switch (message.type) {
        case MessageType.INIT:
            const initMsg = message as InitMessage;
            initializePyodide(initMsg.config);
            break;

        case MessageType.RUN:
            const runMsg = message as RunMessage;
            executeCode(runMsg.id, runMsg.code);
            break;

        case MessageType.INTERRUPT:
            log('Interrupt requested (not fully supported)');
            // Flush pending output
            flushStdout();
            flushStderr();
            break;

        default:
            log(`Unknown message type: ${message.type}`);
    }
}

/**
 * Worker message listener
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    handleMessage(event.data);
};

/**
 * Worker error handler
 */
self.onerror = (event: ErrorEvent) => {
    log('Worker error:', event.error);
    sendMessage({
        type: MessageType.ERROR,
        id: 'worker-error',
        error: event.message
    });
};

log('Pyodide worker started and ready');
```

### 2. Python Utility for Better Output Control (Injected at Runtime)

```typescript
// Add to pyodideWorker.ts initialization

/**
 * Python helper code for output management
 */
const PYTHON_OUTPUT_HELPERS = `
import sys
import io

class NotebookOutputWriter(io.StringIO):
    """Custom writer that ensures proper flushing"""
    def __init__(self, original_stream):
        super().__init__()
        self.original_stream = original_stream
    
    def write(self, text):
        if text:
            self.original_stream.write(text)
            # Auto-flush on newline
            if '\\n' in text:
                self.flush()
        return len(text)
    
    def flush(self):
        self.original_stream.flush()

# Not needed - Pyodide handles this, but kept for reference
`;

// After Pyodide loads, optionally inject helpers
// await pyodide.runPythonAsync(PYTHON_OUTPUT_HELPERS);
```

### 3. Enhanced Worker Manager for Output Handling (src/web/workerManager.ts)

```typescript
/**
 * Updated executeCode to handle batched output
 */
async executeCode(code: string, callbacks?: WorkerCallbacks): Promise<any> {
    if (!this.worker || !this.initPromise) {
        await this.initialize();
    }

    await this.initPromise;

    return new Promise<any>((resolve, reject) => {
        const messageId = `exec-${++this.messageIdCounter}`;

        // Accumulate stdout/stderr for potential batching
        let stdoutAccumulator = '';
        let stderrAccumulator = '';

        this.messageCallbacks.set(messageId, {
            onStdout: (content: string) => {
                stdoutAccumulator += content;
                callbacks?.onStdout?.(content);
            },
            onStderr: (content: string) => {
                stderrAccumulator += content;
                callbacks?.onStderr?.(content);
            },
            onResult: (result, resultType) => {
                callbacks?.onResult?.(result, resultType);
                resolve(result);
            },
            onError: (error, traceback) => {
                callbacks?.onError?.(error, traceback);
                reject(new Error(error));
            }
        });

        const runMessage: RunMessage = {
            type: MessageType.RUN,
            id: messageId,
            code: code
        };

        this.worker!.postMessage(runMessage);
    });
}
```

### 4. Enhanced Kernel Output Display (src/web/pyodideKernel.ts)

```typescript
/**
 * Enhanced appendTextOutput with better formatting
 */
private appendTextOutput(
    execution: vscode.NotebookCellExecution,
    content: string,
    stream: 'stdout' | 'stderr'
): void {
    if (!content) return; // Skip empty output

    // Create output item with appropriate MIME type
    const mimeType = stream === 'stderr' ? 'application/vnd.code.notebook.stderr' : 'text/plain';
    
    const outputItem = vscode.NotebookCellOutputItem.text(content, mimeType);

    const output = new vscode.NotebookCellOutput([outputItem], {
        outputType: stream
    });

    execution.appendOutput([output]);
}

/**
 * Enhanced result output with None handling
 */
private appendResultOutput(
    execution: vscode.NotebookCellExecution,
    result: any,
    resultType?: string
): void {
    // Don't display None results
    if (resultType === 'none' || result === null || result === undefined) {
        return;
    }

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
            outputItems.push(
                vscode.NotebookCellOutputItem.text(String(result), 'text/plain')
            );
        }
    } else {
        outputItems.push(
            vscode.NotebookCellOutputItem.text(String(result), 'text/plain')
        );
    }

    const output = new vscode.NotebookCellOutput(outputItems);
    execution.appendOutput([output]);
}
```

## Test Cases

### Automated Tests

```typescript
// test/suite/output.test.ts
import * as assert from 'assert';
import { PyodideWorkerManager } from '../../web/workerManager';

suite('Output Capture Tests', () => {
    let manager: PyodideWorkerManager;

    setup(async () => {
        manager = new PyodideWorkerManager(mockContext);
        await manager.initialize();
    });

    teardown(() => {
        manager.dispose();
    });

    test('Capture single print statement', async () => {
        let stdout = '';
        await manager.executeCode('print("Hello")', {
            onStdout: (content) => { stdout += content; }
        });
        assert.strictEqual(stdout.trim(), 'Hello');
    });

    test('Capture multiple print statements', async () => {
        let stdout = '';
        const code = `
print("Line 1")
print("Line 2")
print("Line 3")
        `;
        await manager.executeCode(code, {
            onStdout: (content) => { stdout += content; }
        });
        assert.ok(stdout.includes('Line 1'));
        assert.ok(stdout.includes('Line 2'));
        assert.ok(stdout.includes('Line 3'));
    });

    test('Capture stderr on error', async () => {
        let stderr = '';
        try {
            await manager.executeCode('import sys; sys.stderr.write("Error message")', {
                onStderr: (content) => { stderr += content; }
            });
        } catch (e) {
            // Error expected
        }
        assert.ok(stderr.includes('Error message'));
    });

    test('Distinguish stdout from return value', async () => {
        let stdout = '';
        const result = await manager.executeCode('print("Output"); 42', {
            onStdout: (content) => { stdout += content; }
        });
        assert.strictEqual(stdout.trim(), 'Output');
        assert.strictEqual(result, 42);
    });

    test('Return None does not produce output', async () => {
        const result = await manager.executeCode('x = 5');
        assert.strictEqual(result, null);
    });

    test('Capture traceback on error', async () => {
        let errorMsg = '';
        let traceback = '';
        try {
            await manager.executeCode('1 / 0', {
                onError: (error, tb) => {
                    errorMsg = error;
                    traceback = tb || '';
                }
            });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.ok(errorMsg.includes('division'));
            assert.ok(traceback.includes('ZeroDivisionError') || errorMsg.includes('ZeroDivisionError'));
        }
    });
});
```

### Manual Testing Checklist

1. **Basic Print Output**
   - [ ] Cell: `print("Hello, World!")`
   - [ ] Verify output appears
   - [ ] Verify no duplicate output
   - [ ] Verify correct formatting

2. **Multiple Print Statements**
   - [ ] Cell: `for i in range(5): print(i)`
   - [ ] Verify all numbers 0-4 appear
   - [ ] Verify each on separate line
   - [ ] Verify output appears incrementally

3. **Print vs Return Value**
   - [ ] Cell: `print("Output"); 42`
   - [ ] Verify both "Output" and "42" appear
   - [ ] Verify they're in separate output blocks

4. **No Output for None**
   - [ ] Cell: `x = 10`
   - [ ] Verify no output appears (only execution count)

5. **Stderr Capture**
   - [ ] Cell: `import sys; sys.stderr.write("Warning\\n")`
   - [ ] Verify "Warning" appears
   - [ ] Verify it's styled as stderr (different color/format)

6. **Error Traceback**
   - [ ] Cell: `def f(): return 1/0\nf()`
   - [ ] Verify full traceback appears
   - [ ] Verify function name visible
   - [ ] Verify "ZeroDivisionError" appears

7. **Large Output**
   - [ ] Cell: `for i in range(1000): print(i)`
   - [ ] Verify all 1000 numbers appear
   - [ ] Verify scrollable output
   - [ ] Check performance (should be smooth)

8. **Mixed Output**
   - [ ] Cell: `print("Before"); x = 1/0`
   - [ ] Verify "Before" appears
   - [ ] Verify error appears after
   - [ ] Verify proper ordering

9. **Unicode Output**
   - [ ] Cell: `print("Hello 世界 🌍")`
   - [ ] Verify Unicode displays correctly
   - [ ] Verify emojis display correctly

10. **Output Buffering**
    - [ ] Cell: `import sys; sys.stdout.write("No newline")`
    - [ ] Verify output appears (even without newline)
    - [ ] May have slight delay (batching)

## Common Issues and Solutions

### Issue 1: Output doesn't appear
**Cause**: Stream redirection not configured

**Solution**:
```javascript
pyodide.setStdout({ batched: handleStdout });
pyodide.setStderr({ batched: handleStderr });
```

### Issue 2: Output appears twice
**Cause**: Both batched and non-batched callbacks set

**Solution**:
- Use only `{ batched: callback }` format
- Don't set both raw and batched handlers

### Issue 3: Output delayed significantly
**Cause**: Batch delay too long

**Solution**:
```typescript
const BATCH_DELAY_MS = 50; // Reduce if needed
```

### Issue 4: Output chunks split incorrectly
**Cause**: Premature flushing

**Solution**:
- Only flush on newline for text output
- Increase BATCH_SIZE_CHARS if needed
- Ensure final flush after execution

### Issue 5: Return value not captured
**Cause**: Result of runPythonAsync not checked

**Solution**:
```typescript
const result = await pyodide.runPythonAsync(code);
if (result !== undefined && result !== null) {
    // Send result
}
```

### Issue 6: Traceback not formatted correctly
**Cause**: Error object not properly converted

**Solution**:
```typescript
// Pyodide error objects are already formatted strings
const traceback = String(error);
```

### Issue 7: None displays as "null"
**Cause**: JavaScript null converted to string

**Solution**:
```typescript
// Check result type before displaying
if (resultType === 'none' || result === null) {
    return; // Don't display
}
```

## Development Workflow

### 1. Test Output Capture
```python
# Test various output patterns

# Simple print
print("Hello")

# Multiple lines
for i in range(5):
    print(f"Line {i}")

# No newline
import sys
sys.stdout.write("No newline")
sys.stdout.flush()

# Stderr
sys.stderr.write("Error message\n")

# Mixed
print("Before error")
raise ValueError("Test error")
```

### 2. Debug Output Flow
```typescript
// Add logging to worker
function handleStdout(text: string) {
    console.log('[STDOUT]', JSON.stringify(text));
    stdoutBuffer.push(text);
    // ... rest of implementation
}
```

### 3. Monitor Batching
```typescript
// Track batch sizes
function flushStdout() {
    const content = stdoutBuffer.join('');
    console.log(`Flushing ${content.length} chars in ${stdoutBuffer.length} chunks`);
    // ... rest of implementation
}
```

### 4. Test Performance
```python
# Benchmark output performance
import time

start = time.time()
for i in range(10000):
    print(f"Line {i}")
end = time.time()

print(f"Took {end - start:.2f} seconds")
```

### 5. Inspect Output Structure
```javascript
// In DevTools console
const cell = vscode.window.activeNotebookEditor?.notebook.cellAt(0);
console.log('Outputs:', cell.outputs.map(o => ({
    items: o.items.map(i => ({
        mime: i.mime,
        data: i.data.toString().substring(0, 100)
    }))
})));
```

## Next Steps

After completing this step:

1. **Proceed to Step 7**: Implement rich output rendering (HTML, images, etc.)
2. **Verify Output Quality**:
   - Test various output patterns
   - Verify performance with large output
   - Check formatting correctness
3. **Optimize Batching**:
   - Profile batch sizes
   - Adjust timing parameters
   - Test with real-world notebooks
4. **Handle Edge Cases**:
   - Binary output
   - Very long lines
   - Rapid successive prints

## References

- [Pyodide Stream Redirection](https://pyodide.org/en/stable/usage/streams.html) - Official stdout/stderr documentation
- [Pyodide API Reference](https://pyodide.org/en/stable/usage/api/python-api.html) - Python API including setStdout/setStderr
- [Python Output Display](https://stackoverflow.com/questions/79115163/setup-to-get-the-python-output-displayed-line-by-line-during-execution) - Line-by-line output discussion
- [VS Code Notebook Output Types](https://code.visualstudio.com/api/references/vscode-api#NotebookCellOutput) - Output item MIME types
- [Jupyter MIME Types](https://jupyter.org/enhancement-proposals/74-default-rendered-display-priorities/default-rendered-display-priorities.html) - Standard output formats
