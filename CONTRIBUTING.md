# Contributing to OpenClaw

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Install dev dependencies**:
   ```bash
   pip install -e ".[dev]"
   ```

## Code Style

- **Formatter**: We use [Black](https://github.com/psf/black) with default settings (line length 88). Run `black .` before committing.
- **Linter**: [Ruff](https://github.com/astral-sh/ruff) for fast linting. Run `ruff check .` to catch issues.
- **Type hints**: Add type annotations to all function signatures. Run `mypy` to check.
- **Docstrings**: Use Google-style docstrings for public functions and classes.

## Making a Pull Request

1. **Test your changes** — make sure existing functionality isn't broken and add tests for new features where possible.
2. **Keep PRs focused** — one feature or fix per PR.
3. **Write a clear description** of what your PR does and why.
4. **Push** your branch and open a PR against `main`.

## Reporting Issues

Open an issue with a clear title and description. Include steps to reproduce if it's a bug, or a use case if it's a feature request.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
