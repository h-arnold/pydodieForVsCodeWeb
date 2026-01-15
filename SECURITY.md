# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately to the maintainers. **Do not open a public issue for security vulnerabilities.**

### How to Report

1. **Email**: Contact the maintainers directly (add maintainer emails if available)
2. **GitHub Security Advisory**: Use GitHub's private vulnerability reporting feature
3. **Response Time**: We aim to respond within 48 hours

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Your contact information

## Security Measures

This project implements multiple layers of security:

### Automated Security Scanning

1. **CodeQL Analysis**
   - Runs on every PR
   - Scheduled weekly scans
   - Analyzes JavaScript/TypeScript code for vulnerabilities
   - Configuration: `.github/workflows/codeql.yml`

2. **npm Audit**
   - Runs in CI/CD pipeline
   - Checks for known vulnerabilities in dependencies
   - Configured to fail on moderate+ severity issues
   - Command: `npm run security:audit`

3. **ESLint Security Plugin**
   - Detects common security issues in code
   - Rules for:
     - Unsafe regex (ReDoS prevention)
     - eval() detection
     - No hardcoded credentials
     - Object injection vulnerabilities
     - Timing attack detection

### Code Quality Gates

1. **TypeScript Strict Mode**
   - Prevents type-related vulnerabilities
   - Null safety checks
   - No implicit any types

2. **Input Validation**
   - All external inputs must be validated
   - Type checking enforced
   - Length and content validation

3. **Pre-commit Hooks**
   - Automated linting before every commit
   - Security checks run automatically
   - Prevents committing vulnerable code

### Dependency Security

1. **Regular Updates**
   - Dependencies reviewed regularly
   - Security patches applied promptly
   - Automated Dependabot alerts enabled (recommended)

2. **Minimal Dependencies**
   - Only necessary dependencies included
   - Regular audits to remove unused packages
   - Prefer well-maintained packages

## Security Best Practices

### For Contributors

1. **Never Commit Secrets**
   - No API keys, passwords, or tokens in code
   - Use environment variables
   - Review before committing

2. **Validate All Inputs**
   ```typescript
   // ✅ GOOD
   function process(input: string): void {
     if (typeof input !== 'string') {
       throw new Error('Invalid input type');
     }
     if (input.length > MAX_LENGTH) {
       throw new Error('Input too long');
     }
     // Process
   }
   
   // ❌ BAD
   function process(input: any): void {
     // No validation
   }
   ```

3. **Use Safe Regex**
   ```typescript
   // ✅ GOOD - Simple, safe
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   
   // ❌ BAD - Vulnerable to ReDoS
   const emailRegex = /^(a+)+$/;
   ```

4. **Handle Errors Securely**
   - Don't expose sensitive info in error messages
   - Log errors securely
   - Sanitize error output

### For Users

1. **Keep Extension Updated**
   - Update to latest version for security patches
   - Review release notes

2. **Review Permissions**
   - Understand extension permissions
   - Report suspicious behavior

3. **Report Issues**
   - Report security concerns privately
   - Don't publicly disclose vulnerabilities

## Vulnerability Disclosure Timeline

1. **Day 0**: Vulnerability reported privately
2. **Day 1-2**: Acknowledgment sent to reporter
3. **Day 3-7**: Vulnerability assessed and triaged
4. **Day 8-30**: Fix developed and tested
5. **Day 31**: Security advisory published
6. **Day 32+**: Patch released and announced

## Security Contacts

- **Primary**: [Add maintainer email]
- **GitHub**: Use GitHub Security Advisories
- **Response Time**: 48 hours for acknowledgment

## Known Vulnerabilities

Current known vulnerabilities are tracked in:
- GitHub Security Advisories
- npm audit reports
- CodeQL scanning results

### Current Status

As of the latest commit:
- ✅ No high or critical vulnerabilities
- ⚠️ 3 low severity vulnerabilities in dev dependencies (diff package)
- ✅ All security scans passing

## Security Checklist for PRs

Before merging:

- [ ] CodeQL scan passes
- [ ] npm audit shows no moderate+ vulnerabilities
- [ ] No secrets in code
- [ ] Input validation present
- [ ] Error handling secure
- [ ] Dependencies reviewed
- [ ] Tests include security scenarios

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [VS Code Extension Security](https://code.visualstudio.com/api/references/extension-manifest#extension-security)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)

---

**Last Updated**: 2026-01-15

Thank you for helping keep this project secure! 🔒
