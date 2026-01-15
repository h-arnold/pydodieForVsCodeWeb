# Concrete Steps for a Pyodide-Powered VS Code Web Notebook Kernel

## Goal
Build a VS Code For Web**web extension** that provides a **NotebookController** for `jupyter-notebook` so Python cells execute via **Pyodide** in the browser and appear as a selectable kernel in the **official Jupyter extension** UI.

## 1) Establish the Web Extension Scaffolding
- Create a VS Code **web extension** project (target `webworker`).
- Ensure the bundle outputs a **single JS entry** for the extension host.
- Mark `vscode` as **external** in the bundler config.
- Add any required **polyfills** (e.g., `path-browserify`, `process`, `buffer`).

## 2) Register the Kernel in `package.json`
- Add extension **keywords**: `notebookKernelJupyterNotebook`.
- Contribute a **NotebookController** for view type: `jupyter-notebook`.
- Provide a clear kernel label (e.g., “Pyodide (Web)”).

## 3) Create the NotebookController
- Call `vscode.notebooks.createNotebookController(id, 'jupyter-notebook', label)`.
- Set `controller.supportedLanguages = ['python']`.
- Implement `controller.executeHandler = (cells, notebook, controller) => { ... }`.

## 4) Add a Dedicated Pyodide Worker
- Create a **web worker** for Pyodide execution (separate from extension host worker).
- Load Pyodide via CDN or bundled assets.
- Initialize Pyodide with `loadPyodide()` and preload `micropip`.
- Prefer **lazy initialization** (only when a cell first executes) to reduce startup time and memory usage.
- Maintain a message protocol: `init`, `run`, `stdout`, `stderr`, `result`, `error`.

## 5) Wire Controller Execution to the Worker
- For each cell:
  - Create `NotebookCellExecution`.
  - Call `execution.start()` with timestamp.
  - Send code to the worker.
  - Stream outputs with `execution.appendOutput()`.
  - End with `execution.end()`.

## 6) Capture and Stream stdout/stderr
- Use `pyodide.setStdout()` and `pyodide.setStderr()` in the worker.
- Batch output lines to reduce message spam.
- Forward output to the extension host and map to:
  - `text/plain` outputs for stdout
  - error outputs for tracebacks
 - Capture the **final expression value** and emit it as a display output (Jupyter-style last-line echo).

## 7) Render Rich Outputs
- Serialize Python results to **MIME bundles** where possible.
- Prefer standard Jupyter MIME types:
  - `text/plain`, `text/html`, `application/json`, `image/png`.
- Create `NotebookCellOutputItem` with correct MIME labels.

## 8) Provide Basic Package Management
- Enable `micropip` for pure-Python and Pyodide-compatible wheels.
- Expose a command or heuristic to install missing imports.
- Optionally bundle common libraries (NumPy, Pandas, Matplotlib).

## 9) File System Interop
- Use the **VS Code Web FS API** to read/write notebook-adjacent files.
- Map VS Code files into Pyodide’s virtual FS when needed.

## 10) Handle Web Constraints
- CORS: ensure Pyodide assets and wheels are served with permissive headers.
- Cross-origin isolation: detect availability of `SharedArrayBuffer`.
- Fallbacks for interrupt/stop if `SharedArrayBuffer` is unavailable.
- Remember **no Node.js APIs** in the web extension host; all I/O must use VS Code Web FS and Fetch.
- Acknowledge **no ZeroMQ/IPython kernel** support in the web host; execution must be in-browser via Wasm.

## 11) Add Kernel UX/Context Keys
- Use context keys (e.g., `jupyter.webExtension`, `jupyter.ispythonnotebook`, `jupyter.kernel.isjupyter`, `jupyter.isnativeactive`) to gate features.
- Provide user commands:
  - Restart kernel
  - Clear Python globals
  - Install package via `micropip`
  - Optional: soft reset to free memory without full extension reload

## 12) Build & Test Flow
- Bundle for web and host assets over HTTPS for dev.
- Install the web extension into vscode.dev/github.dev.
- Validate kernel discovery in the **Jupyter kernel picker**.
- Execute cells and verify outputs (stdout, errors, rich data).

## 13) Optional Enhancements
- IntelliSense via Jedi running in Pyodide.
- Variable explorer by inspecting `pyodide.globals`.
- Data viewer for DataFrames with JSON summaries.

## Deliverables Checklist
- Web extension bundle (single output for extension host)
- Pyodide worker script
- NotebookController registered for `jupyter-notebook`
- Output streaming and MIME rendering
- Basic package install flow
- Documentation for dev setup + testing
