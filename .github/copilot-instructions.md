# GitHub Copilot Custom Instructions

## Project Overview

This is a VS Code Web Extension that provides a Pyodide-powered Python kernel for Jupyter notebooks. The extension enables Python code execution directly in the browser using WebAssembly, without requiring server infrastructure.

## Code Quality Standards

### TypeScript Standards

1. **Strict Type Safety - MANDATORY**
   - Use TypeScript strict mode (already configured)
   - NEVER use `any` type - use `unknown` with type guards instead
   - Always declare explicit return types for functions
   - Handle null/undefined explicitly with optional chaining and nullish coalescing
   - Use interfaces (prefixed with `I`) for object shapes

2. **Example - Good Code**:
```typescript
interface IExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

async function executeCode(code: string): Promise<IExecutionResult> {
  if (code.trim().length === 0) {
    throw new Error('Code cannot be empty');
  }
  // Implementation
}
```

3. **Example - Bad Code (DO NOT GENERATE)**:
```typescript
// ❌ No any types
function executeCode(code: any): any {
  return code;
}

// ❌ Missing explicit return type
function getData(id: string) {
  return fetchData(id);
}
```

### Code Style Requirements

1. **Formatting** (Prettier auto-formats, but follow these):
   - Single quotes for strings
   - 2-space indentation
   - 100-character line width
   - Semicolons required
   - Trailing commas (ES5)

2. **Import Organization**:
```typescript
// Built-in Node.js modules first
import { strict as assert } from 'assert';
import * as path from 'path';

// External dependencies
import * as vscode from 'vscode';

// Internal modules (alphabetically)
import { PyodideWorker } from './pyodide/worker';
import { MessageHandler } from './utils/messages';
```

3. **Naming Conventions**:
   - Variables/Functions: `camelCase`
   - Classes/Interfaces: `PascalCase`
   - Interfaces: Prefix with `I` (e.g., `IUser`, `IConfig`)
   - Constants: `UPPER_SNAKE_CASE`
   - Private properties: Prefix with `_` (e.g., `_worker`)
   - Booleans: Prefix with `is`, `has`, `should`, `can`

### Documentation Requirements

**JSDoc comments REQUIRED for**:
- All public functions
- All classes and interfaces
- Complex algorithms
- Non-obvious code logic

**Format**:
```typescript
/**
 * Executes Python code in the Pyodide worker
 * 
 * @param code - The Python code to execute
 * @param context - Optional execution context with variables
 * @returns Promise resolving to the execution result
 * @throws {Error} If the worker is not initialized
 * 
 * @example
 * ```typescript
 * const result = await executeCode('print("Hello")');
 * ```
 */
async function executeCode(
  code: string,
  context?: IExecutionContext
): Promise<IExecutionResult> {
  // Implementation
}
```

### Error Handling Standards

1. **Use Custom Error Classes**:
```typescript
class PyodideInitializationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PyodideInitializationError';
  }
}
```

2. **Proper Error Handling**:
```typescript
// ✅ GOOD
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  if (error instanceof SpecificError) {
    logger.error('Specific error occurred', error);
    return handleSpecificError(error);
  }
  throw error; // Rethrow unexpected errors
}

// ❌ BAD - Silent failure
try {
  return await riskyOperation();
} catch (error) {
  return null; // Don't do this
}
```

### Security Requirements

1. **Input Validation - ALWAYS**:
```typescript
function processUserInput(input: string): void {
  // Validate type
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  // Validate content
  if (input.trim().length === 0) {
    throw new Error('Input cannot be empty');
  }
  // Validate length
  if (input.length > MAX_LENGTH) {
    throw new Error('Input exceeds maximum length');
  }
  // Process
}
```

2. **No Hardcoded Secrets**:
```typescript
// ✅ GOOD
const apiKey = process.env.API_KEY;

// ❌ BAD
const apiKey = 'sk-1234567890';
```

3. **Safe Regex** - Avoid ReDoS vulnerabilities:
```typescript
// ✅ GOOD - Simple regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ❌ BAD - Complex, vulnerable regex
const emailRegex = /^(a+)+$/; // Can cause ReDoS
```

### Testing Requirements

1. **Test Coverage** - Minimum thresholds ENFORCED:
   - Lines: 80%
   - Statements: 80%
   - Functions: 80%
   - Branches: 75%

2. **Test Structure** - Use AAA pattern:
```typescript
describe('Feature', () => {
  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = processInput(input);
    
    // Assert
    assert.equal(result, 'expected');
  });
});
```

3. **Test Both Paths**:
```typescript
describe('validateInput', () => {
  it('should accept valid input', () => {
    assert.doesNotThrow(() => validateInput('valid'));
  });

  it('should reject invalid input', () => {
    assert.throws(() => validateInput(''), /cannot be empty/);
  });
});
```

### Performance Best Practices

1. **Lazy Initialization**:
```typescript
class Manager {
  private _worker?: Worker;

  async getWorker(): Promise<Worker> {
    if (this._worker === undefined) {
      this._worker = await this.initWorker();
    }
    return this._worker;
  }
}
```

2. **Resource Cleanup**:
```typescript
class Component {
  private _disposables: vscode.Disposable[] = [];

  dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}
```

3. **Batch Operations**:
```typescript
// Batch multiple outputs instead of sending individually
class OutputBuffer {
  private _buffer: string[] = [];

  append(text: string): void {
    this._buffer.push(text);
    if (this._buffer.length >= 10) {
      this.flush();
    }
  }

  flush(): void {
    // Send all at once
  }
}
```

### VS Code Extension Specific

1. **Web Extension Constraints**:
   - No Node.js APIs (use browser equivalents)
   - No file system access (use VS Code FS API)
   - All execution in Web Workers
   - Polyfills for `path`, `buffer`, `process`

2. **Proper Activation**:
```typescript
export function activate(context: vscode.ExtensionContext): void {
  // Register commands
  const disposable = vscode.commands.registerCommand('command.id', () => {
    // Handler
  });
  
  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Cleanup
}
```

3. **Notebook Controller Pattern**:
```typescript
const controller = vscode.notebooks.createNotebookController(
  'pyodide-kernel',
  'jupyter-notebook',
  'Pyodide (Web)'
);

controller.supportedLanguages = ['python'];
controller.executeHandler = async (cells, notebook, controller) => {
  // Execute cells
};
```

## Workflow Integration

### Pre-Commit Checks
All code is automatically checked before commit:
1. ESLint (strict rules)
2. Prettier (auto-format)
3. TypeScript type checking

### CI/CD Pipeline
All PRs must pass:
1. Linting (ESLint)
2. Type checking (TypeScript)
3. Tests with coverage (80%+ required)
4. Security scanning (CodeQL)
5. Build success

## Common Patterns

### Async/Await (Not Callbacks)
```typescript
// ✅ GOOD
async function process(): Promise<void> {
  const data = await fetchData();
  const result = await processData(data);
  await saveData(result);
}

// ❌ BAD
function process(): void {
  fetchData((data) => {
    processData(data, (result) => {
      saveData(result);
    });
  });
}
```

### Message Passing (Worker Communication)
```typescript
interface IWorkerMessage {
  type: 'init' | 'run' | 'result' | 'error';
  payload: unknown;
}

function sendMessage(message: IWorkerMessage): void {
  worker.postMessage(message);
}
```

## Quality Gates Summary

When generating code, ensure:
- ✅ TypeScript strict mode compliant
- ✅ No `any` types
- ✅ Explicit return types
- ✅ JSDoc comments on public APIs
- ✅ Input validation
- ✅ Error handling
- ✅ Tests written
- ✅ No hardcoded secrets
- ✅ Resource cleanup
- ✅ Performance considered

## Reference Documents

For detailed standards, see:
- `/CODE_STANDARDS.md` - Complete code standards
- `/CONTRIBUTING.md` - Development workflow
- `/docs/` - Implementation guides

## Example Code Generation

When asked to create a new function, generate:

```typescript
/**
 * [Description of what the function does]
 * 
 * @param param1 - [Description]
 * @param param2 - [Description]
 * @returns [Description of return value]
 * @throws {ErrorType} [When this error is thrown]
 */
export async function functionName(
  param1: string,
  param2: number
): Promise<IReturnType> {
  // Input validation
  if (param1.trim().length === 0) {
    throw new Error('param1 cannot be empty');
  }
  if (param2 < 0) {
    throw new Error('param2 must be non-negative');
  }

  try {
    // Implementation
    const result = await doSomething(param1, param2);
    return result;
  } catch (error) {
    if (error instanceof KnownError) {
      // Handle known error
      throw new CustomError('Specific error message', error);
    }
    throw error;
  }
}
```

---

**Remember**: Code quality is not optional. All standards are enforced by automated tools and must be followed.
