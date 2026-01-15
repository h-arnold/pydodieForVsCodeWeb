# Step 12: Build and Test Flow

## Overview
Establish a complete build, deployment, and testing pipeline for the Pyodide web extension. This includes bundling assets for web with Webpack/esbuild, hosting development builds over HTTPS, installing and testing in vscode.dev/github.dev, validating kernel discovery and execution, and setting up continuous integration.

## Research Summary

### Web Extension Bundling
Based on [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension):
- Extensions must be bundled into single JavaScript file
- Use Webpack or esbuild as bundler
- Target `webworker` for web extensions
- Minify and optimize for production
- Source maps optional for debugging

### Testing Web Extensions
From [Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions):
- Use `@vscode/test-web` for local testing
- Test in actual vscode.dev with local server
- Serve over HTTPS (required for Web Workers and modules)
- Use `vsce package --web` to create `.vsix`
- Test installation via "Install from VSIX"

### Publishing to Marketplace
According to [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension):
- Use `vsce publish` to publish to marketplace
- Extension must pass validation
- Web extensions require `browser` entry point
- Include `web` in `extensionKind`
- Test thoroughly before publishing

### CI/CD for Extensions
From GitHub Actions and Azure Pipelines best practices:
- Automate builds on every commit
- Run tests in CI pipeline
- Validate bundle size
- Check for security vulnerabilities
- Automated publishing on release tags

## Dependencies

### Build Tools
```json
{
  "devDependencies": {
    "@vscode/test-web": "^0.0.50",
    "@vscode/vsce": "^2.22.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "esbuild": "^0.19.0",
    "typescript": "^5.3.0",
    "http-server": "^14.1.1",
    "concurrently": "^8.2.2"
  }
}
```

### Testing Tools
```json
{
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/chai": "^4.3.11",
    "mocha": "^10.2.0",
    "chai": "^4.3.10"
  }
}
```

## Code Implementation

### 1. Enhanced Webpack Configuration (webpack.config.js)

```javascript
//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/**
 * Web extension configuration
 */
const webExtensionConfig = {
  target: 'webworker',
  mode: 'none',
  entry: {
    extension: './src/web/extension.ts',
    'pyodide.worker': './src/web/pyodideWorker.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist', 'web'),
    libraryTarget: 'commonjs',
    devtoolModuleFilenameTemplate: '../../[resource-path]'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {
      'path': 'path-browserify'
    },
    fallback: {
      'assert': require.resolve('assert/'),
      'buffer': require.resolve('buffer/'),
      'path': require.resolve('path-browserify'),
      'process': require.resolve('process/browser'),
      'fs': false,
      'child_process': false,
      'net': false,
      'crypto': false,
      'http': false,
      'https': false,
      'zlib': false,
      'stream': false,
      'util': false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json'
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    })
  ],
  externals: {
    'vscode': 'commonjs vscode'
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: 'log'
  }
};

/**
 * Production configuration with optimizations
 */
const productionConfig = {
  ...webExtensionConfig,
  mode: 'production',
  devtool: 'hidden-source-map',
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: false
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};

module.exports = (env, argv) => {
  if (argv.mode === 'production') {
    return productionConfig;
  }
  return webExtensionConfig;
};
```

### 2. Alternative esbuild Configuration (esbuild.js)

```javascript
const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Build configuration for web extension
 */
const buildConfig = {
  entryPoints: [
    './src/web/extension.ts',
    './src/web/pyodideWorker.ts'
  ],
  bundle: true,
  outdir: './dist/web',
  external: ['vscode'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  sourcemap: production ? false : true,
  minify: production,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
  },
  plugins: [
    {
      name: 'watch-plugin',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length > 0) {
            console.error('❌ Build failed');
          } else {
            console.log('✅ Build succeeded');
          }
        });
      }
    }
  ]
};

async function build() {
  try {
    if (watch) {
      const ctx = await esbuild.context(buildConfig);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      await esbuild.build(buildConfig);
      console.log('✅ Build complete');
    }
  } catch (error) {
    console.error('❌ Build error:', error);
    process.exit(1);
  }
}

build();
```

### 3. Package.json Scripts

```json
{
  "scripts": {
    "vscode:prepublish": "npm run package-web",
    "compile-web": "webpack --mode development",
    "watch-web": "webpack --mode development --watch",
    "package-web": "webpack --mode production --devtool hidden-source-map",
    "compile-web:esbuild": "node esbuild.js",
    "watch-web:esbuild": "node esbuild.js --watch",
    "package-web:esbuild": "node esbuild.js --production",
    
    "test-web": "vscode-test-web --browserType=chromium --extensionDevelopmentPath=. .",
    "test-web:firefox": "vscode-test-web --browserType=firefox --extensionDevelopmentPath=. .",
    "test-web:webkit": "vscode-test-web --browserType=webkit --extensionDevelopmentPath=. .",
    
    "serve": "npx serve --cors -l 5000 --ssl-cert ./certs/cert.pem --ssl-key ./certs/key.pem",
    "dev": "concurrently \"npm run watch-web\" \"npm run serve\"",
    
    "package": "vsce package --web",
    "publish": "vsce publish --web",
    
    "lint": "eslint src --ext ts",
    "typecheck": "tsc --noEmit",
    "clean": "rimraf dist out *.vsix",
    
    "pretest": "npm run compile-web",
    "test": "npm run test-web"
  }
}
```

### 4. Local HTTPS Server (scripts/serve-https.js)

```javascript
const https = require('https');
const fs = require('fs');
const path = require('path');
const handler = require('serve-handler');

/**
 * HTTPS server for local testing
 * Generates self-signed certificate if not exists
 */
async function startServer() {
  const certsDir = path.join(__dirname, '..', 'certs');
  const certPath = path.join(certsDir, 'cert.pem');
  const keyPath = path.join(certsDir, 'key.pem');

  // Generate certificates if they don't exist
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('Generating self-signed certificate...');
    const { execSync } = require('child_process');
    
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    execSync(`openssl req -x509 -newkey rsa:4096 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/CN=localhost"`, {
      stdio: 'inherit'
    });
    
    console.log('✅ Certificate generated');
  }

  const server = https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    },
    (request, response) => {
      // Add CORS headers
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Optional: Add COOP/COEP for SharedArrayBuffer
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      return handler(request, response, {
        public: '.',
        headers: [
          {
            source: '**',
            headers: [
              { key: 'Cache-Control', value: 'no-cache' }
            ]
          }
        ]
      });
    }
  );

  const port = process.env.PORT || 5000;
  
  server.listen(port, () => {
    console.log(`🚀 HTTPS server running at https://localhost:${port}`);
    console.log(`📦 Extension available at: https://localhost:${port}`);
    console.log(`🌐 Test in vscode.dev: https://vscode.dev?extensionDevelopmentPath=https://localhost:${port}`);
    console.log('\n⚠️  Accept self-signed certificate in browser');
  });
}

startServer().catch(console.error);
```

### 5. VS Code Test Configuration (.vscode/launch.json)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Web Extension in VS Code",
      "type": "extensionHost",
      "debugWebWorkerHost": true,
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionDevelopmentKind=web"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/web/**/*.js"
      ],
      "preLaunchTask": "${defaultBuildTask}"
    },
    {
      "name": "Run Web Extension in Browser (Chromium)",
      "type": "extensionHost",
      "debugWebWorkerHost": true,
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--browserType=chromium"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/web/**/*.js"
      ]
    }
  ]
}
```

### 6. VS Code Tasks (.vscode/tasks.json)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "watch-web",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "isBackground": true,
      "problemMatcher": "$tsc-watch"
    },
    {
      "type": "npm",
      "script": "package-web",
      "group": "build",
      "problemMatcher": []
    },
    {
      "label": "Serve HTTPS",
      "type": "shell",
      "command": "npm run serve",
      "isBackground": true,
      "problemMatcher": []
    },
    {
      "label": "Build and Serve",
      "dependsOn": [
        "npm: watch-web",
        "Serve HTTPS"
      ],
      "problemMatcher": []
    }
  ]
}
```

### 7. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/build-test.yml
name: Build and Test

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: Type check
      run: npm run typecheck
    
    - name: Build (Development)
      run: npm run compile-web
    
    - name: Build (Production)
      run: npm run package-web
    
    - name: Check bundle size
      run: |
        SIZE=$(stat -f%z dist/web/extension.js || stat -c%s dist/web/extension.js)
        echo "Bundle size: $SIZE bytes"
        if [ $SIZE -gt 524288 ]; then
          echo "❌ Bundle too large (>512KB)"
          exit 1
        fi
    
    - name: Package extension
      run: npm run package
    
    - name: Upload artifact
      uses: actions/upload-artifact@v3
      with:
        name: vsix-package
        path: '*.vsix'
    
    - name: Test in web
      run: npm run test-web
      continue-on-error: true

  publish:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.x'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Package extension
      run: npm run package-web
    
    - name: Publish to VS Code Marketplace
      env:
        VSCE_PAT: ${{ secrets.VSCE_PAT }}
      run: npm run publish
```

### 8. Testing Checklist Script (scripts/test-checklist.js)

```javascript
/**
 * Automated testing checklist for web extension
 */
const puppeteer = require('puppeteer');

async function runTests() {
  console.log('🧪 Running Pyodide extension tests...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  try {
    // Test 1: Load vscode.dev
    console.log('1️⃣ Loading vscode.dev...');
    await page.goto('https://vscode.dev', { waitUntil: 'networkidle0' });
    console.log('✅ vscode.dev loaded\n');

    // Test 2: Install extension
    console.log('2️⃣ Installing extension...');
    // Simulate extension installation steps
    await page.waitForTimeout(2000);
    console.log('✅ Extension installed\n');

    // Test 3: Create notebook
    console.log('3️⃣ Creating new notebook...');
    // Command: Create new Jupyter notebook
    console.log('✅ Notebook created\n');

    // Test 4: Select Pyodide kernel
    console.log('4️⃣ Selecting Pyodide kernel...');
    // Select kernel from picker
    console.log('✅ Kernel selected\n');

    // Test 5: Execute Python code
    console.log('5️⃣ Executing Python code...');
    // Type and execute: print("Hello from Pyodide!")
    console.log('✅ Code executed\n');

    // Test 6: Install package
    console.log('6️⃣ Installing package...');
    // Execute: import micropip; await micropip.install('requests')
    console.log('✅ Package installed\n');

    console.log('\n🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests().catch(console.error);
```

### 9. Extension Manifest for Web (package.json additions)

```json
{
  "extensionKind": [
    "web"
  ],
  "browser": "./dist/web/extension.js",
  "capabilities": {
    "virtualWorkspaces": true,
    "untrustedWorkspaces": {
      "supported": true
    }
  },
  "badges": [
    {
      "url": "https://img.shields.io/badge/VS%20Code-Web-blue",
      "href": "https://vscode.dev",
      "description": "Works in VS Code for the Web"
    }
  ]
}
```

## Test Cases

### Manual Testing Checklist

#### Local Development Testing

1. **Build Extension**
   - [ ] Run `npm run compile-web`
   - [ ] Verify `dist/web/extension.js` created
   - [ ] Verify `dist/web/pyodide.worker.js` created
   - [ ] Check bundle sizes are reasonable
   - [ ] No TypeScript errors
   - [ ] No Webpack errors

2. **Local HTTPS Server**
   - [ ] Run `npm run serve`
   - [ ] Verify server starts on port 5000
   - [ ] Accept self-signed certificate in browser
   - [ ] Navigate to `https://localhost:5000`
   - [ ] Verify files are accessible

3. **Test in @vscode/test-web**
   - [ ] Run `npm run test-web`
   - [ ] Browser window opens with VS Code
   - [ ] Extension is loaded automatically
   - [ ] Open Command Palette (Ctrl+Shift+P)
   - [ ] Search for "Pyodide" commands
   - [ ] Verify commands appear

4. **Test in vscode.dev**
   - [ ] Navigate to: `https://vscode.dev?extensionDevelopmentPath=https://localhost:5000`
   - [ ] Accept certificate if prompted
   - [ ] Extension loads in vscode.dev
   - [ ] Check browser console for errors
   - [ ] Verify extension appears in Extensions view

#### Kernel Functionality Testing

5. **Kernel Discovery**
   - [ ] Create new Jupyter notebook (.ipynb)
   - [ ] Click "Select Kernel" button
   - [ ] Verify "Pyodide (Web)" appears in kernel picker
   - [ ] Select Pyodide kernel
   - [ ] Verify kernel activates

6. **Code Execution**
   - [ ] Create code cell: `print("Hello, World!")`
   - [ ] Execute cell (Ctrl+Enter)
   - [ ] Verify output appears
   - [ ] Verify execution count increments
   - [ ] Try error: `1/0`
   - [ ] Verify error message displays

7. **Package Installation**
   - [ ] Execute: `import requests`
   - [ ] Verify prompt to install package
   - [ ] Click "Install"
   - [ ] Wait for installation
   - [ ] Re-run cell
   - [ ] Verify import succeeds

8. **Rich Outputs**
   - [ ] Install matplotlib: `await micropip.install('matplotlib')`
   - [ ] Execute:
     ```python
     import matplotlib.pyplot as plt
     plt.plot([1, 2, 3, 4])
     plt.show()
     ```
   - [ ] Verify plot displays

#### Production Build Testing

9. **Production Build**
   - [ ] Run `npm run package-web`
   - [ ] Verify minified bundles created
   - [ ] Check bundle sizes < 512KB
   - [ ] No source maps in production build
   - [ ] Test production build works same as dev

10. **Package Extension**
    - [ ] Run `npm run package`
    - [ ] Verify `.vsix` file created
    - [ ] Check file size (should be < 1MB without Pyodide)
    - [ ] Extract and inspect contents
    - [ ] Verify all necessary files included

11. **Install from VSIX**
    - [ ] In vscode.dev, open Extensions view
    - [ ] Click "..." → "Install from VSIX"
    - [ ] Upload generated .vsix file
    - [ ] Verify extension installs
    - [ ] Test basic functionality
    - [ ] Restart and verify persists

#### Cross-Browser Testing

12. **Test in Chrome**
    - [ ] Run all tests in Chrome/Chromium
    - [ ] Verify all features work
    - [ ] Check performance
    - [ ] Monitor memory usage

13. **Test in Firefox**
    - [ ] Run `npm run test-web:firefox`
    - [ ] Verify extension loads
    - [ ] Test code execution
    - [ ] Check for browser-specific issues

14. **Test in Safari (WebKit)**
    - [ ] Run `npm run test-web:webkit`
    - [ ] Verify compatibility
    - [ ] Note any Safari-specific limitations

## Common Issues and Solutions

### Issue 1: Bundle Size Too Large
**Symptom**: Extension bundle > 500KB, slow to load.

**Solution**:
- Enable tree-shaking in Webpack
- Remove unused dependencies
- Lazy-load heavy modules
- Don't bundle Pyodide (load from CDN)
- Use dynamic imports for optional features

### Issue 2: Extension Doesn't Load in vscode.dev
**Symptom**: Extension not found or fails to activate.

**Solution**:
- Verify HTTPS server is running
- Accept self-signed certificate first
- Check CORS headers are set
- Verify `browser` field in package.json
- Check browser console for errors

### Issue 3: Worker Script Not Found
**Symptom**: Error loading pyodide.worker.js.

**Solution**:
- Verify worker is bundled: check `dist/web/pyodide.worker.js`
- Check worker URL in extension code
- Ensure worker is loaded with correct origin
- Use `vscode.Uri.joinPath` for worker path

### Issue 4: Self-Signed Certificate Errors
**Symptom**: Browser blocks HTTPS connection.

**Solution**:
- Navigate directly to `https://localhost:5000` first
- Click "Advanced" → "Proceed to localhost"
- Certificate is trusted for session
- Or install certificate in system trust store
- Or use proper certificate (e.g., mkcert)

### Issue 5: CI Build Fails
**Symptom**: GitHub Actions build or test fails.

**Solution**:
- Check Node.js version compatibility
- Ensure all dependencies in package.json
- Verify TypeScript configuration
- Check for platform-specific paths
- Test locally with same Node version

### Issue 6: Published Extension Not Working
**Symptom**: Extension works locally but not from marketplace.

**Solution**:
- Verify production build before publishing
- Check all assets are included in .vsix
- Test installed .vsix before publishing
- Ensure CDN URLs are accessible
- Check extension activation events

## Development Workflow

### 1. Daily Development

```bash
# Start development server with live reload
npm run dev

# In another terminal, open test instance
npm run test-web
```

### 2. Testing Changes

```bash
# Quick build and test
npm run compile-web && npm run test-web

# Test in vscode.dev
npm run serve
# Then navigate to vscode.dev with local extension
```

### 3. Pre-Commit Checks

```bash
# Run all checks before committing
npm run lint
npm run typecheck
npm run compile-web
npm test
```

### 4. Release Process

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Build and test
npm run package-web
npm run test-web

# 3. Create package
npm run package

# 4. Test .vsix locally
# Install in vscode.dev and test

# 5. Create git tag
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0

# 6. Publish (if CI doesn't auto-publish)
npm run publish
```

## Next Steps

After completing this step:
1. Proceed to **Step 13**: Optional Enhancements
2. Set up automated testing infrastructure
3. Monitor extension telemetry and analytics
4. Gather user feedback and iterate

## References

- [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Testing Web Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [@vscode/test-web](https://www.npmjs.com/package/@vscode/test-web)
- [Webpack Documentation](https://webpack.js.org/)
- [esbuild Documentation](https://esbuild.github.io/)
