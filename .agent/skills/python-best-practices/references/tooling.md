# Python Tooling

Opinionated setup for production Python projects.

## Contents

1. [Ruff](#1-ruff) - Linting & formatting
2. [mypy](#2-mypy) - Type checking
3. [pre-commit](#3-pre-commit) - Git hooks
4. [Debugging](#4-debugging) - debugpy, pdb
5. [pyproject.toml](#5-pyprojecttoml) - Complete example

---

## 1. Ruff

Ruff replaces black, isort, flake8, pylint. Use it exclusively.

### pyproject.toml

```toml
[tool.ruff]
target-version = "py312"
line-length = 88
fix = true

[tool.ruff.lint]
select = [
    "E",      # pycodestyle errors
    "W",      # pycodestyle warnings
    "F",      # Pyflakes
    "I",      # isort
    "B",      # flake8-bugbear
    "C4",     # flake8-comprehensions
    "UP",     # pyupgrade
    "ARG",    # flake8-unused-arguments
    "SIM",    # flake8-simplify
    "TCH",    # flake8-type-checking
    "PTH",    # flake8-use-pathlib
    "ERA",    # eradicate (commented code)
    "PL",     # Pylint
    "RUF",    # Ruff-specific
]
ignore = [
    "E501",   # line too long (handled by formatter)
    "PLR0913", # too many arguments
    "PLR2004", # magic value comparison
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*" = ["ARG", "PLR2004"]
"migrations/**/*" = ["ERA"]

[tool.ruff.lint.isort]
known-first-party = ["app"]
force-single-line = true

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
skip-magic-trailing-comma = false
```

### Commands

```bash
# Check
ruff check .

# Fix auto-fixable
ruff check --fix .

# Format
ruff format .

# Check + format (CI)
ruff check . && ruff format --check .
```

---

## 2. mypy

Strict mode. No exceptions.

### pyproject.toml

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_configs = true
show_error_codes = true
show_column_numbers = true

# Per-module overrides
[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[[tool.mypy.overrides]]
module = [
    "celery.*",
    "redis.*",
    "alembic.*",
]
ignore_missing_imports = true
```

### Commands

```bash
# Check all
mypy .

# Check specific path
mypy app/

# Show error codes (for ignoring)
mypy . --show-error-codes
```

### Common Fixes

```python
# Error: Missing return type
def foo():  # Bad
def foo() -> None:  # Good

# Error: Incompatible types
x: int = None  # Bad
x: int | None = None  # Good

# Error: Need type annotation
items = []  # Bad
items: list[str] = []  # Good

# Silence specific line (last resort)
x = some_untyped_func()  # type: ignore[no-untyped-call]
```

---

## 3. pre-commit

### Install

```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg  # For conventional commits
```

### .pre-commit-config.yaml

```yaml
repos:
  # Ruff - linting & formatting
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  # mypy - type checking
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.13.0
    hooks:
      - id: mypy
        additional_dependencies:
          - pydantic
          - sqlmodel
          - fastapi

  # General checks
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-toml
      - id: check-added-large-files
        args: [--maxkb=1000]
      - id: check-merge-conflict
      - id: detect-private-key
      - id: no-commit-to-branch
        args: [--branch, main, --branch, master]

  # Conventional commits
  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: v3.6.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]
        args: [feat, fix, docs, style, refactor, test, chore, ci]

  # Security
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: [--baseline, .secrets.baseline]
```

### Commands

```bash
# Run all hooks on all files
pre-commit run --all-files

# Run specific hook
pre-commit run ruff --all-files

# Update hooks to latest versions
pre-commit autoupdate

# Skip hooks (emergency only)
git commit --no-verify -m "emergency fix"
```

---

## 4. Debugging

### debugpy (VS Code / Remote)

```bash
pip install debugpy
```

**Launch script:**
```python
# debug.py
import debugpy

debugpy.listen(("0.0.0.0", 5678))
print("Waiting for debugger...")
debugpy.wait_for_client()

# Import and run your app
from app.main import main
main()
```

**VS Code launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Remote Attach",
      "type": "debugpy",
      "request": "attach",
      "connect": {
        "host": "localhost",
        "port": 5678
      },
      "pathMappings": [
        {
          "localRoot": "${workspaceFolder}",
          "remoteRoot": "/app"
        }
      ]
    },
    {
      "name": "Python: FastAPI",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload"],
      "jinja": true
    }
  ]
}
```

### pdb / breakpoint()

```python
# Insert breakpoint
breakpoint()  # Drops into pdb

# Or with debugpy
import debugpy; debugpy.breakpoint()
```

**pdb commands:**
```
n          # next line
s          # step into
c          # continue
p expr     # print expression
pp expr    # pretty print
l          # list source
w          # where (stack trace)
q          # quit
```

### Rich for better output

```python
from rich import print
from rich.traceback import install

install(show_locals=True)  # Better tracebacks

# Debug print with colors
print(f"[green]Success:[/green] {result}")
print(f"[red]Error:[/red] {error}")

# Inspect objects
from rich import inspect
inspect(my_object, methods=True)
```

### icecream for debug prints

```python
from icecream import ic

# Instead of print(x)
ic(x)  # ic| x: 42

# Trace function calls
ic(foo(1, 2))  # ic| foo(1, 2): 3

# Mark execution points
ic()  # ic| script.py:15 in main()

# Disable in production
from icecream import install
install()  # Makes ic() available everywhere

# Disable
ic.disable()
```

---

## 5. pyproject.toml

Complete example:

```toml
[project]
name = "my-app"
version = "0.1.0"
description = "My Python application"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "sqlmodel>=0.0.22",
    "pydantic-settings>=2.6.0",
    "httpx>=0.28.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-cov>=6.0.0",
    "pytest-asyncio>=0.24.0",
    "mypy>=1.13.0",
    "ruff>=0.8.0",
    "pre-commit>=4.0.0",
    "icecream>=2.1.0",
    "debugpy>=1.8.0",
]

[project.scripts]
my-app = "app.main:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

# ============ TOOLS ============

[tool.ruff]
target-version = "py312"
line-length = 88
fix = true

[tool.ruff.lint]
select = ["E", "W", "F", "I", "B", "C4", "UP", "ARG", "SIM", "TCH", "PTH", "ERA", "PL", "RUF"]
ignore = ["E501", "PLR0913", "PLR2004"]

[tool.ruff.lint.per-file-ignores]
"tests/**/*" = ["ARG", "PLR2004"]

[tool.ruff.lint.isort]
known-first-party = ["app"]
force-single-line = true

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_ignores = true
show_error_codes = true

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = [
    "-v",
    "--tb=short",
    "--strict-markers",
    "-ra",
]
filterwarnings = [
    "ignore::DeprecationWarning",
]

[tool.coverage.run]
source = ["app"]
branch = true
omit = ["*/tests/*", "*/__init__.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
]
fail_under = 80
```

---

## Quick Setup

```bash
# New project setup
mkdir my-project && cd my-project
git init

# Create structure
mkdir -p app tests
touch app/__init__.py app/main.py tests/__init__.py

# Create configs
touch pyproject.toml .pre-commit-config.yaml .gitignore

# Install
pip install -e ".[dev]"
pre-commit install

# Verify
ruff check .
mypy .
pytest
```

### .gitignore

```gitignore
# Python
__pycache__/
*.py[cod]
*.so
.Python
*.egg-info/
dist/
build/
.eggs/

# Virtual env
.venv/
venv/
ENV/

# IDE
.vscode/
.idea/
*.swp
*.swo

# Testing
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/

# Env
.env
.env.*
!.env.example

# Secrets
*.pem
*.key
.secrets.baseline
```
