# FastAPI Best Practices

## Contents

1. [Lifespan & App State](#1-lifespan--app-state)
2. [Middleware](#2-middleware)
3. [Model Separation](#3-model-separation)
4. [Dependencies](#4-dependencies)
5. [Routers](#5-routers)
6. [CRUD Patterns](#6-crud-patterns)
7. [Error Handling](#7-error-handling)
8. [Testing](#8-testing)

For ORM/database patterns, see [orm.md](orm.md).

---

## 1. Lifespan & App State

Use the lifespan context manager for startup/shutdown logic and store shared resources in `app.state`:

**Bad:**
```python
# Global engine - hard to test, no cleanup
engine = create_async_engine(connection_string)

@app.on_event("startup")  # Deprecated
async def startup():
    pass
```

**Good:**
```python
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: initialize resources
    engine = create_async_engine(
        settings.database_url,
        pool_size=20,
        max_overflow=30,
        pool_pre_ping=True,
    )
    app.state.db_engine = engine

    yield

    # Shutdown: cleanup
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

# Access via Request in dependencies
def get_engine(request: Request) -> AsyncEngine:
    return request.app.state.db_engine
```

---

## 2. Middleware

### Standard Middleware Stack

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

app = FastAPI(lifespan=lifespan)

# Order matters: first added = outermost (executed first on request, last on response)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
```

### Custom Middleware

```python
from fastapi import Request
from typing import Any
import time

@app.middleware("http")
async def log_request_time(request: Request, call_next: Any) -> Any:
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    response.headers["X-Process-Time"] = str(elapsed)
    return response
```

---

## 3. Model Separation

Separate database models from API schemas to avoid exposing sensitive fields:

**Bad:**
```python
class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str
    password_hash: str  # Exposed in API responses!
```

**Good:**
```python
from pydantic import BaseModel, Field, field_validator

# Base with shared fields
class UserBase(BaseModel):
    email: str
    first_name: str
    last_name: str

# Database model (if using SQLModel)
class User(UserBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    password_hash: str
    created_at: datetime

# API input for creation
class UserCreate(UserBase):
    password: str

# API output (no password!)
class UserPublic(UserBase):
    id: int

    model_config = {"from_attributes": True}

# Partial updates - all fields optional
class UserUpdate(BaseModel):
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
```

### Pydantic Validators

```python
from pydantic import BaseModel, field_validator, model_validator
from typing import Self

class DashboardColumn(BaseModel):
    title: str
    width: int | str

    @field_validator("width")
    @classmethod
    def validate_width(cls, v: int | str) -> int | str:
        if isinstance(v, int) and v <= 0:
            raise ValueError("Width must be positive")
        if isinstance(v, str) and not v.endswith("px"):
            raise ValueError("String width must end with 'px'")
        return v

class BusinessPartner(BaseModel):
    name: str
    is_premium: bool | None = None
    premium_tier: str | None = None

    @model_validator(mode="after")
    def premium_requires_tier(self) -> Self:
        if self.is_premium and not self.premium_tier:
            raise ValueError("premium_tier required when is_premium is True")
        return self
```

---

## 4. Dependencies

### Type-Annotated Dependencies

```python
from typing import Annotated
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncEngine

# Engine from app state
def get_engine(request: Request) -> AsyncEngine:
    return request.app.state.db_engine

EngineDep = Annotated[AsyncEngine, Depends(get_engine)]

# Session with auto-cleanup
async def get_session(engine: EngineDep):
    async with AsyncSession(engine) as session:
        yield session

SessionDep = Annotated[AsyncSession, Depends(get_session)]
```

### Auth Dependencies

```python
from fastapi import Depends, HTTPException

async def get_current_user(
    session: SessionDep,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    user = await fetch_user_by_token(session, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

# Role-based access
async def get_admin_user(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

AdminUser = Annotated[User, Depends(get_admin_user)]
```

### Using Dependencies in Routes

```python
@router.get("/me")
async def get_me(user: CurrentUser) -> UserPublic:
    return user

@router.get("/admin/users")
async def list_users(_: AdminUser, session: SessionDep) -> list[UserPublic]:
    return await fetch_users(session)
```

---

## 5. Routers

### Router Definition

```python
from fastapi import APIRouter, Depends

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

@router.get("")
async def list_users(session: SessionDep) -> list[UserPublic]:
    return await fetch_users(session)

@router.get("/me")
async def get_current(user: CurrentUser) -> UserPublic:
    return user

@router.post("")
async def create_user(
    data: UserCreate,
    _: AdminUser,  # Requires admin
    session: SessionDep,
) -> UserPublic:
    return await create_user_in_db(session, data)
```

### Router-Level Dependencies

```python
# All routes require admin
admin_router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_admin_user)],
)
```

### Mounting Routers

```python
from fastapi import FastAPI

app = FastAPI(root_path="/api", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin_router)
```

---

## 6. CRUD Patterns

```python
from fastapi import HTTPException, Query
from typing import Annotated

# CREATE
@router.post("/", response_model=HeroPublic)
async def create_hero(hero: HeroCreate, session: SessionDep) -> Hero:
    db_hero = Hero.model_validate(hero)
    session.add(db_hero)
    await session.commit()
    await session.refresh(db_hero)
    return db_hero

# READ with pagination
@router.get("/", response_model=list[HeroPublic])
async def list_heroes(
    session: SessionDep,
    offset: int = 0,
    limit: Annotated[int, Query(le=100)] = 100,
) -> list[Hero]:
    result = await session.execute(
        select(Hero).offset(offset).limit(limit)
    )
    return result.scalars().all()

# READ single
@router.get("/{hero_id}", response_model=HeroPublic)
async def get_hero(hero_id: int, session: SessionDep) -> Hero:
    hero = await session.get(Hero, hero_id)
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    return hero

# UPDATE (partial)
@router.patch("/{hero_id}", response_model=HeroPublic)
async def update_hero(
    hero_id: int,
    data: HeroUpdate,
    session: SessionDep,
) -> Hero:
    hero = await session.get(Hero, hero_id)
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(hero, key, value)

    await session.commit()
    await session.refresh(hero)
    return hero

# DELETE
@router.delete("/{hero_id}")
async def delete_hero(hero_id: int, session: SessionDep) -> dict[str, bool]:
    hero = await session.get(Hero, hero_id)
    if not hero:
        raise HTTPException(status_code=404, detail="Hero not found")
    await session.delete(hero)
    await session.commit()
    return {"deleted": True}
```

---

## 7. Error Handling

### Always Use response_model

```python
# Bad: returns None as null, exposes all fields
@router.get("/{user_id}")
async def get_user(user_id: int, session: SessionDep):
    return await session.get(User, user_id)

# Good: validates output, filters sensitive fields
@router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: int, session: SessionDep) -> User:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### Consistent Error Responses

```python
from fastapi import HTTPException

# 400 - Bad Request (validation handled automatically by Pydantic)
# 401 - Unauthorized
raise HTTPException(status_code=401, detail="Invalid credentials")

# 403 - Forbidden
raise HTTPException(status_code=403, detail="Insufficient permissions")

# 404 - Not Found
raise HTTPException(status_code=404, detail="Resource not found")

# 409 - Conflict
raise HTTPException(status_code=409, detail="Resource already exists")
```

---

## 8. Testing

### Async Test Setup

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool

from app.main import app
from app.dependencies import get_engine

@pytest.fixture
async def engine():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def client(engine):
    def override_engine():
        return engine

    app.dependency_overrides[get_engine] = override_engine

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
```

### Test Examples

```python
@pytest.mark.anyio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/users/",
        json={"email": "test@example.com", "name": "Test"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "password_hash" not in data  # Filtered by response_model

@pytest.mark.anyio
async def test_get_user_not_found(client: AsyncClient):
    response = await client.get("/users/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"

@pytest.mark.anyio
async def test_auth_required(client: AsyncClient):
    response = await client.get("/users/me")
    assert response.status_code == 401
```

---

## Sources

- [FastAPI Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [Pydantic Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
