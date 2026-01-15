# Step 7: Rich Output Rendering

## Overview
Implement rich MIME type rendering to display HTML, images, JSON, and other complex output formats from Python libraries like matplotlib, pandas, and Plotly. This step transforms the kernel from text-only output to a full-featured data science environment supporting visualizations and interactive content.

## Research Summary

### Jupyter MIME Type System
Based on [VS Code Notebook API](https://code.visualstudio.com/api/extension-guides/notebook) and [Jupyter Standards](https://jupyter.org/enhancement-proposals/74-default-rendered-display-priorities/default-rendered-display-priorities.html):

**Standard MIME Types:**
```
text/plain             - Plain text (fallback)
text/html              - HTML content
application/json       - JSON data
image/png              - PNG images (base64)
image/jpeg             - JPEG images (base64)
image/svg+xml          - SVG graphics
application/javascript - JavaScript code
text/markdown          - Markdown content
text/latex             - LaTeX equations
```

**Priority Order:**
When multiple MIME types are available, VS Code/Jupyter typically prefer:
1. Rich interactive formats (widgets, Plotly)
2. Images (PNG, SVG, JPEG)
3. Formatted text (HTML, Markdown, LaTeX)
4. Plain text (fallback)

### Python Display System

Python libraries use the IPython display system to generate rich outputs:

```python
# IPython/Jupyter display protocol
from IPython.display import display, HTML, Image

# Libraries auto-display
import matplotlib.pyplot as plt
import pandas as pd

# These automatically generate MIME bundles
df.head()  # → text/html + text/plain
plt.plot() # → image/png + text/plain
```

### MIME Bundle Structure

A MIME bundle is a dictionary mapping MIME types to content:

```python
{
    'text/plain': 'DataFrame representation',
    'text/html': '<table>...</table>',
    'application/json': {...}
}
```

### Integration with Pyodide

Pyodide can serialize Python objects to JavaScript, allowing extraction of MIME bundles:

```javascript
// Check if object has _repr_html_
const hasHtml = pyodide.runPython('hasattr(obj, "_repr_html_")');

if (hasHtml) {
    const html = pyodide.runPython('obj._repr_html_()');
    // Create HTML output item
}
```

## Dependencies

### Python Packages (Loaded via micropip)
```python
# Display utilities
ipython >= 8.0.0  # IPython display system

# Common data science libraries with rich output
pandas >= 2.0.0    # DataFrames with HTML tables
matplotlib >= 3.7.0  # Plotting with PNG output
numpy >= 1.24.0    # Array display
plotly >= 5.0.0    # Interactive plots (HTML)
```

### Pyodide Canvas Support
```javascript
// For matplotlib support
await pyodide.loadPackage(['matplotlib', 'numpy']);

// Matplotlib uses canvas for rendering
// Pyodide automatically configures this
```

## Code Implementation

### 1. MIME Type Detection and Serialization (src/web/mimeHandler.ts)

```typescript
/**
 * Handle MIME type detection and serialization for Python objects
 */

export interface MimeBundle {
    [mimeType: string]: string | object;
}

export class MimeHandler {
    private pyodide: any;

    constructor(pyodide: any) {
        this.pyodide = pyodide;
    }

    /**
     * Extract MIME bundle from a Python object
     */
    extractMimeBundle(result: any): MimeBundle {
        const bundle: MimeBundle = {};

        try {
            // Always include plain text representation
            bundle['text/plain'] = this.getPlainText(result);

            // Check for IPython display protocol methods
            if (this.hasReprHtml(result)) {
                bundle['text/html'] = this.getHtml(result);
            }

            if (this.hasReprJson(result)) {
                bundle['application/json'] = this.getJson(result);
            }

            if (this.hasReprPng(result)) {
                bundle['image/png'] = this.getPng(result);
            }

            if (this.hasReprJpeg(result)) {
                bundle['image/jpeg'] = this.getJpeg(result);
            }

            if (this.hasReprSvg(result)) {
                bundle['image/svg+xml'] = this.getSvg(result);
            }

            if (this.hasReprLatex(result)) {
                bundle['text/latex'] = this.getLatex(result);
            }

            if (this.hasReprMarkdown(result)) {
                bundle['text/markdown'] = this.getMarkdown(result);
            }

        } catch (error) {
            console.error('Error extracting MIME bundle:', error);
            // Fallback to plain text
            return { 'text/plain': String(result) };
        }

        return bundle;
    }

    /**
     * Get plain text representation
     */
    private getPlainText(result: any): string {
        try {
            // Try __repr__ first
            const code = `repr(___result___)`;
            this.pyodide.globals.set('___result___', result);
            const repr = this.pyodide.runPython(code);
            this.pyodide.globals.delete('___result___');
            return String(repr);
        } catch {
            return String(result);
        }
    }

    /**
     * Check if object has _repr_html_ method
     */
    private hasReprHtml(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_html_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get HTML representation
     */
    private getHtml(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const html = this.pyodide.runPython('___result___._repr_html_()');
        this.pyodide.globals.delete('___result___');
        return String(html);
    }

    /**
     * Check if object has _repr_json_ method
     */
    private hasReprJson(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_json_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get JSON representation
     */
    private getJson(result: any): object {
        this.pyodide.globals.set('___result___', result);
        const json = this.pyodide.runPython('___result___._repr_json_()');
        this.pyodide.globals.delete('___result___');
        
        // Convert to JavaScript object
        if (json && typeof json.toJs === 'function') {
            return json.toJs();
        }
        return json;
    }

    /**
     * Check for PNG representation
     */
    private hasReprPng(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_png_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get PNG representation (base64)
     */
    private getPng(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const png = this.pyodide.runPython('___result___._repr_png_()');
        this.pyodide.globals.delete('___result___');
        return String(png);
    }

    /**
     * Check for JPEG representation
     */
    private hasReprJpeg(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_jpeg_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get JPEG representation (base64)
     */
    private getJpeg(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const jpeg = this.pyodide.runPython('___result___._repr_jpeg_()');
        this.pyodide.globals.delete('___result___');
        return String(jpeg);
    }

    /**
     * Check for SVG representation
     */
    private hasReprSvg(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_svg_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get SVG representation
     */
    private getSvg(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const svg = this.pyodide.runPython('___result___._repr_svg_()');
        this.pyodide.globals.delete('___result___');
        return String(svg);
    }

    /**
     * Check for LaTeX representation
     */
    private hasReprLatex(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_latex_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get LaTeX representation
     */
    private getLatex(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const latex = this.pyodide.runPython('___result___._repr_latex_()');
        this.pyodide.globals.delete('___result___');
        return String(latex);
    }

    /**
     * Check for Markdown representation
     */
    private hasReprMarkdown(result: any): boolean {
        try {
            this.pyodide.globals.set('___result___', result);
            const has = this.pyodide.runPython('hasattr(___result___, "_repr_markdown_")');
            this.pyodide.globals.delete('___result___');
            return Boolean(has);
        } catch {
            return false;
        }
    }

    /**
     * Get Markdown representation
     */
    private getMarkdown(result: any): string {
        this.pyodide.globals.set('___result___', result);
        const markdown = this.pyodide.runPython('___result___._repr_markdown_()');
        this.pyodide.globals.delete('___result___');
        return String(markdown);
    }
}
```

### 2. Enhanced Worker with MIME Support (src/web/pyodideWorker.ts - Updates)

```typescript
import { MimeHandler } from './mimeHandler';

// Add to worker globals
let mimeHandler: MimeHandler | null = null;

// Update initialization to create MIME handler
async function initializePyodide(config?: { indexURL?: string; packages?: string[] }) {
    // ... existing initialization code ...
    
    // Create MIME handler
    mimeHandler = new MimeHandler(pyodide);
    log('MIME handler initialized');
    
    // ... rest of initialization ...
}

// Update executeCode to extract MIME bundle
async function executeCode(id: string, code: string) {
    // ... existing execution code ...
    
    try {
        const result = await pyodide.runPythonAsync(code);
        
        // Flush output buffers
        flushStdout();
        flushStderr();
        
        // Extract MIME bundle if result exists
        if (result !== undefined && result !== null && mimeHandler) {
            const mimeBundle = mimeHandler.extractMimeBundle(result);
            
            sendMessage({
                type: MessageType.RESULT,
                id: id,
                result: mimeBundle, // Send entire MIME bundle
                resultType: 'mime-bundle'
            });
        } else {
            sendMessage({
                type: MessageType.RESULT,
                id: id,
                result: null,
                resultType: 'none'
            });
        }
        
        // ... rest of execution code ...
    }
}
```

### 3. Enhanced Message Types (src/common/types.ts - Update)

```typescript
/**
 * Execution result with MIME bundle support
 */
export interface ResultMessage extends WorkerMessage {
    type: MessageType.RESULT;
    result: any | MimeBundle;
    resultType?: string;
}

export interface MimeBundle {
    'text/plain'?: string;
    'text/html'?: string;
    'application/json'?: object;
    'image/png'?: string;
    'image/jpeg'?: string;
    'image/svg+xml'?: string;
    'text/latex'?: string;
    'text/markdown'?: string;
    [mimeType: string]: any;
}
```

### 4. Enhanced Kernel with Rich Output (src/web/pyodideKernel.ts - Updates)

```typescript
/**
 * Enhanced appendResultOutput with MIME bundle support
 */
private appendResultOutput(
    execution: vscode.NotebookCellExecution,
    result: any,
    resultType?: string
): void {
    // Skip None results
    if (resultType === 'none' || result === null || result === undefined) {
        return;
    }

    // Handle MIME bundles
    if (resultType === 'mime-bundle' && typeof result === 'object') {
        this.appendMimeBundleOutput(execution, result);
        return;
    }

    // Fallback to simple type handling
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

/**
 * Append MIME bundle output
 */
private appendMimeBundleOutput(
    execution: vscode.NotebookCellExecution,
    mimeBundle: { [mimeType: string]: any }
): void {
    const outputItems: vscode.NotebookCellOutputItem[] = [];

    // Priority order for MIME types
    const mimeTypePriority = [
        'image/png',
        'image/jpeg',
        'image/svg+xml',
        'text/html',
        'application/json',
        'text/latex',
        'text/markdown',
        'text/plain'
    ];

    // Add output items in priority order
    for (const mimeType of mimeTypePriority) {
        if (mimeBundle[mimeType]) {
            const content = mimeBundle[mimeType];
            
            if (mimeType.startsWith('image/')) {
                // Image data (base64)
                outputItems.push(this.createImageOutputItem(content, mimeType));
            } else if (mimeType === 'application/json') {
                // JSON data
                const jsonString = typeof content === 'string' 
                    ? content 
                    : JSON.stringify(content, null, 2);
                outputItems.push(
                    vscode.NotebookCellOutputItem.text(jsonString, mimeType)
                );
            } else {
                // Text-based MIME types
                outputItems.push(
                    vscode.NotebookCellOutputItem.text(String(content), mimeType)
                );
            }
        }
    }

    // Ensure at least plain text exists
    if (outputItems.length === 0 && mimeBundle['text/plain']) {
        outputItems.push(
            vscode.NotebookCellOutputItem.text(
                String(mimeBundle['text/plain']), 
                'text/plain'
            )
        );
    }

    if (outputItems.length > 0) {
        const output = new vscode.NotebookCellOutput(outputItems);
        execution.appendOutput([output]);
    }
}

/**
 * Create image output item from base64 data
 */
private createImageOutputItem(
    base64Data: string,
    mimeType: string
): vscode.NotebookCellOutputItem {
    // Remove data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to Uint8Array
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    return vscode.NotebookCellOutputItem.bytes(bytes, mimeType);
}
```

### 5. Python Helper Library (Injected at Initialization)

```typescript
// Add to worker initialization
const PYTHON_DISPLAY_HELPERS = `
# Enhanced display support for Pyodide notebooks

import sys
import io
import base64

class DisplayData:
    """Container for rich display data"""
    def __init__(self, data, metadata=None):
        self.data = data
        self.metadata = metadata or {}
    
    def _repr_mimebundle_(self, include=None, exclude=None):
        return self.data, self.metadata

def display(*objs, **kwargs):
    """Display objects with rich representation"""
    # For now, just return the object
    # In full implementation, would trigger display protocol
    for obj in objs:
        # Trigger _repr_*_ methods
        pass

# Matplotlib inline configuration
try:
    import matplotlib
    import matplotlib.pyplot as plt
    
    # Set inline backend
    matplotlib.use('module://matplotlib_pyodide.html5_canvas_backend')
    
    # Configure figure format
    def display_plot():
        """Helper to display current matplotlib figure"""
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        img_data = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        plt.close()
        
        # Return object with _repr_png_
        class PlotImage:
            def _repr_png_(self):
                return img_data
        
        return PlotImage()
    
    # Monkey-patch show() to return PNG
    _original_show = plt.show
    def patched_show(*args, **kwargs):
        return display_plot()
    plt.show = patched_show
    
except ImportError:
    pass

print("Pyodide display helpers loaded", file=sys.stderr)
`;

// In initializePyodide, after loading packages:
await pyodide.runPythonAsync(PYTHON_DISPLAY_HELPERS);
```

## Test Cases

### Automated Tests

```typescript
// test/suite/richOutput.test.ts
import * as assert from 'assert';
import { MimeHandler } from '../../web/mimeHandler';

suite('Rich Output Tests', () => {
    let pyodide: any;
    let handler: MimeHandler;

    setup(async () => {
        // Initialize Pyodide (mocked or real)
        pyodide = await loadPyodide();
        handler = new MimeHandler(pyodide);
    });

    test('Extract plain text representation', () => {
        const result = pyodide.runPython('"Hello"');
        const bundle = handler.extractMimeBundle(result);
        assert.ok(bundle['text/plain']);
        assert.ok(bundle['text/plain'].includes('Hello'));
    });

    test('Extract HTML from pandas DataFrame', async () => {
        await pyodide.loadPackage('pandas');
        const result = pyodide.runPython(`
import pandas as pd
df = pd.DataFrame({'A': [1, 2], 'B': [3, 4]})
df
        `);
        const bundle = handler.extractMimeBundle(result);
        assert.ok(bundle['text/html']);
        assert.ok(bundle['text/html'].includes('<table'));
    });

    test('Extract PNG from matplotlib', async () => {
        await pyodide.loadPackage(['matplotlib', 'numpy']);
        const result = pyodide.runPython(`
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.show()
        `);
        const bundle = handler.extractMimeBundle(result);
        assert.ok(bundle['image/png']);
    });

    test('Extract JSON representation', () => {
        const result = pyodide.runPython(`
class JsonObj:
    def _repr_json_(self):
        return {"key": "value", "number": 42}

JsonObj()
        `);
        const bundle = handler.extractMimeBundle(result);
        assert.ok(bundle['application/json']);
        assert.strictEqual(bundle['application/json'].key, 'value');
    });
});
```

### Manual Testing Checklist

1. **Pandas DataFrame**
   - [ ] Cell: `import pandas as pd; df = pd.DataFrame({'A': [1,2,3], 'B': [4,5,6]}); df`
   - [ ] Verify HTML table renders
   - [ ] Verify table is styled correctly
   - [ ] Verify plain text fallback exists

2. **Matplotlib Plot**
   - [ ] Cell: `import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()`
   - [ ] Verify PNG image displays
   - [ ] Verify image is clear and correctly sized
   - [ ] Check for pixelation or quality issues

3. **NumPy Array**
   - [ ] Cell: `import numpy as np; np.array([[1,2],[3,4]])`
   - [ ] Verify array displays as formatted text
   - [ ] Check alignment and formatting

4. **Dictionary as JSON**
   - [ ] Cell: `{"name": "test", "values": [1,2,3]}`
   - [ ] Verify JSON renderer displays
   - [ ] Check collapsible structure
   - [ ] Verify syntax highlighting

5. **HTML Output**
   - [ ] Cell: `from IPython.display import HTML; HTML("<h1>Title</h1><p>Content</p>")`
   - [ ] Verify HTML renders correctly
   - [ ] Check styling is applied
   - [ ] Verify no security issues (sanitization)

6. **Multiple MIME Types**
   - [ ] Pandas DataFrame (has both HTML and plain text)
   - [ ] Verify HTML renders by default
   - [ ] Right-click → Change Presentation
   - [ ] Verify can switch to plain text view

7. **Large DataFrame**
   - [ ] Cell: `pd.DataFrame(np.random.rand(100, 10))`
   - [ ] Verify scrollable table
   - [ ] Check performance (no lag)
   - [ ] Verify all rows/columns accessible

8. **SVG Graphics**
   - [ ] Create custom SVG output
   - [ ] Verify SVG displays correctly
   - [ ] Check scaling behavior

## Common Issues and Solutions

### Issue 1: HTML not rendering
**Cause**: VS Code security policy blocking HTML

**Solution**:
- Ensure HTML content is sanitized
- Check VS Code settings for notebook trust
- Verify MIME type is exactly 'text/html'

### Issue 2: Images appear corrupted
**Cause**: Incorrect base64 encoding

**Solution**:
```typescript
// Ensure base64 is clean (no data URL prefix)
const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
```

### Issue 3: Matplotlib doesn't work
**Cause**: Backend not configured for browser

**Solution**:
```python
import matplotlib
matplotlib.use('module://matplotlib_pyodide.html5_canvas_backend')
```

### Issue 4: DataFrames show as plain text
**Cause**: _repr_html_ not detected

**Solution**:
- Ensure pandas is properly loaded
- Verify hasattr check is working
- Check Pyodide pandas version compatibility

### Issue 5: MIME types appear in wrong order
**Cause**: Priority not set correctly

**Solution**:
```typescript
const mimeTypePriority = [
    'image/png',      // Images first
    'text/html',      // Then rich text
    'text/plain'      // Plain text last
];
```

### Issue 6: Large images crash browser
**Cause**: Memory constraints

**Solution**:
- Implement size limits for images
- Compress images before display
- Show warning for large outputs

### Issue 7: JSON not collapsible
**Cause**: Not using application/json MIME type

**Solution**:
```typescript
vscode.NotebookCellOutputItem.text(jsonString, 'application/json');
// NOT 'text/plain'
```

## Development Workflow

### 1. Test Rich Output Types
```python
# Test various output types

# Pandas DataFrame
import pandas as pd
df = pd.DataFrame({'A': [1,2,3], 'B': [4,5,6]})
df

# Matplotlib plot
import matplotlib.pyplot as plt
plt.plot([1,4,2,3])
plt.title('Test Plot')
plt.show()

# Dictionary (JSON)
{"name": "Test", "data": [1,2,3]}

# HTML
from IPython.display import HTML
HTML("<h1>Title</h1><ul><li>Item 1</li><li>Item 2</li></ul>")
```

### 2. Debug MIME Detection
```typescript
// Add logging to MimeHandler
extractMimeBundle(result: any): MimeBundle {
    console.log('Extracting MIME bundle for:', result);
    const bundle: MimeBundle = {};
    
    for (const method of ['_repr_html_', '_repr_json_', '_repr_png_']) {
        const has = this[`has${method.replace('_', '').replace(/_/g, '')}`](result);
        console.log(`Has ${method}:`, has);
    }
    
    // ... rest of implementation
}
```

### 3. Inspect MIME Bundles
```javascript
// In DevTools console
const cell = vscode.window.activeNotebookEditor?.notebook.cellAt(0);
const output = cell.outputs[0];
console.log('MIME types:', output.items.map(i => i.mime));
console.log('Data preview:', output.items.map(i => ({
    mime: i.mime,
    data: i.data.toString().substring(0, 200)
})));
```

### 4. Performance Testing
```python
# Test with large outputs
import pandas as pd
import numpy as np

# Large DataFrame
df = pd.DataFrame(np.random.rand(1000, 50))
df

# Multiple plots
import matplotlib.pyplot as plt
for i in range(10):
    plt.figure()
    plt.plot(np.random.rand(100))
    plt.show()
```

### 5. Test MIME Renderers
```python
# Custom MIME type implementations
class MultiMime:
    def _repr_html_(self):
        return "<h1>HTML Version</h1>"
    
    def _repr_markdown_(self):
        return "# Markdown Version"
    
    def _repr_latex_(self):
        return r"$\LaTeX\ Version$"
    
    def __repr__(self):
        return "Plain text version"

MultiMime()
```

## Next Steps

After completing this step:

1. **Proceed to Step 8**: Add package management with micropip
2. **Verify Rich Output**:
   - Test all major MIME types
   - Verify renderer selection
   - Check performance with complex outputs
3. **Optimize Rendering**:
   - Implement lazy loading for images
   - Add caching for repeated renders
   - Handle very large outputs gracefully
4. **Enhance Library Support**:
   - Test matplotlib thoroughly
   - Verify pandas display options
   - Support Plotly interactive plots
   - Add support for additional libraries

## References

- [VS Code Notebook API - Output Items](https://code.visualstudio.com/api/references/vscode-api#NotebookCellOutputItem) - Creating rich output items
- [Jupyter MIME Type Priorities](https://jupyter.org/enhancement-proposals/74-default-rendered-display-priorities/default-rendered-display-priorities.html) - Standard MIME type ordering
- [IPython Display Protocol](https://ipython.readthedocs.io/en/stable/config/integrating.html) - Python rich display system
- [Pyodide Matplotlib](https://pyodide.org/en/stable/usage/packages-in-pyodide.html#matplotlib) - Matplotlib in Pyodide
- [Pandas Styling](https://pandas.pydata.org/docs/user_guide/style.html) - DataFrame HTML output
- [VS Code Notebook Renderers](https://code.visualstudio.com/api/extension-guides/notebook#notebook-renderer) - Custom renderers
- [Base64 Image Encoding](https://developer.mozilla.org/en-US/docs/Web/API/atob) - Converting base64 to binary
