# Contributing to Pyodide VS Code Web Extension

Thank you for your interest in contributing to this project! This document provides guidelines and information for contributors.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful, inclusive, and professional in all interactions.

## Development Setup

### Prerequisites

- **Node.js**: >= 18.x (recommend 20.x)
- **npm**: >= 9.x (recommend 10.x)
- **VS Code**: >= 1.85.0
- **Git**: Latest stable version

### Initial Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/pydodieForVsCodeWeb.git
   cd pydodieForVsCodeWeb
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Initialize Git hooks**
   ```bash
   npm run prepare
   ```

### Project Structure

```
pydodieForVsCodeWeb/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── .husky/                 # Git hooks
├── docs/                   # Implementation documentation
├── src/                    # Source code
│   ├── extension.ts        # Extension entry point
│   └── ...                 # Additional source files
├── test/                   # Test files
├── dist/                   # Build output (gitignored)
├── .eslintrc.js            # ESLint configuration
├── .prettierrc             # Prettier configuration
├── tsconfig.json           # TypeScript configuration
├── webpack.config.js       # Webpack bundler config
└── package.json            # Project metadata & scripts
```

## Quality Gates

This project enforces strict quality standards to ensure code excellence:

### 1. Code Style & Formatting

**Prettier** automatically formats code to maintain consistency:

```bash
# Check formatting
npm run format:check

# Auto-fix formatting
npm run format
```

**Configuration**: `.prettierrc`
- Single quotes
- 2-space indentation
- 100 character line width
- Trailing commas (ES5)
- Semicolons required

### 2. Linting

**ESLint** enforces code quality and best practices:

```bash
# Lint code
npm run lint

# Auto-fix issues
npm run lint:fix
```

**Key Rules**:
- **TypeScript Strict Mode**: All strict checks enabled
- **No `any` types**: Explicit typing required
- **Explicit return types**: Functions must declare return types
- **Import ordering**: Alphabetically sorted with groups
- **Security checks**: Detect common vulnerabilities
- **JSDoc comments**: Required for public APIs

**Configuration**: `.eslintrc.js`

### 3. Type Safety

**TypeScript** with maximum strictness:

```bash
# Type check without emitting files
npm run typecheck
```

**Strict Options Enabled**:
- `strict: true` (all strict checks)
- `noImplicitAny`
- `strictNullChecks`
- `noUnusedLocals`
- `noUnusedParameters`
- `noImplicitReturns`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`

**Configuration**: `tsconfig.json`

### 4. Testing

**Mocha** test framework with coverage enforcement:

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Coverage Requirements** (enforced):
- **Lines**: 80%
- **Statements**: 80%
- **Functions**: 80%
- **Branches**: 75%

**Configuration**: `.mocharc.js`, `nyc` section in `package.json`

### 5. Security Scanning

**Multiple security layers**:

```bash
# npm audit
npm run security:audit

# Snyk (if configured)
npm run security:check
```

**Automated Scans**:
- **CodeQL**: Runs on every PR (GitHub Actions)
- **npm audit**: Checks dependencies for vulnerabilities
- **ESLint security plugin**: Detects code-level security issues

### 6. Pre-commit Hooks

**Husky + lint-staged** runs checks before commits:

Automatically runs on `git commit`:
1. ESLint fix on staged `.ts` files
2. Prettier format on staged `.ts` files

To bypass (not recommended):
```bash
git commit --no-verify
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

### 2. Make Changes

1. Write code following the style guide
2. Add/update tests for your changes
3. Ensure all quality gates pass locally

### 3. Test Your Changes

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format:check

# Test with coverage
npm run test:coverage

# Build
npm run compile-web
```

### 4. Commit Changes

```bash
# Pre-commit hooks will run automatically
git commit -m "feat: add new feature"
```

**Commit Message Format**:
```
<type>: <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

### 5. Push and Create PR

```bash
git push origin feature/my-feature
```

Then create a Pull Request on GitHub.

## Pull Request Guidelines

### PR Checklist

- [ ] Code follows the style guidelines
- [ ] All tests pass locally
- [ ] Test coverage meets requirements (80%+)
- [ ] No linting errors or warnings
- [ ] TypeScript compiles without errors
- [ ] Added/updated tests for changes
- [ ] Updated documentation if needed
- [ ] Commit messages follow conventions
- [ ] No security vulnerabilities introduced

### PR Requirements

1. **Description**: Clearly describe what and why
2. **Tests**: Include tests for new functionality
3. **Documentation**: Update docs for user-facing changes
4. **Breaking Changes**: Clearly mark and document
5. **CI Passing**: All GitHub Actions must pass

### Code Review Process

1. Automated checks run (CI/CD)
2. CodeQL security scan
3. Manual code review by maintainers
4. Address feedback and update PR
5. Approval and merge

## Testing Guidelines

### Writing Tests

```typescript
import { strict as assert } from 'assert';

describe('Feature Name', () => {
  it('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = processInput(input);
    
    // Assert
    assert.equal(result, 'expected');
  });

  it('should handle async operations', async () => {
    const result = await asyncOperation();
    assert.ok(result);
  });
});
```

### Test Organization

- One test file per source file (`foo.ts` → `foo.test.ts`)
- Group related tests with `describe` blocks
- Use descriptive test names ("should do X when Y")
- Follow AAA pattern: Arrange, Act, Assert

### Coverage Requirements

- All new code must have tests
- Aim for edge cases and error conditions
- Mock external dependencies
- Test both success and failure paths

## Documentation Guidelines

### Code Documentation

**JSDoc comments required** for:
- Public functions
- Classes and interfaces
- Complex algorithms
- Non-obvious code

```typescript
/**
 * Executes Python code in Pyodide worker
 * @param code - The Python code to execute
 * @param context - Execution context with variables
 * @returns Promise resolving to execution result
 * @throws {Error} If code execution fails
 */
async function executePythonCode(
  code: string,
  context: IExecutionContext
): Promise<IExecutionResult> {
  // Implementation
}
```

### Documentation Updates

When adding features:
1. Update relevant docs in `docs/` directory
2. Update README.md if user-facing
3. Add JSDoc comments to new code
4. Update CHANGELOG.md (if exists)

## Security Guidelines

### Security Best Practices

1. **No hardcoded secrets**: Use environment variables
2. **Input validation**: Sanitize all user input
3. **Dependency updates**: Keep dependencies current
4. **Security headers**: Proper CORS and CSP
5. **Audit regularly**: Run `npm audit` before commits

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead, email security concerns to the maintainers privately.

## Build and Release

### Development Build

```bash
npm run compile-web
```

Output: `dist/web/extension.js`

### Production Build

```bash
npm run package-web
```

Optimized, minified build ready for distribution.

### Local Testing

```bash
# Test in VS Code web environment
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.

# Or serve and open in vscode.dev
npx serve --cors -l 5000 .
# Then: https://vscode.dev/?extensionDevelopmentPath=http://localhost:5000
```

## Getting Help

- **Documentation**: Check `docs/` directory
- **Issues**: Search existing GitHub issues
- **Discussions**: Use GitHub Discussions for questions
- **Code**: Read the implementation guides in `docs/`

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Pyodide Documentation](https://pyodide.org/en/stable/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Mocha Testing](https://mochajs.org/)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing! 🎉
