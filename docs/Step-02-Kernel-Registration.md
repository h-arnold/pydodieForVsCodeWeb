# Step 2: Register the Kernel in package.json

## Overview

Configure the extension's `package.json` to properly register the Pyodide kernel so it appears in the Jupyter extension's kernel picker. This involves adding specific contribution points, keywords, and metadata that enable kernel discovery.

## Research Summary

### Notebook Controller Discovery

Based on [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook) and [Jupyter Extension Wiki](https://github.com/microsoft/vscode-jupyter/wiki/Accessing-Jupyter-Kernels-from-3rd-party-extensions):

- The official Jupyter extension (ms-toolsai.jupyter) scans for NotebookController providers
- Controllers must target the `jupyter-notebook` view type to appear in .ipynb files
- The keyword `notebookKernelJupyterNotebook` enables marketplace discoverability
- Activation events control when the extension loads
- Context keys help differentiate web vs desktop environments

### Key Requirements

1. **View Type**: Must be `jupyter-notebook` for .ipynb compatibility
2. **Keywords**: Include `notebookKernelJupyterNotebook` for discovery
3. **Activation Events**: Use `onNotebook:jupyter-notebook` for lazy loading
4. **Browser Field**: Must point to web extension bundle
5. **Categories**: Include "Notebooks" and "Data Science"

## Dependencies

No additional dependencies beyond Step 1. The configuration is purely declarative in package.json.

## Code Implementation

### Complete package.json for Web Extension

```json
{
  "name": "pyodide-vscode-web",
  "displayName": "Pyodide Kernel for VS Code Web",
  "description": "Run Python in Jupyter notebooks using Pyodide (WebAssembly) - works in vscode.dev and github.dev",
  "version": "0.1.0",
  "publisher": "your-publisher-name",
  "icon": "resources/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/pyodide-vscode-web"
  },
  "bugs": {
    "url": "https://github.com/your-username/pyodide-vscode-web/issues"
  },
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Notebooks", "Data Science", "Programming Languages"],
  "keywords": [
    "python",
    "jupyter",
    "notebook",
    "pyodide",
    "webassembly",
    "wasm",
    "kernel",
    "data-science",
    "web",
    "notebookKernelJupyterNotebook"
  ],
  "activationEvents": ["onNotebook:jupyter-notebook"],
  "browser": "./dist/web/extension.js",
  "main": "./dist/node/extension.js",
  "capabilities": {
    "virtualWorkspaces": true,
    "untrustedWorkspaces": {
      "supported": true
    }
  },
  "contributes": {
    "notebookRenderer": [],
    "commands": [
      {
        "command": "pyodide.restartKernel",
        "title": "Restart Pyodide Kernel",
        "category": "Pyodide",
        "enablement": "jupyter.webExtension && jupyter.ispythonnotebook"
      },
      {
        "command": "pyodide.clearOutputs",
        "title": "Clear All Outputs",
        "category": "Pyodide"
      },
      {
        "command": "pyodide.installPackage",
        "title": "Install Python Package (micropip)",
        "category": "Pyodide",
        "enablement": "jupyter.webExtension"
      }
    ],
    "menus": {
      "notebook/toolbar": [
        {
          "command": "pyodide.restartKernel",
          "when": "jupyter.webExtension && jupyter.ispythonnotebook && notebookType == jupyter-notebook",
          "group": "navigation@100"
        }
      ]
    },
    "configuration": {
      "title": "Pyodide Kernel",
      "properties": {
        "pyodide.indexURL": {
          "type": "string",
          "default": "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
          "description": "URL to Pyodide distribution files"
        },
        "pyodide.autoInstallPackages": {
          "type": "boolean",
          "default": true,
          "description": "Automatically install missing packages with micropip"
        },
        "pyodide.preloadPackages": {
          "type": "array",
          "default": [],
          "items": {
            "type": "string"
          },
          "description": "Packages to preload when kernel starts"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run package-web",
    "compile-web": "webpack --mode development",
    "watch-web": "webpack --mode development --watch",
    "package-web": "webpack --mode production --devtool hidden-source-map",
    "compile-tests": "tsc -p . --outDir out",
    "watch-tests": "tsc -p . -w --outDir out",
    "pretest": "npm run compile-tests && npm run compile-web",
    "test": "node ./out/test/runTest.js",
    "lint": "eslint src --ext ts",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "devDependencies": {
    "@types/vscode": "*",
    "@types/node": "*",
    "@types/mocha": "*",
    "@typescript-eslint/eslint-plugin": "*",
    "@typescript-eslint/parser": "*",
    "typescript": "*",
    "webpack": "*",
    "webpack-cli": "*",
    "ts-loader": "*",
    "path-browserify": "*",
    "process": "*",
    "buffer": "*",
    "assert": "*",
    "@vscode/test-web": "*",
    "eslint": "*",
    "prettier": "*",
    "mocha": "*"
  },
  "dependencies": {}
}
```

### Key Configuration Sections Explained

#### 1. Basic Metadata

```json
{
  "name": "pyodide-vscode-web",
  "displayName": "Pyodide Kernel for VS Code Web",
  "description": "Run Python in Jupyter notebooks using Pyodide (WebAssembly)",
  "version": "0.1.0",
  "publisher": "your-publisher-name"
}
```

- **name**: Unique identifier (lowercase, no spaces)
- **displayName**: Human-readable name in marketplace
- **publisher**: Your VS Code marketplace publisher ID

#### 2. Engine Requirements

```json
{
  "engines": {
    "vscode": "^1.85.0"
  }
}
```

- Specifies minimum VS Code version
- Version 1.85+ recommended for latest Notebook API features

#### 3. Categories and Keywords

```json
{
  "categories": ["Notebooks", "Data Science", "Programming Languages"],
  "keywords": [
    "python",
    "jupyter",
    "notebook",
    "pyodide",
    "webassembly",
    "notebookKernelJupyterNotebook"
  ]
}
```

- **notebookKernelJupyterNotebook**: Critical keyword for Jupyter extension discovery
- Categories help users find the extension in marketplace

#### 4. Activation Events

```json
{
  "activationEvents": ["onNotebook:jupyter-notebook"]
}
```

- Lazy-loads extension only when Jupyter notebook is opened
- Reduces memory footprint and startup time
- Can add additional events: `"onCommand:pyodide.restartKernel"`

#### 5. Entry Points

```json
{
  "browser": "./dist/web/extension.js",
  "main": "./dist/node/extension.js"
}
```

- **browser**: Used in web environments (vscode.dev, github.dev)
- **main**: Used in desktop VS Code (optional, for hybrid support)

#### 6. Capabilities

```json
{
  "capabilities": {
    "virtualWorkspaces": true,
    "untrustedWorkspaces": {
      "supported": true
    }
  }
}
```

- **virtualWorkspaces**: Enables extension in virtual file systems (github.dev)
- **untrustedWorkspaces**: Allows running in untrusted workspaces (Pyodide is sandboxed)

#### 7. Commands Contribution

```json
{
  "contributes": {
    "commands": [
      {
        "command": "pyodide.restartKernel",
        "title": "Restart Pyodide Kernel",
        "category": "Pyodide",
        "enablement": "jupyter.webExtension && jupyter.ispythonnotebook"
      }
    ]
  }
}
```

- Commands users can invoke via Command Palette
- **enablement**: Context key expressions control when commands are available
- **category**: Groups related commands together

#### 8. Menu Contributions

```json
{
  "menus": {
    "notebook/toolbar": [
      {
        "command": "pyodide.restartKernel",
        "when": "jupyter.webExtension && jupyter.ispythonnotebook && notebookType == jupyter-notebook",
        "group": "navigation@100"
      }
    ]
  }
}
```

- Adds commands to notebook toolbar
- **when**: Context expression determines visibility
- **group**: Controls position in toolbar

#### 9. Configuration Settings

```json
{
  "configuration": {
    "title": "Pyodide Kernel",
    "properties": {
      "pyodide.indexURL": {
        "type": "string",
        "default": "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
        "description": "URL to Pyodide distribution files"
      }
    }
  }
}
```

- User-configurable settings
- Accessible via `vscode.workspace.getConfiguration('pyodide')`

## Context Keys Reference

### Jupyter Extension Context Keys

These are set by the official Jupyter extension and can be used in `when` clauses:

| Context Key                | Description                          | Example Value              |
| -------------------------- | ------------------------------------ | -------------------------- |
| `jupyter.webExtension`     | True when running in web environment | `true` in vscode.dev       |
| `jupyter.ispythonnotebook` | Active notebook is Python-based      | `true` for Python kernels  |
| `jupyter.kernel.isjupyter` | Kernel is Jupyter-compatible         | `true`                     |
| `jupyter.isnativeactive`   | Active editor is a Jupyter notebook  | `true` when .ipynb is open |
| `notebookType`             | Type of active notebook              | `jupyter-notebook`         |

### Custom Context Keys (Set in Step 11)

```typescript
// Set custom context in extension code
vscode.commands.executeCommand('setContext', 'pyodide.kernelReady', true);
```

## Test Cases

### 1. Manifest Validation

```bash
# Validate package.json structure
npx @vscode/vsce ls

# Expected output should include:
# - All files in dist/web/
# - package.json
# - README.md
# - No source files (src/*)
```

### 2. Extension Installation Test

```typescript
// test/integration/activation.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation Test Suite', () => {
  test('Extension should be present', async () => {
    const ext = vscode.extensions.getExtension('your-publisher.pyodide-vscode-web');
    assert.ok(ext, 'Extension not found');
  });

  test('Extension activates on notebook open', async () => {
    const ext = vscode.extensions.getExtension('your-publisher.pyodide-vscode-web');

    // Create a new Jupyter notebook
    const notebook = await vscode.workspace.openNotebookDocument('jupyter-notebook');

    // Wait for activation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    assert.ok(ext?.isActive, 'Extension did not activate');
  });
});
```

### 3. Command Registration Test

```typescript
suite('Command Registration Test Suite', () => {
  test('All commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();

    const requiredCommands = [
      'pyodide.restartKernel',
      'pyodide.clearOutputs',
      'pyodide.installPackage',
    ];

    for (const cmd of requiredCommands) {
      assert.ok(commands.includes(cmd), `Command ${cmd} not registered`);
    }
  });
});
```

### 4. Configuration Test

```typescript
suite('Configuration Test Suite', () => {
  test('Default configuration values', () => {
    const config = vscode.workspace.getConfiguration('pyodide');

    assert.strictEqual(config.get('indexURL'), 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/');

    assert.strictEqual(config.get('autoInstallPackages'), true);

    assert.deepStrictEqual(config.get('preloadPackages'), []);
  });
});
```

### 5. Manual Testing Checklist

- [ ] **Marketplace Metadata**
  - [ ] Extension name is clear and descriptive
  - [ ] Description mentions vscode.dev and github.dev support
  - [ ] Categories include "Notebooks" and "Data Science"
  - [ ] Keywords include `notebookKernelJupyterNotebook`

- [ ] **Activation**
  - [ ] Extension doesn't activate on VS Code startup
  - [ ] Extension activates when opening .ipynb file
  - [ ] No errors in developer console on activation

- [ ] **Commands**
  - [ ] Commands appear in Command Palette (Ctrl+Shift+P)
  - [ ] Commands are properly categorized under "Pyodide"
  - [ ] Enablement conditions work (commands disabled when not applicable)

- [ ] **Configuration**
  - [ ] Settings appear in Settings UI (search "pyodide")
  - [ ] Default values are correct
  - [ ] Settings descriptions are clear

- [ ] **Kernel Discovery**
  - [ ] Open .ipynb file in vscode.dev with Jupyter extension installed
  - [ ] Click "Select Kernel" button
  - [ ] Verify "Pyodide (Web)" appears in kernel picker
  - [ ] Kernel has appropriate icon/label

## Development Workflow

### 1. Update package.json

Edit the package.json according to the template above.

### 2. Validate Manifest

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Validate package.json
npx @vscode/vsce ls

# Check for common issues
npx @vscode/vsce package --web --dry-run
```

### 3. Test Locally

```bash
# Build extension
npm run compile-web

# Test in web environment
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.
```

### 4. Publish (when ready)

```bash
# Package extension
npx @vscode/vsce package --web

# Publish to marketplace
npx @vscode/vsce publish --web
```

## Common Issues and Solutions

### Issue 1: Kernel not appearing in picker

**Symptoms**: Pyodide kernel doesn't show up in Jupyter kernel picker

**Solutions**:

- Verify `notebookKernelJupyterNotebook` keyword is in package.json
- Check that extension activated (check DevTools console)
- Ensure NotebookController is created with correct view type (Step 3)
- Verify Jupyter extension (ms-toolsai.jupyter) is installed

### Issue 2: Extension activates too early

**Symptoms**: Extension loads on VS Code startup, slowing down start time

**Solutions**:

- Remove `*` from activationEvents
- Use specific events: `onNotebook:jupyter-notebook`
- Avoid `onStartupFinished` unless necessary

### Issue 3: Commands not appearing in palette

**Symptoms**: Commands defined but not visible in Command Palette

**Solutions**:

- Check command IDs match between `contributes.commands` and implementation
- Verify enablement conditions are satisfied
- Test with `jupyter.webExtension` context in vscode.dev

### Issue 4: Settings not showing in UI

**Symptoms**: Configuration properties don't appear in Settings

**Solutions**:

- Verify `configuration.title` is set
- Check property keys follow pattern: `extensionName.settingName`
- Reload VS Code after changing package.json

## Integration with Jupyter Extension

### Expected Behavior

1. User opens .ipynb file in vscode.dev
2. Jupyter extension loads (ms-toolsai.jupyter)
3. Pyodide extension activates (`onNotebook:jupyter-notebook`)
4. NotebookController is registered (Step 3)
5. Kernel appears in picker as "Pyodide (Web)"
6. User selects kernel
7. Execution handler is invoked for cell execution

### Context Keys Flow

```
User opens .ipynb
  ↓
jupyter.isnativeactive = true
  ↓
User selects Pyodide kernel
  ↓
jupyter.ispythonnotebook = true
jupyter.kernel.isjupyter = true
  ↓
Toolbar commands become enabled
```

## Extension Icon (Optional)

Create a 128x128 PNG icon at `resources/icon.png`:

- Represents Pyodide/Python/WebAssembly
- Simple, recognizable design
- Works well at small sizes
- Follows VS Code icon guidelines

## README.md Template

```markdown
# Pyodide Kernel for VS Code Web

Run Python code in Jupyter notebooks directly in your browser using Pyodide (WebAssembly).

## Features

- ✅ Works in vscode.dev and github.dev (no installation required)
- ✅ Execute Python code in Jupyter notebooks
- ✅ Install packages with micropip
- ✅ Full Python standard library support
- ✅ No server required - everything runs in your browser

## Usage

1. Open vscode.dev or github.dev
2. Open or create a Jupyter notebook (.ipynb file)
3. Click "Select Kernel" in the top right
4. Choose "Pyodide (Web)"
5. Start coding!

## Requirements

- VS Code for the Web (vscode.dev, github.dev)
- Jupyter extension (ms-toolsai.jupyter)
- Modern browser with WebAssembly support

## Extension Settings

- `pyodide.indexURL`: URL to Pyodide distribution files
- `pyodide.autoInstallPackages`: Auto-install missing packages
- `pyodide.preloadPackages`: Packages to load at kernel startup

## Known Limitations

- No compiled C extensions (use Pyodide-compatible packages)
- Limited filesystem access (uses virtual FS)
- No network sockets (use Fetch API)

## License

MIT
```

## Next Steps

After completing this step:

1. Proceed to **Step 3**: Create the NotebookController
2. Test kernel discovery in vscode.dev with Jupyter extension
3. Verify activation events work as expected

## References

- [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)
- [Jupyter Extension Wiki](https://github.com/microsoft/vscode-jupyter/wiki/Accessing-Jupyter-Kernels-from-3rd-party-extensions)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
