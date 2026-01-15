# Pyodide VS Code Web Extension - Implementation Guide

## Overview

This directory contains **comprehensive, step-by-step documentation** for building a VS Code Web extension that provides a Pyodide-powered Python kernel for Jupyter notebooks. The extension enables Python code execution directly in the browser (vscode.dev, github.dev) using WebAssembly, without requiring any server infrastructure.

## Documentation Structure

Each step document follows a consistent structure:
1. **Overview** - High-level summary of the step
2. **Research Summary** - Technical background and references
3. **Dependencies** - Required packages and versions
4. **Code Implementation** - Complete, production-ready code
5. **Test Cases** - Automated tests and manual verification checklists
6. **Common Issues and Solutions** - Troubleshooting guide
7. **Development Workflow** - Step-by-step procedures
8. **Next Steps** - Continuation guidance
9. **References** - Links to official documentation

## Implementation Steps

### Foundation (Steps 1-3)
Build the core VS Code extension infrastructure:

- **[Step 1: Web Extension Scaffolding](./Step-01-Web-Extension-Scaffolding.md)** (12KB)
  - Set up Webpack/esbuild bundler for web target
  - Configure TypeScript for browser environment
  - Add Node.js polyfills (path, process, buffer)
  - Create basic extension structure
  - **Key Files**: `package.json`, `webpack.config.js`, `tsconfig.json`, `extension.ts`

- **[Step 2: Kernel Registration](./Step-02-Kernel-Registration.md)** (17KB)
  - Configure `package.json` contribution points
  - Add `notebookKernelJupyterNotebook` keyword for discovery
  - Set up activation events and capabilities
  - Define commands and configuration settings
  - **Key Sections**: `contributes`, `activationEvents`, `browser` field

- **[Step 3: NotebookController](./Step-03-NotebookController.md)** (21KB)
  - Implement `NotebookController` using VS Code API
  - Handle cell execution lifecycle
  - Manage outputs and execution order
  - Support interrupt operations
  - **Key Classes**: `PyodideNotebookController`, `NotebookCellExecution`

### Pyodide Integration (Steps 4-7)
Connect the Python execution engine:

- **[Step 4: Pyodide Worker](./Step-04-Pyodide-Worker.md)** (27KB)
  - Create dedicated Web Worker for Pyodide
  - Load Pyodide from CDN with lazy initialization
  - Implement message protocol (init, run, stdout, stderr, result, error)
  - Set up worker manager and factory patterns
  - **Key Files**: `pyodideWorker.ts`, worker message handlers

- **[Step 5: Controller-Worker Wiring](./Step-05-Controller-Worker-Wiring.md)** (22KB)
  - Connect NotebookController to Pyodide worker
  - Implement bidirectional message passing
  - Stream execution outputs incrementally
  - Handle async execution and promises
  - **Key Classes**: `PyodideKernel`, message queue management

- **[Step 6: Stdout/Stderr Capture](./Step-06-Stdout-Stderr-Capture.md)** (25KB)
  - Redirect Python stdout/stderr using `pyodide.setStdout()`
  - Implement output batching for performance
  - Capture final expression values (Jupyter-style)
  - Handle print statements and tracebacks
  - **Key Functions**: Stream redirection, buffer management

- **[Step 7: Rich Output Rendering](./Step-07-Rich-Output-Rendering.md)** (27KB)
  - Serialize Python objects to MIME bundles
  - Support Jupyter MIME types (text/html, image/png, application/json)
  - Integrate with matplotlib, pandas, Plotly
  - Create proper `NotebookCellOutputItem` objects
  - **Key Classes**: `MimeHandler`, output serialization

### Advanced Features (Steps 8-11)
Add professional-grade capabilities:

- **[Step 8: Package Management](./Step-08-Package-Management.md)** (28KB)
  - Enable micropip for installing packages
  - Auto-install on import errors
  - Bundle common libraries (NumPy, Pandas, Matplotlib)
  - Provide UI for package installation
  - **Key Features**: `micropip` integration, package commands

- **[Step 9: File System Interop](./Step-09-File-System-Interop.md)** (23KB)
  - Bridge VS Code FS API with Pyodide virtual FS
  - Sync files between workspace and Python environment
  - Support reading/writing notebook-adjacent files
  - Handle file watchers
  - **Key Classes**: `FileSystemBridge`, file synchronization

- **[Step 10: Web Constraints](./Step-10-Web-Constraints.md)** (25KB)
  - Handle CORS for Pyodide assets and wheels
  - Detect and use SharedArrayBuffer when available
  - Implement fallbacks for browsers without cross-origin isolation
  - Manage memory constraints (1-4GB browser limit)
  - **Key Features**: CORS validation, memory monitoring

- **[Step 11: Kernel UX/Context Keys](./Step-11-Kernel-UX-Context-Keys.md)** (27KB)
  - Implement kernel lifecycle commands (restart, clear, interrupt)
  - Set Jupyter-compatible context keys
  - Add status bar integration
  - Provide variable inspection
  - **Key Commands**: `pyodide.restartKernel`, `pyodide.installPackage`

### Deployment & Enhancement (Steps 12-13)
Finalize and extend the extension:

- **[Step 12: Build & Test Flow](./Step-12-Build-Test-Flow.md)** (22KB)
  - Set up production build pipeline
  - Configure HTTPS local server for development
  - Test in vscode.dev and github.dev
  - Implement CI/CD with GitHub Actions
  - **Key Tools**: Webpack, `@vscode/test-web`, GitHub Actions

- **[Step 13: Optional Enhancements](./Step-13-Optional-Enhancements.md)** (31KB)
  - Add IntelliSense via Jedi language server
  - Implement variable explorer with tree view
  - Create DataFrame data viewer
  - Support interactive help and debugging
  - **Key Features**: LSP integration, custom UI views

## Quick Start

### Prerequisites
```bash
# Required tools
node >= 18.x
npm >= 9.x
VS Code >= 1.85.0
```

### Installation & Build
```bash
# Clone repository
git clone <repository-url>
cd pydodieForVsCodeWeb

# Install dependencies
npm install

# Build for development
npm run compile-web

# Build for production
npm run package-web
```

### Local Testing
```bash
# Option 1: Use VS Code test web
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.

# Option 2: Serve locally and load in vscode.dev
npx serve --cors -l 5000 .
# Then open: https://vscode.dev/?extensionDevelopmentPath=http://localhost:5000
```

### Publishing
```bash
# Package extension
npx @vscode/vsce package --web

# Publish to marketplace
npx @vscode/vsce publish --web
```

## Development Order

Follow these steps **in sequence** for best results:

1. **Steps 1-3**: Foundation - Build the VS Code extension shell
2. **Steps 4-5**: Integration - Connect Pyodide worker
3. **Step 6-7**: Outputs - Implement proper output handling
4. **Test thoroughly** - Validate basic execution works
5. **Steps 8-9**: Features - Add package management and file I/O
6. **Step 10**: Constraints - Handle browser limitations
7. **Step 11**: UX - Polish user experience
8. **Step 12**: Deploy - Set up production build
9. **Step 13**: Enhance - Add optional advanced features

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Mock VS Code API where needed
- Use Mocha/Jest for test framework

### Integration Tests
- Test controller + worker communication
- Verify output streaming
- Test package installation

### Manual Testing
- Load extension in vscode.dev
- Test with real Jupyter notebooks
- Verify all commands work
- Check error handling

### Performance Testing
- Measure initialization time (should be < 5s)
- Test memory usage (should be < 500MB for basic usage)
- Verify output streaming is smooth

## Key Technologies

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Pyodide** | Python WebAssembly runtime | 0.25.0+ |
| **VS Code API** | Extension framework | 1.85.0+ |
| **TypeScript** | Type-safe development | 5.3.0+ |
| **Webpack** | Module bundler | 5.89.0+ |
| **Web Workers** | Isolated Python execution | Browser API |
| **micropip** | Package installation | Bundled with Pyodide |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code for the Web (vscode.dev / github.dev)             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Jupyter Extension (ms-toolsai.jupyter)               │ │
│  │  - Notebook UI                                        │ │
│  │  - Kernel Picker                                      │ │
│  │  - Output Renderers                                   │ │
│  └────────────────┬──────────────────────────────────────┘ │
│                   │                                         │
│  ┌────────────────▼──────────────────────────────────────┐ │
│  │  Pyodide Extension (This Extension)                   │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Extension Host (Web Worker)                     │ │ │
│  │  │  - NotebookController                            │ │ │
│  │  │  - Command Handlers                              │ │ │
│  │  │  - PyodideKernel (Message Router)                │ │ │
│  │  └──────────────┬───────────────────────────────────┘ │ │
│  │                 │ postMessage / MessagePort            │ │
│  │  ┌──────────────▼───────────────────────────────────┐ │ │
│  │  │  Pyodide Worker (Dedicated Web Worker)          │ │ │
│  │  │  - CPython (WebAssembly)                         │ │ │
│  │  │  - Standard Library                              │ │ │
│  │  │  - micropip                                      │ │ │
│  │  │  - Virtual File System                           │ │ │
│  │  │  - Output Capture                                │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────── ┘ │
└─────────────────────────────────────────────────────────────┘
```

## Common Workflows

### Adding a New Command
1. Add command to `package.json` → `contributes.commands`
2. Implement handler in `extension.ts`
3. Register in context subscriptions
4. Add tests in `test/commands.test.ts`

### Supporting a New MIME Type
1. Add handler in `MimeHandler` class (Step 7)
2. Test with Python code that produces that output
3. Verify rendering in notebook cell output

### Installing a New Pyodide Package
1. Check compatibility at https://pyodide.org/en/stable/usage/packages-in-pyodide.html
2. Add to `preloadPackages` config if commonly used
3. Document in README.md

## Troubleshooting

### Extension Not Loading
- Check browser console for errors
- Verify `browser` field in package.json points to correct file
- Ensure bundle is properly built in `dist/web/`
- Check CORS headers if serving locally

### Kernel Not Appearing
- Verify `notebookKernelJupyterNotebook` keyword in package.json
- Check that Jupyter extension is installed
- Ensure controller is created with `jupyter-notebook` view type
- Verify activation events include `onNotebook:jupyter-notebook`

### Code Execution Fails
- Check Pyodide worker is initialized (see console)
- Verify message passing between extension and worker
- Check for Python syntax errors
- Ensure packages are installed

### Slow Performance
- Enable lazy initialization (don't load Pyodide until needed)
- Use output batching to reduce message frequency
- Consider bundling common packages instead of CDN
- Monitor memory usage in browser DevTools

## Resources

### Official Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Notebook API Guide](https://code.visualstudio.com/api/extension-guides/notebook)
- [Web Extensions Guide](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [Pyodide Documentation](https://pyodide.org/en/stable/)
- [Jupyter Extension Wiki](https://github.com/microsoft/vscode-jupyter/wiki)

### Example Implementations
- [vscode-pyodide](https://marketplace.visualstudio.com/items?itemName=joyceerhl.vscode-pyodide) - Reference implementation
- [vscode-python-web-wasm](https://github.com/microsoft/vscode-python-web-wasm) - Microsoft's approach
- [JupyterLite](https://jupyterlite.readthedocs.io/) - Jupyter in browser

### Community
- [Pyodide Discussions](https://github.com/pyodide/pyodide/discussions)
- [VS Code Extension Development](https://github.com/microsoft/vscode-discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode-extensions+pyodide)

## Contributing

This documentation is designed to be **comprehensive and actionable**. Each step can be implemented independently by following the detailed instructions, code examples, and test cases provided.

### Documentation Standards
- ✅ Every code example must be complete and runnable
- ✅ Every feature must have test cases
- ✅ Every common issue must have a solution
- ✅ All references must be to official sources
- ✅ Minimum 8,000 characters per step document

## License

[Specify your license here]

## Authors

[Your information here]

---

**Total Documentation**: 13 comprehensive guides covering every aspect of building a production-ready Pyodide kernel for VS Code Web.

**Last Updated**: 2026-01-15
