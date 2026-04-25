# ORM Best Practices (SQLAlchemy/SQLModel)

## Contents

1. [Engine Setup](#1-engine-setup)
2. [Model Definition](#2-model-definition)
3. [Relationships](#3-relationships)
4. [Query Patterns](#4-query-patterns)
5. [Session Management](#5-session-management)
6. [Transactions](#6-transactions)
7. [Migrations](#7-migrations)
8. [Testing](#8-testing)
9. [Performance](#9-performance)

---

## 1. Engine Setup

**Bad:**
```python
def get_users():
    engine = create_engine(DATABASE_URL)  # New engine per call!
    with Session(engine) as session:
        return session.exec(select(User)).all()
```

**Good:**
```python
# database.py - Single engine for entire app
from sqlmodel import create_engine, Session

DATABASE_URL = "postgresql://user:pass@localhost/db"

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Verify connections before use
    pool_size=5,             # Connection pool size
    max_overflow=10,         # Extra connections when pool exhausted
)

def get_session():
    with Session(engine) as session:
        yield session
```

### SQLite-specific

```python
# SQLite requires this for multi-threading
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)
```

---

## 2. Model Definition

**Bad:**
```python
class User(SQLModel, table=True):
    id: int  # Required on create - breaks inserts
    name: str
    email: str
```

**Good:**
```python
from datetime import datetime
from sqlmodel import SQLModel, Field

class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, min_length=1, max_length=100)
    email: str = Field(unique=True, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime | None = Field(default=None)
```

### Field Options

```python
Field(
    primary_key=True,      # Primary key
    foreign_key="table.id", # Foreign key reference
    unique=True,           # Unique constraint
    index=True,            # Create index
    nullable=False,        # NOT NULL (default for required fields)
    default=None,          # Default value
    default_factory=list,  # Factory for mutable defaults
)
```

---

## 3. Relationships

### One-to-Many

```python
class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str

    heroes: list["Hero"] = Relationship(back_populates="team")

class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    team_id: int | None = Field(default=None, foreign_key="team.id")

    team: Team | None = Relationship(back_populates="heroes")
```

### Many-to-Many

```python
class HeroSkillLink(SQLModel, table=True):
    hero_id: int = Field(foreign_key="hero.id", primary_key=True)
    skill_id: int = Field(foreign_key="skill.id", primary_key=True)

class Hero(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    skills: list["Skill"] = Relationship(
        back_populates="heroes",
        link_model=HeroSkillLink
    )

class Skill(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    heroes: list["Hero"] = Relationship(
        back_populates="skills",
        link_model=HeroSkillLink
    )
```

---

## 4. Query Patterns

### Basic Queries

```python
from sqlmodel import select

# Get all
users = session.exec(select(User)).all()

# Get by ID
user = session.get(User, user_id)

# Filter
active_users = session.exec(
    select(User).where(User.is_active == True)
).all()

# Multiple conditions
results = session.exec(
    select(User)
    .where(User.is_active == True)
    .where(User.age >= 18)
).all()

# Order by
users = session.exec(
    select(User).order_by(User.created_at.desc())
).all()

# Pagination
users = session.exec(
    select(User).offset(offset).limit(limit)
).all()
```

### N+1 Problem

**Bad:**
```python
heroes = session.exec(select(Hero)).all()
for hero in heroes:
    print(hero.team.name)  # Separate query per hero!
```

**Good (eager loading):**
```python
from sqlalchemy.orm import selectinload, joinedload

# selectinload: Separate IN query (good for collections)
statement = select(Hero).options(selectinload(Hero.skills))

# joinedload: Single JOIN query (good for single relations)
statement = select(Hero).options(joinedload(Hero.team))

heroes = session.exec(statement).all()
```

### Complex Queries

```python
from sqlmodel import func, col

# Count
count = session.exec(select(func.count(User.id))).one()

# Aggregate
avg_age = session.exec(select(func.avg(User.age))).one()

# Group by
stats = session.exec(
    select(User.team_id, func.count(User.id))
    .group_by(User.team_id)
).all()

# Subquery
subquery = select(func.max(Score.value)).where(Score.user_id == User.id)
users_with_max = session.exec(
    select(User, subquery.scalar_subquery().label("max_score"))
).all()
```

---

## 5. Session Management

**Bad:**
```python
session = Session(engine)
user = session.get(User, 1)
# Forgot to close!

# Or manual close without error handling
session = Session(engine)
try:
    user = session.get(User, 1)
finally:
    session.close()
```

**Good:**
```python
# Context manager (auto-closes)
with Session(engine) as session:
    user = session.get(User, 1)
    session.add(new_user)
    session.commit()

# Or as generator for dependency injection
def get_session():
    with Session(engine) as session:
        yield session
```

### Session Lifecycle

```python
with Session(engine) as session:
    # 1. Query (attached to session)
    user = session.get(User, 1)

    # 2. Modify
    user.name = "New Name"

    # 3. Commit changes
    session.commit()

    # 4. Refresh to get updated values from DB
    session.refresh(user)
```

---

## 6. Transactions

**Bad:**
```python
def transfer(from_id: int, to_id: int, amount: float, session: Session):
    from_acc = session.get(Account, from_id)
    from_acc.balance -= amount
    session.commit()  # Partial commit!

    to_acc = session.get(Account, to_id)
    to_acc.balance += amount
    session.commit()
```

**Good:**
```python
def transfer(from_id: int, to_id: int, amount: float, session: Session):
    from_acc = session.get(Account, from_id)
    to_acc = session.get(Account, to_id)

    if from_acc.balance < amount:
        raise ValueError("Insufficient funds")

    from_acc.balance -= amount
    to_acc.balance += amount
    session.commit()  # Atomic commit
```

### Rollback on Error

```python
def create_order(order_data: dict, session: Session):
    try:
        order = Order(**order_data)
        session.add(order)

        for item in order_data["items"]:
            session.add(OrderItem(**item, order_id=order.id))

        session.commit()
        return order
    except Exception:
        session.rollback()
        raise
```

### Nested Transactions (Savepoints)

```python
with Session(engine) as session:
    session.add(user)

    with session.begin_nested():  # Savepoint
        try:
            session.add(risky_item)
            session.commit()
        except Exception:
            session.rollback()  # Only rolls back to savepoint

    session.commit()  # User still saved
```

---

## 7. Migrations

### Alembic Setup

```bash
pip install alembic
alembic init alembic
```

**alembic/env.py:**
```python
from sqlmodel import SQLModel
from app.models import User, Team, Hero  # Import ALL models
from app.database import DATABASE_URL

config.set_main_option("sqlalchemy.url", DATABASE_URL)
target_metadata = SQLModel.metadata
```

### Commands

```bash
# Generate migration from model changes
alembic revision --autogenerate -m "Add users table"

# Apply all pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# Show current revision
alembic current

# Show migration history
alembic history
```

### Migration File

```python
# alembic/versions/001_add_users.py
def upgrade():
    op.create_table(
        'user',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(), nullable=False, unique=True),
        sa.Column('name', sa.String(), nullable=False),
    )
    op.create_index('ix_user_email', 'user', ['email'])

def downgrade():
    op.drop_index('ix_user_email')
    op.drop_table('user')
```

---

## 8. Testing

### In-Memory Database

```python
import pytest
from sqlmodel import create_engine, Session, SQLModel
from sqlmodel.pool import StaticPool

@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",  # In-memory
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # Single connection for all threads
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def test_create_user(session: Session):
    user = User(name="Test", email="test@example.com")
    session.add(user)
    session.commit()

    db_user = session.get(User, user.id)
    assert db_user.name == "Test"
```

### Test Fixtures

```python
@pytest.fixture
def sample_team(session: Session) -> Team:
    team = Team(name="Avengers")
    session.add(team)
    session.commit()
    session.refresh(team)
    return team

@pytest.fixture
def sample_hero(session: Session, sample_team: Team) -> Hero:
    hero = Hero(name="Iron Man", team_id=sample_team.id)
    session.add(hero)
    session.commit()
    session.refresh(hero)
    return hero

def test_hero_belongs_to_team(sample_hero: Hero, sample_team: Team):
    assert sample_hero.team_id == sample_team.id
```

---

## 9. Performance

### Indexes

```python
class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True)  # Single column index
    name: str

    __table_args__ = (
        Index("ix_user_name_email", "name", "email"),  # Composite index
    )
```

### Bulk Operations

**Bad:**
```python
for item in items:
    session.add(Item(**item))
    session.commit()  # Commit per item!
```

**Good:**
```python
# Batch insert
session.add_all([Item(**item) for item in items])
session.commit()

# Or bulk insert (faster, no ORM events)
session.exec(insert(Item).values(items))
session.commit()
```

### Lazy Loading Control

```python
class Hero(SQLModel, table=True):
    # Lazy (default): Load on access
    team: Team | None = Relationship()

    # Joined: Always load with parent
    team: Team | None = Relationship(sa_relationship_kwargs={"lazy": "joined"})

    # Select: Load via separate query on access
    skills: list[Skill] = Relationship(sa_relationship_kwargs={"lazy": "selectin"})
```

---

## Sources

- [SQLModel Documentation](https://sqlmodel.tiangolo.com/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/en/20/orm/)
- [Dependency Injection](https://arjancodes.com/blog/python-dependency-injection-best-practices/)
- [FastAPI SQL Databases](https://fastapi.tiangolo.com/tutorial/sql-databases/)
