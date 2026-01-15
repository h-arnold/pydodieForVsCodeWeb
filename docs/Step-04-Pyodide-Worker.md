# Step 4: Add a Dedicated Pyodide Worker

## Overview
Create a dedicated Web Worker to host the Pyodide WebAssembly runtime, isolating Python execution from the extension host. This worker will load Pyodide from a CDN, initialize the Python environment, execute user code, and communicate results back to the extension host via a message-passing protocol.

## Research Summary

### Web Worker Architecture for Pyodide
Based on [Pyodide Web Worker Documentation](https://pyodide.org/en/stable/usage/webworker.html):
- Pyodide should run in a **dedicated Web Worker**, not the extension host worker
- This prevents blocking the extension UI during heavy computation
- The worker communicates via `postMessage()` and `onmessage` handlers
- Message passing must be asynchronous and serializable

### Key Technical Considerations

1. **Dual-Worker Architecture**: The extension host itself runs in a Web Worker, so the Pyodide worker is a "worker within a worker" environment.

2. **Lazy Initialization**: Load Pyodide only when first needed to minimize startup overhead and memory usage. The initial download is ~6-8MB.

3. **CDN Loading**: Use `importScripts()` to load Pyodide from a CDN like jsdelivr. This avoids bundling the large Wasm binary.

4. **Memory Constraints**: Browser tabs typically have 1-4GB memory limits. Pyodide core uses ~100-200MB, with additional memory for loaded packages.

5. **Cross-Origin Isolation**: SharedArrayBuffer (needed for advanced features like interrupts) requires COOP/COEP headers, which may not be available in vscode.dev.

### Initialization Flow
```
Extension Host Worker
    ↓ (creates)
Pyodide Worker
    ↓ (loads via importScripts)
pyodide.js from CDN
    ↓ (calls)
loadPyodide()
    ↓ (downloads & initializes)
CPython WebAssembly Runtime
    ↓ (preloads)
micropip, standard library packages
```

## Dependencies

### CDN Resources
```typescript
// Pyodide v0.25.0 (latest stable as of implementation)
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';
const PYODIDE_JS = `${PYODIDE_CDN}pyodide.js`;

// Alternative CDNs for redundancy:
// - 'https://unpkg.com/pyodide@0.25.0/pyodide.js'
// - Self-hosted option: bundle in extension
```

### Preloaded Packages
```python
# Core packages to load during initialization
- micropip (v0.25.0) - Package installer for Pyodide
- setuptools - Python package utilities
- packaging - Version handling utilities
```

### Message Protocol Types
```typescript
// Defined in src/common/types.ts
enum MessageType {
    INIT = 'init',           // Initialize Pyodide
    INIT_SUCCESS = 'init_success',
    INIT_ERROR = 'init_error',
    RUN = 'run',             // Execute code
    STDOUT = 'stdout',       // Standard output
    STDERR = 'stderr',       // Standard error
    RESULT = 'result',       // Execution result
    ERROR = 'error',         // Execution error
    INTERRUPT = 'interrupt'  // Stop execution (if supported)
}
```

## Code Implementation

### 1. Worker Message Types (src/common/types.ts - Extended)

```typescript
/**
 * Message types for Pyodide worker communication
 */
export enum MessageType {
    INIT = 'init',
    INIT_SUCCESS = 'init_success',
    INIT_ERROR = 'init_error',
    RUN = 'run',
    STDOUT = 'stdout',
    STDERR = 'stderr',
    RESULT = 'result',
    ERROR = 'error',
    INTERRUPT = 'interrupt'
}

/**
 * Base message interface
 */
export interface WorkerMessage {
    type: MessageType;
    id: string;
}

/**
 * Initialize Pyodide
 */
export interface InitMessage extends WorkerMessage {
    type: MessageType.INIT;
    config?: {
        indexURL?: string;
        packages?: string[];
    };
}

/**
 * Initialization success response
 */
export interface InitSuccessMessage extends WorkerMessage {
    type: MessageType.INIT_SUCCESS;
    pyodideVersion: string;
}

/**
 * Initialization error response
 */
export interface InitErrorMessage extends WorkerMessage {
    type: MessageType.INIT_ERROR;
    error: string;
}

/**
 * Execute Python code
 */
export interface RunMessage extends WorkerMessage {
    type: MessageType.RUN;
    code: string;
}

/**
 * Standard output message
 */
export interface StdoutMessage extends WorkerMessage {
    type: MessageType.STDOUT;
    content: string;
}

/**
 * Standard error message
 */
export interface StderrMessage extends WorkerMessage {
    type: MessageType.STDERR;
    content: string;
}

/**
 * Execution result message
 */
export interface ResultMessage extends WorkerMessage {
    type: MessageType.RESULT;
    result: any;
    resultType?: string;
}

/**
 * Execution error message
 */
export interface ErrorMessage extends WorkerMessage {
    type: MessageType.ERROR;
    error: string;
    traceback?: string;
}

/**
 * Interrupt execution
 */
export interface InterruptMessage extends WorkerMessage {
    type: MessageType.INTERRUPT;
}
```

### 2. Pyodide Worker Implementation (src/web/pyodideWorker.ts)

```typescript
/**
 * Pyodide Web Worker
 * 
 * This worker runs in a separate thread from the extension host,
 * hosting the Pyodide WebAssembly Python runtime.
 */

import { MessageType, WorkerMessage, InitMessage, RunMessage } from '../common/types';

// Global Pyodide instance
let pyodide: any = null;
let isInitialized = false;
let isInitializing = false;

// Queue for messages received before initialization
const messageQueue: Array<{ message: WorkerMessage; timestamp: number }> = [];

/**
 * Pyodide CDN configuration
 */
const PYODIDE_VERSION = '0.25.0';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * Log helper for worker
 */
function log(message: string, ...args: any[]) {
    console.log(`[PyodideWorker] ${message}`, ...args);
}

/**
 * Send message to extension host
 */
function sendMessage(message: WorkerMessage) {
    self.postMessage(message);
}

/**
 * Initialize Pyodide runtime
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
        // Load Pyodide script from CDN
        const indexURL = config?.indexURL || PYODIDE_CDN;
        log(`Loading Pyodide from ${indexURL}`);
        
        // Import Pyodide loader script
        importScripts(`${indexURL}pyodide.js`);

        // TypeScript doesn't know about loadPyodide global
        const loadPyodide = (self as any).loadPyodide;
        
        if (!loadPyodide) {
            throw new Error('loadPyodide not available after importing script');
        }

        // Initialize Pyodide
        pyodide = await loadPyodide({
            indexURL: indexURL
        });

        log(`Pyodide ${pyodide.version} loaded successfully`);

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

        // Send success message
        sendMessage({
            type: MessageType.INIT_SUCCESS,
            id: 'init',
            pyodideVersion: pyodide.version
        });

        log('Pyodide initialization complete');

        // Process any queued messages
        processMessageQueue();

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
 * Execute Python code
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

    try {
        log(`Executing code (ID: ${id})`);

        // Execute the code and capture result
        // runPython returns the value of the last expression
        const result = await pyodide.runPythonAsync(code);

        // Send result back
        sendMessage({
            type: MessageType.RESULT,
            id: id,
            result: result,
            resultType: typeof result
        });

        log(`Execution complete (ID: ${id})`);

    } catch (error) {
        log(`Execution error (ID: ${id}):`, error);

        // Extract Python traceback if available
        let traceback = '';
        try {
            // Pyodide errors often have a Python traceback
            if (error && typeof error === 'object' && 'message' in error) {
                traceback = String(error);
            }
        } catch (e) {
            // Ignore traceback extraction errors
        }

        sendMessage({
            type: MessageType.ERROR,
            id: id,
            error: error instanceof Error ? error.message : String(error),
            traceback: traceback
        });
    }
}

/**
 * Process queued messages after initialization
 */
function processMessageQueue() {
    log(`Processing ${messageQueue.length} queued messages`);
    
    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        if (item) {
            handleMessage(item.message);
        }
    }
}

/**
 * Handle incoming messages from extension host
 */
function handleMessage(message: WorkerMessage) {
    // If not initialized and not an init message, queue it
    if (!isInitialized && message.type !== MessageType.INIT) {
        log(`Queueing message type ${message.type} until initialization complete`);
        messageQueue.push({ message, timestamp: Date.now() });
        return;
    }

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
            log('Interrupt requested (not fully supported without SharedArrayBuffer)');
            // TODO: Implement interruption if SharedArrayBuffer available
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

// Log worker startup
log('Pyodide worker started and ready');
```

### 3. Worker Factory (src/web/workerFactory.ts)

```typescript
/**
 * Factory for creating Pyodide worker instances
 */

import * as vscode from 'vscode';

/**
 * Create a Pyodide worker instance
 * 
 * In a web extension, workers are created differently than in Node.js
 */
export function createPyodideWorker(context: vscode.ExtensionContext): Worker {
    // Get the URI for the worker script
    const workerScriptUri = vscode.Uri.joinPath(
        context.extensionUri,
        'dist',
        'web',
        'pyodide.worker.js'
    );

    // Create worker from URI
    // Note: In a web extension, we use the Worker constructor directly
    const worker = new Worker(workerScriptUri.toString());

    return worker;
}

/**
 * Dispose of a worker properly
 */
export function disposeWorker(worker: Worker) {
    worker.terminate();
}
```

### 4. Worker Manager (src/web/workerManager.ts)

```typescript
/**
 * Manages the Pyodide worker lifecycle and communication
 */

import * as vscode from 'vscode';
import { createPyodideWorker, disposeWorker } from './workerFactory';
import {
    MessageType,
    WorkerMessage,
    InitMessage,
    RunMessage,
    ResultMessage,
    ErrorMessage,
    StdoutMessage,
    StderrMessage,
    InitSuccessMessage,
    InitErrorMessage
} from '../common/types';

export interface WorkerCallbacks {
    onStdout?: (content: string) => void;
    onStderr?: (content: string) => void;
    onResult?: (result: any, resultType?: string) => void;
    onError?: (error: string, traceback?: string) => void;
}

export class PyodideWorkerManager {
    private worker?: Worker;
    private initPromise?: Promise<void>;
    private messageCallbacks: Map<string, WorkerCallbacks> = new Map();
    private messageIdCounter = 0;

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Initialize the worker and Pyodide runtime
     */
    async initialize(): Promise<void> {
        // Return existing initialization if in progress
        if (this.initPromise) {
            return this.initPromise;
        }

        // Create initialization promise
        this.initPromise = new Promise<void>((resolve, reject) => {
            // Create worker
            this.worker = createPyodideWorker(this.context);

            // Set up message handler
            this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
                this.handleWorkerMessage(event.data);
            };

            // Set up error handler
            this.worker.onerror = (event: ErrorEvent) => {
                console.error('[WorkerManager] Worker error:', event);
                reject(new Error(`Worker error: ${event.message}`));
            };

            // Send init message
            const initMessage: InitMessage = {
                type: MessageType.INIT,
                id: 'init'
            };

            // Listen for init response
            const initHandler = (message: WorkerMessage) => {
                if (message.type === MessageType.INIT_SUCCESS) {
                    const successMsg = message as InitSuccessMessage;
                    console.log(`Pyodide initialized: ${successMsg.pyodideVersion}`);
                    resolve();
                } else if (message.type === MessageType.INIT_ERROR) {
                    const errorMsg = message as InitErrorMessage;
                    reject(new Error(`Pyodide initialization failed: ${errorMsg.error}`));
                }
            };

            this.messageCallbacks.set('init', {
                onResult: () => initHandler({ type: MessageType.INIT_SUCCESS, id: 'init', pyodideVersion: 'unknown' }),
                onError: (error) => initHandler({ type: MessageType.INIT_ERROR, id: 'init', error })
            });

            this.worker.postMessage(initMessage);
        });

        return this.initPromise;
    }

    /**
     * Execute Python code
     */
    async executeCode(code: string, callbacks?: WorkerCallbacks): Promise<any> {
        // Ensure worker is initialized
        if (!this.worker || !this.initPromise) {
            await this.initialize();
        }

        await this.initPromise;

        return new Promise<any>((resolve, reject) => {
            const messageId = `exec-${++this.messageIdCounter}`;

            // Store callbacks
            this.messageCallbacks.set(messageId, {
                ...callbacks,
                onResult: (result, resultType) => {
                    callbacks?.onResult?.(result, resultType);
                    resolve(result);
                },
                onError: (error, traceback) => {
                    callbacks?.onError?.(error, traceback);
                    reject(new Error(error));
                }
            });

            // Send run message
            const runMessage: RunMessage = {
                type: MessageType.RUN,
                id: messageId,
                code: code
            };

            this.worker!.postMessage(runMessage);
        });
    }

    /**
     * Handle messages from the worker
     */
    private handleWorkerMessage(message: WorkerMessage) {
        const callbacks = this.messageCallbacks.get(message.id);

        if (!callbacks) {
            console.warn(`No callbacks registered for message ID: ${message.id}`);
            return;
        }

        switch (message.type) {
            case MessageType.INIT_SUCCESS:
                const initSuccess = message as InitSuccessMessage;
                callbacks.onResult?.(initSuccess.pyodideVersion, 'string');
                this.messageCallbacks.delete(message.id);
                break;

            case MessageType.INIT_ERROR:
                const initError = message as InitErrorMessage;
                callbacks.onError?.(initError.error);
                this.messageCallbacks.delete(message.id);
                break;

            case MessageType.STDOUT:
                const stdout = message as StdoutMessage;
                callbacks.onStdout?.(stdout.content);
                break;

            case MessageType.STDERR:
                const stderr = message as StderrMessage;
                callbacks.onStderr?.(stderr.content);
                break;

            case MessageType.RESULT:
                const result = message as ResultMessage;
                callbacks.onResult?.(result.result, result.resultType);
                this.messageCallbacks.delete(message.id);
                break;

            case MessageType.ERROR:
                const error = message as ErrorMessage;
                callbacks.onError?.(error.error, error.traceback);
                this.messageCallbacks.delete(message.id);
                break;
        }
    }

    /**
     * Dispose of the worker
     */
    dispose() {
        if (this.worker) {
            disposeWorker(this.worker);
            this.worker = undefined;
        }
        this.initPromise = undefined;
        this.messageCallbacks.clear();
    }
}
```

### 5. Update Extension Entry Point (src/web/extension.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorkerManager } from './workerManager';

let workerManager: PyodideWorkerManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pyodide Kernel extension is now active in web mode');

    // Create worker manager (lazy initialization)
    workerManager = new PyodideWorkerManager(context);
    context.subscriptions.push({
        dispose: () => workerManager.dispose()
    });

    // Test command to verify worker functionality
    const testCommand = vscode.commands.registerCommand(
        'pyodide-kernel.test',
        async () => {
            try {
                await workerManager.initialize();
                const result = await workerManager.executeCode('2 + 2');
                vscode.window.showInformationMessage(`Result: ${result}`);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );
    context.subscriptions.push(testCommand);

    return {
        workerManager // Export for use by other components
    };
}

export function deactivate() {
    console.log('Pyodide Kernel extension deactivated');
}
```

## Test Cases

### Automated Tests

```typescript
// test/suite/pyodideWorker.test.ts
import * as assert from 'assert';
import { PyodideWorkerManager } from '../../web/workerManager';

suite('Pyodide Worker Tests', () => {
    let manager: PyodideWorkerManager;

    setup(async () => {
        // Create manager instance
        manager = new PyodideWorkerManager(mockContext);
    });

    teardown(() => {
        manager.dispose();
    });

    test('Worker initializes successfully', async () => {
        await manager.initialize();
        // If no error thrown, test passes
    });

    test('Execute simple Python expression', async () => {
        const result = await manager.executeCode('2 + 2');
        assert.strictEqual(result, 4);
    });

    test('Execute multi-line Python code', async () => {
        const code = `
x = 10
y = 20
x + y
        `;
        const result = await manager.executeCode(code);
        assert.strictEqual(result, 30);
    });

    test('Handle Python errors gracefully', async () => {
        try {
            await manager.executeCode('1 / 0');
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('division'));
        }
    });
});
```

### Manual Testing Checklist

1. **Worker Creation**
   - [ ] Extension activates without errors
   - [ ] Worker script loads from dist/web/pyodide.worker.js
   - [ ] No console errors during worker creation

2. **Pyodide Initialization**
   - [ ] Run test command: `Pyodide Kernel: Test`
   - [ ] Check browser DevTools Network tab for CDN requests
   - [ ] Verify pyodide.js loads from jsdelivr CDN
   - [ ] Verify pyodide.asm.wasm downloads (~6-8MB)
   - [ ] Verify micropip package loads
   - [ ] Total initialization time < 10 seconds on decent connection

3. **Code Execution**
   - [ ] Simple expression: `2 + 2` returns `4`
   - [ ] Variable assignment: `x = 5` executes without error
   - [ ] Multiple statements work correctly
   - [ ] String operations: `"hello " + "world"` returns `"hello world"`
   - [ ] List operations: `[1, 2, 3]` returns array

4. **Error Handling**
   - [ ] Syntax error displays appropriate message
   - [ ] Runtime error (e.g., `1/0`) shows traceback
   - [ ] Undefined variable error handled gracefully
   - [ ] Worker doesn't crash on error

5. **Memory and Performance**
   - [ ] Initial memory usage reasonable (~100-200MB)
   - [ ] Worker responds to multiple executions
   - [ ] No memory leaks after repeated executions
   - [ ] Worker can be disposed and recreated

6. **Network Conditions**
   - [ ] Test with slow network (throttling in DevTools)
   - [ ] Test with offline mode after initial load (should work if cached)
   - [ ] Verify CDN failover if primary CDN unavailable

## Common Issues and Solutions

### Issue 1: "loadPyodide is not defined"
**Cause**: Pyodide script not loaded correctly via importScripts()

**Solution**:
- Verify CDN URL is correct and accessible
- Check CORS headers allow loading from vscode.dev
- Ensure importScripts() completes before calling loadPyodide
- Try alternative CDN (unpkg.com instead of jsdelivr)

### Issue 2: Worker fails to initialize in vscode.dev
**Cause**: Cross-origin security restrictions

**Solution**:
- Ensure worker script is served from same origin as extension
- Check Content-Security-Policy headers
- Verify worker URI construction in workerFactory.ts
- Use browser DevTools to check network errors

### Issue 3: High memory usage
**Cause**: Pyodide and loaded packages consume significant memory

**Solution**:
- Implement lazy initialization (only load when needed)
- Don't preload unnecessary packages
- Provide command to restart worker and free memory
- Monitor usage with browser Task Manager

### Issue 4: Slow initialization
**Cause**: Large Wasm binary download

**Solution**:
- Use CDN with good global coverage (jsdelivr)
- Show progress indicator during initialization
- Cache Pyodide files in browser storage
- Consider self-hosting Pyodide files for faster loading

### Issue 5: "SharedArrayBuffer is not defined"
**Cause**: Cross-origin isolation not enabled

**Solution**:
- This is expected in vscode.dev (no COOP/COEP headers)
- Feature interruption won't work without it
- Document limitation for users
- Implement timeout-based fallback for long-running code

### Issue 6: Worker messages not received
**Cause**: Message handler timing or serialization issues

**Solution**:
- Ensure worker.onmessage is set before postMessage
- Verify message objects are serializable (no functions)
- Check message ID matching in callbacks
- Add logging to trace message flow

## Development Workflow

### 1. Build and Watch
```bash
# Terminal 1: Watch mode for automatic rebuilding
npm run watch-web

# Webpack will rebuild on file changes
# Both extension.js and pyodide.worker.js
```

### 2. Test Worker in Isolation
```typescript
// Create test HTML file to test worker standalone
// test-worker.html
<!DOCTYPE html>
<html>
<head><title>Worker Test</title></head>
<body>
<h1>Pyodide Worker Test</h1>
<button onclick="testWorker()">Test Worker</button>
<pre id="output"></pre>

<script>
const worker = new Worker('dist/web/pyodide.worker.js');

worker.onmessage = (e) => {
    document.getElementById('output').textContent += 
        JSON.stringify(e.data, null, 2) + '\n';
};

function testWorker() {
    worker.postMessage({ type: 'init', id: 'test-init' });
    setTimeout(() => {
        worker.postMessage({ 
            type: 'run', 
            id: 'test-run', 
            code: '2 + 2' 
        });
    }, 5000);
}
</script>
</body>
</html>
```

### 3. Debug Worker
```javascript
// In browser DevTools Console:

// Check worker status
console.log(workerManager);

// Test initialization
await workerManager.initialize();

// Test code execution
const result = await workerManager.executeCode('print("Hello from Pyodide")');
console.log('Result:', result);
```

### 4. Performance Profiling
```javascript
// Measure initialization time
console.time('pyodide-init');
await workerManager.initialize();
console.timeEnd('pyodide-init');

// Measure execution time
console.time('code-exec');
await workerManager.executeCode('sum(range(1000000))');
console.timeEnd('code-exec');
```

### 5. Network Debugging
- Open Chrome DevTools → Network tab
- Filter by "pyodide" to see all Pyodide-related requests
- Check timing, size, and caching status
- Verify CORS headers on responses

## Next Steps

After completing this step:

1. **Proceed to Step 5**: Wire the controller execution to this worker
2. **Verify Worker Functionality**: 
   - Test initialization time
   - Test basic code execution
   - Verify message passing works correctly
3. **Optimize Loading**:
   - Consider caching strategies for Pyodide files
   - Implement progress feedback during initialization
4. **Add Monitoring**:
   - Track initialization success/failure rates
   - Monitor memory usage patterns
   - Log execution times

## References

- [Pyodide Web Worker Guide](https://pyodide.org/en/stable/usage/webworker.html) - Official documentation for using Pyodide in workers
- [Using Pyodide in a Web Worker (v0.24.0)](https://pyodide.org/en/0.24.0/usage/webworker.html) - Version-specific guide
- [Pyodide Quickstart](https://pyodide.org/en/stable/usage/quickstart.html) - Getting started with loadPyodide()
- [Web Workers MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) - Web Worker API reference
- [Working with Bundlers - Pyodide](https://pyodide.org/en/stable/usage/working-with-bundlers.html) - Bundling Pyodide with Webpack/esbuild
- [Cloudflare Python Workers](https://blog.cloudflare.com/python-workers/) - Real-world Pyodide usage example
- [VS Code Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions) - Web extension environment constraints
