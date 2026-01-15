# Step 1: Establish the Web Extension Scaffolding

## Overview

Create a VS Code web extension project that targets the `webworker` environment, ensuring compatibility with VS Code for the Web (vscode.dev, github.dev). This foundation will support running Python via Pyodide in a browser-based Jupyter notebook environment.

## Research Summary

### Web Extension Architecture

Based on [VS Code Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions):

- Web extensions run in a **Web Worker** environment (not Node.js)
- No access to Node.js APIs (`fs`, `child_process`, `os`, etc.)
- Must use browser APIs (Fetch, Web Workers, IndexedDB)
- Single bundled JavaScript file for the extension host
- All dependencies must be bundled or externalized properly

### Key Constraints

1. **Runtime Environment**: Web Worker (webworker target)
2. **No Node.js APIs**: Must use browser-compatible alternatives
3. **Bundling Required**: Extension must be a single JS bundle
4. **CORS Considerations**: External resources must have proper headers
5. **Module System**: CommonJS or ES Modules compatible with web

## Dependencies

### Build Dependencies

```json
{
  "devDependencies": {
    "@types/vscode": "*",
    "@types/node": "*",
    "typescript": "*",
    "webpack": "*",
    "webpack-cli": "*",
    "ts-loader": "*",
    "path-browserify": "*",
    "process": "*",
    "buffer": "*"
  }
}
```

### Runtime Dependencies

```json
{
  "dependencies": {
    "@vscode/extension-telemetry": "^0.9.0"
  }
}
```

### Alternative: Using esbuild (faster alternative to Webpack)

```json
{
  "devDependencies": {
    "esbuild": "*",
    "esbuild-plugin-polyfill-node": "*"
  }
}
```

## Project Structure

```
pydodieForVsCodeWeb/
├── src/
│   ├── web/
│   │   ├── extension.ts          # Main extension entry point
│   │   ├── pyodideWorker.ts      # Pyodide worker (created in Step 4)
│   │   └── notebookController.ts # Controller logic (created in Step 3)
│   └── common/
│       ├── types.ts              # Shared types
│       └── constants.ts          # Constants
├── dist/
│   └── web/                      # Bundled output
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
├── webpack.config.js             # Webpack bundler config
└── .vscodeignore                # Files to exclude from package
```

## Code Implementation

### 1. package.json (Web Extension Configuration)

```json
{
  "name": "pyodide-vscode-web",
  "displayName": "Pyodide Kernel for VS Code Web",
  "description": "Run Python in Jupyter notebooks using Pyodide (WebAssembly)",
  "version": "0.1.0",
  "publisher": "your-publisher-name",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Notebooks", "Data Science"],
  "keywords": [
    "python",
    "jupyter",
    "notebook",
    "pyodide",
    "webassembly",
    "notebookKernelJupyterNotebook"
  ],
  "activationEvents": ["onNotebook:jupyter-notebook"],
  "browser": "./dist/web/extension.js",
  "contributes": {
    "notebookRenderer": []
  },
  "scripts": {
    "vscode:prepublish": "npm run package-web",
    "compile-web": "webpack --mode development",
    "watch-web": "webpack --mode development --watch",
    "package-web": "webpack --mode production --devtool hidden-source-map",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "devDependencies": {
    "@types/vscode": "*",
    "@types/node": "*",
    "typescript": "*",
    "webpack": "*",
    "webpack-cli": "*",
    "ts-loader": "*",
    "path-browserify": "*",
    "process": "*",
    "buffer": "*"
  }
}
```

**Key Points:**

- `browser` field points to the web extension entry point (instead of `main`)
- `activationEvents` includes `onNotebook:jupyter-notebook` for lazy activation
- `notebookKernelJupyterNotebook` keyword for kernel discoverability

### 2. tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020", "WebWorker"],
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", ".vscode-test-web"]
}
```

### 3. webpack.config.js

```javascript
//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const webExtensionConfig = {
  target: 'webworker', // Web extension target
  mode: 'none',
  entry: {
    extension: './src/web/extension.ts',
    'pyodide.worker': './src/web/pyodideWorker.ts',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist', 'web'),
    libraryTarget: 'commonjs',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {
      // Polyfills for Node.js core modules
      path: 'path-browserify',
    },
    fallback: {
      // Required for browser compatibility
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      fs: false,
      child_process: false,
      net: false,
      crypto: false,
      http: false,
      https: false,
      zlib: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
  externals: {
    vscode: 'commonjs vscode', // VS Code API is provided at runtime
  },
  performance: {
    hints: false,
  },
  devtool: 'source-map',
};

module.exports = [webExtensionConfig];
```

**Key Configuration Points:**

- `target: 'webworker'` - Ensures code runs in Web Worker environment
- `externals: { 'vscode': 'commonjs vscode' }` - VS Code API not bundled
- `fallback` - Polyfills for Node.js modules
- `ProvidePlugin` - Injects global `process` and `Buffer`
- Two entry points: main extension and Pyodide worker

### 4. src/web/extension.ts (Initial Scaffold)

```typescript
import * as vscode from 'vscode';

/**
 * Main activation function for the web extension
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
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
export function deactivate() {
  console.log('Pyodide Kernel extension deactivated');
}
```

### 5. src/common/types.ts

```typescript
/**
 * Message types for communication between extension host and Pyodide worker
 */
export enum MessageType {
  INIT = 'init',
  RUN = 'run',
  STDOUT = 'stdout',
  STDERR = 'stderr',
  RESULT = 'result',
  ERROR = 'error',
  INTERRUPT = 'interrupt',
}

/**
 * Base message interface
 */
export interface WorkerMessage {
  type: MessageType;
  id?: string;
}

/**
 * Configuration for Pyodide initialization
 */
export interface PyodideConfig {
  indexURL?: string;
  packages?: string[];
}
```

### 6. src/common/constants.ts

```typescript
/**
 * Extension constants
 */
export const EXTENSION_ID = 'pyodide-vscode-web';
export const CONTROLLER_ID = 'pyodide-kernel';
export const CONTROLLER_LABEL = 'Pyodide (Web)';
export const NOTEBOOK_TYPE = 'jupyter-notebook';

/**
 * Pyodide CDN URLs
 */
export const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';
export const PYODIDE_VERSION = '0.25.0';
```

### 7. .vscodeignore

```
.vscode/**
.vscode-test/**
.vscode-test-web/**
src/**
.gitignore
.yarnrc
webpack.config.js
**/tsconfig.json
**/*.map
**/*.ts
node_modules/**
out/**
```

### 8. .gitignore

```
node_modules/
out/
dist/
*.vsix
.vscode-test/
.vscode-test-web/
*.log
```

## Test Cases

### Manual Testing Checklist

1. **Build Verification**
   - [x] Run `npm install` successfully
   - [x] Run `npm run compile-web` without errors
   - [x] Verify `dist/web/extension.js` is created
   - [x] Verify `dist/web/pyodide.worker.js` is created (in Step 4)
   - [x] Check bundle size is reasonable (< 500KB for extension, worker varies)
     - ✅ extension.js: 609 bytes (production), 2.8KB (dev)
     - ✅ pyodide.worker.js: 151 bytes (production), 674 bytes (dev)

2. **Web Extension Loading**
   - [ ] Package extension with `vsce package --web`
   - [ ] Upload to local server or use `@vscode/test-web`
   - [ ] Load extension in vscode.dev
   - [ ] Verify extension appears in Extensions view
   - [ ] Check console for activation message
   - [ ] No errors in browser DevTools console

3. **Environment Verification**
   - [ ] Verify `typeof process !== 'undefined'` (polyfill loaded)
   - [ ] Verify `Buffer` is available globally
   - [ ] Test that `path` module works (e.g., `path.join()`)
   - [ ] Confirm no Node.js native modules are referenced

4. **Production Build**
   - [x] Run `npm run package-web` (production build)
   - [x] Verify source maps are excluded or hidden
   - [x] Check minified bundle size
   - [ ] Test production bundle in vscode.dev

## Development Workflow

1. **Initial Setup**

   ```bash
   npm install
   npm run compile-web
   ```

2. **Development Mode**

   ```bash
   npm run watch-web
   # In another terminal:
   npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.
   ```

3. **Testing in vscode.dev**

   ```bash
   # Build and serve locally
   npm run compile-web
   npx serve --cors -l 5000 .

   # Open vscode.dev with local extension
   # https://vscode.dev/?extensionDevelopmentPath=http://localhost:5000
   ```

4. **Production Package**
   ```bash
   npm run package-web
   npx @vscode/vsce package --web
   ```

## Common Issues and Solutions

### Issue 1: "Module not found: Error: Can't resolve 'fs'"

**Solution**: Add `fs: false` to webpack's `resolve.fallback` configuration.

### Issue 2: "process is not defined"

**Solution**: Add `webpack.ProvidePlugin` to inject `process/browser`.

### Issue 3: Extension doesn't load in vscode.dev

**Solution**:

- Verify `browser` field in package.json
- Check CORS headers if serving locally
- Ensure bundle is properly created in `dist/web/`

### Issue 4: Large bundle size

**Solution**:

- Use `externals` for VS Code API
- Enable tree-shaking in production mode
- Lazy-load heavy dependencies
- Consider code splitting

## Next Steps

After completing this step:

1. Proceed to **Step 2**: Register the Kernel in package.json
2. Verify the scaffolding works by loading the extension in vscode.dev
3. Add telemetry and logging infrastructure if needed

## References

- [VS Code Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Webpack Configuration for Web](https://webpack.js.org/configuration/target/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)

---

## Implementation Notes (Completed)

### ✅ Step 1 Completed - Web Extension Scaffolding

**Completed Tasks:**

1. ✅ Created `src/web/extension.ts` - Main extension entry point
2. ✅ Created `src/web/pyodideWorker.ts` - Placeholder for Pyodide worker
3. ✅ Created `src/common/types.ts` - Shared type definitions
4. ✅ Created `src/common/constants.ts` - Extension constants
5. ✅ Updated `webpack.config.js` - Two entry points (extension + worker)
6. ✅ Updated `tsconfig.json` - Web Worker target with ES2020
7. ✅ Created `.vscodeignore` - Package exclusions
8. ✅ Installed `assert` package for Node.js polyfills
9. ✅ Verified build succeeds (dev and production)
10. ✅ Verified type checking passes

**Key Changes/Deviations:**

- Used ES2020 instead of ES2022 for better browser compatibility
- Added `rootDir` to tsconfig to fix compilation issues
- Excluded `test/` directory from TypeScript compilation (separate config needed for tests)
- Used underscore prefix for unused `context` parameter to satisfy strict mode
- Bundle sizes are excellent: 609 bytes (extension), 151 bytes (worker) in production

**Build Verification:**

```bash
✅ npm run compile-web    # Development build succeeds
✅ npm run package-web    # Production build succeeds
✅ npm run typecheck      # Type checking passes
✅ Bundle sizes < 1KB     # Optimal for web extension
```

**Next Steps:**

- Proceed to Step 2: Register the Kernel in package.json
- Manual testing in vscode.dev will be done after Step 3 (Notebook Controller)
