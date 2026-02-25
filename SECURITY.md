# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

We support only the latest minor version. Please upgrade to receive security patches.

## Security Scanning

This project uses multiple layers of automated security scanning:

### Dependency Vulnerabilities
- **npm audit**: Runs on every CI build
- **Trivy**: Container image scanning

### Code Analysis
- **CodeQL**: Static analysis for security vulnerabilities (weekly + on PRs)
- **Gitleaks**: Secret detection in source code

### What We Scan For
- Known CVEs in dependencies
- SQL injection vulnerabilities
- Cross-site scripting (XSS)
- Regular expression denial of service (ReDoS)
- Path traversal attacks
- Hardcoded secrets and credentials

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT open a public GitHub issue**
2. Email: hello@ansvar.eu
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

We will respond within 48 hours and provide a timeline for a fix.

## Security Best Practices

This project follows security best practices:

- All database queries use prepared statements (no SQL injection)
- Input validation on all user-provided data
- Read-only database access (no write operations)
- No execution of user-provided code
- Automated security testing in CI/CD

## Database Security

The procurement database (`data/procurement.db`) is:
- Pre-built and version-controlled (tamper evident)
- Opened in read-only mode (no write risk)
- Source data from official public sources (auditable)
- Ingestion scripts require manual execution (no auto-download)

---

**Last Updated**: 2026-02-25
