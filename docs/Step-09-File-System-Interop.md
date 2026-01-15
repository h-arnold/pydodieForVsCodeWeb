# Step 9: File System Interoperability

## Overview
Implement bidirectional file system integration between VS Code Web's File System API and Pyodide's virtual file system (Emscripten FS). This enables Python code to read and write files from the workspace, load datasets, save outputs, and interact with the VS Code editor as if running in a local Python environment.

## Research Summary

### VS Code Web File System API
Based on [VS Code Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions):
- Web extensions use `vscode.workspace.fs` API instead of Node.js `fs` module
- Supports reading/writing files via URIs
- Works with virtual file systems (GitHub, Azure Repos, Local Browser Storage)
- All operations are asynchronous and return Promises
- Files are represented as `Uint8Array` buffers

### Pyodide Virtual File System
From [Pyodide File System Documentation](https://pyodide.org/en/stable/usage/file-system.html):
- Uses Emscripten's virtual file system (MEMFS, IDBFS, WORKERFS)
- Default MEMFS: In-memory, lost on page reload
- IDBFS: Persistent storage using IndexedDB
- Can mount custom file system implementations
- Supports standard Python file operations (`open()`, `read()`, `write()`)
- Accessible via `pyodide.FS` object

### Integration Strategies
According to [Run and Debug Python in the Web](https://code.visualstudio.com/docs/python/python-web):
- **Sync on demand**: Copy files when Python code accesses them
- **Lazy loading**: Mount VS Code workspace as virtual FS
- **Write-through**: Immediately sync writes back to VS Code
- **Batch sync**: Periodic synchronization for performance

## Dependencies

### VS Code API
```typescript
// Built-in, no additional dependencies
import * as vscode from 'vscode';
```

### Pyodide File System APIs
```python
# Available in Pyodide runtime
from pyodide.ffi import to_js
from js import Uint8Array
import pyodide
```

### TypeScript Utilities
```json
{
  "devDependencies": {
    "@types/emscripten": "^1.39.10"
  }
}
```

## Code Implementation

### 1. File System Bridge (src/web/fileSystemBridge.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorker } from './pyodideWorker';

/**
 * Bridges VS Code's file system with Pyodide's virtual file system
 */
export class FileSystemBridge {
    private worker: PyodideWorker;
    private syncedPaths: Set<string> = new Set();

    constructor(worker: PyodideWorker) {
        this.worker = worker;
    }

    /**
     * Initialize the file system bridge in the worker
     */
    async initialize(): Promise<void> {
        await this.worker.executeCode(`
import os
import json
from pathlib import Path

# Create workspace directory in Pyodide FS
os.makedirs('/workspace', exist_ok=True)
os.chdir('/workspace')

print("Pyodide file system initialized")
        `);
    }

    /**
     * Sync a file from VS Code to Pyodide
     */
    async syncFileToWorker(uri: vscode.Uri): Promise<void> {
        try {
            // Read file from VS Code
            const content = await vscode.workspace.fs.readFile(uri);
            
            // Get relative path
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const relativePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(uri, false)
                : uri.path.split('/').pop() || 'file';

            // Write to Pyodide FS
            await this.writeFileToWorker(relativePath, content);
            
            this.syncedPaths.add(relativePath);
            console.log(`[FileSystemBridge] Synced ${relativePath} to worker`);
        } catch (error) {
            console.error(`[FileSystemBridge] Failed to sync ${uri.path}:`, error);
            throw error;
        }
    }

    /**
     * Write file content to Pyodide virtual FS
     */
    private async writeFileToWorker(path: string, content: Uint8Array): Promise<void> {
        // Convert Uint8Array to base64 for transfer
        const base64 = this.arrayBufferToBase64(content);
        
        await this.worker.executeCode(`
import base64
import os
from pathlib import Path

# Decode base64 content
content = base64.b64decode('${base64}')

# Create parent directories
path = Path('${path}')
path.parent.mkdir(parents=True, exist_ok=True)

# Write file
with open('${path}', 'wb') as f:
    f.write(content)

print(f"Wrote {len(content)} bytes to ${path}")
        `);
    }

    /**
     * Read a file from Pyodide and sync back to VS Code
     */
    async syncFileFromWorker(path: string, uri: vscode.Uri): Promise<void> {
        try {
            // Read file from Pyodide
            const result = await this.worker.executeCode(`
import base64
import os

if os.path.exists('${path}'):
    with open('${path}', 'rb') as f:
        content = f.read()
    print(base64.b64encode(content).decode('utf-8'))
else:
    print('FILE_NOT_FOUND')
            `);

            if (result.output === 'FILE_NOT_FOUND') {
                throw new Error(`File not found in worker: ${path}`);
            }

            // Convert base64 back to Uint8Array
            const content = this.base64ToArrayBuffer(result.output.trim());
            
            // Write to VS Code
            await vscode.workspace.fs.writeFile(uri, content);
            
            console.log(`[FileSystemBridge] Synced ${path} from worker to ${uri.path}`);
        } catch (error) {
            console.error(`[FileSystemBridge] Failed to sync from worker:`, error);
            throw error;
        }
    }

    /**
     * Sync entire workspace directory
     */
    async syncWorkspaceToWorker(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // Find all Python files and data files
        const files = await vscode.workspace.findFiles(
            '{**/*.py,**/*.txt,**/*.csv,**/*.json,**/*.yaml,**/*.yml}',
            '**/node_modules/**',
            100 // Limit to 100 files for performance
        );

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing workspace to Pyodide...',
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < files.length; i++) {
                progress.report({
                    message: `${i + 1}/${files.length}: ${files[i].path}`,
                    increment: (100 / files.length)
                });
                
                try {
                    await this.syncFileToWorker(files[i]);
                } catch (error) {
                    console.warn(`Failed to sync ${files[i].path}:`, error);
                }
            }
        });
    }

    /**
     * List files in Pyodide virtual FS
     */
    async listFiles(directory: string = '/workspace'): Promise<string[]> {
        const result = await this.worker.executeCode(`
import os
import json

files = []
for root, dirs, filenames in os.walk('${directory}'):
    for filename in filenames:
        filepath = os.path.join(root, filename)
        files.append(filepath)

print(json.dumps(files))
        `);

        try {
            return JSON.parse(result.output);
        } catch {
            return [];
        }
    }

    /**
     * Check if file exists in Pyodide FS
     */
    async fileExists(path: string): Promise<boolean> {
        const result = await this.worker.executeCode(`
import os
print('true' if os.path.exists('${path}') else 'false')
        `);

        return result.output.trim() === 'true';
    }

    /**
     * Create a file watcher to auto-sync changes
     */
    createFileWatcher(context: vscode.ExtensionContext): void {
        // Watch Python files
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.py');

        watcher.onDidChange(async (uri) => {
            if (this.syncedPaths.has(vscode.workspace.asRelativePath(uri))) {
                await this.syncFileToWorker(uri);
            }
        });

        watcher.onDidCreate(async (uri) => {
            await this.syncFileToWorker(uri);
        });

        context.subscriptions.push(watcher);
    }

    /**
     * Utility: Convert ArrayBuffer to base64
     */
    private arrayBufferToBase64(buffer: Uint8Array): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Utility: Convert base64 to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): Uint8Array {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}
```

### 2. Enhanced Worker with File System Support (src/web/pyodideWorker.ts)

```typescript
// Add to existing worker implementation

/**
 * Message type for file system operations
 */
interface FileSystemMessage {
    type: 'fs-read' | 'fs-write' | 'fs-list' | 'fs-exists';
    path: string;
    content?: Uint8Array;
}

// In worker message handler
self.onmessage = async (event: MessageEvent) => {
    const { type, ...data } = event.data;

    if (type === 'fs-read') {
        await handleFileRead(data.path);
    } else if (type === 'fs-write') {
        await handleFileWrite(data.path, data.content);
    }
    // ... other message types
};

async function handleFileRead(path: string): Promise<void> {
    try {
        // Read from Pyodide FS
        const content = pyodide.FS.readFile(path);
        
        self.postMessage({
            type: 'fs-read-result',
            path: path,
            content: content
        });
    } catch (error) {
        self.postMessage({
            type: 'fs-error',
            path: path,
            error: error.message
        });
    }
}

async function handleFileWrite(path: string, content: Uint8Array): Promise<void> {
    try {
        // Ensure directory exists
        const pathParts = path.split('/');
        const dirPath = pathParts.slice(0, -1).join('/');
        
        if (dirPath) {
            pyodide.FS.mkdirTree(dirPath);
        }

        // Write file
        pyodide.FS.writeFile(path, content);
        
        self.postMessage({
            type: 'fs-write-result',
            path: path
        });
    } catch (error) {
        self.postMessage({
            type: 'fs-error',
            path: path,
            error: error.message
        });
    }
}
```

### 3. File System Commands (src/web/commands/fileSystemCommands.ts)

```typescript
import * as vscode from 'vscode';
import { FileSystemBridge } from '../fileSystemBridge';

export function registerFileSystemCommands(
    context: vscode.ExtensionContext,
    fsBridge: FileSystemBridge
): void {
    // Command: Sync Current File
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.syncCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active file');
                return;
            }

            try {
                await fsBridge.syncFileToWorker(editor.document.uri);
                vscode.window.showInformationMessage(
                    `Synced ${editor.document.fileName} to Pyodide`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Sync failed: ${error}`);
            }
        })
    );

    // Command: Sync Workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.syncWorkspace', async () => {
            try {
                await fsBridge.syncWorkspaceToWorker();
                vscode.window.showInformationMessage('Workspace synced to Pyodide');
            } catch (error) {
                vscode.window.showErrorMessage(`Workspace sync failed: ${error}`);
            }
        })
    );

    // Command: List Pyodide Files
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.listFiles', async () => {
            try {
                const files = await fsBridge.listFiles();
                
                const quickPick = vscode.window.createQuickPick();
                quickPick.items = files.map(file => ({ label: file }));
                quickPick.title = 'Files in Pyodide Virtual FS';
                quickPick.placeholder = 'Search files...';
                quickPick.show();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list files: ${error}`);
            }
        })
    );

    // Command: Export File from Pyodide
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.exportFile', async () => {
            const files = await fsBridge.listFiles();
            
            const selected = await vscode.window.showQuickPick(files, {
                placeHolder: 'Select file to export from Pyodide'
            });

            if (!selected) {
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(selected.split('/').pop() || 'file'),
                filters: {
                    'All Files': ['*']
                }
            });

            if (uri) {
                try {
                    await fsBridge.syncFileFromWorker(selected, uri);
                    vscode.window.showInformationMessage(`Exported ${selected}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Export failed: ${error}`);
                }
            }
        })
    );
}
```

### 4. Integration with Notebook Controller

```typescript
// In src/web/notebookController.ts

export class PyodideNotebookController {
    private fsBridge: FileSystemBridge;

    constructor(private worker: PyodideWorker) {
        this.fsBridge = new FileSystemBridge(worker);
    }

    async initialize(): Promise<void> {
        await this.fsBridge.initialize();
        
        // Optionally sync workspace on startup
        const config = vscode.workspace.getConfiguration('pyodide');
        if (config.get('autoSyncWorkspace', false)) {
            await this.fsBridge.syncWorkspaceToWorker();
        }
    }

    async executeCell(
        cell: vscode.NotebookCell,
        execution: vscode.NotebookCellExecution
    ): Promise<void> {
        const code = cell.document.getText();

        // Check if code contains file operations
        if (this.containsFileOperations(code)) {
            // Ensure relevant files are synced
            await this.syncRelevantFiles(code);
        }

        // Execute code...
        
        // After execution, check for new files created
        await this.syncNewFiles();
    }

    private containsFileOperations(code: string): boolean {
        const fileOps = [
            /open\s*\(/,
            /pd\.read_csv/,
            /pd\.read_excel/,
            /np\.load/,
            /json\.load/,
            /with\s+open/
        ];

        return fileOps.some(pattern => pattern.test(code));
    }

    private async syncRelevantFiles(code: string): Promise<void> {
        // Extract file paths from code
        const filePathPattern = /['"]([^'"]+\.(csv|txt|json|xlsx|py))['\"]/g;
        const matches = code.matchAll(filePathPattern);

        for (const match of matches) {
            const filename = match[1];
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (workspaceFolder) {
                const uri = vscode.Uri.joinPath(workspaceFolder.uri, filename);
                try {
                    await this.fsBridge.syncFileToWorker(uri);
                } catch {
                    // File might not exist, ignore
                }
            }
        }
    }

    private async syncNewFiles(): Promise<void> {
        // List files created during execution
        const files = await this.fsBridge.listFiles();
        
        // Optionally prompt user to export new files
        // Implementation depends on UX requirements
    }
}
```

### 5. Configuration Settings (package.json contribution)

```json
{
  "contributes": {
    "configuration": {
      "title": "Pyodide File System",
      "properties": {
        "pyodide.autoSyncWorkspace": {
          "type": "boolean",
          "default": false,
          "description": "Automatically sync workspace files to Pyodide on startup"
        },
        "pyodide.autoSyncOnFileChange": {
          "type": "boolean",
          "default": true,
          "description": "Automatically sync files when they change in VS Code"
        },
        "pyodide.maxFileSizeToSync": {
          "type": "number",
          "default": 10485760,
          "description": "Maximum file size to sync (in bytes, default 10MB)"
        },
        "pyodide.fileExtensionsToSync": {
          "type": "array",
          "default": [".py", ".txt", ".csv", ".json", ".yaml", ".yml"],
          "description": "File extensions to automatically sync"
        }
      }
    }
  }
}
```

## Test Cases

### Manual Testing Checklist

1. **Basic File Reading**
   - [ ] Create a text file `data.txt` in workspace with content "Hello World"
   - [ ] Sync workspace to Pyodide
   - [ ] Execute cell:
     ```python
     with open('data.txt', 'r') as f:
         print(f.read())
     ```
   - [ ] Verify output shows "Hello World"

2. **File Writing**
   - [ ] Execute cell:
     ```python
     with open('output.txt', 'w') as f:
         f.write('Generated by Python')
     ```
   - [ ] Run command "Pyodide: List Files"
   - [ ] Verify `output.txt` appears in list
   - [ ] Export file to workspace
   - [ ] Verify file contents in VS Code

3. **CSV File Operations**
   - [ ] Create `data.csv` with sample data
   - [ ] Execute cell:
     ```python
     import pandas as pd
     df = pd.read_csv('data.csv')
     print(df.head())
     ```
   - [ ] Verify data is displayed correctly

4. **Directory Operations**
   - [ ] Execute cell:
     ```python
     import os
     os.makedirs('results/plots', exist_ok=True)
     print(os.listdir('.'))
     ```
   - [ ] Verify directory is created
   - [ ] Verify directory listing is correct

5. **Automatic Sync**
   - [ ] Enable auto-sync in settings
   - [ ] Edit a Python file in workspace
   - [ ] Import that file in notebook
   - [ ] Verify changes are reflected

6. **Large File Handling**
   - [ ] Create file larger than max size setting
   - [ ] Attempt to sync
   - [ ] Verify appropriate warning/error
   - [ ] Verify smaller files still sync

## Common Issues and Solutions

### Issue 1: File Not Found in Python Code
**Symptom**: `FileNotFoundError` even though file exists in workspace.

**Solution**:
- File hasn't been synced to Pyodide yet
- Run "Pyodide: Sync Workspace" command
- Or enable auto-sync in settings
- Check current working directory: `import os; print(os.getcwd())`

### Issue 2: Large Files Cause Browser to Hang
**Symptom**: Browser becomes unresponsive during file sync.

**Solution**:
- Set `pyodide.maxFileSizeToSync` to smaller value (e.g., 5MB)
- Sync files selectively instead of entire workspace
- Use streaming/chunked transfer for large files
- Consider using external storage (CDN, GitHub raw)

### Issue 3: Binary Files Corrupted After Sync
**Symptom**: Binary files (images, Excel) don't work after syncing.

**Solution**:
- Ensure binary mode is used: `'rb'` or `'wb'`
- Verify base64 encoding/decoding is correct
- Check that no text transformations are applied
- Test with small binary file first

### Issue 4: File Changes in Pyodide Not Reflected in VS Code
**Symptom**: Python creates/modifies files but they don't appear in workspace.

**Solution**:
- File sync is one-way by default (VS Code → Pyodide)
- Use "Pyodide: Export File" command to pull files back
- Implement bidirectional sync if needed
- Or prompt user after execution to export new files

### Issue 5: Permission Errors
**Symptom**: `PermissionError` when writing files.

**Solution**:
- Check Pyodide FS permissions (usually not an issue in MEMFS)
- Verify VS Code workspace has write permissions
- Check browser storage quotas for IDBFS
- Clear browser storage and retry

### Issue 6: Path Separator Issues
**Symptom**: Files not found due to Windows vs. Unix path separators.

**Solution**:
- Pyodide uses Unix-style paths (`/`)
- Normalize paths before syncing: `path.replace('\\', '/')`
- Use `pathlib` for cross-platform paths:
  ```python
  from pathlib import Path
  p = Path('data') / 'file.txt'
  ```

## Development Workflow

### 1. Testing File Operations

```bash
# Create test workspace
mkdir test-workspace
cd test-workspace
echo "test data" > data.txt

# Start VS Code Web with test workspace
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.. .
```

### 2. Debugging File System Bridge

```typescript
// Add verbose logging
private async syncFileToWorker(uri: vscode.Uri): Promise<void> {
    console.log('[FileSystemBridge] Syncing:', uri.path);
    const content = await vscode.workspace.fs.readFile(uri);
    console.log('[FileSystemBridge] Read bytes:', content.length);
    
    // ... rest of implementation
}
```

### 3. Testing with Different File Types

```python
# Test script for various file operations
import json
import csv

# JSON
data = {'name': 'test', 'value': 42}
with open('data.json', 'w') as f:
    json.dump(data, f)

# CSV
with open('data.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Value'])
    writer.writerow(['Test', 42])

# Binary
with open('binary.dat', 'wb') as f:
    f.write(bytes([1, 2, 3, 4, 5]))
```

### 4. Performance Testing

```typescript
// Measure sync performance
async function benchmarkSync(fsBridge: FileSystemBridge): Promise<void> {
    const start = performance.now();
    await fsBridge.syncWorkspaceToWorker();
    const duration = performance.now() - start;
    console.log(`Workspace sync took ${duration}ms`);
}
```

## Next Steps

After completing this step:
1. Proceed to **Step 10**: Handle Web Constraints (CORS, memory limits)
2. Implement persistent storage using IndexedDB (IDBFS)
3. Add progress indicators for large file syncs
4. Consider implementing virtual mount for on-demand loading

## References

- [VS Code File System API](https://code.visualstudio.com/api/references/vscode-api#workspace.fs)
- [Pyodide File System](https://pyodide.org/en/stable/usage/file-system.html)
- [Emscripten File System API](https://emscripten.org/docs/api_reference/Filesystem-API.html)
- [Run and Debug Python in the Web](https://code.visualstudio.com/docs/python/python-web)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
