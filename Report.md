# **Architectural Design of Pyodide-Based Notebook Controllers for Visual Studio Code for the Web**

The paradigm of modern software development is increasingly shifting toward browser-resident execution environments, necessitating a fundamental departure from traditional server-client architectures in integrated development environments (IDEs). Visual Studio Code for the Web, accessible via platforms such as vscode.dev and github.dev, represents a significant milestone in this evolution, providing a zero-install interface for code editing and execution.1 However, the core challenge in these environments remains the execution of interpreted languages like Python, which traditionally require a local or remote process host.2 To bridge this gap within the context of Jupyter Notebooks, one must leverage WebAssembly (Wasm) via the Pyodide project, integrating it as a client-side kernel that operates within the constraints of the browser's extension host.4 This report provides a comprehensive technical analysis of the steps required to construct a VS Code web extension that serves as a Pyodide-powered kernel, fully compatible with the official Microsoft Jupyter extension.

## **The Architectural Paradigm of Browser-Native Execution**

The traditional execution model for Jupyter Notebooks relies on the IPython kernel, which communicates with the frontend via the ZeroMQ protocol over a network or local socket.3 In the browser-native context of VS Code for the Web, this model is untenable due to the sandbox restrictions of the Web Extension Host.6 The Web Extension Host operates as a Web Worker, which precludes access to Node.js system APIs such as child\_process, fs, and os.6 Consequently, the execution engine must be contained entirely within the browser's JavaScript runtime, utilizing WebAssembly as the execution format for the Python interpreter.5

Pyodide provides a comprehensive solution by porting the CPython interpreter to WebAssembly using the Emscripten toolchain.5 This distribution includes the Python standard library and a sophisticated foreign function interface (FFI) that facilitates bi-directional communication between JavaScript and Python.5 By integrating Pyodide into a VS Code extension, one effectively replaces the need for a remote Jupyter server with a local, browser-resident virtual machine.4

| Feature | Traditional Jupyter Execution | Pyodide-Based Web Execution |
| :---- | :---- | :---- |
| **Runtime** | Local/Remote OS Process | Browser WebAssembly (Wasm) 5 |
| **Communication** | ZeroMQ over TCP/Sockets 3 | Message Port API / Web Workers 10 |
| **Dependencies** | Python, ipykernel, Jupyter 2 | Pyodide, Wasm-compatible wheels 8 |
| **Isolation** | Process-level isolation | Browser worker sandbox 6 |
| **File Access** | Direct OS file system | Virtual FS / VS Code FS API 6 |

## **Strategic Integration with the VS Code Notebook API**

To allow a third-party extension to provide execution capabilities to the official Jupyter extension, one must utilize the NotebookController API.13 The official Jupyter extension (provided by ms-toolsai.jupyter) serves as the primary UI provider and orchestrator for Jupyter documents (.ipynb files) in VS Code.2 When a user opens a notebook, the Jupyter extension identifies compatible kernels by scanning for registered NotebookController instances that target the jupyter-notebook view type.13

### **Kernel Discovery and Registration**

In earlier iterations, the Jupyter extension provided a proprietary API for kernel registration; however, this is now deprecated in favor of the standardized VS Code Notebook API.15 To ensure a Pyodide-based kernel is discoverable, the extension must declare specific contribution points in its package.json manifest.13 The viewType for the controller must be explicitly set to jupyter-notebook to appear in the kernel picker for .ipynb files.14 Furthermore, the extension must include the keyword notebookKernelJupyterNotebook in its metadata, which facilitates discoverability when users are prompted to search for a kernel.13

The NotebookController is instantiated using the vscode.notebooks.createNotebookController method, which requires a unique identifier, the target notebook type, and a user-facing label.13 A critical component of this controller is the executeHandler, which serves as the entry point for code execution.13 This handler receives an array of NotebookCell objects and is responsible for managing their lifecycle, from initial queuing to the final delivery of outputs.13

### **Implementation of the Execution Handler**

The execution handler must provide a seamless experience by managing cell states and providing incremental feedback.13 This is achieved through the NotebookCellExecution object, which provides a handle for updating the UI.13 When a cell is scheduled for execution, the controller must invoke execution.start() and record the starting timestamp.13 As the Pyodide engine produces results, the controller uses execution.replaceOutput() or execution.appendOutput() to render data in the notebook's output area.13 Finally, execution.end() is called to signal completion and release the UI lock on the cell.13

## **Technical Foundations of the Pyodide Web Worker**

For optimal performance and responsiveness, the Pyodide interpreter should not run in the same thread as the extension host.10 The extension host itself is a worker that must remain free to handle workbench events and metadata requests.6 Therefore, a dedicated "Execution Worker" must be spawned to host the Pyodide environment.10 This dual-worker architecture isolates the heavy computation of Python execution from the extension logic.10

### **Initialization and Resource Loading**

The initialization of the Pyodide worker begins with the loading of the pyodide.js script, typically from a CDN like cdn.jsdelivr.net or from a bundled asset within the extension's folder.7 Upon loading, the worker script calls loadPyodide(), which downloads the CPython Wasm binary and initializes the memory space.7 The environment is then primed by loading essential packages such as micropip for package management and setuptools for building modules.8

Once initialized, the worker should establish a message listener using the self.onmessage API to receive execution requests from the extension host.10 The communication protocol must be strictly asynchronous, as Wasm execution is often blocking within its own thread.10

### **Standard Stream Management**

A functional kernel must capture all outputs generated by the user's code, including print() statements and error tracebacks.22 Pyodide provides redirection hooks via pyodide.setStdout() and pyodide.setStderr().22 These hooks should be configured to send data back to the extension host via postMessage.23 The use of a "batched" output handler is recommended, as it allows the worker to accumulate characters until a newline or flush occurs, reducing the overhead of high-frequency message passing.22

| Output Mechanism | Implementation Strategy | Impact on User Experience |
| :---- | :---- | :---- |
| **stdout** | pyodide.setStdout with batching 22 | Real-time display of print statements 23 |
| **stderr** | pyodide.setStderr for tracebacks 22 | Clear visibility of errors and warnings 23 |
| **Display Data** | FFI-based serialization of rich objects 5 | Support for plots, HTML, and LaTeX 13 |
| **Return Value** | Capturing the final expression result 7 | Automatic echoing of the last line 24 |

## **Interfacing with the Official Jupyter Extension**

The official Jupyter extension acts as the primary client for the kernel.2 To ensure full compatibility, the Pyodide extension must respect the expectations of the Jupyter UI, including its handling of MIME types and kernel metadata.2

### **Managing MIME Types and Renderers**

Jupyter Notebooks support a wide array of output formats beyond plain text, including text/html, image/png, and application/json.13 The Pyodide kernel must be capable of serializing Python objects into these formats.5 While VS Code provides built-in renderers for many common types, the Jupyter extension automatically installs additional renderers for complex types like Plotly, Vega, and LaTeX.2 The controller should leverage these existing renderers by producing NotebookCellOutput items with the correct MIME type labels.13

### **The Role of Context Keys**

The Jupyter extension exposes several context keys that allow third-party extensions to conditionally enable features based on the state of the notebook.2 One of the most important is jupyter.webExtension, which is set to true when the extension is running in a browser environment.2 Extensions can use this key in when clauses for keybindings or menu contributions to tailor the UI for the web.2 Other relevant keys include jupyter.ispythonnotebook, which identifies if the active kernel is Python-based, and jupyter.kernel.isjupyter, which signals that the kernel is managed by the Jupyter infrastructure.25

| Context Key | Condition for Truth | Significance for Development |
| :---- | :---- | :---- |
| jupyter.webExtension | Running in vscode.dev/github.dev 2 | Differentiating browser vs. desktop behavior 2 |
| jupyter.ispythonnotebook | Kernel is Python-based 25 | Enabling Python-specific editor features 25 |
| jupyter.kernel.isjupyter | Kernel comes from Jupyter extension 25 | Ensuring compatibility with Jupyter UI 25 |
| jupyter.isnativeactive | Active editor is a Jupyter Notebook 25 | Controlling visibility of kernel controls 25 |

## **Package Management and Environment Virtualization**

A significant limitation of the Pyodide environment is the inability to use standard pip for installing arbitrary packages from PyPI, as many packages contain compiled C extensions that are incompatible with the Wasm runtime.8 Instead, the environment relies on micropip, a Python library specifically designed for Pyodide.8

### **Leveraging Micropip for Browser Dependencies**

micropip can install pure-Python wheels from PyPI or custom-compiled Wasm wheels from specified index URLs.12 Within the VS Code extension, micropip should be pre-loaded into the worker.12 When a user attempts an import that fails, the kernel can potentially offer to install the missing package via micropip automatically.12 However, one must account for the lack of socket support in the browser; all network requests made by micropip or user code must go through the browser's Fetch API.26

### **Virtualizing the Site-Packages Directory**

To support more complex development scenarios, the extension can provide a pre-configured site-packages directory.26 This is particularly useful for bundling common libraries like NumPy, Pandas, or Matplotlib, which are already ported to Pyodide and included in the base distribution.8 The extension can map these libraries into the Pyodide virtual file system, ensuring they are available immediately upon kernel startup without requiring a network fetch.26

## **Overcoming Browser-Specific Runtime Constraints**

Developing for the web extension host requires a deep understanding of browser security policies and resource limitations.6 The environment is significantly more restrictive than the Node.js runtime available on the desktop.6

### **Security and CORS**

The Fetch API is subject to Cross-Origin Resource Sharing (CORS) policies.6 If the Pyodide Wasm files or Python wheels are hosted on a different domain, that domain must explicitly allow requests from the origin of the VS Code instance (e.g., vscode.dev).6 During development, this often necessitates the use of a local server with permissive CORS headers or a tunneling service like localtunnel.4

### **Cross-Origin Isolation and SharedArrayBuffer**

To implement synchronous features such as keyboard interrupts or blocking I/O, Pyodide ideally requires access to SharedArrayBuffer and Atomics.5 These APIs are only available if the website is in a "cross-origin isolated" state, which is controlled by the COOP and COEP headers.5 Since VS Code for the Web may not always be in this state, the extension must implement fallback mechanisms.5 For example, if SharedArrayBuffer is unavailable, the kernel may need to use a slower, asynchronous messaging pattern for interrupts, which may result in less responsive behavior when halting long-running cells.5

### **Memory Constraints and Optimization**

WebAssembly is limited by the memory ceiling of the browser tab, which is typically between 1GB and 4GB.28 The initial download of the Pyodide runtime and the subsequent loading of large libraries like Pandas can quickly consume several hundred megabytes of memory.9 To optimize performance, the extension should:

* Utilize CDN caching for the Pyodide core and common wheels.20  
* Implement lazy-loading of the Pyodide environment, only initializing the worker when a notebook is actually opened or a cell is executed.2  
* Provide a way for users to clear the Python global state to free up memory without reloading the entire extension.2

## **Bundling and Build Pipeline Requirements**

Because the web extension host can only load a single JavaScript file, the extension's code must be bundled using a tool like Webpack or esbuild.6 The build configuration must target webworker to ensure compatibility with the browser environment.6

### **Configuration for the Web Extension Host**

The Webpack configuration should include polyfills for Node.js modules that might be used by upstream dependencies but are absent in the browser.6 Examples include buffer, process, and path-browserify.6 The vscode module must be marked as an external dependency, as it is provided at runtime by the VS Code host and cannot be bundled.6

JavaScript

// Sample Webpack configuration target  
const webExtensionConfig \= {  
    target: 'webworker',  
    entry: {  
        extension: './src/web/extension.ts',  
        'pyodide.worker': './src/web/pyodide.worker.ts'  
    },  
    output: {  
        filename: '\[name\].js',  
        path: path.resolve(\_\_dirname, 'dist')  
    },  
    externals: {  
        'vscode': 'commonjs vscode' // provided by the runtime \[31\]  
    },  
    resolve: {  
        fallback: {  
            "path": require.resolve("path-browserify") //   
        }  
    }  
};

### **Supporting Local Development and Testing**

Testing a web extension is fundamentally different from testing a desktop extension. Developers must launch an instance of VS Code for the Web that loads the local extension code.4 This typically involves:

1. Compiling the TypeScript code into a web-friendly bundle.6  
2. Serving the bundled files over HTTPS with correct CORS headers.4  
3. Connecting the local server to vscode.dev via the "Install Web Extension" command or a custom URL parameter.4  
4. Utilizing the browser's developer tools for debugging the Pyodide worker and its communication with the extension host.7

## **Advanced Kernel Features: IntelliSense and Variables**

A professional-grade kernel extension should provide more than simple code execution; it should enhance the editing experience with IntelliSense and a variable explorer.3

### **IntelliSense via Wasm-Resident Language Servers**

To provide code completion in the web, the extension can host a lightweight Python language server within the Pyodide environment.6 Projects like Jedi are compatible with Pyodide and can be used to analyze the user's code and provide suggestions.9 The extension acts as a bridge, forwarding LSP (Language Server Protocol) requests from VS Code to the Jedi instance running in the Pyodide worker.6

### **The Variable Explorer and Data Viewer**

Visualizing the current state of the Python environment is a core requirement for data science workflows.3 The Pyodide kernel can provide this by inspecting the pyodide.globals object and extracting names and types of defined variables.7 For more complex structures like Pandas DataFrames, the kernel can serialize a summary of the data into JSON, which the extension then displays in the VS Code Variables view.13

| Feature | Implementation in Pyodide Kernel | Impact |
| :---- | :---- | :---- |
| **IntelliSense** | Jedi running in Pyodide Wasm 9 | High-quality auto-completion in the web 2 |
| **Variable Explorer** | Inspection of pyodide.globals 7 | Ability to track state across cells 11 |
| **Data Viewer** | JSON serialization of DataFrames 13 | Deep inspection of scientific data 9 |
| **Interactive Help** | Redirection of help() to markdown 13 | On-demand documentation access 2 |

## **Conclusion: The Future of Browser-Native Data Science**

Developing a Pyodide-based VS Code extension for Jupyter Notebooks requires a sophisticated orchestration of several modern web technologies. By combining the VS Code Notebook API with the WebAssembly-powered Pyodide interpreter, one creates a robust, zero-install environment for Python development that transcends the limitations of traditional hardware-bound IDEs. This architecture not only supports the official Jupyter extension's UI but also paves the way for a new generation of edge-based computational tools.

The strategic integration with the ms-toolsai.jupyter extension ensures that users maintain access to the rich set of renderers and keybindings they expect, while the use of Web Workers and Pyodide provides a secure, isolated, and performant execution engine. As the WebAssembly ecosystem continues to evolve, with improvements in memory management and SIMD support, the performance gap between browser-native and native-OS execution will continue to shrink, making the browser a first-class citizen for high-performance Python development and data science. In this landscape, the ability to deliver complex computational environments through a simple URL signifies a major leap toward truly universal and accessible programming tools.

#### **Works cited**

1. Jupyter Notebooks on the web \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/docs/datascience/notebooks-web](https://code.visualstudio.com/docs/datascience/notebooks-web)  
2. Jupyter \- Visual Studio Marketplace, accessed on January 15, 2026, [https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter)  
3. Create Python Extension's Notebook Controller · Issue \#23100 \- GitHub, accessed on January 15, 2026, [https://github.com/microsoft/vscode-python/issues/23100](https://github.com/microsoft/vscode-python/issues/23100)  
4. vscode-pyodide \- Visual Studio Marketplace, accessed on January 15, 2026, [https://marketplace.visualstudio.com/items?itemName=joyceerhl.vscode-pyodide](https://marketplace.visualstudio.com/items?itemName=joyceerhl.vscode-pyodide)  
5. Bringing Python to Workers using Pyodide and WebAssembly \- The Cloudflare Blog, accessed on January 15, 2026, [https://blog.cloudflare.com/python-workers/](https://blog.cloudflare.com/python-workers/)  
6. Web Extensions \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/api/extension-guides/web-extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)  
7. Getting started — Version 0.29.1 \- Pyodide, accessed on January 15, 2026, [https://pyodide.org/en/stable/usage/quickstart.html](https://pyodide.org/en/stable/usage/quickstart.html)  
8. Pyodide is a Python distribution for the browser and Node.js based on WebAssembly \- GitHub, accessed on January 15, 2026, [https://github.com/pyodide/pyodide](https://github.com/pyodide/pyodide)  
9. Feasibility, Use Cases, and Limitations of Pyodide \- Microsoft for Python Developers Blog, accessed on January 15, 2026, [https://devblogs.microsoft.com/python/feasibility-use-cases-and-limitations-of-pyodide/](https://devblogs.microsoft.com/python/feasibility-use-cases-and-limitations-of-pyodide/)  
10. Using Pyodide in a web worker — Version 0.29.1, accessed on January 15, 2026, [https://pyodide.org/en/stable/usage/webworker.html](https://pyodide.org/en/stable/usage/webworker.html)  
11. Integrating Python and Jupyter Notebook with Visual Studio Code \- Stack Overflow, accessed on January 15, 2026, [https://stackoverflow.com/questions/73526188/integrating-python-and-jupyter-notebook-with-visual-studio-code](https://stackoverflow.com/questions/73526188/integrating-python-and-jupyter-notebook-with-visual-studio-code)  
12. Loading packages — Version 0.29.1 \- Pyodide, accessed on January 15, 2026, [https://pyodide.org/en/stable/usage/loading-packages.html\#micropip](https://pyodide.org/en/stable/usage/loading-packages.html#micropip)  
13. Notebook API \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/api/extension-guides/notebook](https://code.visualstudio.com/api/extension-guides/notebook)  
14. Introducing Native Notebooks · microsoft/vscode-jupyter Wiki \- GitHub, accessed on January 15, 2026, [https://github.com/microsoft/vscode-jupyter/wiki/Introducing-Native-Notebooks/e33ba3a3ff2927adc8b52bcc709338c942de15a3](https://github.com/microsoft/vscode-jupyter/wiki/Introducing-Native-Notebooks/e33ba3a3ff2927adc8b52bcc709338c942de15a3)  
15. Accessing Jupyter Kernels from 3rd party extensions · microsoft ..., accessed on January 15, 2026, [https://github.com/microsoft/vscode-jupyter/wiki/Accessing-Jupyter-Kernels-from-3rd-party-extensions](https://github.com/microsoft/vscode-jupyter/wiki/Accessing-Jupyter-Kernels-from-3rd-party-extensions)  
16. Contribution Points | Visual Studio Code Extension API, accessed on January 15, 2026, [https://code.visualstudio.com/api/references/contribution-points](https://code.visualstudio.com/api/references/contribution-points)  
17. VS Code API | Visual Studio Code Extension API \- AiDocZh, accessed on January 15, 2026, [https://www.aidoczh.com/visualstudio/api/references/vscode-api.html](https://www.aidoczh.com/visualstudio/api/references/vscode-api.html)  
18. Using Pyodide from a web worker \- Read the Docs, accessed on January 15, 2026, [https://test-pyodide.readthedocs.io/en/latest/using\_pyodide\_from\_webworker.html](https://test-pyodide.readthedocs.io/en/latest/using_pyodide_from_webworker.html)  
19. Using Pyodide in a web worker — Version 0.24.0, accessed on January 15, 2026, [https://pyodide.org/en/0.24.0/usage/webworker.html](https://pyodide.org/en/0.24.0/usage/webworker.html)  
20. Working with Bundlers — Version 0.29.1 \- Pyodide, accessed on January 15, 2026, [https://pyodide.org/en/stable/usage/working-with-bundlers.html](https://pyodide.org/en/stable/usage/working-with-bundlers.html)  
21. Worker Messaging \- Pyodide Components documentation, accessed on January 15, 2026, [https://pyodide-components.readthedocs.io/en/latest/worker\_message.html](https://pyodide-components.readthedocs.io/en/latest/worker_message.html)  
22. Redirecting standard streams \- pyodide.setStdin(), accessed on January 15, 2026, [https://pyodide.org/en/stable/usage/streams.html](https://pyodide.org/en/stable/usage/streams.html)  
23. setup to get the python output displayed line by line during execution \- Stack Overflow, accessed on January 15, 2026, [https://stackoverflow.com/questions/79115163/setup-to-get-the-python-output-displayed-line-by-line-during-execution](https://stackoverflow.com/questions/79115163/setup-to-get-the-python-output-displayed-line-by-line-during-execution)  
24. Release 0.23.1 unknown \- Pyodide, accessed on January 15, 2026, [https://pyodide.org/\_/downloads/en/0.23.1/pdf/](https://pyodide.org/_/downloads/en/0.23.1/pdf/)  
25. Extensibility for other extensions · microsoft/vscode-jupyter Wiki \- GitHub, accessed on January 15, 2026, [https://github.com/microsoft/vscode-jupyter/wiki/Extensibility-for-other-extensions](https://github.com/microsoft/vscode-jupyter/wiki/Extensibility-for-other-extensions)  
26. Run and Debug Python in the Web \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/docs/python/python-web](https://code.visualstudio.com/docs/python/python-web)  
27. microsoft/vscode-python-web-wasm: An extension allows to run Python code in a Web browser using WebAssembly technology \- GitHub, accessed on January 15, 2026, [https://github.com/microsoft/vscode-python-web-wasm](https://github.com/microsoft/vscode-python-web-wasm)  
28. Review https://pyscript.net/ · Issue \#290 · strawgate/kb-yaml-to-lens \- GitHub, accessed on January 15, 2026, [https://github.com/strawgate/kb-yaml-to-lens/issues/290](https://github.com/strawgate/kb-yaml-to-lens/issues/290)  
29. Extension Marketplace \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/docs/configure/extensions/extension-marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)  
30. Working with Bundlers — Version 0.26.4 \- Pyodide, accessed on January 15, 2026, [https://pyodide.org/en/0.26.4/usage/working-with-bundlers.html](https://pyodide.org/en/0.26.4/usage/working-with-bundlers.html)  
31. Bundling Extensions \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/api/working-with-extensions/bundling-extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)  
32. Python Interactive window \- Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/docs/python/jupyter-support-py](https://code.visualstudio.com/docs/python/jupyter-support-py)  
33. Editing Python in Visual Studio Code, accessed on January 15, 2026, [https://code.visualstudio.com/docs/python/editing](https://code.visualstudio.com/docs/python/editing)