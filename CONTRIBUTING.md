# Contributing to Public Procurement MCP

Thank you for your interest in contributing to the Public Procurement MCP Server! This document provides guidelines for contributions.

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Use a clear, descriptive title
- Include steps to reproduce bugs
- Include relevant error messages or logs

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Include tests for new functionality
- Keep commits focused and atomic

## Areas We're Looking For Help

### Additional Legal Sources

We welcome contributions adding national procurement transpositions:
- Austrian BVergG amendments
- German GWB/VgV updates
- Swiss BoeB revisions
- Other EU member state implementations

### Reference Data

- CPV code updates
- NUTS region updates
- Threshold value changes

### Bug Fixes and Improvements

- Fix parsing issues in legal text
- Improve search relevance
- Better error handling
- Performance optimizations

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/public-procurement-mcp
cd public-procurement-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Data Sources

All regulation text must come from official public sources:

- **EUR-Lex** (eur-lex.europa.eu) -- CC BY 4.0 license
- **TED** (ted.europa.eu) -- Open Data
- **National legal databases** -- Public domain

Do **not** include copyrighted commercial databases.

## Questions?

Open an issue or reach out at hello@ansvar.eu.

---

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
