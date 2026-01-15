# Step 10: Handling Web-Specific Constraints

## Overview
Address the unique constraints and limitations of running Python in a browser environment, including CORS policies, cross-origin isolation requirements, SharedArrayBuffer availability, memory management, and the absence of Node.js APIs. This step ensures the extension works reliably across different browser contexts and hosting scenarios.

## Research Summary

### CORS (Cross-Origin Resource Sharing)
Based on [VS Code Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions):
- Browser blocks requests to different origins by default
- Pyodide assets (Wasm, packages) must be served with CORS headers
- CDNs like jsdelivr.net and unpkg.com have CORS enabled
- Custom package indexes need `Access-Control-Allow-Origin: *`
- Fetch API respects CORS; no way to bypass in browser

### Cross-Origin Isolation and SharedArrayBuffer
From [Bringing Python to Workers using Pyodide and WebAssembly](https://blog.cloudflare.com/python-workers/):
- **SharedArrayBuffer** required for threading and some Pyodide features
- Only available in "cross-origin isolated" contexts
- Requires both headers on main document:
  - `Cross-Origin-Opener-Policy: same-origin` (COOP)
  - `Cross-Origin-Embedder-Policy: require-corp` (COEP)
- vscode.dev and github.dev may not have these headers
- Fallback: Run without SharedArrayBuffer (no threading, slower interrupts)

### Memory Constraints
According to [Feasibility and Limitations of Pyodide](https://devblogs.microsoft.com/python/feasibility-use-cases-and-limitations-of-pyodide/):
- Browser tabs typically limited to 1-4GB RAM
- Wasm memory must be allocated upfront
- Pyodide runtime ~150-200MB
- Large packages (NumPy, Pandas) add 50-100MB each
- User data and execution state accumulate
- No swap space; OOM crashes the tab

### No Node.js APIs
Per [Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions):
- No `fs`, `child_process`, `net`, `http`, `crypto` (Node versions)
- Must use: `vscode.workspace.fs`, Web Workers, Fetch API, Web Crypto
- No synchronous file I/O
- No subprocess execution
- No native binary modules

## Dependencies

### Browser Feature Detection
```typescript
// No additional dependencies, use native browser APIs
```

### Polyfills (if needed)
```json
{
  "devDependencies": {
    "buffer": "^6.0.3",
    "process": "^0.11.10",
    "path-browserify": "^1.0.1"
  }
}
```

## Code Implementation

### 1. Feature Detection Utility (src/web/featureDetection.ts)

```typescript
/**
 * Detects browser capabilities and constraints
 */
export class FeatureDetection {
    /**
     * Check if SharedArrayBuffer is available
     */
    static hasSharedArrayBuffer(): boolean {
        return typeof SharedArrayBuffer !== 'undefined';
    }

    /**
     * Check if site is cross-origin isolated
     */
    static isCrossOriginIsolated(): boolean {
        return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    }

    /**
     * Estimate available memory
     */
    static async estimateAvailableMemory(): Promise<number | null> {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                return estimate.quota || null;
            } catch {
                return null;
            }
        }
        return null;
    }

    /**
     * Check if running in a web worker
     */
    static isWebWorker(): boolean {
        return typeof WorkerGlobalScope !== 'undefined' && 
               self instanceof WorkerGlobalScope;
    }

    /**
     * Get browser information
     */
    static getBrowserInfo(): BrowserInfo {
        const userAgent = navigator.userAgent;
        
        let browser = 'unknown';
        if (userAgent.includes('Chrome')) {
            browser = 'chrome';
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            browser = 'safari';
        } else if (userAgent.includes('Firefox')) {
            browser = 'firefox';
        } else if (userAgent.includes('Edge')) {
            browser = 'edge';
        }

        return {
            name: browser,
            userAgent: userAgent,
            platform: navigator.platform
        };
    }

    /**
     * Get comprehensive capability report
     */
    static async getCapabilityReport(): Promise<CapabilityReport> {
        return {
            sharedArrayBuffer: this.hasSharedArrayBuffer(),
            crossOriginIsolated: this.isCrossOriginIsolated(),
            availableMemory: await this.estimateAvailableMemory(),
            browser: this.getBrowserInfo(),
            webWorker: this.isWebWorker()
        };
    }
}

export interface BrowserInfo {
    name: string;
    userAgent: string;
    platform: string;
}

export interface CapabilityReport {
    sharedArrayBuffer: boolean;
    crossOriginIsolated: boolean;
    availableMemory: number | null;
    browser: BrowserInfo;
    webWorker: boolean;
}
```

### 2. CORS Handler (src/web/corsHandler.ts)

```typescript
import * as vscode from 'vscode';

/**
 * Handles CORS-related issues when loading external resources
 */
export class CorsHandler {
    private corsProxyUrl?: string;

    constructor() {
        // Get CORS proxy from configuration
        const config = vscode.workspace.getConfiguration('pyodide');
        this.corsProxyUrl = config.get('corsProxyUrl');
    }

    /**
     * Fetch resource with CORS handling
     */
    async fetchWithCors(url: string): Promise<Response> {
        try {
            // Try direct fetch first
            const response = await fetch(url);
            if (response.ok) {
                return response;
            }
            
            // If failed, try with CORS proxy
            if (this.corsProxyUrl) {
                return await this.fetchViaProxy(url);
            }
            
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        } catch (error) {
            if (this.corsProxyUrl) {
                return await this.fetchViaProxy(url);
            }
            throw error;
        }
    }

    /**
     * Fetch via CORS proxy
     */
    private async fetchViaProxy(url: string): Promise<Response> {
        if (!this.corsProxyUrl) {
            throw new Error('CORS proxy not configured');
        }

        const proxyUrl = `${this.corsProxyUrl}${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`CORS proxy failed: ${response.statusText}`);
        }
        
        return response;
    }

    /**
     * Get recommended Pyodide CDN URL based on CORS support
     */
    static getRecommendedCdnUrl(version: string = '0.25.0'): string {
        // These CDNs have CORS enabled by default
        return `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
    }

    /**
     * Test if URL is accessible (CORS check)
     */
    async testCors(url: string): Promise<boolean> {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Validate Pyodide CDN accessibility
     */
    async validatePyodideCdn(cdnUrl: string): Promise<ValidationResult> {
        const testFile = `${cdnUrl}pyodide.js`;
        
        try {
            const accessible = await this.testCors(testFile);
            
            if (accessible) {
                return {
                    valid: true,
                    message: 'CDN is accessible'
                };
            } else {
                return {
                    valid: false,
                    message: 'CDN blocked by CORS policy',
                    suggestion: 'Use a CORS-enabled CDN like cdn.jsdelivr.net'
                };
            }
        } catch (error) {
            return {
                valid: false,
                message: `CDN unreachable: ${error}`,
                suggestion: 'Check network connection or try alternate CDN'
            };
        }
    }
}

export interface ValidationResult {
    valid: boolean;
    message: string;
    suggestion?: string;
}
```

### 3. Memory Manager (src/web/memoryManager.ts)

```typescript
import * as vscode from 'vscode';

/**
 * Monitors and manages memory usage in the browser
 */
export class MemoryManager {
    private memoryWarningThreshold = 0.8; // 80% of available memory
    private lastMemoryCheck = 0;
    private checkInterval = 30000; // Check every 30 seconds

    /**
     * Get current memory usage estimate
     */
    async getMemoryUsage(): Promise<MemoryInfo | null> {
        if (!('memory' in performance)) {
            return null;
        }

        const memory = (performance as any).memory;
        
        return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            percentUsed: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
        };
    }

    /**
     * Check if memory usage is approaching limit
     */
    async checkMemoryPressure(): Promise<MemoryPressure> {
        const now = Date.now();
        if (now - this.lastMemoryCheck < this.checkInterval) {
            return MemoryPressure.Normal;
        }

        this.lastMemoryCheck = now;
        const info = await this.getMemoryUsage();

        if (!info) {
            return MemoryPressure.Unknown;
        }

        const percentUsed = info.percentUsed / 100;

        if (percentUsed > 0.9) {
            return MemoryPressure.Critical;
        } else if (percentUsed > this.memoryWarningThreshold) {
            return MemoryPressure.High;
        } else {
            return MemoryPressure.Normal;
        }
    }

    /**
     * Show memory warning if needed
     */
    async showMemoryWarningIfNeeded(): Promise<void> {
        const pressure = await this.checkMemoryPressure();

        if (pressure === MemoryPressure.Critical) {
            const action = await vscode.window.showErrorMessage(
                'Memory usage is critically high. Kernel may become unstable.',
                'Restart Kernel',
                'Clear Outputs',
                'Dismiss'
            );

            if (action === 'Restart Kernel') {
                await vscode.commands.executeCommand('pyodide.restartKernel');
            } else if (action === 'Clear Outputs') {
                await vscode.commands.executeCommand('notebook.clearAllCellsOutputs');
            }
        } else if (pressure === MemoryPressure.High) {
            vscode.window.showWarningMessage(
                'Memory usage is high. Consider restarting kernel or clearing outputs.'
            );
        }
    }

    /**
     * Monitor memory and show warnings
     */
    startMonitoring(context: vscode.ExtensionContext): void {
        const interval = setInterval(async () => {
            await this.showMemoryWarningIfNeeded();
        }, this.checkInterval);

        context.subscriptions.push({
            dispose: () => clearInterval(interval)
        });
    }

    /**
     * Get memory recommendations
     */
    async getMemoryRecommendations(): Promise<string[]> {
        const info = await this.getMemoryUsage();
        const recommendations: string[] = [];

        if (!info) {
            return ['Memory monitoring not available in this browser'];
        }

        if (info.percentUsed > 70) {
            recommendations.push('Clear notebook outputs to free memory');
            recommendations.push('Restart kernel to reset memory state');
            recommendations.push('Avoid loading large datasets');
        }

        if (info.percentUsed > 50) {
            recommendations.push('Delete unused variables with `del variable_name`');
            recommendations.push('Use generators instead of lists for large data');
        }

        return recommendations;
    }
}

export interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    percentUsed: number;
}

export enum MemoryPressure {
    Normal = 'normal',
    High = 'high',
    Critical = 'critical',
    Unknown = 'unknown'
}
```

### 4. Interrupt Handler (with and without SharedArrayBuffer)

```typescript
/**
 * Handles kernel interrupts with fallback for environments without SharedArrayBuffer
 */
export class InterruptHandler {
    private worker: Worker;
    private supportsSharedArrayBuffer: boolean;
    private interruptBuffer?: SharedArrayBuffer;
    private interruptFlag?: Int32Array;

    constructor(worker: Worker) {
        this.worker = worker;
        this.supportsSharedArrayBuffer = FeatureDetection.hasSharedArrayBuffer();
        
        if (this.supportsSharedArrayBuffer) {
            this.setupSharedArrayBuffer();
        }
    }

    /**
     * Setup SharedArrayBuffer for fast interrupts
     */
    private setupSharedArrayBuffer(): void {
        // Create 4-byte shared buffer for interrupt flag
        this.interruptBuffer = new SharedArrayBuffer(4);
        this.interruptFlag = new Int32Array(this.interruptBuffer);
        
        // Send buffer to worker
        this.worker.postMessage({
            type: 'init-interrupt',
            buffer: this.interruptBuffer
        });
    }

    /**
     * Interrupt the running Python code
     */
    async interrupt(): Promise<void> {
        if (this.supportsSharedArrayBuffer && this.interruptFlag) {
            // Fast path: Set interrupt flag
            Atomics.store(this.interruptFlag, 0, 1);
            
            // Notify worker
            Atomics.notify(this.interruptFlag, 0);
        } else {
            // Slow path: Send message to worker
            this.worker.postMessage({ type: 'interrupt' });
        }

        // Wait for acknowledgment (with timeout)
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Interrupt timeout'));
            }, 5000);

            const handler = (event: MessageEvent) => {
                if (event.data.type === 'interrupted') {
                    clearTimeout(timeout);
                    this.worker.removeEventListener('message', handler);
                    resolve();
                }
            };

            this.worker.addEventListener('message', handler);
        });
    }

    /**
     * Clear interrupt flag
     */
    clearInterrupt(): void {
        if (this.interruptFlag) {
            Atomics.store(this.interruptFlag, 0, 0);
        }
    }
}

// Worker-side interrupt handling
// Add to pyodideWorker.ts:

let interruptBuffer: SharedArrayBuffer | null = null;
let interruptFlag: Int32Array | null = null;

self.onmessage = async (event: MessageEvent) => {
    const { type, ...data } = event.data;

    if (type === 'init-interrupt') {
        interruptBuffer = data.buffer;
        interruptFlag = new Int32Array(interruptBuffer);
        
        // Setup Pyodide interrupt handler
        if (pyodide) {
            pyodide.setInterruptBuffer(interruptFlag);
        }
    } else if (type === 'interrupt') {
        // Fallback: Terminate current execution
        // Note: This is less graceful than SharedArrayBuffer method
        if (pyodide) {
            try {
                // Attempt to interrupt
                pyodide.globals.get('_interrupt_handler')?.();
                self.postMessage({ type: 'interrupted' });
            } catch (error) {
                console.error('Interrupt failed:', error);
            }
        }
    }
};

// Check interrupt flag periodically during execution
function checkInterrupt(): void {
    if (interruptFlag && Atomics.load(interruptFlag, 0) === 1) {
        throw new Error('KeyboardInterrupt');
    }
}
```

### 5. Initialization with Feature Detection

```typescript
// In src/web/extension.ts

import { FeatureDetection } from './featureDetection';
import { CorsHandler } from './corsHandler';
import { MemoryManager } from './memoryManager';

export async function activate(context: vscode.ExtensionContext) {
    // Detect capabilities
    const capabilities = await FeatureDetection.getCapabilityReport();
    
    console.log('Browser capabilities:', capabilities);

    // Show warnings for missing features
    if (!capabilities.sharedArrayBuffer) {
        vscode.window.showWarningMessage(
            'SharedArrayBuffer not available. Kernel interrupts will be slower.',
            'Learn More'
        ).then(action => {
            if (action === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse(
                    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer'
                ));
            }
        });
    }

    // Validate CORS
    const corsHandler = new CorsHandler();
    const cdnUrl = CorsHandler.getRecommendedCdnUrl();
    const corsValid = await corsHandler.validatePyodideCdn(cdnUrl);
    
    if (!corsValid.valid) {
        vscode.window.showErrorMessage(
            `Pyodide CDN not accessible: ${corsValid.message}`,
            corsValid.suggestion || 'OK'
        );
    }

    // Start memory monitoring
    const memoryManager = new MemoryManager();
    memoryManager.startMonitoring(context);

    // Initialize controller with capabilities
    const controller = new PyodideNotebookController(capabilities);
    
    // ... rest of activation
}
```

### 6. Configuration (package.json)

```json
{
  "contributes": {
    "configuration": {
      "title": "Pyodide Web Constraints",
      "properties": {
        "pyodide.corsProxyUrl": {
          "type": "string",
          "default": "",
          "description": "CORS proxy URL for loading external resources (e.g., https://corsproxy.io/?)"
        },
        "pyodide.cdnUrl": {
          "type": "string",
          "default": "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
          "description": "CDN URL for Pyodide assets"
        },
        "pyodide.memoryWarningThreshold": {
          "type": "number",
          "default": 80,
          "description": "Memory usage percentage to trigger warning (0-100)"
        },
        "pyodide.enableMemoryMonitoring": {
          "type": "boolean",
          "default": true,
          "description": "Monitor memory usage and show warnings"
        },
        "pyodide.fallbackWithoutSharedArrayBuffer": {
          "type": "boolean",
          "default": true,
          "description": "Allow running without SharedArrayBuffer (slower interrupts)"
        }
      }
    }
  }
}
```

## Test Cases

### Manual Testing Checklist

1. **SharedArrayBuffer Detection**
   - [ ] Open browser console
   - [ ] Check `typeof SharedArrayBuffer`
   - [ ] Open extension in vscode.dev
   - [ ] Verify warning if SharedArrayBuffer unavailable
   - [ ] Test in github.dev (may differ)

2. **CORS Validation**
   - [ ] Configure custom CDN URL in settings
   - [ ] Reload extension
   - [ ] Check console for CORS errors
   - [ ] Try jsdelivr.net CDN
   - [ ] Try unpkg.com CDN
   - [ ] Verify successful loading

3. **Memory Monitoring**
   - [ ] Enable memory monitoring in settings
   - [ ] Execute cells with large arrays:
     ```python
     import numpy as np
     big_array = np.random.rand(10000, 10000)
     ```
   - [ ] Wait for memory warning
   - [ ] Verify warning appears when threshold exceeded
   - [ ] Restart kernel
   - [ ] Verify memory is freed

4. **Interrupt Handling**
   - [ ] Execute infinite loop:
     ```python
     while True:
         pass
     ```
   - [ ] Click interrupt button
   - [ ] Verify execution stops (may take 5-10 seconds without SAB)
   - [ ] Check console for interrupt method used

5. **Feature Report**
   - [ ] Run command to show capabilities
   - [ ] Verify all detected features listed:
     - Browser name
     - SharedArrayBuffer availability
     - Cross-origin isolation status
     - Available memory

6. **Error Handling**
   - [ ] Disconnect network
   - [ ] Try to execute code
   - [ ] Verify appropriate error message
   - [ ] Reconnect network
   - [ ] Verify recovery

## Common Issues and Solutions

### Issue 1: SharedArrayBuffer Not Available
**Symptom**: Warning about SharedArrayBuffer, interrupts don't work quickly.

**Solution**:
- This is expected on most hosting platforms (vscode.dev, github.dev)
- Interrupts will use message-based fallback (slower)
- For local development, serve with COOP/COEP headers:
  ```javascript
  // server.js
  app.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
  });
  ```
- Alternative: Accept limitation and inform users

### Issue 2: CORS Blocks Pyodide Assets
**Symptom**: `Failed to fetch pyodide.js` error.

**Solution**:
- Use CDN with CORS enabled (jsdelivr.net, unpkg.com)
- For custom hosting, add headers:
  ```
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  ```
- Use CORS proxy as fallback (not recommended for production)
- Bundle Pyodide assets with extension (large bundle size)

### Issue 3: Out of Memory Errors
**Symptom**: Browser tab crashes, "Out of memory" error.

**Solution**:
- Reduce data size in notebooks
- Clear outputs regularly
- Restart kernel periodically
- Use `del` to free variables:
  ```python
  del large_dataframe
  import gc; gc.collect()
  ```
- Configure memory warning threshold lower
- Close other tabs to free browser memory

### Issue 4: Slow Performance Compared to Desktop
**Symptom**: Code executes much slower than desktop Python.

**Solution**:
- Expected: Wasm is typically 1.5-3x slower than native
- Optimize Python code:
  - Use NumPy/Pandas operations (optimized in Wasm)
  - Avoid Python loops for large data
  - Use vectorized operations
- Accept performance limitation
- Consider desktop VS Code for heavy computation

### Issue 5: Network Timeout Loading Packages
**Symptom**: Package installation fails with timeout.

**Solution**:
- Check network connectivity
- Increase timeout in Fetch calls
- Try alternative CDN
- Cache packages locally using Service Worker
- Bundle common packages with extension

### Issue 6: Cannot Access Local Files
**Symptom**: `FileNotFoundError` for files on local disk.

**Solution**:
- Browser cannot access local file system directly
- Must use VS Code workspace FS API
- Sync files to Pyodide virtual FS (see Step 9)
- Or use File System Access API (requires user permission)

## Development Workflow

### 1. Local Development with CORS

```bash
# Serve extension with CORS headers
npx http-server -p 5000 --cors -c-1

# Or use custom server
node server.js
```

```javascript
// server.js
const express = require('express');
const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.static('.'));
app.listen(5000, () => console.log('Server on :5000'));
```

### 2. Testing Cross-Origin Isolation

```javascript
// Add to HTML when testing locally
<script>
if (!crossOriginIsolated) {
    console.warn('Not cross-origin isolated');
    console.log('Add COOP and COEP headers to enable SharedArrayBuffer');
}
</script>
```

### 3. Memory Profiling

```typescript
// Log memory usage over time
setInterval(async () => {
    const memory = await memoryManager.getMemoryUsage();
    if (memory) {
        console.log(`Memory: ${(memory.percentUsed).toFixed(1)}% (${
            (memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${
            (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB)`);
    }
}, 10000);
```

### 4. Testing in Different Browsers

```bash
# Chrome (Chromium)
npx @vscode/test-web --browserType=chromium

# Firefox
npx @vscode/test-web --browserType=firefox

# WebKit (Safari)
npx @vscode/test-web --browserType=webkit
```

## Next Steps

After completing this step:
1. Proceed to **Step 11**: Kernel UX and Context Keys
2. Implement Service Worker for offline caching
3. Add telemetry for tracking feature availability
4. Optimize memory usage with lazy loading

## References

- [SharedArrayBuffer and Cross-Origin Isolation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [VS Code Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Pyodide in Web Workers](https://pyodide.org/en/stable/usage/webworker.html)
- [Performance Memory API](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)
- [Storage Quota API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)
