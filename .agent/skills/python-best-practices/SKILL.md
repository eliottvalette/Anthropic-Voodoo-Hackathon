---
name: python-best-practices
description: >-
  Python best practices guide based on Arjan Codes teachings. Use this skill
  when writing Python code to ensure adherence to SOLID principles, proper
  type hints, dependency injection, composition over inheritance, and other
  best practices. Automatically applies when writing or reviewing Python code.
  Covers: code smells, typing, async/await, functools, itertools, testing,
  logging, enums, dataclasses vs Pydantic, project structure, FastAPI, ORM,
  tooling (ruff, mypy, pre-commit).
---

# Python Best Practices

This skill provides comprehensive Python best practices based on Arjan Codes' teachings.

## When to Apply

Apply these practices when:
- Writing new Python code
- Reviewing existing Python code
- Refactoring Python code
- Designing Python APIs or classes

## Quick Reference

### SOLID Principles
1. **SRP**: Each class/function has one responsibility
2. **OCP**: Open for extension, closed for modification
3. **LSP**: Subtypes must be substitutable for their base types
4. **ISP**: Prefer small, specific interfaces
5. **DIP**: Depend on abstractions, not implementations

### Code Smells to Avoid
- **God Objects**: Break into smaller, focused classes
- **Duplicate Code**: Extract common logic
- **Long Methods**: Decompose into smaller functions
- **Magic Numbers**: Use named constants
- **Nested Conditionals**: Use early returns or `all()`

### Type Hints (Always Use)
```python
# Use Union/Optional for nullable or multi-type
def get_user(id: int | str) -> User | None: ...

# Use Literal for restricted values
def set_status(status: Literal["active", "inactive"]) -> None: ...

# Use Protocol for duck typing
class Switchable(Protocol):
    def turn_on(self) -> None: ...
```

### Dependency Injection
```python
# Constructor injection (preferred)
class Service:
    def __init__(self, db: Database, cache: Cache) -> None:
        self.db = db
        self.cache = cache
```

### Composition over Inheritance
- Inject behaviors via composition
- Use Protocols for interfaces
- Avoid deep inheritance hierarchies

### Async/Await
```python
# Use asyncio.gather for concurrency
results = await asyncio.gather(*[fetch(url) for url in urls])
```

### Common Pitfalls
- **Mutable defaults**: Use `None` and create inside function
- **Float comparison**: Use `math.isclose()` or `Decimal`
- **Loop variable capture**: Use `lambda x, i=i: ...`

## Detailed Reference

For comprehensive examples with good/bad code patterns, see [references/fundamentals.md](references/fundamentals.md):

- **SOLID Principles** (§1): SRP, OCP, LSP, ISP, DIP with examples
- **Code Smells** (§2): God objects, duplication, long methods, magic numbers
- **Type Hints** (§3): Union, Optional, Literal, Callable, Protocol, TypedDict, Generics
- **Dependency Injection** (§4): Constructor injection, method injection, testing
- **Composition vs Inheritance** (§5): Behavior composition patterns
- **Async/Await** (§6): asyncio.gather, sync-to-async conversion
- **Functools** (§7): lru_cache, wraps, partial
- **Itertools** (§8): chain, islice, groupby
- **Testing** (§9): Property-based testing with Hypothesis
- **Logging** (§10): Structured logging configuration
- **Enums** (§11): Type-safe constants
- **Python Pitfalls** (§12): Mutable defaults, float comparison, loop capture
- **Project Structure** (§13): Layout and imports
- **Dataclasses vs Pydantic** (§14): When to use each
- **Custom Collections** (§15): collections.abc patterns
- **Context Managers** (§16): Class and generator-based
- **Function Optimization** (§17): Single responsibility, minimal parameters

## FastAPI Reference

For FastAPI patterns, see [references/fastapi.md](references/fastapi.md):

- **Project Structure**: Modular layout for APIs
- **Model Separation**: Base/Create/Public/Update pattern
- **Session Dependency**: Injection with `yield`
- **CRUD Patterns**: Create, read, update, delete
- **Error Handling**: HTTPException, response_model

## ORM Reference

For SQLAlchemy/SQLModel patterns, see [references/orm.md](references/orm.md):

- **Engine Setup**: Connection pooling, single engine
- **Model Definition**: Field options, constraints
- **Relationships**: One-to-many, many-to-many
- **Query Patterns**: Eager loading, avoiding N+1
- **Transactions**: Atomic commits, rollbacks
- **Migrations**: Alembic setup and commands
- **Testing**: In-memory SQLite fixtures
- **Performance**: Indexes, bulk operations

## Tooling Reference

For dev tooling setup, see [references/tooling.md](references/tooling.md):

- **Ruff**: Linting & formatting (replaces black, isort, flake8)
- **mypy**: Strict type checking config
- **pre-commit**: Git hooks (ruff, mypy, security, conventional commits)
- **Debugging**: debugpy, pdb, icecream, rich
- **pyproject.toml**: Complete example config
