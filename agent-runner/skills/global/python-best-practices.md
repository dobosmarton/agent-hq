<!-- skill:name = Python Best Practices -->
<!-- skill:description = Python 3.12+ project setup, strict typing, functional patterns, and type-safe coding practices -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->
<!-- skill:appliesTo = both -->

# Skill: Python Best Practices

## When to Use This Skill

Use this skill when:

- Starting new Python projects
- Setting up pyproject.toml with uv, ruff, mypy
- Writing type-safe Python code
- Applying functional programming patterns in Python
- Choosing between dataclasses and Pydantic
- Reviewing Python code for type safety and reliability

**Example User Requests:**

- "Set up a new Python project with strict typing"
- "Configure ruff, mypy, and pyright"
- "Help me write this function with proper type annotations"
- "Should I use a dataclass or Pydantic model here?"
- "Review this Python code for type safety"
- "Set up pytest with Hypothesis"

---

## Core Principles

1. **Type everything explicitly** - Annotate all parameters, returns, and non-obvious variables
2. **No `Any` ever** - Zero tolerance. Use `TypedDict` for dicts with known keys, `object` for polymorphic data (narrow with `isinstance`), `dict[str, T]` for homogeneous dicts. Only cast library-imposed `Any` with a justifying comment
3. **Prefer `Protocol` over ABC** - Structural subtyping keeps code decoupled
4. **Frozen dataclasses by default** - `@dataclass(frozen=True, slots=True)` for all data containers
5. **Pydantic at boundaries, dataclasses internally** - Validate external input, trust internal data
6. **Functional style over OOP** - Pure functions, immutability, composition
7. **Comprehensions over map/filter/lambda** - More readable, more Pythonic
8. **Simplicity over cleverness** - The simplest solution that works

---

## Project Setup

### pyproject.toml (Complete Configuration)

```toml
[project]
name = "my-project"
version = "0.1.0"
description = "A well-structured Python project"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.27",
    "pydantic>=2.7",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
    "pytest-asyncio>=0.24",
    "hypothesis>=6.100",
    "mypy>=1.10",
    "ruff>=0.5",
]

# --- mypy: strict type checking ---
[tool.mypy]
python_version = "3.12"
strict = true
warn_unreachable = true
enable_error_code = [
    "ignore-without-code",
    "redundant-cast",
    "truthy-bool",
    "truthy-iterable",
    "unused-awaitable",
]

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false

# --- pyright: editor-level type checking ---
[tool.pyright]
pythonVersion = "3.12"
typeCheckingMode = "strict"
reportMissingTypeStubs = "warning"
reportUnusedImport = "error"
reportUnusedVariable = "error"

# --- ruff: linting + formatting (replaces flake8, black, isort) ---
[tool.ruff]
target-version = "py312"
line-length = 88

[tool.ruff.lint]
select = [
    "F",     # Pyflakes
    "E",     # pycodestyle errors
    "W",     # pycodestyle warnings
    "I",     # isort
    "N",     # pep8-naming
    "UP",    # pyupgrade
    "B",     # flake8-bugbear
    "A",     # flake8-builtins
    "C4",    # flake8-comprehensions
    "SIM",   # flake8-simplify
    "TCH",   # flake8-type-checking
    "RUF",   # Ruff-specific rules
    "PTH",   # flake8-use-pathlib
    "RET",   # flake8-return
    "ARG",   # flake8-unused-arguments
    "PERF",  # perflint
]
ignore = [
    "E501",    # line too long (handled by formatter)
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["ARG", "PLR2004"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
docstring-code-format = true

# --- pytest ---
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-ra --strict-markers --strict-config"
filterwarnings = ["error"]
```

### uv Workflow

```bash
# Initialize project
uv init my-project && cd my-project

# Add dependencies
uv add httpx pydantic
uv add --dev pytest hypothesis ruff mypy

# Run code (auto-syncs environment)
uv run python main.py
uv run pytest
uv run mypy src/
uv run ruff check .
uv run ruff format .

# Pin Python version
uv python pin 3.12
```

### Package Scripts

```bash
# Common commands (add to Makefile or justfile)
uv run ruff check .              # Lint
uv run ruff format .             # Format
uv run mypy src/                 # Type check
uv run pytest                    # Test
uv run pytest --cov=src/         # Test with coverage
```

---

## Type Annotation Patterns

### Type Aliases (PEP 695 - Python 3.12+)

```python
# ✅ GOOD: New type statement (3.12+)
type UserID = int
type Vector = list[float]
type Matrix = list[Vector]
type JSON = dict[str, "JSON"] | list["JSON"] | str | int | float | bool | None

# ❌ BAD: Legacy TypeAlias
from typing import TypeAlias
UserID: TypeAlias = int
```

### Generic Functions (PEP 695 - Python 3.12+)

```python
from collections.abc import Sequence

# ✅ GOOD: Inline type parameter syntax (3.12+)
def first[T](items: Sequence[T]) -> T:
    return items[0]

def pair[T, U](a: T, b: U) -> tuple[T, U]:
    return (a, b)

# ✅ GOOD: Generic with bound
from typing import SupportsLessThan

def minimum[T: SupportsLessThan](a: T, b: T) -> T:
    return a if a < b else b

# ❌ BAD: Legacy TypeVar
from typing import TypeVar
T = TypeVar("T")  # Redundant name repetition
def first(items: Sequence[T]) -> T:
    return items[0]
```

### Generic Classes (PEP 695 - Python 3.12+)

```python
# ✅ GOOD: Clean generic class syntax
class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        if not self._items:
            raise IndexError("Stack is empty")
        return self._items.pop()
```

### Explicit Function Signatures

```python
# ✅ GOOD: Explicit parameter and return types
def add(a: int, b: int) -> int:
    return a + b

async def fetch_user(user_id: str) -> User | None:
    result = await db.query(user_id)
    return result

# ❌ BAD: Missing return type
def add(a: int, b: int):
    return a + b

# ❌ BAD: Using Any
def process(data: Any) -> Any:
    return data
```

### Literal Types and Exhaustiveness

```python
from typing import Literal, assert_never

type Direction = Literal["north", "south", "east", "west"]
type LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]

def move(direction: Direction) -> tuple[int, int]:
    match direction:
        case "north": return (0, 1)
        case "south": return (0, -1)
        case "east":  return (1, 0)
        case "west":  return (-1, 0)
        case _ as unreachable:
            assert_never(unreachable)  # Compile-time exhaustiveness check
```

### TypeIs for Type Narrowing (Python 3.13+)

```python
from typing import TypeIs

# ✅ GOOD: TypeIs narrows in both branches
def is_string(value: str | int) -> TypeIs[str]:
    return isinstance(value, str)

def process(value: str | int) -> str:
    if is_string(value):
        return value.upper()      # Narrowed to str
    else:
        return str(value + 1)     # Narrowed to int

# For Python 3.12: use inline isinstance checks instead
def process_312(value: str | int) -> str:
    if isinstance(value, str):
        return value.upper()
    return str(value + 1)
```

---

## Dataclasses vs Pydantic

### Decision Table

| Criterion         | `dataclass`                   | Pydantic `BaseModel`                  |
| ----------------- | ----------------------------- | ------------------------------------- |
| **Use when**      | Internal data, between layers | System boundaries, user input, APIs   |
| **Validation**    | None (static checking only)   | Full runtime validation + coercion    |
| **Performance**   | Very fast instantiation       | Slower (validation overhead)          |
| **Immutability**  | `frozen=True`                 | `ConfigDict(frozen=True)`             |
| **Serialization** | `dataclasses.asdict()`        | `.model_dump()`, `.model_dump_json()` |

### Pydantic at Boundaries

```python
from pydantic import BaseModel, ConfigDict, Field

# ✅ GOOD: Pydantic validates untrusted external input
class CreateUserRequest(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    email: str = Field(pattern=r"^[\w.+-]+@[\w-]+\.[\w.]+$")
    age: int = Field(ge=0, le=150)
```

### Frozen Dataclasses Internally

```python
from dataclasses import dataclass

# ✅ GOOD: Frozen + slots for internal domain objects
@dataclass(frozen=True, slots=True)
class User:
    id: int
    name: str
    email: str
    age: int

# ✅ GOOD: "Update" by creating a new instance
def rename_user(user: User, new_name: str) -> User:
    return User(id=user.id, name=new_name, email=user.email, age=user.age)

# ❌ BAD: Mutable dataclass
@dataclass
class User:
    id: int
    name: str  # Can be mutated accidentally
```

### Boundary Conversion

```python
def create_user(request: CreateUserRequest) -> User:
    """Pydantic validates, then we convert to a frozen dataclass."""
    user_id = generate_id()
    return User(
        id=user_id,
        name=request.name,
        email=request.email,
        age=request.age,
    )
```

---

## Protocol vs ABC

### Protocol for Interfaces (Default Choice)

```python
from typing import Protocol, runtime_checkable

# ✅ GOOD: Protocol - structural subtyping, no inheritance required
@runtime_checkable
class Repository[T](Protocol):
    def get(self, id: str) -> T | None: ...
    def save(self, entity: T) -> None: ...

class UserRepository:
    """Satisfies Repository[User] without inheriting from it."""

    def get(self, id: str) -> User | None:
        return db.query(id)

    def save(self, entity: User) -> None:
        db.insert(entity)

# Works! No inheritance needed.
def create_service(repo: Repository[User]) -> UserService:
    return UserService(repo)
```

### ABC Only for Shared Implementation

```python
from abc import ABC, abstractmethod

# ✅ ACCEPTABLE: ABC when you have shared logic to inherit
class BaseProcessor(ABC):
    def process(self, data: bytes) -> bytes:
        validated = self._validate(data)  # Shared logic
        return self._transform(validated)  # Delegates to subclass

    @abstractmethod
    def _validate(self, data: bytes) -> bytes: ...

    @abstractmethod
    def _transform(self, data: bytes) -> bytes: ...
```

### Decision

```
Need just an interface contract?         → Protocol
Need shared implementation + contract?   → ABC
Need isinstance() runtime checks?        → Protocol + @runtime_checkable
Default choice?                          → Protocol
```

---

## Functional Programming Patterns

### Pure Functions

```python
# ✅ GOOD: Pure - same input always gives same output
def calculate_total(items: tuple[Item, ...], tax_rate: float) -> float:
    subtotal = sum(item.price for item in items)
    return subtotal * (1 + tax_rate)

# ❌ BAD: Impure - depends on global state
_tax_rate = 0.1
def calculate_total(items: list[Item]) -> float:
    return sum(item.price for item in items) * (1 + _tax_rate)
```

### Immutability

```python
from dataclasses import dataclass
from typing import NamedTuple

# Frozen dataclass: default for domain models
@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float

    def translate(self, dx: float, dy: float) -> "Point":
        return Point(x=self.x + dx, y=self.y + dy)

# NamedTuple: lighter weight, tuple-compatible
class Color(NamedTuple):
    r: int
    g: int
    b: int

# Use tuple instead of list for immutable sequences
STATUSES: tuple[str, ...] = ("pending", "active", "completed")

# ✅ GOOD: Return new object instead of mutating
def add_tag(user: User, tag: str) -> User:
    return User(id=user.id, name=user.name, tags=(*user.tags, tag))

# ❌ BAD: Mutation
def add_tag(user: User, tag: str) -> None:
    user.tags.append(tag)  # Mutating input!
```

### Comprehensions Over map/filter/lambda

```python
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

# ✅ GOOD: Comprehensions - readable, Pythonic
evens = [n for n in numbers if n % 2 == 0]
squares = [n ** 2 for n in numbers]
lookup = {user.id: user for user in users}

# ✅ ACCEPTABLE: map with existing named function
names = ["alice", "bob", "charlie"]
capitalized = list(map(str.capitalize, names))

# ❌ BAD: map/filter with lambdas
evens = list(filter(lambda n: n % 2 == 0, numbers))
squares = list(map(lambda n: n ** 2, numbers))
```

### functools Essentials

```python
from functools import lru_cache, partial, reduce

# lru_cache: memoize expensive pure functions
@lru_cache(maxsize=256)
def fibonacci(n: int) -> int:
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# partial: create specialized versions of functions
def multiply(x: int, y: int) -> int:
    return x * y

double = partial(multiply, y=2)
triple = partial(multiply, y=3)

# reduce: fold a sequence (prefer sum/min/max/any/all for simple cases)
from operator import add
total = reduce(add, [1, 2, 3, 4, 5])  # 15
# Better: total = sum([1, 2, 3, 4, 5])
```

### Function Composition

```python
from collections.abc import Callable
from functools import reduce

def pipe[T](*functions: Callable[[T], T]) -> Callable[[T], T]:
    """Compose functions left to right: pipe(f, g, h)(x) == h(g(f(x)))"""
    def composed(value: T) -> T:
        return reduce(lambda v, f: f(v), functions, value)
    return composed

# Usage
def strip(s: str) -> str:
    return s.strip()

def lower(s: str) -> str:
    return s.lower()

def replace_spaces(s: str) -> str:
    return s.replace(" ", "-")

slugify = pipe(strip, lower, replace_spaces)
assert slugify("  Hello World  ") == "hello-world"
```

### itertools for Lazy Pipelines

```python
from itertools import chain, groupby, islice, batched
from operator import itemgetter

# chain: combine iterables lazily
all_items = chain(range(5), range(5, 10))

# islice: lazy slicing of generators
first_100 = islice(huge_generator(), 100)

# batched: split into chunks (Python 3.12+)
for chunk in batched(range(100), 10):
    process_chunk(chunk)

# groupby: group sorted data (requires sorted input!)
data = [("A", 1), ("A", 2), ("B", 3), ("B", 4)]
grouped = {
    key: [v for _, v in group]
    for key, group in groupby(data, key=itemgetter(0))
}
```

---

## Result Type Pattern

### Lightweight Result (No Library Required)

```python
from dataclasses import dataclass
from typing import assert_never

@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T

@dataclass(frozen=True, slots=True)
class Err[E]:
    error: E

type Result[T, E] = Ok[T] | Err[E]
```

### Usage

```python
def divide(a: float, b: float) -> Result[float, str]:
    if b == 0:
        return Err("Division by zero")
    return Ok(a / b)

def parse_int(s: str) -> Result[int, str]:
    try:
        return Ok(int(s))
    except ValueError:
        return Err(f"Cannot parse '{s}' as integer")

# Caller MUST handle both cases (type checker enforces this)
match divide(10, 3):
    case Ok(value):
        print(f"Result: {value}")
    case Err(error):
        print(f"Failed: {error}")
```

### Composing Results

```python
def process_input(raw: str) -> Result[float, str]:
    match parse_int(raw):
        case Err(e):
            return Err(e)
        case Ok(value):
            return divide(100, value)
```

---

## Error Handling

### Custom Exception Hierarchy

```python
class AppError(Exception):
    """Base exception for this application."""

    def __init__(self, message: str, *, code: str | None = None) -> None:
        self.message = message
        self.code = code
        super().__init__(message)

class ValidationError(AppError):
    def __init__(self, field: str, reason: str) -> None:
        self.field = field
        self.reason = reason
        super().__init__(
            message=f"Validation failed for '{field}': {reason}",
            code="VALIDATION_ERROR",
        )

class NotFoundError(AppError):
    def __init__(self, resource: str, identifier: str | int) -> None:
        self.resource = resource
        self.identifier = identifier
        super().__init__(
            message=f"{resource} '{identifier}' not found",
            code="NOT_FOUND",
        )

class ExternalServiceError(AppError):
    def __init__(self, service: str, detail: str) -> None:
        self.service = service
        super().__init__(
            message=f"External service '{service}' failed: {detail}",
            code="EXTERNAL_ERROR",
        )
```

### Catch Specific Exceptions

```python
# ✅ GOOD: Catch specific exceptions
try:
    user = get_user(user_id)
except NotFoundError:
    return None
except ExternalServiceError as e:
    logger.error("Service failed", exc_info=e)
    raise

# ❌ BAD: Bare except
try:
    user = get_user(user_id)
except:
    pass

# ❌ BAD: Too broad
try:
    user = get_user(user_id)
except Exception:
    return None  # Hides real bugs
```

### Context Managers for Resource Safety

```python
from contextlib import contextmanager
from collections.abc import Generator

@contextmanager
def database_transaction(db: Database) -> Generator[Transaction, None, None]:
    tx = db.begin()
    try:
        yield tx
        tx.commit()
    except Exception:
        tx.rollback()
        raise
    finally:
        tx.close()

# Usage
with database_transaction(db) as tx:
    tx.execute("INSERT INTO users ...")
    # If this throws, transaction is rolled back automatically
```

---

## Code Organization

### Recommended Module Structure

```
my_project/
  src/
    my_project/
      __init__.py          # Public API re-exports (explicit)
      py.typed             # PEP 561 marker (typed package)
      models/
        __init__.py        # Re-exports: from .user import User as User
        user.py
        order.py
      services/
        __init__.py
        user_service.py
      repositories/
        __init__.py
        user_repo.py
      errors.py            # Custom exception hierarchy
      types.py             # Shared type aliases, Protocols, Result type
  tests/
    __init__.py
    conftest.py            # Shared fixtures
    test_user_service.py
  pyproject.toml
  uv.lock
```

### Explicit Re-exports

```python
# my_project/models/__init__.py

# ✅ GOOD: Explicit re-export with `as` (works with no_implicit_reexport)
from .user import User as User
from .order import Order as Order

# Also good: using __all__
__all__ = ["User", "Order"]

# ❌ BAD: Implicit re-export (fails under strict mypy)
from .user import User  # NOT re-exported with no_implicit_reexport!
```

### Avoiding Circular Imports

```python
# Strategy 1: TYPE_CHECKING guard
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .order import Order  # Only imported during type checking

class User:
    def get_orders(self) -> list["Order"]:
        ...

# Strategy 2: Dependency inversion with Protocol
class UserRepository(Protocol):
    def get(self, user_id: int) -> User: ...
    def save(self, user: User) -> None: ...

# Now services depend on Protocol, not concrete implementations
class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo
```

---

## Testing

### pytest Patterns

```python
import pytest
from my_project.models import User
from my_project.services import UserService

class TestUserService:
    """Group related tests in classes (no inheritance needed)."""

    def test_create_user_returns_user_with_id(
        self, user_service: UserService
    ) -> None:
        user = user_service.create("Alice", "alice@example.com")
        assert isinstance(user, User)
        assert user.name == "Alice"

    def test_create_user_rejects_empty_name(
        self, user_service: UserService
    ) -> None:
        with pytest.raises(ValidationError, match="name"):
            user_service.create("", "alice@example.com")
```

### Fixtures (Composition Over Inheritance)

```python
# tests/conftest.py
import pytest

@pytest.fixture
def in_memory_repo() -> InMemoryUserRepo:
    return InMemoryUserRepo()

@pytest.fixture
def user_service(in_memory_repo: InMemoryUserRepo) -> UserService:
    return UserService(repo=in_memory_repo)

@pytest.fixture
def sample_user(user_service: UserService) -> User:
    return user_service.create("Alice", "alice@test.com")
```

### Parametrize

```python
@pytest.mark.parametrize(
    ("input_str", "expected"),
    [
        ("42", Ok(42)),
        ("-1", Ok(-1)),
        ("0", Ok(0)),
        ("abc", Err("Cannot parse 'abc' as integer")),
        ("", Err("Cannot parse '' as integer")),
    ],
    ids=["positive", "negative", "zero", "letters", "empty"],
)
def test_parse_int(input_str: str, expected: Result[int, str]) -> None:
    assert parse_int(input_str) == expected
```

### Property-Based Testing with Hypothesis

```python
from hypothesis import given
from hypothesis import strategies as st

# Property: encoding then decoding is identity
@given(st.text())
def test_json_roundtrip(s: str) -> None:
    import json
    assert json.loads(json.dumps(s)) == s

# Property: positive division never fails
@given(
    a=st.integers(min_value=1, max_value=10_000),
    b=st.integers(min_value=1, max_value=10_000),
)
def test_divide_positive_numbers(a: int, b: int) -> None:
    result = divide(a, b)
    match result:
        case Ok(value):
            assert value == a / b
        case Err(_):
            pytest.fail("Should not fail for positive numbers")

# Custom composite strategy
@st.composite
def valid_users(draw: st.DrawFn) -> CreateUserRequest:
    name = draw(st.text(min_size=1, max_size=100))
    email = draw(st.emails())
    age = draw(st.integers(min_value=0, max_value=150))
    return CreateUserRequest(name=name, email=email, age=age)

@given(user=valid_users())
def test_create_user_never_crashes(user: CreateUserRequest) -> None:
    result = create_user(user)
    assert isinstance(result, User)
```

---

## Anti-Patterns to Avoid

### 1. Using `Any` — The Cardinal Sin of Python Typing

`Any` defeats the entire purpose of static typing. It silently disables type checking for everything it touches — any attribute access, any method call, any assignment passes without error. **There is always a stronger type.** The sections below cover every common scenario where `Any` creeps in and how to eliminate it.

#### Replace `dict[str, Any]` with TypedDict

The most common `Any` source. When a function returns a dict with known keys, define a TypedDict:

```python
from typing import TypedDict

# ❌ BAD: Callers can access any key without type checking
def get_step_result(experiment_id: int) -> dict[str, Any] | None: ...

# ✅ GOOD: Every key is typed, misspelled keys are compile-time errors
class StepResultDict(TypedDict):
    id: int
    experiment_id: int
    step_name: str
    step_number: int
    data: object       # Polymorphic — forces isinstance narrowing
    worker_id: str
    created_at: str

def get_step_result(experiment_id: int) -> StepResultDict | None: ...
```

**Placement strategy:** Define TypedDicts in the file that creates them (each API client defines its own response shapes), not in a shared module. Response shapes are implementation details that change when real APIs replace stubs.

```python
# verdandi/clients/porkbun.py — TypedDicts colocated with the client
class DomainAvailability(TypedDict):
    domain: str
    available: bool
    price: str
    currency: str

class PorkbunClient:
    async def check_availability(self, domain: str) -> DomainAvailability: ...
```

#### Use `object` instead of `Any` for truly polymorphic data

When a value genuinely can be anything (e.g., `json.loads()` output), use `object`. Unlike `Any`, `object` forces callers to narrow with `isinstance` before accessing attributes — making the type check meaningful:

```python
# ❌ BAD: Any allows .get() without narrowing — bugs hide silently
class StepResultDict(TypedDict):
    data: Any  # json.loads() output

result = get_step_result(1)
result["data"].get("decision")  # No mypy error, but crashes if data is a list!

# ✅ GOOD: object forces isinstance narrowing
class StepResultDict(TypedDict):
    data: object  # json.loads() output — could be dict, list, str, int, etc.

result = get_step_result(1)
data = result["data"]
if isinstance(data, dict) and data.get("decision") == "NO_GO":
    ...  # Safe — mypy verified the type
```

#### Use `dict[str, concrete_type]` for homogeneous dicts

When dict values are all the same type but keys vary (e.g., engagement metrics where different platforms return different metric names):

```python
# ❌ BAD: Any allows mixed types to sneak in
engagement: dict[str, Any]  # Could contain str, int, list, None...

# ✅ GOOD: All values are int — simple and precise
engagement: dict[str, int]  # {"likes": 42, "retweets": 7, "replies": 3}
```

#### TypedDict as Pydantic field types — use `typing_extensions`

On Python < 3.12, Pydantic v2 requires `typing_extensions.TypedDict` (not `typing.TypedDict`) for TypedDicts used as model field types. This is because Pydantic needs metadata that `typing.TypedDict` doesn't provide on older Python versions:

```python
# ❌ FAILS at runtime on Python 3.11:
# PydanticUserError: "Please use typing_extensions.TypedDict"
from typing import TypedDict

class FeatureItem(TypedDict):
    title: str
    description: str

class LandingPage(BaseModel):
    features: list[FeatureItem]  # Runtime error!

# ✅ GOOD: Works on Python 3.11+
from typing_extensions import TypedDict

class FeatureItem(TypedDict):
    title: str
    description: str

class LandingPage(BaseModel):
    features: list[FeatureItem]  # ✅ Works
```

**Note:** TypedDicts used _outside_ Pydantic models (e.g., plain function return types) can use `typing.TypedDict` on any Python version.

#### Annotate empty collections explicitly

When mypy cannot infer the element type of an empty collection from context, add an explicit annotation:

```python
# ❌ BAD: mypy infers list[dict[str, object]], not list[SearchResult]
results = []
for item in data:
    results.append(SearchResult(title=item["title"], url=item["url"]))

# ✅ GOOD: Explicit type annotation
results: list[SearchResult] = []
for item in data:
    results.append(SearchResult(title=item["title"], url=item["url"]))
```

#### The ONLY acceptable `Any`: unavoidable library casts

Some libraries have inherently untyped return values. SQLAlchemy's DML `.execute()` returns `Result[Any]` — the row type cannot be inferred from an `UPDATE` statement. In these cases, cast with a comment explaining why:

```python
from typing import Any, cast
from sqlalchemy import CursorResult

# ✅ ACCEPTABLE: SQLAlchemy DML result type is inherently Any
result = cast(
    "CursorResult[Any]",
    session.execute(
        update(TopicReservationRow)
        .where(TopicReservationRow.status == "active")
        .values(status="expired")
    ),
)
count = int(result.rowcount)
```

**Rule: If `Any` exists in your codebase, each instance must have a comment justifying why no stronger type is possible.** Aim for zero — tolerate only library-imposed casts.

#### Quick decision tree for replacing `Any`

```
dict with known keys?                → TypedDict
dict with variable keys, same type?  → dict[str, ConcreteType]
json.loads() output?                 → object (narrow with isinstance)
Function parameter, any type?        → object (narrow with isinstance)
Library returns untyped value?       → cast("ConcreteType", value) + comment
Empty collection, type not inferred? → Explicit annotation: list[T] = []
```

### 2. Mutable Default Arguments

```python
# ❌ BAD: Shared mutable default
def append_item(item: str, items: list[str] = []) -> list[str]:
    items.append(item)
    return items

# ✅ GOOD: None sentinel
def append_item(item: str, items: list[str] | None = None) -> list[str]:
    if items is None:
        items = []
    return [*items, item]  # Return new list
```

### 3. Bare `except`

```python
# ❌ BAD: Catches KeyboardInterrupt, SystemExit, everything
try:
    do_something()
except:
    pass

# ✅ GOOD: Catch specific exceptions
try:
    do_something()
except ValueError as e:
    logger.warning("Invalid value", error=str(e))
    raise
```

### 4. Dicts Instead of Dataclasses

```python
# ❌ BAD: No type safety, easy to misspell keys
def create_user(name: str) -> dict[str, str]:
    return {"name": name, "typo_filed": "oops"}  # No error!

# ✅ GOOD: Structured, typed
@dataclass(frozen=True, slots=True)
class User:
    name: str

def create_user(name: str) -> User:
    return User(name=name)
```

### 5. Missing Return Types

```python
# ❌ BAD: mypy cannot verify callers
def get_user(user_id: int):
    ...

# ✅ GOOD: Explicit, including None
def get_user(user_id: int) -> User | None:
    ...
```

### 6. String Dispatch Instead of Literal

```python
# ❌ BAD: Accepts any string, typos are silent bugs
def set_level(level: str) -> None: ...
set_level("DEUBG")  # Typo, no error

# ✅ GOOD: Restricted to valid values
type LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
def set_level(level: LogLevel) -> None: ...
set_level("DEUBG")  # mypy error!
```

### 7. Missing `slots=True`

```python
# ❌ BAD: Uses __dict__, slower, more memory
@dataclass(frozen=True)
class Point:
    x: float
    y: float

# ✅ GOOD: Uses __slots__, faster, less memory
@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
```

---

## Quick Reference

### Dataclass vs Pydantic Decision

```
Untrusted input (API, user, file)?   → Pydantic BaseModel
Internal domain data?                → @dataclass(frozen=True, slots=True)
Dict with known keys (JSON shape)?   → TypedDict
Simple immutable tuple?              → NamedTuple
```

### Interface Decision

```
Need structural subtyping?           → Protocol
Need runtime isinstance check?      → Protocol + @runtime_checkable
Need shared implementation?          → ABC
Default choice?                      → Protocol
```

### Common Type Patterns

```python
# Nullable
type MaybeUser = User | None

# Readonly sequence
def process(items: Sequence[int]) -> int: ...

# Callback type
type Handler[T] = Callable[[T], None]
type AsyncHandler[T] = Callable[[T], Awaitable[None]]

# Mapping
type Headers = Mapping[str, str]
```

### Modern Python Toolchain (2026)

| Category              | Tool                                   | Replaces                        |
| --------------------- | -------------------------------------- | ------------------------------- |
| Package manager       | **uv**                                 | pip, poetry, pipenv             |
| Linter + Formatter    | **ruff**                               | flake8, black, isort, pyupgrade |
| Type checker (editor) | **pyright** / Pylance                  | -                               |
| Type checker (CI)     | **mypy --strict**                      | -                               |
| Validation (boundary) | **Pydantic v2**                        | marshmallow, cerberus           |
| Domain models         | **dataclass(frozen=True, slots=True)** | attrs, plain dicts              |
| Testing               | **pytest + hypothesis**                | unittest                        |

---
