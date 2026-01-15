# Step 8: Package Management with micropip

## Overview
Implement a comprehensive package management system using micropip to install pure-Python and Pyodide-compatible packages in the browser environment. This step enables users to import external libraries, handle missing dependencies automatically, and pre-bundle common data science packages for offline use.

## Research Summary

### micropip Architecture
Based on [Pyodide Loading Packages Documentation](https://pyodide.org/en/stable/usage/loading-packages.html#micropip):
- **micropip** is a Python package manager specifically designed for Pyodide
- Installs pure-Python wheels from PyPI or custom indexes
- Can install Pyodide-compatible binary wheels (pre-compiled to WebAssembly)
- Uses browser's Fetch API for downloads (no socket support)
- Supports dependency resolution and version constraints
- Cannot install packages with C extensions unless pre-compiled for Pyodide

### Package Availability
According to the [Pyodide GitHub repository](https://github.com/pyodide/pyodide):
- **Pre-built packages**: NumPy, Pandas, Matplotlib, SciPy, scikit-learn (~150 packages)
- **Pure-Python packages**: Any package without C extensions can be installed from PyPI
- **Custom wheels**: Can be built using pyodide-build for C extensions

### Limitations
From [Feasibility, Use Cases, and Limitations of Pyodide](https://devblogs.microsoft.com/python/feasibility-use-cases-and-limitations-of-pyodide/):
- Cannot use pip directly (no subprocess support in browser)
- Network requests subject to CORS policies
- Package size impacts browser memory (1-4GB typical limit)
- Installation is temporary (per-session unless cached)

## Dependencies

### Runtime Dependencies
```json
{
  "dependencies": {
    "semver": "^7.5.4"
  }
}
```

### Pyodide Packages (Pre-loaded in Worker)
```python
# Core packages loaded at initialization
packages = [
    'micropip',      # Package installer
    'setuptools',    # For building packages
    'packaging'      # For version parsing
]
```

### Optional Bundled Packages
```python
# Common data science packages (lazy-loaded)
bundled_packages = [
    'numpy',         # Numerical computing
    'pandas',        # Data analysis
    'matplotlib',    # Plotting
    'scipy',         # Scientific computing
    'scikit-learn',  # Machine learning
    'pillow',        # Image processing
    'requests',      # HTTP library (pure-Python)
    'beautifulsoup4' # HTML parsing
]
```

## Code Implementation

### 1. Package Manager Interface (src/web/packageManager.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorker } from './pyodideWorker';

/**
 * Manages package installation and discovery for Pyodide
 */
export class PackageManager {
    private installedPackages: Set<string> = new Set();
    private installationPromises: Map<string, Promise<void>> = new Map();
    private worker: PyodideWorker;

    constructor(worker: PyodideWorker) {
        this.worker = worker;
    }

    /**
     * Install a package using micropip
     */
    async installPackage(packageName: string, version?: string): Promise<void> {
        const packageSpec = version ? `${packageName}==${version}` : packageName;
        
        // Check if already installed
        if (this.installedPackages.has(packageSpec)) {
            return;
        }

        // Check if installation is in progress
        const existing = this.installationPromises.get(packageSpec);
        if (existing) {
            return existing;
        }

        // Start installation
        const promise = this.doInstall(packageSpec);
        this.installationPromises.set(packageSpec, promise);

        try {
            await promise;
            this.installedPackages.add(packageSpec);
        } finally {
            this.installationPromises.delete(packageSpec);
        }
    }

    private async doInstall(packageSpec: string): Promise<void> {
        const code = `
import micropip
await micropip.install('${packageSpec}')
print(f"Successfully installed {packageSpec}")
`;
        
        await this.worker.executeCode(code);
    }

    /**
     * Install multiple packages
     */
    async installPackages(packages: string[]): Promise<void> {
        await Promise.all(packages.map(pkg => this.installPackage(pkg)));
    }

    /**
     * Check if a package is available in Pyodide
     */
    async isPackageAvailable(packageName: string): Promise<boolean> {
        const code = `
import micropip
import json
try:
    # Check if package is in Pyodide's built-in packages
    from pyodide import find_imports
    available = '${packageName}' in find_imports('')
    print(json.dumps({'available': available}))
except:
    print(json.dumps({'available': False}))
`;
        
        const result = await this.worker.executeCode(code);
        try {
            const parsed = JSON.parse(result.output);
            return parsed.available;
        } catch {
            return false;
        }
    }

    /**
     * List all installed packages
     */
    async listInstalledPackages(): Promise<string[]> {
        const code = `
import micropip
import json
packages = micropip.list()
print(json.dumps([str(pkg) for pkg in packages]))
`;
        
        const result = await this.worker.executeCode(code);
        try {
            return JSON.parse(result.output);
        } catch {
            return [];
        }
    }

    /**
     * Get package information
     */
    async getPackageInfo(packageName: string): Promise<PackageInfo | null> {
        const code = `
import micropip
import json
try:
    # Get package metadata
    packages = micropip.list()
    for pkg in packages:
        if pkg.name == '${packageName}':
            print(json.dumps({
                'name': pkg.name,
                'version': str(pkg.version),
                'location': str(pkg.location)
            }))
            break
    else:
        print(json.dumps(None))
except Exception as e:
    print(json.dumps(None))
`;
        
        const result = await this.worker.executeCode(code);
        try {
            return JSON.parse(result.output);
        } catch {
            return null;
        }
    }
}

export interface PackageInfo {
    name: string;
    version: string;
    location: string;
}
```

### 2. Import Error Detection (src/web/importDetector.ts)

```typescript
/**
 * Detects missing imports from Python error messages
 */
export class ImportDetector {
    /**
     * Extract package name from ImportError or ModuleNotFoundError
     */
    static extractMissingPackage(errorMessage: string): string | null {
        // Pattern: "ModuleNotFoundError: No module named 'package_name'"
        const patterns = [
            /ModuleNotFoundError: No module named ['"]([^'"]+)['"]/,
            /ImportError: No module named ['"]([^'"]+)['"]/,
            /ImportError: cannot import name ['"]([^'"]+)['"] from ['"]([^'"]+)['"]/
        ];

        for (const pattern of patterns) {
            const match = errorMessage.match(pattern);
            if (match) {
                // Return the package name (first part before any dots)
                const fullModule = match[1];
                return fullModule.split('.')[0];
            }
        }

        return null;
    }

    /**
     * Extract all import statements from Python code
     */
    static extractImports(code: string): string[] {
        const imports = new Set<string>();
        
        // Match "import package" or "import package as alias"
        const importPattern = /^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
        
        // Match "from package import ..."
        const fromPattern = /^\s*from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+import/gm;

        let match;
        while ((match = importPattern.exec(code)) !== null) {
            imports.add(match[1]);
        }

        while ((match = fromPattern.exec(code)) !== null) {
            imports.add(match[1]);
        }

        return Array.from(imports);
    }

    /**
     * Check if error is an import-related error
     */
    static isImportError(errorMessage: string): boolean {
        return errorMessage.includes('ModuleNotFoundError') ||
               errorMessage.includes('ImportError') ||
               errorMessage.includes('No module named');
    }
}
```

### 3. Auto-Install Feature (src/web/autoInstaller.ts)

```typescript
import * as vscode from 'vscode';
import { PackageManager } from './packageManager';
import { ImportDetector } from './importDetector';

/**
 * Automatically suggests and installs missing packages
 */
export class AutoInstaller {
    private packageManager: PackageManager;
    private autoInstallEnabled: boolean = true;

    constructor(packageManager: PackageManager) {
        this.packageManager = packageManager;
    }

    /**
     * Handle execution error and offer to install missing packages
     */
    async handleExecutionError(error: string, code: string): Promise<boolean> {
        if (!ImportDetector.isImportError(error)) {
            return false;
        }

        const packageName = ImportDetector.extractMissingPackage(error);
        if (!packageName) {
            return false;
        }

        // Check if this is a stdlib module (shouldn't need installation)
        if (this.isStdlibModule(packageName)) {
            return false;
        }

        // Prompt user to install
        const action = await vscode.window.showErrorMessage(
            `Package '${packageName}' is not installed. Install it now?`,
            'Install',
            'Cancel',
            'Don\'t Ask Again'
        );

        if (action === 'Install') {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Installing ${packageName}...`,
                    cancellable: false
                }, async () => {
                    await this.packageManager.installPackage(packageName);
                });

                vscode.window.showInformationMessage(
                    `Successfully installed ${packageName}. Please re-run the cell.`
                );
                return true;
            } catch (installError) {
                vscode.window.showErrorMessage(
                    `Failed to install ${packageName}: ${installError}`
                );
                return false;
            }
        } else if (action === 'Don\'t Ask Again') {
            this.autoInstallEnabled = false;
        }

        return false;
    }

    /**
     * Pre-install packages found in code
     */
    async preInstallImports(code: string): Promise<void> {
        const imports = ImportDetector.extractImports(code);
        const packagesToInstall = imports.filter(pkg => !this.isStdlibModule(pkg));

        if (packagesToInstall.length === 0) {
            return;
        }

        // Check which packages need installation
        const missing: string[] = [];
        for (const pkg of packagesToInstall) {
            const available = await this.packageManager.isPackageAvailable(pkg);
            if (!available) {
                missing.push(pkg);
            }
        }

        if (missing.length > 0 && this.autoInstallEnabled) {
            const action = await vscode.window.showInformationMessage(
                `Install ${missing.length} missing package(s): ${missing.join(', ')}?`,
                'Install All',
                'Skip'
            );

            if (action === 'Install All') {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Installing packages...',
                    cancellable: false
                }, async (progress) => {
                    for (let i = 0; i < missing.length; i++) {
                        progress.report({
                            message: `${missing[i]} (${i + 1}/${missing.length})`,
                            increment: (100 / missing.length)
                        });
                        await this.packageManager.installPackage(missing[i]);
                    }
                });
            }
        }
    }

    /**
     * Check if module is part of Python standard library
     */
    private isStdlibModule(name: string): boolean {
        const stdlibModules = new Set([
            'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 
            'asyncore', 'atexit', 'audioop', 'base64', 'bdb', 'binascii', 
            'binhex', 'bisect', 'builtins', 'bz2', 'calendar', 'cgi', 'cgitb',
            'chunk', 'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections',
            'colorsys', 'compileall', 'concurrent', 'configparser', 'contextlib',
            'contextvars', 'copy', 'copyreg', 'crypt', 'csv', 'ctypes', 'curses',
            'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib', 'dis',
            'distutils', 'doctest', 'email', 'encodings', 'enum', 'errno',
            'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch', 'fractions',
            'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext', 'glob',
            'graphlib', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
            'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress',
            'itertools', 'json', 'keyword', 'lib2to3', 'linecache', 'locale',
            'logging', 'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes',
            'mmap', 'modulefinder', 'msilib', 'msvcrt', 'multiprocessing', 'netrc',
            'nis', 'nntplib', 'numbers', 'operator', 'optparse', 'os', 'ossaudiodev',
            'parser', 'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil',
            'platform', 'plistlib', 'poplib', 'posix', 'posixpath', 'pprint', 'profile',
            'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri',
            'random', 're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy',
            'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil',
            'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver',
            'spwd', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep',
            'struct', 'subprocess', 'sunau', 'symbol', 'symtable', 'sys', 'sysconfig',
            'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios',
            'test', 'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token',
            'tokenize', 'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo',
            'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid',
            'venv', 'warnings', 'wave', 'weakref', 'webbrowser', 'winreg', 'winsound',
            'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib'
        ]);
        
        return stdlibModules.has(name);
    }
}
```

### 4. Package Installation Commands (src/web/commands/packageCommands.ts)

```typescript
import * as vscode from 'vscode';
import { PackageManager } from '../packageManager';

export function registerPackageCommands(
    context: vscode.ExtensionContext,
    packageManager: PackageManager
): void {
    // Command: Install Package
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.installPackage', async () => {
            const packageName = await vscode.window.showInputBox({
                prompt: 'Enter package name to install',
                placeHolder: 'e.g., requests, beautifulsoup4',
                validateInput: (value) => {
                    if (!value) {
                        return 'Package name cannot be empty';
                    }
                    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                        return 'Invalid package name';
                    }
                    return null;
                }
            });

            if (!packageName) {
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Installing ${packageName}...`,
                    cancellable: false
                }, async () => {
                    await packageManager.installPackage(packageName);
                });

                vscode.window.showInformationMessage(
                    `Successfully installed ${packageName}`
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install ${packageName}: ${error}`
                );
            }
        })
    );

    // Command: List Installed Packages
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.listPackages', async () => {
            try {
                const packages = await packageManager.listInstalledPackages();
                
                if (packages.length === 0) {
                    vscode.window.showInformationMessage('No packages installed');
                    return;
                }

                const quickPick = vscode.window.createQuickPick();
                quickPick.items = packages.map(pkg => ({ label: pkg }));
                quickPick.title = 'Installed Packages';
                quickPick.placeholder = 'Search packages...';
                quickPick.show();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list packages: ${error}`);
            }
        })
    );

    // Command: Install Common Data Science Packages
    context.subscriptions.push(
        vscode.commands.registerCommand('pyodide.installDataSciencePackages', async () => {
            const packages = ['numpy', 'pandas', 'matplotlib', 'scipy'];
            
            const proceed = await vscode.window.showWarningMessage(
                `Install ${packages.length} data science packages? This may take several minutes.`,
                'Install',
                'Cancel'
            );

            if (proceed !== 'Install') {
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Installing data science packages...',
                    cancellable: false
                }, async (progress) => {
                    for (let i = 0; i < packages.length; i++) {
                        progress.report({
                            message: `${packages[i]} (${i + 1}/${packages.length})`,
                            increment: (100 / packages.length)
                        });
                        await packageManager.installPackage(packages[i]);
                    }
                });

                vscode.window.showInformationMessage(
                    'Successfully installed all data science packages'
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to install packages: ${error}`
                );
            }
        })
    );
}
```

### 5. Integration with Notebook Controller

```typescript
// In src/web/notebookController.ts, integrate package management:

import { PackageManager } from './packageManager';
import { AutoInstaller } from './autoInstaller';

export class PyodideNotebookController {
    private packageManager: PackageManager;
    private autoInstaller: AutoInstaller;

    constructor(private worker: PyodideWorker) {
        this.packageManager = new PackageManager(worker);
        this.autoInstaller = new AutoInstaller(this.packageManager);
    }

    async executeCell(
        cell: vscode.NotebookCell,
        execution: vscode.NotebookCellExecution
    ): Promise<void> {
        const code = cell.document.getText();

        // Optional: Pre-install imports before execution
        try {
            await this.autoInstaller.preInstallImports(code);
        } catch (error) {
            // Continue even if pre-install fails
            console.warn('Pre-install failed:', error);
        }

        try {
            // Execute the cell
            const result = await this.worker.executeCode(code);
            
            // Handle outputs...
            
        } catch (error) {
            // Check if it's an import error and offer to install
            const handled = await this.autoInstaller.handleExecutionError(
                error.message,
                code
            );

            if (!handled) {
                // Report the error to the cell
                execution.replaceOutput([
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.error(error)
                    ])
                ]);
            }
        }
    }
}
```

## Test Cases

### Automated Tests (tests/packageManager.test.ts)

```typescript
import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { PackageManager } from '../src/web/packageManager';
import { ImportDetector } from '../src/web/importDetector';

describe('ImportDetector', () => {
    it('should extract package from ModuleNotFoundError', () => {
        const error = "ModuleNotFoundError: No module named 'requests'";
        const pkg = ImportDetector.extractMissingPackage(error);
        expect(pkg).to.equal('requests');
    });

    it('should extract nested package correctly', () => {
        const error = "ModuleNotFoundError: No module named 'sklearn.ensemble'";
        const pkg = ImportDetector.extractMissingPackage(error);
        expect(pkg).to.equal('sklearn');
    });

    it('should extract imports from code', () => {
        const code = `
import numpy as np
from pandas import DataFrame
import matplotlib.pyplot as plt
`;
        const imports = ImportDetector.extractImports(code);
        expect(imports).to.include.members(['numpy', 'pandas', 'matplotlib']);
    });
});

describe('PackageManager', () => {
    let packageManager: PackageManager;

    beforeEach(() => {
        // Setup mock worker
    });

    it('should install a package successfully', async () => {
        await packageManager.installPackage('requests');
        // Verify installation
    });

    it('should not reinstall already installed package', async () => {
        await packageManager.installPackage('requests');
        await packageManager.installPackage('requests');
        // Verify single installation
    });

    it('should install package with version constraint', async () => {
        await packageManager.installPackage('numpy', '1.24.0');
        // Verify correct version
    });
});
```

### Manual Testing Checklist

1. **Basic Package Installation**
   - [ ] Run command "Pyodide: Install Package"
   - [ ] Enter package name (e.g., "requests")
   - [ ] Verify success notification
   - [ ] Import package in cell: `import requests`
   - [ ] Verify no import error

2. **Auto-Install on Import Error**
   - [ ] Create cell with: `import beautifulsoup4`
   - [ ] Execute cell
   - [ ] Verify prompt to install package
   - [ ] Click "Install"
   - [ ] Wait for installation
   - [ ] Re-run cell
   - [ ] Verify successful import

3. **Data Science Package Bundle**
   - [ ] Run command "Pyodide: Install Data Science Packages"
   - [ ] Wait for installation (may take 2-3 minutes)
   - [ ] Test each package:
     ```python
     import numpy as np
     import pandas as pd
     import matplotlib.pyplot as plt
     print(np.__version__, pd.__version__)
     ```
   - [ ] Verify all imports succeed

4. **List Installed Packages**
   - [ ] Install several packages
   - [ ] Run command "Pyodide: List Packages"
   - [ ] Verify all packages appear in quick pick
   - [ ] Search for specific package
   - [ ] Verify filtering works

5. **Error Handling**
   - [ ] Try installing non-existent package
   - [ ] Verify error message is displayed
   - [ ] Try installing package with C extension (e.g., "lxml")
   - [ ] Verify appropriate error or fallback

6. **Version Constraints**
   - [ ] Install package with specific version
   - [ ] Verify correct version installed
   - [ ] Try installing incompatible version
   - [ ] Verify error handling

## Common Issues and Solutions

### Issue 1: Package Installation Fails with CORS Error
**Symptom**: Error message about CORS policy blocking request.

**Solution**: 
- Ensure Pyodide CDN (jsdelivr.net) is accessible
- Check browser console for specific CORS errors
- If using custom package index, ensure CORS headers are set:
  ```
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD
  ```

### Issue 2: Package with C Extension Cannot Be Installed
**Symptom**: Error about missing compiler or unsupported architecture.

**Solution**:
- Check if package is in [Pyodide package list](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)
- If available, use pre-built Pyodide version
- If not available, find pure-Python alternative
- Example: Use `httpx` instead of `requests` for some cases

### Issue 3: Out of Memory During Package Installation
**Symptom**: Browser tab crashes or becomes unresponsive.

**Solution**:
- Install packages one at a time instead of batch
- Clear Python globals before installing large packages
- Restart kernel to free memory
- Consider using smaller alternative packages

### Issue 4: Slow Package Installation
**Symptom**: Installation takes several minutes.

**Solution**:
- Large packages (NumPy, Pandas) are 10-50MB and take time
- Show progress indicators to users
- Cache packages in IndexedDB for future sessions
- Pre-bundle common packages in extension

### Issue 5: Package Import Works in Desktop Python but Fails in Pyodide
**Symptom**: Package installs but import fails.

**Solution**:
- Check if package has optional dependencies
- Some packages require modules not available in browser (e.g., `socket`, `multiprocessing`)
- Look for browser-compatible alternatives
- Check Pyodide compatibility notes

## Development Workflow

### 1. Testing Package Installation Locally

```bash
# Start development server
npm run watch-web

# In another terminal
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.
```

### 2. Testing with Custom Package Index

```python
# In Pyodide worker initialization
micropip.set_index_urls([
    'https://pyodide-cdn.com/packages/',
    'https://custom-index.com/simple/'
])
```

### 3. Monitoring Package Installation

```typescript
// Add logging to track installations
private async doInstall(packageSpec: string): Promise<void> {
    console.log(`[PackageManager] Installing ${packageSpec}...`);
    const startTime = Date.now();
    
    try {
        await this.worker.executeCode(`
import micropip
await micropip.install('${packageSpec}')
        `);
        console.log(`[PackageManager] Installed ${packageSpec} in ${Date.now() - startTime}ms`);
    } catch (error) {
        console.error(`[PackageManager] Failed to install ${packageSpec}:`, error);
        throw error;
    }
}
```

### 4. Pre-bundling Common Packages

```typescript
// In extension activation
async function preloadCommonPackages(worker: PyodideWorker): Promise<void> {
    const packages = ['numpy', 'pandas', 'matplotlib'];
    
    await worker.executeCode(`
import pyodide_js
# Preload packages without importing
await pyodide_js.loadPackage(${JSON.stringify(packages)})
    `);
}
```

## Next Steps

After completing this step:
1. Proceed to **Step 9**: File System Interop for reading/writing files
2. Test package installation with various package types
3. Consider implementing package caching for offline use
4. Add telemetry to track which packages users install most

## References

- [Pyodide Loading Packages](https://pyodide.org/en/stable/usage/loading-packages.html)
- [micropip API Reference](https://micropip.pyodide.org/en/stable/project/api.html)
- [Pyodide Packages List](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)
- [Building Packages for Pyodide](https://pyodide.org/en/stable/development/building-and-testing-packages.html)
- [Feasibility and Limitations of Pyodide](https://devblogs.microsoft.com/python/feasibility-use-cases-and-limitations-of-pyodide/)
