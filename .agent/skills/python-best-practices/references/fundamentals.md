# Python Best Practices
> Based on Arjan Codes teachings

## Contents

1. [SOLID Principles](#1-solid-principles) - SRP, OCP, LSP, ISP, DIP
2. [Code Smells](#2-code-smells) - God objects, duplication, long methods, magic numbers, nesting
3. [Type Hints](#3-type-hints) - Union, Optional, Literal, Callable, Protocol, TypedDict, Generics
4. [Dependency Injection](#4-dependency-injection) - Constructor injection, method injection, testing
5. [Composition vs Inheritance](#5-composition-vs-inheritance) - Behavior composition
6. [Async/Await](#6-asyncawait) - asyncio.gather, sync-to-async
7. [Functools](#7-functools) - lru_cache, wraps, partial
8. [Itertools](#8-itertools) - chain, islice, groupby
9. [Testing](#9-testing) - Property-based testing with Hypothesis
10. [Logging](#10-logging) - Structured logging configuration
11. [Enums](#11-enums) - Type-safe constants with methods
12. [Python Pitfalls](#12-python-pitfalls) - Mutable defaults, float comparison, loop capture
13. [Project Structure](#13-project-structure) - Layout, __init__.py patterns
14. [Dataclasses vs Pydantic](#14-dataclasses-vs-pydantic-vs-attrs) - When to use each
15. [Custom Collections](#15-custom-collections) - collections.abc patterns
16. [Context Managers](#16-context-managers) - Class and generator-based
17. [Function Optimization](#17-function-optimization) - Single responsibility, minimal parameters

---

## 1. SOLID Principles

### 1.1 Single Responsibility Principle (SRP)

**Bad:**
```python
class Order:
    def add_item(self, name: str, quantity: int, price: float) -> None:
        self.items.append({"name": name, "quantity": quantity, "price": price})

    def pay(self, payment_type: str, security_code: str) -> None:
        # Handles both order AND payment
        if payment_type == "debit":
            print(f"Processing debit payment with code {security_code}")
        elif payment_type == "credit":
            print(f"Processing credit payment with code {security_code}")
```

**Good:**
```python
class Order:
    def __init__(self) -> None:
        self.items: list[dict] = []
        self.status: str = "open"

    def add_item(self, name: str, quantity: int, price: float) -> None:
        self.items.append({"name": name, "quantity": quantity, "price": price})

class PaymentProcessor:
    def pay(self, order: Order, security_code: str) -> None:
        print(f"Processing payment with code {security_code}")
        order.status = "paid"
```

### 1.2 Open-Closed Principle (OCP)

**Bad:**
```python
class PaymentProcessor:
    def pay(self, payment_type: str, order: Order) -> None:
        # Must modify this class for each new payment type
        if payment_type == "debit":
            print("Processing debit payment")
        elif payment_type == "credit":
            print("Processing credit payment")
        elif payment_type == "paypal":
            print("Processing paypal payment")
```

**Good:**
```python
from abc import ABC, abstractmethod

class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, order: Order) -> None:
        pass

class DebitPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order) -> None:
        print("Processing debit payment")

class CreditPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order) -> None:
        print("Processing credit payment")

class PaypalPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order) -> None:
        print("Processing paypal payment")
```

### 1.3 Liskov Substitution Principle (LSP)

**Bad:**
```python
class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, order: Order, security_code: str) -> None:
        pass

class PaypalPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order, security_code: str) -> None:
        # Uses email instead of security_code - violates the contract!
        print(f"Verifying email: {security_code}")
```

**Good:**
```python
class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, order: Order) -> None:
        pass

class PaypalPaymentProcessor(PaymentProcessor):
    def __init__(self, email_address: str) -> None:
        self.email_address = email_address

    def pay(self, order: Order) -> None:
        print(f"Verifying email: {self.email_address}")
        order.status = "paid"
```

### 1.4 Interface Segregation Principle (ISP)

**Bad:**
```python
class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, order: Order) -> None:
        pass

    @abstractmethod
    def auth_sms(self, order: Order, code: str) -> None:
        pass

class CreditPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order) -> None:
        print("Processing credit payment")

    def auth_sms(self, order: Order, code: str) -> None:
        raise NotImplementedError("Credit cards don't use SMS auth")
```

**Good:**
```python
class PaymentProcessor(ABC):
    @abstractmethod
    def pay(self, order: Order) -> None:
        pass

class SmsAuthMixin(ABC):
    @abstractmethod
    def auth_sms(self, code: str) -> None:
        pass

class DebitPaymentProcessor(PaymentProcessor, SmsAuthMixin):
    def auth_sms(self, code: str) -> None:
        print(f"Verifying SMS code: {code}")

    def pay(self, order: Order) -> None:
        print("Processing debit payment")

class CreditPaymentProcessor(PaymentProcessor):
    def pay(self, order: Order) -> None:
        print("Processing credit payment")
```

### 1.5 Dependency Inversion Principle (DIP)

**Bad:**
```python
class SMSAuthorizer:
    def is_authenticated(self) -> bool:
        return self.authenticated

class DebitPaymentProcessor:
    def __init__(self, security_code: str) -> None:
        self.security_code = security_code
        self.authorizer = SMSAuthorizer()  # Tight coupling!
```

**Good:**
```python
from abc import ABC, abstractmethod

class Authorizer(ABC):
    @abstractmethod
    def is_authenticated(self) -> bool:
        pass

class SMSAuthorizer(Authorizer):
    def is_authenticated(self) -> bool:
        return self.authenticated

class RobotAuthorizer(Authorizer):
    def is_authenticated(self) -> bool:
        return self.authenticated

class DebitPaymentProcessor:
    def __init__(self, security_code: str, authorizer: Authorizer) -> None:
        self.security_code = security_code
        self.authorizer = authorizer  # Depends on abstraction
```

---

## 2. Code Smells

### 2.1 God Object

**Bad:**
```python
class OnlineStore:
    def search_product(self, query: str) -> list[Product]:
        pass

    def process_order(self, order: Order) -> None:
        pass

    def handle_payment(self, payment_info: PaymentInfo) -> None:
        pass

    def manage_inventory(self, product_id: int, quantity: int) -> None:
        pass

    def send_notification(self, user: User, message: str) -> None:
        pass
```

**Good:**
```python
class ProductSearch:
    def search(self, query: str) -> list[Product]:
        pass

class OrderProcessor:
    def process(self, order: Order) -> None:
        pass

class PaymentGateway:
    def handle_payment(self, payment_info: PaymentInfo) -> None:
        pass

class InventoryManager:
    def update_stock(self, product_id: int, quantity: int) -> None:
        pass
```

### 2.2 Duplicate Code

**Bad:**
```python
class ReportGenerator:
    def generate_sales_report(self, data: list[dict]) -> str:
        # Duplicated preprocessing
        cleaned = [d for d in data if d.get("valid")]
        normalized = [{k: str(v).strip() for k, v in d.items()} for d in cleaned]
        # Specific generation
        return self._format_sales(normalized)

    def generate_inventory_report(self, data: list[dict]) -> str:
        # Duplicated preprocessing (identical!)
        cleaned = [d for d in data if d.get("valid")]
        normalized = [{k: str(v).strip() for k, v in d.items()} for d in cleaned]
        # Specific generation
        return self._format_inventory(normalized)
```

**Good:**
```python
class ReportGenerator:
    def _preprocess(self, data: list[dict]) -> list[dict]:
        cleaned = [d for d in data if d.get("valid")]
        return [{k: str(v).strip() for k, v in d.items()} for d in cleaned]

    def generate_sales_report(self, data: list[dict]) -> str:
        normalized = self._preprocess(data)
        return self._format_sales(normalized)

    def generate_inventory_report(self, data: list[dict]) -> str:
        normalized = self._preprocess(data)
        return self._format_inventory(normalized)
```

### 2.3 Long Method

**Bad:**
```python
def handle_customer_request(request: CustomerRequest) -> Response:
    # Validation (20 lines)
    if not request.customer_id:
        raise ValueError("Missing customer ID")
    # ... more validation ...

    # Logging (10 lines)
    logger.info(f"Processing request {request.id}")
    # ... more logging ...

    # Inventory check (15 lines)
    inventory = get_inventory()
    # ... checks ...

    # Price calculation (20 lines)
    price = calculate_base_price(request)
    # ... calculations ...

    # Discount application (15 lines)
    discounts = get_applicable_discounts(request)
    # ... application ...

    # Finalization (10 lines)
    return create_response(price, discounts)
```

**Good:**
```python
def handle_customer_request(request: CustomerRequest) -> Response:
    validate_request(request)
    log_request(request)
    check_inventory(request)
    pricing = calculate_pricing(request)
    pricing = apply_discounts(pricing, request)
    return finalize_response(pricing)

def validate_request(request: CustomerRequest) -> None:
    if not request.customer_id:
        raise ValueError("Missing customer ID")

def calculate_pricing(request: CustomerRequest) -> Pricing:
    return Pricing(base=calculate_base_price(request))

def apply_discounts(pricing: Pricing, request: CustomerRequest) -> Pricing:
    discounts = get_applicable_discounts(request)
    return pricing.with_discounts(discounts)
```

### 2.4 Magic Numbers

**Bad:**
```python
def calculate_shipping_cost(distance: float) -> float:
    return distance * 1.25

def apply_discount(price: float) -> float:
    if price > 100:
        return price * 0.9
    return price

def is_valid_age(age: int) -> bool:
    return 18 <= age <= 120
```

**Good:**
```python
PER_MILE_SHIPPING_RATE = 1.25
BULK_DISCOUNT_THRESHOLD = 100
BULK_DISCOUNT_RATE = 0.9
MIN_VALID_AGE = 18
MAX_VALID_AGE = 120

def calculate_shipping_cost(distance: float) -> float:
    return distance * PER_MILE_SHIPPING_RATE

def apply_discount(price: float) -> float:
    if price > BULK_DISCOUNT_THRESHOLD:
        return price * BULK_DISCOUNT_RATE
    return price

def is_valid_age(age: int) -> bool:
    return MIN_VALID_AGE <= age <= MAX_VALID_AGE
```

### 2.5 Nested Conditionals

**Bad:**
```python
def approve_loan(application: LoanApplication) -> bool:
    if application.credit_score > 600:
        if application.income > 30000:
            if application.debt_to_income_ratio < 0.4:
                if application.employment_years > 2:
                    return True
    return False
```

**Good (early returns):**
```python
def approve_loan(application: LoanApplication) -> bool:
    if application.credit_score <= 600:
        return False
    if application.income <= 30000:
        return False
    if application.debt_to_income_ratio >= 0.4:
        return False
    if application.employment_years <= 2:
        return False
    return True
```

**Good (all()):**
```python
def approve_loan(application: LoanApplication) -> bool:
    return all([
        application.credit_score > 600,
        application.income > 30000,
        application.debt_to_income_ratio < 0.4,
        application.employment_years > 2,
    ])
```

---

## 3. Type Hints

### 3.1 Basic Type Hints

**Bad:**
```python
def get_user(id):
    return database.query(f"SELECT * FROM users WHERE id={id}")

def process_items(items):
    return [item.upper() for item in items]
```

**Good:**
```python
def get_user(id: int) -> User | None:
    return database.query(f"SELECT * FROM users WHERE id={id}")

def process_items(items: list[str]) -> list[str]:
    return [item.upper() for item in items]
```

### 3.2 Union and Optional

**Bad:**
```python
def get_user(id):
    # Can accept int or str, returns User or None - not documented!
    pass

def find_item(name):
    # Returns Item or None - not clear!
    pass
```

**Good:**
```python
from typing import Optional, Union

def get_user(id: int | str) -> User | None:
    """Accepts an integer or string ID, returns User or None."""
    pass

def find_item(name: str) -> Optional[Item]:
    """Returns the found item or None."""
    pass
```

### 3.3 Literal

**Bad:**
```python
def set_status(status: str) -> None:
    # Accepts any string!
    if status not in ("active", "inactive", "pending"):
        raise ValueError("Invalid status")
    self.status = status
```

**Good:**
```python
from typing import Literal

Status = Literal["active", "inactive", "pending"]

def set_status(status: Status) -> None:
    self.status = status  # Statically checked by mypy
```

### 3.4 Callable

**Bad:**
```python
def filter_users(filter_func, users):
    return [u for u in users if filter_func(u)]

def apply_transformation(data, transform):
    return transform(data)
```

**Good:**
```python
from typing import Callable

def filter_users(
    filter_func: Callable[[User], bool],
    users: list[User]
) -> list[User]:
    return [u for u in users if filter_func(u)]

def apply_transformation(
    data: list[int],
    transform: Callable[[int], int]
) -> list[int]:
    return [transform(x) for x in data]
```

### 3.5 Protocol (Duck Typing)

**Bad:**
```python
from abc import ABC, abstractmethod

class Switchable(ABC):
    @abstractmethod
    def turn_on(self) -> None:
        pass

    @abstractmethod
    def turn_off(self) -> None:
        pass

# All classes must explicitly inherit from Switchable
class Light(Switchable):
    def turn_on(self) -> None:
        print("Light on")

    def turn_off(self) -> None:
        print("Light off")
```

**Good:**
```python
from typing import Protocol

class Switchable(Protocol):
    def turn_on(self) -> None: ...
    def turn_off(self) -> None: ...

# No explicit inheritance needed - duck typing!
class Light:
    def turn_on(self) -> None:
        print("Light on")

    def turn_off(self) -> None:
        print("Light off")

class Fan:
    def turn_on(self) -> None:
        print("Fan on")

    def turn_off(self) -> None:
        print("Fan off")

def operate(device: Switchable) -> None:
    device.turn_on()
    device.turn_off()

# Both work because they respect the Protocol
operate(Light())
operate(Fan())
```

### 3.6 TypedDict

**Bad:**
```python
def create_user(data: dict) -> None:
    # No guarantee about which keys are present
    name = data["name"]
    email = data["email"]
    age = data["age"]
```

**Good:**
```python
from typing import TypedDict

class UserData(TypedDict):
    name: str
    email: str
    age: int

def create_user(data: UserData) -> None:
    name = data["name"]  # Guaranteed to exist and be str
    email = data["email"]
    age = data["age"]
```

### 3.7 Generics (Python 3.12+)


**Bad (before 3.12):**
```python
from typing import TypeVar, Generic, Callable, ParamSpec

T = TypeVar("T")
P = ParamSpec("P")

class Container(Generic[T]):
    def __init__(self, item: T) -> None:
        self.item = item

def decorator(func: Callable[P, T]) -> Callable[P, T]:
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        return func(*args, **kwargs)
    return wrapper
```

**Good (3.12+):**
```python
class Container[T]:
    def __init__(self, item: T) -> None:
        self.item = item

def decorator[**P, T](func: Callable[P, T]) -> Callable[P, T]:
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
        return func(*args, **kwargs)
    return wrapper
```

---

## 4. Dependency Injection

### 4.1 Constructor Injection

**Bad:**
```python
class UserService:
    def __init__(self) -> None:
        self.database = PostgresDatabase()  # Tight coupling
        self.cache = RedisCache()  # Tight coupling

    def get_user(self, user_id: int) -> User:
        return self.database.query(user_id)
```

**Good:**
```python
class UserService:
    def __init__(self, database: Database, cache: Cache) -> None:
        self.database = database
        self.cache = cache

    def get_user(self, user_id: int) -> User:
        if cached := self.cache.get(user_id):
            return cached
        return self.database.query(user_id)

# Usage
db = PostgresDatabase()
cache = RedisCache()
service = UserService(database=db, cache=cache)
```

### 4.2 Method Injection

**Bad:**
```python
class ReportGenerator:
    def __init__(self, formatter: Formatter) -> None:
        self.formatter = formatter  # Used only once

    def generate(self, data: list[dict]) -> str:
        return self.formatter.format(data)
```

**Good:**
```python
class ReportGenerator:
    def generate(self, data: list[dict], formatter: Formatter) -> str:
        return formatter.format(data)

# Allows different formatters per call
generator = ReportGenerator()
csv_report = generator.generate(data, CsvFormatter())
json_report = generator.generate(data, JsonFormatter())
```

### 4.3 Testing with DI

**Good:**
```python
from unittest.mock import Mock

def test_get_user() -> None:
    # Arrange
    mock_database = Mock(spec=Database)
    mock_database.query.return_value = User(name="Arjan", email="arjan@example.com")

    service = UserService(database=mock_database, cache=Mock(spec=Cache))

    # Act
    user = service.get_user(1)

    # Assert
    assert user.name == "Arjan"
    mock_database.query.assert_called_once_with(1)
```

---

## 5. Composition vs Inheritance

### 5.1 Prefer Composition


**Bad (deep inheritance):**
```python
class Animal:
    def eat(self) -> None:
        print("Eating")

class Mammal(Animal):
    def give_birth(self) -> None:
        print("Giving birth")

class Dog(Mammal):
    def bark(self) -> None:
        print("Barking")

class SwimmingDog(Dog):
    def swim(self) -> None:
        print("Swimming")
```

**Good (composition):**
```python
from typing import Protocol

class CanEat(Protocol):
    def eat(self) -> None: ...

class CanSwim(Protocol):
    def swim(self) -> None: ...

class CanBark(Protocol):
    def bark(self) -> None: ...

class EatingBehavior:
    def eat(self) -> None:
        print("Eating")

class SwimmingBehavior:
    def swim(self) -> None:
        print("Swimming")

class BarkingBehavior:
    def bark(self) -> None:
        print("Barking")

class Dog:
    def __init__(self) -> None:
        self._eating = EatingBehavior()
        self._barking = BarkingBehavior()

    def eat(self) -> None:
        self._eating.eat()

    def bark(self) -> None:
        self._barking.bark()

class SwimmingDog:
    def __init__(self) -> None:
        self._eating = EatingBehavior()
        self._barking = BarkingBehavior()
        self._swimming = SwimmingBehavior()

    def eat(self) -> None:
        self._eating.eat()

    def bark(self) -> None:
        self._barking.bark()

    def swim(self) -> None:
        self._swimming.swim()
```

---

## 6. Async/Await

### 6.1 asyncio.gather for Concurrency


**Bad (sequential):**
```python
import asyncio

async def fetch_user(user_id: int) -> User:
    await asyncio.sleep(1)  # Simulates an API call
    return User(id=user_id)

async def main() -> None:
    # Sequential execution - 5 seconds total
    users = []
    for i in range(5):
        user = await fetch_user(i)
        users.append(user)
```

**Good (concurrent):**
```python
import asyncio

async def fetch_user(user_id: int) -> User:
    await asyncio.sleep(1)  # Simulates an API call
    return User(id=user_id)

async def main() -> None:
    # Concurrent execution - ~1 second total
    users = await asyncio.gather(*[fetch_user(i) for i in range(5)])
```

### 6.2 Sync vs Async

**Bad:**
```python
import requests

def get_pokemon_names(count: int) -> list[str]:
    names = []
    for i in range(1, count + 1):
        response = requests.get(f"https://pokeapi.co/api/v2/pokemon/{i}")
        names.append(response.json()["name"])
    return names  # Slow - sequential requests
```

**Good:**
```python
import asyncio
import aiohttp

async def get_pokemon_name(session: aiohttp.ClientSession, pokemon_id: int) -> str:
    async with session.get(f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}") as response:
        data = await response.json()
        return data["name"]

async def get_pokemon_names(count: int) -> list[str]:
    async with aiohttp.ClientSession() as session:
        tasks = [get_pokemon_name(session, i) for i in range(1, count + 1)]
        return await asyncio.gather(*tasks)  # Fast - concurrent requests
```

---

## 7. Functools

### 7.1 lru_cache for Memoization


**Bad:**
```python
def fibonacci(n: int) -> int:
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)  # Exponential!

# fibonacci(40) takes several seconds
```

**Good:**
```python
from functools import lru_cache

@lru_cache(maxsize=128)
def fibonacci(n: int) -> int:
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# fibonacci(40) is instant
```

### 7.2 wraps for Decorators


**Bad:**
```python
def log_calls(func):
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@log_calls
def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}"

print(greet.__name__)  # "wrapper" - incorrect!
print(greet.__doc__)   # None - lost!
```

**Good:**
```python
from functools import wraps

def log_calls(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@log_calls
def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}"

print(greet.__name__)  # "greet" - correct!
print(greet.__doc__)   # "Return a greeting message." - preserved!
```

### 7.3 partial for Partial Functions


**Bad:**
```python
def multiply(x: int, y: int) -> int:
    return x * y

def double(x: int) -> int:
    return multiply(x, 2)

def triple(x: int) -> int:
    return multiply(x, 3)
```

**Good:**
```python
from functools import partial

def multiply(x: int, y: int) -> int:
    return x * y

double = partial(multiply, y=2)
triple = partial(multiply, y=3)

print(double(5))  # 10
print(triple(5))  # 15
```

---

## 8. Itertools

### 8.1 chain for Combining Iterables


**Bad:**
```python
list1 = [1, 2, 3]
list2 = [4, 5, 6]
list3 = [7, 8, 9]

# Creates a new list in memory
combined = list1 + list2 + list3
for item in combined:
    print(item)
```

**Good:**
```python
from itertools import chain

list1 = [1, 2, 3]
list2 = [4, 5, 6]
list3 = [7, 8, 9]

# Iterates without creating an intermediate list
for item in chain(list1, list2, list3):
    print(item)
```

### 8.2 islice for Extracting Elements


**Bad:**
```python
def generate_numbers():
    i = 0
    while True:
        yield i
        i += 1

# Dangerous with an infinite generator!
numbers = list(generate_numbers())[:10]
```

**Good:**
```python
from itertools import islice

def generate_numbers():
    i = 0
    while True:
        yield i
        i += 1

# Safe and efficient
first_10 = list(islice(generate_numbers(), 10))
# Or with offset: elements 5 to 15
middle = list(islice(generate_numbers(), 5, 15))
```

### 8.3 groupby for Grouping


**Good:**
```python
from itertools import groupby
from operator import itemgetter

books = [
    ("Python Crash Course", "Eric Matthes"),
    ("Automate the Boring Stuff", "Al Sweigart"),
    ("Fluent Python", "Luciano Ramalho"),
    ("Learning Python", "Mark Lutz"),
    ("Python Cookbook", "David Beazley"),
]

# Sort by author first (groupby requires sorted data)
sorted_books = sorted(books, key=itemgetter(1))

for author, group in groupby(sorted_books, key=itemgetter(1)):
    titles = [title for title, _ in group]
    print(f"{author}: {titles}")
```

---

## 9. Testing

### 9.1 Property-Based Testing with Hypothesis


**Bad (limited tests):**
```python
def test_sort():
    assert sorted([3, 1, 2]) == [1, 2, 3]
    assert sorted([]) == []
    assert sorted([1]) == [1]
    # What about edge cases?
```

**Good (property-based):**
```python
from hypothesis import given
from hypothesis.strategies import lists, integers

@given(lists(integers()))
def test_sort_is_ordered(numbers: list[int]) -> None:
    sorted_numbers = sorted(numbers)
    for i in range(1, len(sorted_numbers)):
        assert sorted_numbers[i - 1] <= sorted_numbers[i]

@given(lists(integers()))
def test_sort_preserves_length(numbers: list[int]) -> None:
    assert len(sorted(numbers)) == len(numbers)

@given(lists(integers()))
def test_sort_preserves_elements(numbers: list[int]) -> None:
    sorted_numbers = sorted(numbers)
    assert set(sorted_numbers) == set(numbers)
```

---

## 10. Logging

### 10.1 Basic Configuration


**Bad:**
```python
def process_order(order_id: int) -> None:
    print(f"Processing order {order_id}")
    # ... processing ...
    print(f"Order {order_id} completed")
    # ... if error ...
    print(f"ERROR: Order {order_id} failed")
```

**Good:**
```python
import logging

logger = logging.getLogger(__name__)

def process_order(order_id: int) -> None:
    logger.info("Processing order %d", order_id)
    try:
        # ... processing ...
        logger.info("Order %d completed", order_id)
    except Exception as e:
        logger.error("Order %d failed: %s", order_id, e)
        raise
```

### 10.2 Advanced Configuration


**Good:**
```python
import logging
from logging.handlers import RotatingFileHandler

def setup_logging() -> None:
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Structured format
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler with rotation
    file_handler = RotatingFileHandler(
        "app.log",
        maxBytes=10_000_000,  # 10MB
        backupCount=5
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
```

---

## 11. Enums

### 11.1 Basic Usage


**Bad:**
```python
def set_status(status: str) -> None:
    if status == "pending":
        pass
    elif status == "active":
        pass
    elif status == "completed":
        pass
    # Easy to make a typo: "actve"
```

**Good:**
```python
from enum import Enum, auto

class Status(Enum):
    PENDING = auto()
    ACTIVE = auto()
    COMPLETED = auto()

def set_status(status: Status) -> None:
    match status:
        case Status.PENDING:
            pass
        case Status.ACTIVE:
            pass
        case Status.COMPLETED:
            pass
```

### 11.2 Enums with Methods


**Good:**
```python
from enum import Enum

class Weekday(Enum):
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6
    SUNDAY = 7

    def is_weekend(self) -> bool:
        return self in (Weekday.SATURDAY, Weekday.SUNDAY)

    def is_workday(self) -> bool:
        return not self.is_weekend()

# Usage
today = Weekday.SATURDAY
print(today.is_weekend())  # True
```

---

## 12. Python Pitfalls

### 12.1 Mutable Default Arguments


**Bad:**
```python
def add_item(item: str, items: list[str] = []) -> list[str]:
    items.append(item)
    return items

# Bug: the list is shared between all calls!
print(add_item("a"))  # ["a"]
print(add_item("b"))  # ["a", "b"] - unexpected!
```

**Good:**
```python
def add_item(item: str, items: list[str] | None = None) -> list[str]:
    if items is None:
        items = []
    items.append(item)
    return items

print(add_item("a"))  # ["a"]
print(add_item("b"))  # ["b"] - correct!
```

### 12.2 Float Comparison


**Bad:**
```python
result = 0.1 + 0.2
print(result == 0.3)  # False!
```

**Good:**
```python
import math
from decimal import Decimal

result = 0.1 + 0.2

# Solution 1: math.isclose
print(math.isclose(result, 0.3))  # True

# Solution 2: Decimal for precision
result = Decimal("0.1") + Decimal("0.2")
print(result == Decimal("0.3"))  # True
```

### 12.3 Variable Capture in Loops


**Bad:**
```python
multipliers = []
for i in range(5):
    multipliers.append(lambda x: x * i)

# All functions use i=4!
print([m(2) for m in multipliers])  # [8, 8, 8, 8, 8]
```

**Good:**
```python
multipliers = []
for i in range(5):
    multipliers.append(lambda x, i=i: x * i)  # Capture via default

print([m(2) for m in multipliers])  # [0, 2, 4, 6, 8]

# Or with functools.partial
from functools import partial

def multiply(x: int, factor: int) -> int:
    return x * factor

multipliers = [partial(multiply, factor=i) for i in range(5)]
print([m(2) for m in multipliers])  # [0, 2, 4, 6, 8]
```

### 12.4 Pattern Matching Type Check


**Bad:**
```python
def process(value):
    match value:
        case int:  # Compares to the int class, not an instance!
            print("Integer")
        case str:
            print("String")
```

**Good:**
```python
def process(value):
    match value:
        case int():  # Matches an int instance
            print("Integer")
        case str():
            print("String")
```

---

## 13. Project Structure

### 13.1 Recommended Layout


**Good:**
```
my_project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── core/
│       │   ├── __init__.py
│       │   └── models.py
│       ├── services/
│       │   ├── __init__.py
│       │   └── user_service.py
│       └── api/
│           ├── __init__.py
│           └── routes.py
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   └── test_models.py
│   └── integration/
│       └── test_api.py
├── docs/
│   └── README.md
├── pyproject.toml
├── .gitignore
└── LICENSE
```

### 13.2 __init__.py for Simplified Imports


**Good:**
```python
# src/my_package/core/__init__.py
from .models import User, Order, Product

# src/my_package/__init__.py
from .core import User, Order, Product
from .services import UserService

# Simplified usage
from my_package import User, UserService
```

---

## 14. Dataclasses vs Pydantic vs attrs

### 14.1 Dataclasses (Standard Library)


**Good:**
```python
from dataclasses import dataclass, field

@dataclass
class User:
    name: str
    email: str
    age: int
    tags: list[str] = field(default_factory=list)

# No runtime validation - fast but less safe
user = User(name="Arjan", email="arjan@example.com", age=30)
```

### 14.2 Pydantic (Validation)


**Good:**
```python
from pydantic import BaseModel, EmailStr, field_validator

class User(BaseModel):
    name: str
    email: EmailStr
    age: int

    @field_validator("age")
    @classmethod
    def validate_age(cls, v: int) -> int:
        if v < 0 or v > 150:
            raise ValueError("Age must be between 0 and 150")
        return v

# Automatic validation
user = User(name="Arjan", email="arjan@example.com", age=30)

# Easy serialization
print(user.model_dump_json())
```

### 14.3 When to Use What

**General rule:**
- **Dataclasses**: Internal data, lightweight structures, performance-critical
- **Pydantic**: APIs, configs, external data validation, serialization
- **attrs**: Need validation without Pydantic, performance with slots

---

## 15. Custom Collections

### 15.1 Using collections.abc


**Bad:**
```python
class MyList(list):
    def __init__(self, *args):
        super().__init__(*args)

    def append(self, item):
        print(f"Adding {item}")
        super().append(item)

# Problem: some methods can bypass append()
my_list = MyList()
my_list += [1, 2, 3]  # Doesn't call append()!
```

**Good:**
```python
from collections.abc import MutableSequence

class MyList(MutableSequence):
    def __init__(self):
        self._items: list = []

    def __getitem__(self, index):
        return self._items[index]

    def __setitem__(self, index, value):
        self._items[index] = value

    def __delitem__(self, index):
        del self._items[index]

    def __len__(self):
        return len(self._items)

    def insert(self, index, value):
        print(f"Adding {value}")
        self._items.insert(index, value)

# All methods (append, extend, etc.) go through insert()
```

---

## 16. Context Managers

### 16.1 Class-based Context Manager


**Good:**
```python
class DatabaseConnection:
    def __init__(self, connection_string: str) -> None:
        self.connection_string = connection_string
        self.connection = None

    def __enter__(self):
        self.connection = create_connection(self.connection_string)
        return self.connection

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.connection:
            self.connection.close()
        return False  # Don't suppress exceptions

# Usage
with DatabaseConnection("postgresql://localhost/db") as conn:
    conn.execute("SELECT * FROM users")
# Connection automatically closed
```

### 16.2 Generator-based Context Manager


**Good:**
```python
from contextlib import contextmanager
import time

@contextmanager
def timer(name: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{name} took {elapsed:.4f} seconds")

# Usage
with timer("database query"):
    result = database.query("SELECT * FROM users")
```

---

## 17. Function Optimization

### 17.1 Single Responsibility


**Bad:**
```python
def checkout(card: Card, cart: Cart) -> bool:
    # Card validation (20 lines)
    if not card.number or len(card.number) != 16:
        return False
    # CVV validation (10 lines)
    # Funds verification (15 lines)
    # Payment processing (20 lines)
    return True
```

**Good:**
```python
def checkout(card: Card, cart: Cart) -> None:
    validate_card(card)
    validate_cart(cart)
    charge_card(card, cart.total)

def validate_card(card: Card) -> None:
    validate_card_number(card.number)
    validate_expiry_date(card.exp_date)
    validate_cvv(card.cvv)

def validate_card_number(number: str) -> None:
    if not number or len(number) != 16:
        raise ValueError("Invalid card number")
```

### 17.2 Pass Only Necessary Data


**Bad:**
```python
def validate_funds(card: Card, cart: Cart) -> bool:
    # Depends on complete Card and Cart
    return card.balance >= cart.total
```

**Good:**
```python
def validate_funds(balance: int, total: int) -> bool:
    # Depends only on the necessary values
    return balance >= total

# Call
validate_funds(card.balance, cart.total)
```

---

## Sources

This skill is based on Arjan Codes content:
- [ArjanCodes Blog](https://arjancodes.com/blog/)
- [SOLID Principles in Python](https://arjancodes.com/blog/solid-principles-in-python-programming/)
- [Python Code Smells](https://arjancodes.com/blog/best-practices-for-eliminating-python-code-smells/)
- [Type Hinting](https://arjancodes.com/blog/how-to-improve-python-code-with-type-hinting/)
- [Dependency Injection](https://arjancodes.com/blog/python-dependency-injection-best-practices/)
- [Composition vs Inheritance](https://arjancodes.com/blog/composition-over-inheritance-in-software-development/)
- [Functools](https://arjancodes.com/blog/python-functools-module-for-code-optimization/)
- [Itertools](https://arjancodes.com/blog/python-itertools-module-tutorial-for-efficient-data-handling/)
- [Hypothesis Testing](https://arjancodes.com/blog/how-to-use-property-based-testing-in-python-with-hypothesis/)
- [Python Logging](https://arjancodes.com/blog/how-to-set-up-python-logging-module/)
- [Python Enums](https://arjancodes.com/blog/python-enum-classes-for-managing-constants/)
- [Python Pitfalls](https://arjancodes.com/blog/python-common-pitfalls-and-fixes-for-syntactic-snafus/)
- [Project Structure](https://arjancodes.com/blog/guide-to-structuring-python-projects/)
- [Custom Collections](https://arjancodes.com/blog/best-practices-for-python-custom-collections/)
- [Function Optimization](https://arjancodes.com/blog/python-function-optimization-tips-for-better-code-maintainability/)
