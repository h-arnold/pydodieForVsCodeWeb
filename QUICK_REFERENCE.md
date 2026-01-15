# Quick Reference: Quality Tools

A quick reference card for all quality tools and commands in this project.

## 🎯 Quick Commands

### Most Common

```bash
npm test                    # Run tests
npm run lint                # Check code quality
npm run format              # Format code
npm run typecheck           # Type check
```

### Before Commit

```bash
npm run lint:fix            # Auto-fix linting issues
npm run format              # Format code
npm test                    # Run tests
```

### Before PR

```bash
npm run typecheck           # Type check
npm run lint                # Lint check
npm run format:check        # Format check
npm run test:coverage       # Tests with coverage
npm run package-web         # Production build
```

## 📋 Tool Reference

### TypeScript

| Command | Description |
|---------|-------------|
| `npm run typecheck` | Type check without building |
| `npm run compile` | Compile TypeScript to JavaScript |

**Config**: `tsconfig.json`

**Strict Mode**: Enabled (all strict checks on)

### ESLint

| Command | Description |
|---------|-------------|
| `npm run lint` | Check for linting errors |
| `npm run lint:fix` | Auto-fix linting errors |

**Config**: `.eslintrc.js`

**Rules**: Strict TypeScript + Security + Import

**Severity**:
- ❌ Error = Blocks commit/CI
- ⚠️  Warning = Should fix

### Prettier

| Command | Description |
|---------|-------------|
| `npm run format` | Format all code |
| `npm run format:check` | Check if formatted |

**Config**: `.prettierrc`

**Settings**:
- Single quotes
- 2 spaces
- 100 char width
- Semicolons
- Trailing commas

### Testing (Mocha + nyc)

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:watch` | Watch mode |

**Config**: `.mocharc.js`, `package.json` (nyc)

**Coverage Required**:
- Lines: 80%
- Statements: 80%
- Functions: 80%
- Branches: 75%

### Security

| Command | Description |
|---------|-------------|
| `npm run security:audit` | npm audit check |
| `npm audit fix` | Auto-fix vulnerabilities |

**Tools**:
- npm audit
- CodeQL (GitHub Actions)
- ESLint security plugin

### Build

| Command | Description |
|---------|-------------|
| `npm run compile-web` | Development build |
| `npm run package-web` | Production build |
| `npm run watch` | Watch mode |

**Config**: `webpack.config.js`

## 🔄 Pre-commit Hooks

**What Runs**: Lint + Format (automatically)

**Files**: Only staged files

**Bypass** (emergency only):
```bash
git commit --no-verify
```

**Setup**:
```bash
npm run prepare
```

## ✅ Quality Gate Checklist

### Before Commit
- [ ] `npm run typecheck` ✅
- [ ] `npm run lint` ✅
- [ ] `npm run format:check` ✅
- [ ] `npm test` ✅

### Before PR
- [ ] All commit checks ✅
- [ ] `npm run test:coverage` ≥80% ✅
- [ ] `npm run security:audit` clean ✅
- [ ] `npm run package-web` builds ✅
- [ ] Documentation updated ✅

### Before Merge
- [ ] All CI checks pass ✅
- [ ] Code review approved ✅
- [ ] No merge conflicts ✅
- [ ] CodeQL scan complete ✅

## 🚨 Common Errors

### TypeScript Error

```
error TS2322: Type 'string | undefined' is not assignable to type 'string'
```

**Fix**: Handle undefined explicitly
```typescript
// ❌ BAD
const value: string = maybeUndefined;

// ✅ GOOD
const value: string = maybeUndefined ?? 'default';
```

### ESLint Error: no-explicit-any

```
error: Unexpected any. Specify a different type
```

**Fix**: Use proper types
```typescript
// ❌ BAD
function process(data: any) { }

// ✅ GOOD
function process(data: string) { }
// or
function process(data: unknown) {
  if (typeof data === 'string') { }
}
```

### Coverage Below Threshold

```
ERROR: Coverage for lines (75%) does not meet threshold (80%)
```

**Fix**: Add tests
```bash
# View coverage report
npm run test:coverage
open coverage/index.html
# Add tests for uncovered lines
```

## 📊 File Locations

| What | Where |
|------|-------|
| Source code | `src/` |
| Tests | `test/` |
| Build output | `dist/` |
| Coverage | `coverage/` |
| Config files | Root directory |
| Docs | `docs/`, `*.md` |

## 🔗 Related Docs

- [SETUP.md](./SETUP.md) - Environment setup
- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute
- [CODE_STANDARDS.md](./CODE_STANDARDS.md) - Code standards
- [QUALITY_GATES.md](./QUALITY_GATES.md) - Detailed quality gates

## 💡 Tips

**Tip 1**: Run `npm run lint:fix` before `npm run lint`
- Fixes most issues automatically

**Tip 2**: Use `npm run test:watch` while developing
- Tests run automatically on file save

**Tip 3**: Check coverage HTML for gaps
- `open coverage/index.html`
- See exactly what's not covered

**Tip 4**: Pre-commit hooks save time
- Catches issues before CI
- Auto-fixes when possible

**Tip 5**: VS Code integration
- Install recommended extensions
- Format on save enabled
- Real-time linting

---

**Keep this handy!** 📌

Pin this file or bookmark for quick reference.
