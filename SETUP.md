# Development Environment Setup Guide

Complete guide for setting up the development environment for the Pyodide VS Code Web Extension.

## Prerequisites

### Required Software

#### 1. Node.js and npm

**Required**: Node.js >= 18.x (recommend 20.x LTS)

**Install**:

```bash
# Check if already installed
node --version
npm --version

# macOS (using Homebrew)
brew install node@20

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows (using Chocolatey)
choco install nodejs-lts

# Or download from: https://nodejs.org/
```

**Verify Installation**:
```bash
node --version  # Should be v20.x.x or later
npm --version   # Should be 10.x.x or later
```

#### 2. Git

**Required**: Latest stable version

**Install**:

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows
# Download from https://git-scm.com/
```

**Configure**:
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

#### 3. Visual Studio Code

**Required**: VS Code >= 1.85.0

**Install**: Download from [https://code.visualstudio.com/](https://code.visualstudio.com/)

**Recommended Extensions**:
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- TypeScript and JavaScript (`ms-vscode.vscode-typescript-next`)
- GitHub Copilot (optional, `GitHub.copilot`)

#### 4. Modern Web Browser

For testing the web extension:
- Chrome/Chromium (recommended)
- Firefox
- Edge

## Initial Setup

### 1. Clone the Repository

```bash
# Clone via HTTPS
git clone https://github.com/h-arnold/pydodieForVsCodeWeb.git
cd pydodieForVsCodeWeb

# Or clone via SSH
git clone git@github.com:h-arnold/pydodieForVsCodeWeb.git
cd pydodieForVsCodeWeb
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# This will:
# - Install production dependencies
# - Install development dependencies
# - Set up Husky Git hooks
# - Prepare the development environment
```

**Expected Output**:
```
added XXX packages, and audited XXX packages in XXs

XXX packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

### 3. Verify Installation

Run the following commands to ensure everything is set up correctly:

```bash
# 1. Type check
npm run typecheck
# Expected: No output (success)

# 2. Lint check
npm run lint
# Expected: No errors

# 3. Format check
npm run format:check
# Expected: "All matched files use Prettier code style!"

# 4. Run tests
npm test
# Expected: All tests passing

# 5. Build
npm run compile-web
# Expected: "compiled successfully"
```

If all commands succeed, your environment is set up correctly! ✅

## VS Code Configuration

### 1. Workspace Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "eslint.validate": [
    "javascript",
    "typescript"
  ],
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.nyc_output": true,
    "**/coverage": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true
  }
}
```

### 2. Recommended Extensions

Install these extensions for the best development experience:

```bash
# Install via command line
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-vscode.vscode-typescript-next
```

Or install manually from the Extensions marketplace.

### 3. Launch Configuration (Optional)

Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Web Extension in Browser",
      "type": "extensionHost",
      "debugWebWorkerHost": true,
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionDevelopmentKind=web"
      ]
    }
  ]
}
```

## Development Workflow

### Daily Development

1. **Pull latest changes**:
   ```bash
   git pull origin main
   npm install  # If package.json changed
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

3. **Make changes**:
   - Edit code in `src/`
   - Add tests in `test/`

4. **Run quality checks**:
   ```bash
   npm run typecheck  # Type checking
   npm run lint       # Linting
   npm test           # Tests
   ```

5. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: add my feature"
   # Pre-commit hooks run automatically
   ```

6. **Push and create PR**:
   ```bash
   git push origin feature/my-feature
   # Create PR on GitHub
   ```

### Available Scripts

```bash
# Development
npm run compile-web        # Build for development
npm run watch              # Watch mode (auto-rebuild)

# Code Quality
npm run typecheck          # TypeScript type checking
npm run lint               # Run ESLint
npm run lint:fix           # Auto-fix linting issues
npm run format             # Format code with Prettier
npm run format:check       # Check formatting

# Testing
npm test                   # Run tests
npm run test:coverage      # Run tests with coverage
npm run test:watch         # Watch mode for tests

# Security
npm run security:audit     # npm audit check
npm run security:check     # Snyk check (if configured)

# Production
npm run package-web        # Production build
```

## Testing the Extension

### Method 1: VS Code Test Web

```bash
# Run in Chromium
npx @vscode/test-web --browserType=chromium --extensionDevelopmentPath=.

# Run in Firefox
npx @vscode/test-web --browserType=firefox --extensionDevelopmentPath=.
```

This opens a local instance of VS Code for the Web with your extension loaded.

### Method 2: Serve and Load in vscode.dev

```bash
# Serve the extension
npx serve --cors -l 5000 .

# Then open in browser:
# https://vscode.dev/?extensionDevelopmentPath=http://localhost:5000
```

### Method 3: Debug in VS Code

1. Open the project in VS Code
2. Press `F5` or use Run → Start Debugging
3. Select "Run Web Extension in Browser"

## Troubleshooting

### Common Issues

#### 1. Git Hooks Not Working

**Problem**: Pre-commit hooks don't run

**Solution**:
```bash
npm run prepare
chmod +x .husky/pre-commit
```

#### 2. TypeScript Errors

**Problem**: TypeScript complains about unknown types

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Ensure VS Code uses workspace TypeScript
# CMD+Shift+P → "TypeScript: Select TypeScript Version" → "Use Workspace Version"
```

#### 3. ESLint Errors

**Problem**: ESLint shows errors in VS Code

**Solution**:
```bash
# Ensure ESLint extension is installed
code --install-extension dbaeumer.vscode-eslint

# Reload VS Code
# CMD+Shift+P → "Developer: Reload Window"
```

#### 4. Build Fails

**Problem**: Webpack build fails

**Solution**:
```bash
# Clean and rebuild
rm -rf dist/
npm run compile-web

# Check for syntax errors
npm run typecheck
```

#### 5. Tests Fail

**Problem**: Tests fail locally but pass in CI

**Solution**:
```bash
# Ensure clean state
rm -rf node_modules coverage .nyc_output dist
npm install
npm test
```

### Getting Help

1. **Check Documentation**:
   - [CONTRIBUTING.md](./CONTRIBUTING.md)
   - [CODE_STANDARDS.md](./CODE_STANDARDS.md)
   - [QUALITY_GATES.md](./QUALITY_GATES.md)

2. **GitHub Issues**: Search existing issues or create a new one

3. **GitHub Discussions**: Ask questions in Discussions

## Advanced Setup

### Custom npm Registry (Optional)

If you use a custom npm registry:

```bash
npm config set registry https://registry.npmjs.org/
# Or your private registry
```

### Proxy Configuration (Optional)

If behind a corporate proxy:

```bash
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

### VS Code Insiders

For testing with latest VS Code features:

```bash
# Download VS Code Insiders
# https://code.visualstudio.com/insiders/
```

## Environment Variables

No environment variables are required for basic development.

For advanced features (future):
- `CODECOV_TOKEN`: For coverage uploads (CI only)
- `SNYK_TOKEN`: For Snyk security scanning (optional)

## Platform-Specific Notes

### macOS

- Use Homebrew for package management
- Xcode Command Line Tools required: `xcode-select --install`

### Linux

- Build tools may be required: `sudo apt-get install build-essential`
- Ensure Node.js is from official source, not system packages

### Windows

- Use PowerShell or Git Bash
- Consider using WSL2 for better compatibility
- Line endings: Git should be configured with `core.autocrlf=true`

## Next Steps

After setup:

1. ✅ Read [CONTRIBUTING.md](./CONTRIBUTING.md)
2. ✅ Review [CODE_STANDARDS.md](./CODE_STANDARDS.md)
3. ✅ Explore the [implementation docs](./docs/README.md)
4. ✅ Try making a small change and commit it
5. ✅ Run the full test suite
6. ✅ Build the extension and test it locally

## Maintenance

### Keep Dependencies Updated

```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Update to latest (careful - may have breaking changes)
npm install <package>@latest
```

### Regular Security Checks

```bash
# Run security audit
npm audit

# Fix vulnerabilities (if possible)
npm audit fix
```

---

**Last Updated**: 2026-01-15

You're now ready to contribute! 🚀
