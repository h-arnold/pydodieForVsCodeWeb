# Step 13: Optional Enhancements

## Overview
Implement advanced features that elevate the Pyodide kernel from basic execution to a full-featured Python development environment. This includes IntelliSense via Jedi, a variable explorer for inspecting runtime state, a data viewer for DataFrames and arrays, interactive debugging capabilities, and code formatting tools—all running entirely in the browser.

## Research Summary

### IntelliSense in Web Extensions
Based on [Python in VS Code Web](https://code.visualstudio.com/docs/python/python-web) and [Language Server Protocol](https://microsoft.github.io/language-server-protocol/):
- Desktop Python extension uses Pylance (TypeScript-based language server)
- Pylance not available in web (requires Node.js)
- Alternative: Jedi running in Pyodide for completions and hover info
- Jedi is pure-Python and Pyodide-compatible
- Can provide: completions, hover info, definitions, references

### Variable Explorer
From [Jupyter Extension Wiki](https://github.com/microsoft/vscode-jupyter/wiki):
- Inspect `pyodide.globals` to enumerate variables
- Extract type, value preview, and size information
- Display in VS Code TreeView or Webview
- Update after each cell execution
- Support for expanding nested objects

### Data Viewer for DataFrames
According to [Python Data Science in VS Code](https://code.visualstudio.com/docs/datascience/overview):
- Desktop Jupyter extension has built-in DataFrame viewer
- For web, serialize DataFrame to JSON for display
- Use Webview to render interactive table
- Support: sorting, filtering, pagination
- Works with: Pandas DataFrames, NumPy arrays, dicts, lists

### Debugging in Pyodide
From Pyodide documentation and web debugging practices:
- No traditional debugger (no breakpoint API in Wasm)
- Alternative: Implement print-based debugging helpers
- Can provide: trace functions, exception inspection
- Post-mortem debugging via exception inspection
- Limited compared to native Python debugging

## Dependencies

### Python Packages (in Pyodide)
```python
# IntelliSense
packages = ['jedi']

# Data analysis (already available)
packages = ['pandas', 'numpy']
```

### TypeScript Libraries
```json
{
  "devDependencies": {
    "@vscode/webview-ui-toolkit": "^1.4.0"
  }
}
```

## Code Implementation

### 1. IntelliSense Provider (src/web/intellisense/jediProvider.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorker } from '../pyodideWorker';

/**
 * Provides IntelliSense using Jedi running in Pyodide
 */
export class JediIntelliSenseProvider {
    private worker: PyodideWorker;
    private initialized = false;

    constructor(worker: PyodideWorker) {
        this.worker = worker;
    }

    /**
     * Initialize Jedi in the worker
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.worker.executeCode(`
# Install and configure Jedi
import micropip
await micropip.install('jedi')

import jedi
import json

def get_completions(code, line, column):
    """Get code completions at cursor position"""
    try:
        script = jedi.Script(code)
        completions = script.complete(line, column)
        
        results = []
        for c in completions[:50]:  # Limit to 50 results
            results.append({
                'name': c.name,
                'type': c.type,
                'complete': c.complete,
                'signature': str(c.get_signatures()[0]) if c.get_signatures() else None,
                'docstring': c.docstring(raw=True)[:200] if c.docstring() else None
            })
        
        return results
    except Exception as e:
        return []

def get_hover_info(code, line, column):
    """Get hover information at cursor position"""
    try:
        script = jedi.Script(code)
        names = script.help(line, column)
        
        if names:
            name = names[0]
            return {
                'name': name.name,
                'type': name.type,
                'docstring': name.docstring(raw=True),
                'signature': str(name.get_signatures()[0]) if name.get_signatures() else None
            }
        return None
    except Exception as e:
        return None

def get_definition(code, line, column):
    """Get definition location"""
    try:
        script = jedi.Script(code)
        definitions = script.goto(line, column, follow_imports=True)
        
        if definitions:
            d = definitions[0]
            return {
                'line': d.line,
                'column': d.column,
                'module_path': d.module_path,
                'description': d.description
            }
        return None
    except Exception as e:
        return None

print("Jedi initialized")
        `);

        this.initialized = true;
    }

    /**
     * Provide completions for a position in the document
     */
    async provideCompletions(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        await this.initialize();

        const code = document.getText();
        const line = position.line + 1; // Jedi uses 1-based indexing
        const column = position.character;

        const result = await this.worker.executeCode(`
import json
completions = get_completions('''${code.replace(/'/g, "\\'")}''', ${line}, ${column})
print(json.dumps(completions))
        `);

        try {
            const completions = JSON.parse(result.output);
            return completions.map((c: any) => {
                const item = new vscode.CompletionItem(c.name, this.mapJediTypeToVSCode(c.type));
                item.detail = c.signature || c.type;
                item.documentation = c.docstring ? new vscode.MarkdownString(c.docstring) : undefined;
                item.insertText = c.complete || c.name;
                return item;
            });
        } catch {
            return [];
        }
    }

    /**
     * Provide hover information
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | null> {
        await this.initialize();

        const code = document.getText();
        const line = position.line + 1;
        const column = position.character;

        const result = await this.worker.executeCode(`
import json
info = get_hover_info('''${code.replace(/'/g, "\\'")}''', ${line}, ${column})
print(json.dumps(info))
        `);

        try {
            const info = JSON.parse(result.output);
            if (!info) {
                return null;
            }

            const markdown = new vscode.MarkdownString();
            
            if (info.signature) {
                markdown.appendCodeblock(info.signature, 'python');
            }
            
            if (info.docstring) {
                markdown.appendMarkdown('\n\n' + info.docstring);
            }

            return new vscode.Hover(markdown);
        } catch {
            return null;
        }
    }

    /**
     * Map Jedi completion type to VS Code completion kind
     */
    private mapJediTypeToVSCode(jediType: string): vscode.CompletionItemKind {
        const typeMap: { [key: string]: vscode.CompletionItemKind } = {
            'module': vscode.CompletionItemKind.Module,
            'class': vscode.CompletionItemKind.Class,
            'function': vscode.CompletionItemKind.Function,
            'param': vscode.CompletionItemKind.Variable,
            'path': vscode.CompletionItemKind.File,
            'keyword': vscode.CompletionItemKind.Keyword,
            'property': vscode.CompletionItemKind.Property,
            'statement': vscode.CompletionItemKind.Variable
        };

        return typeMap[jediType] || vscode.CompletionItemKind.Text;
    }

    /**
     * Register IntelliSense providers
     */
    register(context: vscode.ExtensionContext): void {
        // Completion provider
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { language: 'python', scheme: 'vscode-notebook-cell' },
                {
                    provideCompletionItems: async (document, position) => {
                        return this.provideCompletions(document, position);
                    }
                },
                '.', // Trigger on dot
                '(' // Trigger on opening paren
            )
        );

        // Hover provider
        context.subscriptions.push(
            vscode.languages.registerHoverProvider(
                { language: 'python', scheme: 'vscode-notebook-cell' },
                {
                    provideHover: async (document, position) => {
                        return this.provideHover(document, position);
                    }
                }
            )
        );
    }
}
```

### 2. Variable Explorer (src/web/variableExplorer/variableExplorer.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorker } from '../pyodideWorker';

/**
 * Variable explorer tree view
 */
export class VariableExplorer implements vscode.TreeDataProvider<VariableItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<VariableItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private worker: PyodideWorker;
    private variables: VariableItem[] = [];

    constructor(worker: PyodideWorker) {
        this.worker = worker;
    }

    /**
     * Refresh variables after code execution
     */
    async refresh(): Promise<void> {
        this.variables = await this.fetchVariables();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Fetch variables from Pyodide
     */
    private async fetchVariables(): Promise<VariableItem[]> {
        const result = await this.worker.executeCode(`
import json
import sys

variables = []

# Get all user-defined variables
for name in dir():
    if not name.startswith('_'):
        try:
            obj = globals()[name]
            var_type = type(obj).__name__
            
            # Get string representation
            value_str = repr(obj)
            if len(value_str) > 100:
                value_str = value_str[:97] + '...'
            
            # Get size/length if available
            size = None
            if hasattr(obj, '__len__'):
                try:
                    size = len(obj)
                except:
                    pass
            
            # Check if expandable
            expandable = var_type in ['list', 'dict', 'tuple', 'set', 'DataFrame', 'ndarray']
            
            variables.append({
                'name': name,
                'type': var_type,
                'value': value_str,
                'size': size,
                'expandable': expandable
            })
        except Exception as e:
            pass

print(json.dumps(variables))
        `);

        try {
            const data = JSON.parse(result.output);
            return data.map((v: any) => new VariableItem(
                v.name,
                v.type,
                v.value,
                v.size,
                v.expandable
            ));
        } catch {
            return [];
        }
    }

    getTreeItem(element: VariableItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: VariableItem): Promise<VariableItem[]> {
        if (!element) {
            // Root level - show all variables
            return this.variables;
        } else {
            // Get children of expandable item
            return this.getVariableChildren(element.name);
        }
    }

    /**
     * Get children of an expandable variable
     */
    private async getVariableChildren(name: string): Promise<VariableItem[]> {
        const result = await this.worker.executeCode(`
import json

obj = globals()['${name}']
children = []

if isinstance(obj, dict):
    for key, value in list(obj.items())[:100]:
        children.append({
            'name': str(key),
            'type': type(value).__name__,
            'value': repr(value)[:100],
            'size': None,
            'expandable': False
        })
elif isinstance(obj, (list, tuple)):
    for i, value in enumerate(list(obj)[:100]):
        children.append({
            'name': f'[{i}]',
            'type': type(value).__name__,
            'value': repr(value)[:100],
            'size': None,
            'expandable': False
        })

print(json.dumps(children))
        `);

        try {
            const data = JSON.parse(result.output);
            return data.map((v: any) => new VariableItem(
                v.name,
                v.type,
                v.value,
                v.size,
                v.expandable
            ));
        } catch {
            return [];
        }
    }

    /**
     * Register variable explorer view
     */
    static register(context: vscode.ExtensionContext, worker: PyodideWorker): VariableExplorer {
        const explorer = new VariableExplorer(worker);
        
        const treeView = vscode.window.createTreeView('pyodide.variableExplorer', {
            treeDataProvider: explorer
        });

        context.subscriptions.push(treeView);

        // Add refresh command
        context.subscriptions.push(
            vscode.commands.registerCommand('pyodide.refreshVariables', () => {
                explorer.refresh();
            })
        );

        // Add view value command
        context.subscriptions.push(
            vscode.commands.registerCommand('pyodide.viewVariable', async (item: VariableItem) => {
                const document = await vscode.workspace.openTextDocument({
                    content: item.value,
                    language: 'python'
                });
                vscode.window.showTextDocument(document);
            })
        );

        return explorer;
    }
}

class VariableItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly type: string,
        public readonly value: string,
        public readonly size?: number,
        public readonly expandable?: boolean
    ) {
        super(
            name,
            expandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        this.description = `${type}${size !== null && size !== undefined ? ` (${size})` : ''}`;
        this.tooltip = value;
        
        // Set icon based on type
        this.iconPath = new vscode.ThemeIcon(this.getIconForType(type));

        // Add context value for commands
        this.contextValue = 'variable';
    }

    private getIconForType(type: string): string {
        const iconMap: { [key: string]: string } = {
            'int': 'symbol-number',
            'float': 'symbol-number',
            'str': 'symbol-string',
            'bool': 'symbol-boolean',
            'list': 'symbol-array',
            'dict': 'symbol-object',
            'tuple': 'symbol-array',
            'set': 'symbol-array',
            'function': 'symbol-method',
            'type': 'symbol-class',
            'module': 'symbol-namespace',
            'DataFrame': 'table',
            'ndarray': 'symbol-array'
        };

        return iconMap[type] || 'symbol-variable';
    }
}
```

### 3. Data Viewer (src/web/dataViewer/dataViewer.ts)

```typescript
import * as vscode from 'vscode';
import { PyodideWorker } from '../pyodideWorker';

/**
 * Interactive data viewer for DataFrames and arrays
 */
export class DataViewer {
    private panel: vscode.WebviewPanel | undefined;
    private worker: PyodideWorker;

    constructor(worker: PyodideWorker) {
        this.worker = worker;
    }

    /**
     * Show data viewer for a variable
     */
    async showDataFrame(variableName: string): Promise<void> {
        // Get DataFrame data
        const data = await this.getDataFrameData(variableName);
        
        if (!data) {
            vscode.window.showErrorMessage(`Cannot view ${variableName} as DataFrame`);
            return;
        }

        // Create or show panel
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'pyodideDataViewer',
                `Data Viewer: ${variableName}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        // Update webview content
        this.panel.webview.html = this.getWebviewContent(variableName, data);
    }

    /**
     * Extract DataFrame data as JSON
     */
    private async getDataFrameData(variableName: string): Promise<DataFrameData | null> {
        const result = await this.worker.executeCode(`
import json
import pandas as pd
import numpy as np

try:
    obj = globals()['${variableName}']
    
    # Convert to DataFrame if needed
    if isinstance(obj, np.ndarray):
        df = pd.DataFrame(obj)
    elif isinstance(obj, pd.DataFrame):
        df = obj
    elif isinstance(obj, (list, dict)):
        df = pd.DataFrame(obj)
    else:
        print(json.dumps(None))
        raise ValueError("Not a data structure")
    
    # Limit to first 10000 rows for performance
    df_limited = df.head(10000)
    
    # Get summary statistics
    stats = {}
    for col in df_limited.columns:
        if df_limited[col].dtype in ['int64', 'float64']:
            stats[col] = {
                'count': int(df_limited[col].count()),
                'mean': float(df_limited[col].mean()),
                'std': float(df_limited[col].std()),
                'min': float(df_limited[col].min()),
                'max': float(df_limited[col].max())
            }
    
    result = {
        'columns': df_limited.columns.tolist(),
        'data': df_limited.values.tolist(),
        'shape': df.shape,
        'dtypes': {col: str(dtype) for col, dtype in df_limited.dtypes.items()},
        'stats': stats
    }
    
    print(json.dumps(result, default=str))
except Exception as e:
    print(json.dumps(None))
        `);

        try {
            return JSON.parse(result.output);
        } catch {
            return null;
        }
    }

    /**
     * Generate webview HTML
     */
    private getWebviewContent(variableName: string, data: DataFrameData): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Viewer: ${variableName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 10px;
        }
        h2 {
            margin-top: 0;
        }
        .info {
            margin-bottom: 20px;
            color: var(--vscode-descriptionForeground);
        }
        table {
            border-collapse: collapse;
            width: 100%;
            font-size: 12px;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-lineHighlightBackground);
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        tr:nth-child(even) {
            background-color: var(--vscode-editor-lineHighlightBackground);
        }
        .stats {
            margin-top: 20px;
            padding: 10px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 4px;
        }
        .stats h3 {
            margin-top: 0;
        }
        .filter-box {
            margin-bottom: 10px;
        }
        input[type="text"] {
            padding: 5px;
            width: 200px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
        }
    </style>
</head>
<body>
    <h2>Data Viewer: ${variableName}</h2>
    
    <div class="info">
        Shape: ${data.shape[0]} rows × ${data.shape[1]} columns
    </div>
    
    <div class="filter-box">
        <input type="text" id="filterInput" placeholder="Filter columns...">
    </div>
    
    <div style="overflow-x: auto; max-height: 600px;">
        <table id="dataTable">
            <thead>
                <tr>
                    <th>#</th>
                    ${data.columns.map(col => `<th>${col}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.data.map((row, i) => `
                    <tr>
                        <td>${i}</td>
                        ${row.map(cell => `<td>${cell}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    
    ${Object.keys(data.stats).length > 0 ? `
    <div class="stats">
        <h3>Summary Statistics</h3>
        <table>
            <tr>
                <th>Column</th>
                <th>Count</th>
                <th>Mean</th>
                <th>Std</th>
                <th>Min</th>
                <th>Max</th>
            </tr>
            ${Object.entries(data.stats).map(([col, stats]: [string, any]) => `
                <tr>
                    <td>${col}</td>
                    <td>${stats.count}</td>
                    <td>${stats.mean.toFixed(2)}</td>
                    <td>${stats.std.toFixed(2)}</td>
                    <td>${stats.min.toFixed(2)}</td>
                    <td>${stats.max.toFixed(2)}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    ` : ''}
    
    <script>
        // Simple column filter
        document.getElementById('filterInput').addEventListener('input', (e) => {
            const filter = e.target.value.toLowerCase();
            const table = document.getElementById('dataTable');
            const headers = table.querySelectorAll('th');
            const rows = table.querySelectorAll('tbody tr');
            
            // Show/hide columns
            headers.forEach((header, index) => {
                const show = header.textContent.toLowerCase().includes(filter) || index === 0;
                header.style.display = show ? '' : 'none';
                
                rows.forEach(row => {
                    row.cells[index].style.display = show ? '' : 'none';
                });
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Register data viewer commands
     */
    static register(context: vscode.ExtensionContext, worker: PyodideWorker): DataViewer {
        const viewer = new DataViewer(worker);

        context.subscriptions.push(
            vscode.commands.registerCommand('pyodide.viewDataFrame', async (variableName?: string) => {
                if (!variableName) {
                    variableName = await vscode.window.showInputBox({
                        prompt: 'Enter variable name to view',
                        placeHolder: 'df'
                    });
                }

                if (variableName) {
                    await viewer.showDataFrame(variableName);
                }
            })
        );

        return viewer;
    }
}

interface DataFrameData {
    columns: string[];
    data: any[][];
    shape: [number, number];
    dtypes: { [key: string]: string };
    stats: { [key: string]: any };
}
```

### 4. Package.json Contributions

```json
{
  "contributes": {
    "commands": [
      {
        "command": "pyodide.viewDataFrame",
        "title": "View as DataFrame",
        "category": "Pyodide",
        "icon": "$(table)"
      },
      {
        "command": "pyodide.refreshVariables",
        "title": "Refresh Variables",
        "category": "Pyodide",
        "icon": "$(refresh)"
      },
      {
        "command": "pyodide.viewVariable",
        "title": "View Variable",
        "category": "Pyodide"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "pyodide.variableExplorer",
          "name": "Python Variables",
          "when": "jupyter.ispythonnotebook"
        }
      ]
    },
    "menus": {
      "view/title": [
        {
          "command": "pyodide.refreshVariables",
          "when": "view == pyodide.variableExplorer",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "pyodide.viewVariable",
          "when": "view == pyodide.variableExplorer",
          "group": "inline"
        },
        {
          "command": "pyodide.viewDataFrame",
          "when": "view == pyodide.variableExplorer && viewItem == variable",
          "group": "navigation"
        }
      ]
    }
  }
}
```

### 5. Integration with Notebook Controller

```typescript
// In src/web/notebookController.ts

import { JediIntelliSenseProvider } from './intellisense/jediProvider';
import { VariableExplorer } from './variableExplorer/variableExplorer';
import { DataViewer } from './dataViewer/dataViewer';

export function activate(context: vscode.ExtensionContext) {
    const worker = new PyodideWorker();
    
    // Initialize IntelliSense
    const intellisense = new JediIntelliSenseProvider(worker);
    intellisense.register(context);
    
    // Initialize Variable Explorer
    const variableExplorer = VariableExplorer.register(context, worker);
    
    // Initialize Data Viewer
    const dataViewer = DataViewer.register(context, worker);
    
    // Refresh variables after each cell execution
    const controller = new PyodideNotebookController(worker);
    controller.onDidExecuteCell(() => {
        variableExplorer.refresh();
    });
}
```

## Test Cases

### Manual Testing Checklist

1. **IntelliSense - Completions**
   - [ ] Type `import num` and press Ctrl+Space
   - [ ] Verify "numpy" appears in completions
   - [ ] Select completion
   - [ ] Type `numpy.ar` and press Ctrl+Space
   - [ ] Verify "array" appears with type info

2. **IntelliSense - Hover**
   - [ ] Type `import pandas as pd`
   - [ ] Hover over `pd`
   - [ ] Verify module documentation appears
   - [ ] Type `pd.DataFrame(`
   - [ ] Hover over `DataFrame`
   - [ ] Verify signature and docstring appear

3. **Variable Explorer - Basic**
   - [ ] Execute: `x = 42`
   - [ ] Open Variable Explorer panel
   - [ ] Verify `x` appears with type "int"
   - [ ] Execute: `name = "test"`
   - [ ] Refresh variables
   - [ ] Verify both variables shown

4. **Variable Explorer - Collections**
   - [ ] Execute: `data = [1, 2, 3, 4, 5]`
   - [ ] Variable Explorer shows "list (5)"
   - [ ] Expand `data` in tree
   - [ ] Verify items [0]-[4] shown
   - [ ] Execute: `info = {"key": "value"}`
   - [ ] Expand `info`
   - [ ] Verify dictionary items shown

5. **Data Viewer - DataFrame**
   - [ ] Execute:
     ```python
     import pandas as pd
     df = pd.DataFrame({
         'A': [1, 2, 3],
         'B': ['a', 'b', 'c']
     })
     ```
   - [ ] Right-click `df` in Variable Explorer
   - [ ] Click "View as DataFrame"
   - [ ] Verify data table opens in webview
   - [ ] Verify columns and data correct
   - [ ] Verify summary statistics shown

6. **Data Viewer - NumPy Array**
   - [ ] Execute:
     ```python
     import numpy as np
     arr = np.random.rand(5, 3)
     ```
   - [ ] View `arr` as DataFrame
   - [ ] Verify array displayed as table
   - [ ] Verify statistics calculated

## Common Issues and Solutions

### Issue 1: IntelliSense Not Working
**Symptom**: No completions or hover info appear.

**Solution**:
- Check Jedi is installed: Execute `import jedi` in notebook
- Verify Jedi initialization in worker
- Check browser console for errors
- Ensure language ID is 'python'
- Try shorter timeout for completions

### Issue 2: Variable Explorer Not Updating
**Symptom**: New variables don't appear after execution.

**Solution**:
- Manually refresh with refresh button
- Check auto-refresh is enabled
- Verify `globals()` access in worker
- Check for exceptions in variable extraction code

### Issue 3: Data Viewer Shows Empty Table
**Symptom**: DataFrame viewer opens but no data shown.

**Solution**:
- Verify variable is actually a DataFrame/array
- Check JSON serialization for special values (NaN, Inf)
- Limit data size (use `.head()` for large DataFrames)
- Check browser console for webview errors

### Issue 4: Large DataFrames Crash Browser
**Symptom**: Browser becomes unresponsive viewing large data.

**Solution**:
- Limit to first 10,000 rows
- Implement pagination in webview
- Use virtual scrolling for large tables
- Warn user before viewing large datasets

### Issue 5: IntelliSense Slow
**Symptom**: Completions take several seconds.

**Solution**:
- Jedi analysis is CPU-intensive in Wasm
- Limit completion results (max 50)
- Cache completion results
- Consider debouncing completion requests
- Accept slower performance vs desktop

## Development Workflow

### 1. Testing IntelliSense

```python
# Test script for IntelliSense
import numpy as np
import pandas as pd

# Trigger completions
np.  # Should show array, zeros, etc.
pd.DataFrame(  # Should show signature

# Hover tests
data = [1, 2, 3]  # Hover over 'data'
```

### 2. Testing Variable Explorer

```typescript
// Log variable extraction
const variables = await fetchVariables();
console.log('Variables:', variables);
```

### 3. Performance Monitoring

```typescript
// Measure IntelliSense performance
const start = performance.now();
const completions = await provideCompletions(doc, pos);
console.log(`Completions took ${performance.now() - start}ms`);
```

## Next Steps

After completing this step:
1. All core and optional features are implemented
2. Conduct comprehensive testing
3. Gather user feedback
4. Iterate based on usage patterns
5. Consider additional enhancements:
   - Code formatting with Black/autopep8
   - Linting with Pyflakes
   - Notebook diffing
   - Export to HTML/PDF

## References

- [Jedi Documentation](https://jedi.readthedocs.io/)
- [VS Code Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Pandas DataFrame](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.html)
- [VS Code TreeView API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Python in VS Code Web](https://code.visualstudio.com/docs/python/python-web)
