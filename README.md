# Pyodide Python Kernel for VS Code Web

A browser-based Python kernel for Jupyter notebooks powered by Pyodide, enabling Python code execution directly in VS Code for the Web (vscode.dev, github.dev) without server infrastructure.

[![CI](https://github.com/h-arnold/pydodieForVsCodeWeb/actions/workflows/ci.yml/badge.svg)](https://github.com/h-arnold/pydodieForVsCodeWeb/actions/workflows/ci.yml)
[![CodeQL](https://github.com/h-arnold/pydodieForVsCodeWeb/actions/workflows/codeql.yml/badge.svg)](https://github.com/h-arnold/pydodieForVsCodeWeb/actions/workflows/codeql.yml)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

## Features

- 🌐 **100% Browser-Based**: Runs entirely in the browser using WebAssembly
- 🚀 **Zero Server Setup**: No backend infrastructure required
- 📓 **Jupyter Integration**: Full compatibility with VS Code's Jupyter extension
- 🐍 **Python Ecosystem**: Access to NumPy, Pandas, Matplotlib via Pyodide
- 🔒 **Secure**: Sandboxed execution environment
- ⚡ **Fast**: Web Worker-based execution keeps UI responsive

## Quality Gates

This project implements comprehensive quality gates to ensure code excellence:

### 🔍 Code Quality

- **ESLint**: Strict TypeScript rules enforcing best practices
- **Prettier**: Automated code formatting
- **TypeScript Strict Mode**: Maximum type safety
- **Pre-commit Hooks**: Automated checks before every commit

### 🧪 Testing

- **Mocha**: Test framework with full async support
- **Code Coverage**: Enforced minimum 80% coverage
  - Lines: 80%
  - Statements: 80%
  - Functions: 80%
  - Branches: 75%

### 🛡️ Security

- **CodeQL**: Automated security scanning on every PR
- **npm audit**: Dependency vulnerability checks
- **ESLint Security Plugin**: Code-level security analysis
- **No Hardcoded Secrets**: Environment variable enforcement

### 🚀 CI/CD

- **GitHub Actions**: Automated testing, linting, and building
- **Coverage Reporting**: Codecov integration
- **Security Scanning**: Regular CodeQL analysis
- **Build Validation**: Ensures extension packages correctly

## Quick Start

### Prerequisites

- **Node.js**: >= 18.x (recommend 20.x)
- **npm**: >= 9.x (recommend 10.x)
- **VS Code**: >= 1.85.0

### Installation

```bash
# Clone the repository
git clone https://github.com/h-arnold/pydodieForVsCodeWeb.git
cd pydodieForVsCodeWeb

# Install dependencies
npm install

# Initialize Git hooks
npm run prepare
```

### Development

```bash
# Type check
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for development
npm run compile-web

# Build for production
npm run package-web
```

### Local Testing

```bash
# Option 1: VS Code test web
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.

# Option 2: Serve and load in vscode.dev
npx serve --cors -l 5000 .
# Then open: https://vscode.dev/?extensionDevelopmentPath=http://localhost:5000
```

## Project Structure

```
pydodieForVsCodeWeb/
├── .github/
│   ├── workflows/          # GitHub Actions CI/CD
│   └── copilot-instructions.md  # Copilot code standards
├── .husky/                 # Git hooks
├── docs/                   # Comprehensive implementation guides
├── src/                    # Source code
│   └── extension.ts        # Extension entry point
├── test/                   # Test files
├── .eslintrc.js            # ESLint configuration (strict)
├── .prettierrc             # Prettier configuration
├── tsconfig.json           # TypeScript configuration (strict)
├── webpack.config.js       # Webpack bundler config
├── package.json            # Dependencies and scripts
├── CODE_STANDARDS.md       # Code standards and best practices
└── CONTRIBUTING.md         # Contributing guidelines
```

## Code Standards

This project enforces strict code standards. See [CODE_STANDARDS.md](./CODE_STANDARDS.md) for complete details.

### Key Requirements

- ✅ **TypeScript Strict Mode**: All strict checks enabled
- ✅ **No `any` Types**: Explicit typing required everywhere
- ✅ **Explicit Return Types**: Required for all functions
- ✅ **JSDoc Comments**: Required for public APIs
- ✅ **Input Validation**: All external input must be validated
- ✅ **Error Handling**: Proper error handling patterns required
- ✅ **Test Coverage**: Minimum 80% coverage enforced
- ✅ **Security**: No secrets, safe regex, validated inputs

### Example

```typescript
/**
 * Executes Python code in Pyodide worker
 * @param code - The Python code to execute
 * @returns Promise resolving to execution result
 * @throws {Error} If code is invalid
 */
async function executeCode(code: string): Promise<IExecutionResult> {
  if (code.trim().length === 0) {
    throw new Error('Code cannot be empty');
  }
  // Implementation
}
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development setup
- Quality gates and tools
- Testing requirements
- Pull request process
- Code review guidelines

### Quick Contribution Checklist

Before submitting a PR:

- [ ] Code passes linting (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Types check (`npm run typecheck`)
- [ ] Tests pass (`npm test`)
- [ ] Coverage meets requirements (80%+)
- [ ] Documentation updated
- [ ] Security checks pass
- [ ] Commit messages follow conventions

## Documentation

### Implementation Guides

Comprehensive step-by-step guides in the `docs/` directory:

1. [Web Extension Scaffolding](./docs/Step-01-Web-Extension-Scaffolding.md)
2. [Kernel Registration](./docs/Step-02-Kernel-Registration.md)
3. [NotebookController](./docs/Step-03-NotebookController.md)
4. [Pyodide Worker](./docs/Step-04-Pyodide-Worker.md)
5. [Controller-Worker Wiring](./docs/Step-05-Controller-Worker-Wiring.md)
6. [Stdout/Stderr Capture](./docs/Step-06-Stdout-Stderr-Capture.md)
7. [Rich Output Rendering](./docs/Step-07-Rich-Output-Rendering.md)
8. [Package Management](./docs/Step-08-Package-Management.md)
9. [File System Interop](./docs/Step-09-File-System-Interop.md)
10. [Web Constraints](./docs/Step-10-Web-Constraints.md)
11. [Kernel UX/Context Keys](./docs/Step-11-Kernel-UX-Context-Keys.md)
12. [Build & Test Flow](./docs/Step-12-Build-Test-Flow.md)
13. [Optional Enhancements](./docs/Step-13-Optional-Enhancements.md)

See [docs/README.md](./docs/README.md) for complete documentation overview.

## Technology Stack

| Technology | Purpose | Version |
|-----------|---------|---------|
| **Pyodide** | Python WebAssembly runtime | 0.29.1+ |
| **VS Code API** | Extension framework | 1.85.0+ |
| **TypeScript** | Type-safe development | 5.3.0+ |
| **Webpack** | Module bundler | 5.89.0+ |
| **ESLint** | Code quality linting | 8.56.0+ |
| **Prettier** | Code formatting | 3.2.4+ |
| **Mocha** | Testing framework | 10.2.0+ |
| **Husky** | Git hooks | 9.0.10+ |

## Scripts Reference

```bash
# Development
npm run compile-web        # Build for development
npm run watch              # Watch mode with auto-rebuild

# Code Quality
npm run lint               # Run ESLint
npm run lint:fix           # Auto-fix linting issues
npm run format             # Format with Prettier
npm run format:check       # Check formatting
npm run typecheck          # TypeScript type checking

# Testing
npm test                   # Run tests
npm run test:coverage      # Run tests with coverage
npm run test:watch         # Watch mode for tests

# Security
npm run security:audit     # npm audit check
npm run security:check     # Snyk security check

# Production
npm run package-web        # Build for production
npm run vscode:prepublish  # Pre-publish build
```

## CI/CD Pipeline

### On Every Push/PR

1. **Lint**: ESLint with strict rules
2. **Type Check**: TypeScript strict mode
3. **Format Check**: Prettier validation
4. **Test**: Mocha with coverage enforcement
5. **Security**: npm audit + CodeQL
6. **Build**: Production build validation

### Quality Requirements

All checks must pass before merge:
- ✅ No linting errors
- ✅ No type errors
- ✅ All tests passing
- ✅ Coverage >= 80%
- ✅ No security vulnerabilities
- ✅ Successful build

## Security

### Reporting Vulnerabilities

Please report security vulnerabilities privately to the maintainers. Do not open public issues for security concerns.

### Security Measures

- **Automated Scanning**: CodeQL runs on every PR and weekly
- **Dependency Audits**: npm audit in CI/CD pipeline
- **Code Analysis**: ESLint security plugin
- **Input Validation**: All external inputs validated
- **No Secrets**: Environment variables only

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.

## Acknowledgments

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Pyodide Project](https://pyodide.org/)
- [Microsoft Jupyter Extension](https://github.com/microsoft/vscode-jupyter)

## Support

- 📖 [Documentation](./docs/README.md)
- 🐛 [Issue Tracker](https://github.com/h-arnold/pydodieForVsCodeWeb/issues)
- 💬 [Discussions](https://github.com/h-arnold/pydodieForVsCodeWeb/discussions)

---

Built with ❤️ for the Python and VS Code communities