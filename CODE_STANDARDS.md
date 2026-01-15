# Code Standards and Best Practices

This document defines the code standards, conventions, and best practices for the Pyodide VS Code Web Extension project.

## Table of Contents

1. [TypeScript Standards](#typescript-standards)
2. [Code Style](#code-style)
3. [Naming Conventions](#naming-conventions)
4. [Documentation Standards](#documentation-standards)
5. [Testing Standards](#testing-standards)
6. [Security Standards](#security-standards)
7. [Performance Guidelines](#performance-guidelines)
8. [Error Handling](#error-handling)
9. [Git Commit Standards](#git-commit-standards)

## TypeScript Standards

### Strict Type Safety

**Always use strict TypeScript settings**. This project has the most stringent TypeScript configuration:

```typescript
// ✅ GOOD - Explicit types
function calculateSum(a: number, b: number): number {
  return a + b;
}

// ❌ BAD - Implicit any
function calculateSum(a, b) {
  return a + b;
}
```

### No `any` Types

**Never use `any` type**. Use proper types or `unknown` with type guards:

```typescript
// ✅ GOOD - Proper typing
function processData(data: unknown): string {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
  throw new Error('Invalid data type');
}

// ❌ BAD - Using any
function processData(data: any): string {
  return data.toUpperCase();
}
```

### Explicit Return Types

**Always declare return types** for functions:

```typescript
// ✅ GOOD - Explicit return type
function getUserName(user: IUser): string {
  return user.name;
}

async function fetchData(): Promise<IData> {
  return await api.getData();
}

// ❌ BAD - Inferred return type
function getUserName(user: IUser) {
  return user.name;
}
```

### Null Safety

**Handle null and undefined explicitly**:

```typescript
// ✅ GOOD - Null checks
function getLength(str: string | null): number {
  return str?.length ?? 0;
}

// ✅ GOOD - Type guard
function processValue(value: string | undefined): void {
  if (value === undefined) {
    return;
  }
  console.log(value.toUpperCase());
}

// ❌ BAD - Unsafe access
function getLength(str: string | null): number {
  return str.length; // Potential null reference
}
```

### Interfaces Over Types

**Use interfaces for object shapes**, prefix with `I`:

```typescript
// ✅ GOOD - Interface with I prefix
interface IUser {
  id: string;
  name: string;
  email: string;
}

interface IExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

// ❌ BAD - Type alias for objects
type User = {
  id: string;
  name: string;
};
```

### Const Assertions

**Use const assertions** for literal values:

```typescript
// ✅ GOOD - Const assertion
const MESSAGE_TYPES = {
  INIT: 'init',
  RUN: 'run',
  RESULT: 'result',
} as const;

type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

// ❌ BAD - Mutable object
const MESSAGE_TYPES = {
  INIT: 'init',
  RUN: 'run',
  RESULT: 'result',
};
```

## Code Style

### Formatting

All code is automatically formatted by Prettier. Key rules:

- **Indentation**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Trailing commas**: ES5 style

### Import Organization

**Order imports** by type and alphabetically:

```typescript
// ✅ GOOD - Organized imports
import { strict as assert } from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';

import { PyodideWorker } from './pyodide/worker';
import { MessageHandler } from './utils/messages';

// ❌ BAD - Random order
import { MessageHandler } from './utils/messages';
import * as vscode from 'vscode';
import { PyodideWorker } from './pyodide/worker';
import * as path from 'path';
```

### Function Length

**Keep functions focused and short**:

- Maximum 50 lines per function
- Single responsibility principle
- Extract complex logic into helper functions

```typescript
// ✅ GOOD - Focused function
async function executePythonCode(code: string): Promise<IExecutionResult> {
  validateCode(code);
  const worker = await getWorker();
  const result = await worker.execute(code);
  return formatResult(result);
}

// ❌ BAD - Too long, does too much
async function executePythonCode(code: string): Promise<IExecutionResult> {
  // 100+ lines of validation, execution, formatting, error handling...
}
```

### Avoid Nested Callbacks

**Use async/await** instead of nested callbacks:

```typescript
// ✅ GOOD - Async/await
async function processSequence(): Promise<void> {
  try {
    const data = await fetchData();
    const processed = await processData(data);
    await saveData(processed);
  } catch (error) {
    handleError(error);
  }
}

// ❌ BAD - Callback hell
function processSequence(): void {
  fetchData((data) => {
    processData(data, (processed) => {
      saveData(processed, () => {
        // Done
      });
    });
  });
}
```

## Naming Conventions

### General Rules

```typescript
// Variables and functions: camelCase
const userName = 'John';
function calculateTotal(): number { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_ENDPOINT = 'https://api.example.com';

// Classes and Interfaces: PascalCase
class NotebookController { }
interface IExecutionContext { }

// Interfaces: Prefix with 'I'
interface IUser { }
interface IConfiguration { }

// Enums: PascalCase (members too)
enum ExecutionState {
  Idle = 'idle',
  Running = 'running',
  Completed = 'completed',
}

// Private properties: prefix with underscore
class Worker {
  private _isInitialized: boolean = false;
}
```

### Descriptive Names

**Use clear, descriptive names**:

```typescript
// ✅ GOOD - Descriptive
const userAuthenticationToken = generateToken();
function validateEmailAddress(email: string): boolean { }

// ❌ BAD - Abbreviated
const uat = genTok();
function valEmail(e: string): boolean { }
```

### Boolean Names

**Prefix boolean variables** with `is`, `has`, `should`, `can`:

```typescript
// ✅ GOOD
const isInitialized = true;
const hasPermission = false;
const shouldRetry = true;
const canExecute = checkPermissions();

// ❌ BAD
const initialized = true;
const permission = false;
```

## Documentation Standards

### JSDoc Comments

**Required for all public APIs**:

```typescript
/**
 * Executes Python code in the Pyodide worker
 * 
 * This function sends the code to the web worker for execution
 * and returns the result or any errors that occurred.
 * 
 * @param code - The Python code to execute
 * @param context - Optional execution context with variables
 * @returns Promise resolving to the execution result
 * @throws {Error} If the worker is not initialized
 * @throws {ExecutionError} If code execution fails
 * 
 * @example
 * ```typescript
 * const result = await executeCode('print("Hello")');
 * console.log(result.output); // "Hello\n"
 * ```
 */
async function executeCode(
  code: string,
  context?: IExecutionContext
): Promise<IExecutionResult> {
  // Implementation
}
```

### Inline Comments

**Use sparingly** for complex logic:

```typescript
// ✅ GOOD - Explains non-obvious logic
// Use SharedArrayBuffer if available for better performance
// Fallback to regular message passing in unsupported browsers
const useSharedMemory = typeof SharedArrayBuffer !== 'undefined';

// ❌ BAD - Stating the obvious
// Set x to 5
const x = 5;
```

### TODO Comments

**Format TODO comments consistently**:

```typescript
// TODO(username): Add error recovery mechanism
// FIXME(username): Memory leak in worker cleanup
// HACK(username): Temporary workaround for browser bug
```

## Testing Standards

### Test Structure

**Follow AAA pattern** (Arrange, Act, Assert):

```typescript
describe('PyodideWorker', () => {
  describe('initialize', () => {
    it('should successfully initialize Pyodide', async () => {
      // Arrange
      const worker = new PyodideWorker();
      
      // Act
      const result = await worker.initialize();
      
      // Assert
      assert.equal(result, true);
      assert.ok(worker.isReady());
    });
  });
});
```

### Test Names

**Use descriptive test names**:

```typescript
// ✅ GOOD - Descriptive
it('should throw error when code is empty string', () => { });
it('should return cached result for duplicate requests', () => { });

// ❌ BAD - Vague
it('handles error', () => { });
it('works correctly', () => { });
```

### Test Coverage

**Required coverage levels**:
- Lines: 80%
- Statements: 80%
- Functions: 80%
- Branches: 75%

**Test both success and failure paths**:

```typescript
describe('validateInput', () => {
  it('should accept valid input', () => {
    assert.doesNotThrow(() => validateInput('valid'));
  });

  it('should reject empty input', () => {
    assert.throws(() => validateInput(''), /Input cannot be empty/);
  });

  it('should reject null input', () => {
    assert.throws(() => validateInput(null), /Input cannot be null/);
  });
});
```

## Security Standards

### Input Validation

**Validate all external input**:

```typescript
// ✅ GOOD - Validated
function executeUserCode(code: string): void {
  if (typeof code !== 'string') {
    throw new Error('Code must be a string');
  }
  if (code.trim().length === 0) {
    throw new Error('Code cannot be empty');
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error('Code exceeds maximum length');
  }
  // Execute
}

// ❌ BAD - No validation
function executeUserCode(code: string): void {
  // Execute directly
}
```

### No Secrets in Code

**Never hardcode secrets**:

```typescript
// ✅ GOOD - Environment variable
const apiKey = process.env.API_KEY;

// ❌ BAD - Hardcoded
const apiKey = 'sk-1234567890abcdef';
```

### Safe Regex

**Avoid ReDoS vulnerabilities**:

```typescript
// ✅ GOOD - Simple, safe regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ❌ BAD - Vulnerable to ReDoS
const emailRegex = /^([a-zA-Z0-9_\-\.]+)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.)|(([a-zA-Z0-9\-]+\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\]?)$/;
```

### Dependency Security

**Keep dependencies updated**:

```bash
# Regular security audits
npm audit
npm audit fix

# Check for vulnerabilities
npm run security:audit
```

## Performance Guidelines

### Lazy Initialization

**Load resources only when needed**:

```typescript
// ✅ GOOD - Lazy loading
class PyodideManager {
  private _worker?: PyodideWorker;

  async getWorker(): Promise<PyodideWorker> {
    if (this._worker === undefined) {
      this._worker = await this.initializeWorker();
    }
    return this._worker;
  }
}

// ❌ BAD - Eager initialization
class PyodideManager {
  private _worker = this.initializeWorker(); // Blocks constructor
}
```

### Avoid Memory Leaks

**Clean up resources**:

```typescript
// ✅ GOOD - Proper cleanup
class ResourceManager {
  private _disposables: vscode.Disposable[] = [];

  register(disposable: vscode.Disposable): void {
    this._disposables.push(disposable);
  }

  dispose(): void {
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}

// ❌ BAD - No cleanup
class ResourceManager {
  private _disposables: vscode.Disposable[] = [];
  // No dispose method
}
```

### Batch Operations

**Batch multiple operations** to reduce overhead:

```typescript
// ✅ GOOD - Batched output
class OutputBuffer {
  private _buffer: string[] = [];

  append(text: string): void {
    this._buffer.push(text);
    if (this._buffer.length >= 10) {
      this.flush();
    }
  }

  flush(): void {
    if (this._buffer.length > 0) {
      this.sendToUI(this._buffer.join(''));
      this._buffer = [];
    }
  }
}

// ❌ BAD - Individual sends
function appendOutput(text: string): void {
  sendToUI(text); // Too many messages
}
```

## Error Handling

### Custom Error Classes

**Create specific error types**:

```typescript
// ✅ GOOD - Custom errors
class PyodideInitializationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PyodideInitializationError';
  }
}

class CodeExecutionError extends Error {
  constructor(
    message: string,
    public readonly pythonTraceback: string
  ) {
    super(message);
    this.name = 'CodeExecutionError';
  }
}

// ❌ BAD - Generic errors
throw new Error('Something went wrong');
```

### Error Handling Patterns

**Always handle errors appropriately**:

```typescript
// ✅ GOOD - Proper error handling
async function executeCode(code: string): Promise<IExecutionResult> {
  try {
    const result = await worker.execute(code);
    return result;
  } catch (error) {
    if (error instanceof CodeExecutionError) {
      logger.error('Code execution failed', error.pythonTraceback);
      return {
        success: false,
        error: error.message,
        traceback: error.pythonTraceback,
      };
    }
    throw error; // Rethrow unexpected errors
  }
}

// ❌ BAD - Silent failure
async function executeCode(code: string): Promise<IExecutionResult> {
  try {
    return await worker.execute(code);
  } catch (error) {
    return { success: false }; // Loses error information
  }
}
```

## Git Commit Standards

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, missing semi-colons, etc.)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes
- `ci`: CI/CD changes

### Examples

```
feat(worker): add support for async execution

Implemented asynchronous code execution in Pyodide worker
using message passing protocol. This allows non-blocking
execution of Python code.

Closes #123
```

```
fix(output): prevent memory leak in output buffer

The output buffer was not being cleared after execution,
causing memory to accumulate over multiple runs.

Fixes #456
```

## Summary Checklist

Before committing code, ensure:

- [ ] TypeScript strict mode compliance
- [ ] No `any` types used
- [ ] Explicit return types on all functions
- [ ] Proper error handling
- [ ] JSDoc comments on public APIs
- [ ] Tests written (80%+ coverage)
- [ ] No linting errors
- [ ] Code formatted with Prettier
- [ ] Security best practices followed
- [ ] Performance considerations addressed
- [ ] Descriptive naming conventions
- [ ] No hardcoded secrets
- [ ] Proper resource cleanup

---

Following these standards ensures high-quality, maintainable, and secure code.
