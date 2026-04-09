"""Generic base repository for common data access patterns."""

from collections.abc import Sequence
from typing import Any, ClassVar, Generic, TypeVar

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.expression import ColumnElement

from app.models.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic repository providing common CRUD operations.

    Subclasses must set the `model` class variable to their SQLAlchemy model class.
    Never calls commit() — transaction management stays in the router/dependency layer.
    """

    model: ClassVar[type[Any]]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, entity_id: int) -> T | None:
        result = await self._session.execute(
            select(self.model).where(self.model.id == entity_id)
        )
        return result.scalar_one_or_none()

    async def get_by_field(
        self, field: InstrumentedAttribute[Any], value: Any
    ) -> T | None:
        result = await self._session.execute(
            select(self.model).where(field == value)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        *,
        order_by: InstrumentedAttribute[Any] | None = None,
        descending: bool = True,
    ) -> list[T]:
        stmt = select(self.model)
        if order_by is not None:
            stmt = stmt.order_by(
                order_by.desc() if descending else order_by.asc()
            )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_many(self, ids: list[int]) -> list[T]:
        if not ids:
            return []
        result = await self._session.execute(
            select(self.model).where(self.model.id.in_(ids))
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> T:
        entity = self.model(**kwargs)
        self._session.add(entity)
        return await self.flush_and_refresh(entity)

    async def update(self, entity: T, **kwargs: Any) -> T:
        for key, value in kwargs.items():
            setattr(entity, key, value)
        return await self.flush_and_refresh(entity)

    async def delete(self, entity: T) -> None:
        await self._session.delete(entity)
        await self._session.flush()

    async def delete_many(
        self, ids: list[int]
    ) -> tuple[list[int], list[int]]:
        """Delete entities by IDs. Returns (deleted_ids, missing_ids)."""
        if not ids:
            return [], []
        existing = await self.get_many(ids)
        existing_ids = {getattr(e, "id") for e in existing}
        deleted_ids: list[int] = []
        missing_ids: list[int] = [i for i in ids if i not in existing_ids]
        for entity in existing:
            await self._session.delete(entity)
            deleted_ids.append(getattr(entity, "id"))
        await self._session.flush()
        return deleted_ids, missing_ids

    async def list_paginated(
        self,
        *,
        filters: Sequence[ColumnElement[Any]] | None = None,
        sort_column: InstrumentedAttribute[Any] | None = None,
        sort_dir: str = "desc",
        offset: int = 0,
        limit: int = 50,
    ) -> list[T]:
        stmt = select(self.model)
        if filters:
            stmt = stmt.where(and_(*filters))
        if sort_column is not None:
            direction = sort_column.desc() if sort_dir == "desc" else sort_column.asc()
            stmt = stmt.order_by(direction)
        stmt = stmt.offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def count(
        self, *, filters: Sequence[ColumnElement[Any]] | None = None
    ) -> int:
        stmt = select(func.count()).select_from(self.model)
        if filters:
            stmt = stmt.where(and_(*filters))
        result = await self._session.execute(stmt)
        return result.scalar_one()

    async def flush_and_refresh(self, entity: T) -> T:
        await self._session.flush()
        await self._session.refresh(entity)
        return entity

    @staticmethod
    def resolve_sort(
        sort_by: str | None,
        allowed: dict[str, InstrumentedAttribute[Any]],
        default: InstrumentedAttribute[Any],
    ) -> InstrumentedAttribute[Any]:
        """Resolve a string sort key to a column expression."""
        if sort_by is None:
            return default
        column = allowed.get(sort_by)
        if column is None:
            raise ValueError(f"Invalid sort_by: {sort_by}")
        return column
