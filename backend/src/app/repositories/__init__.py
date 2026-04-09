"""Repository layer for data access abstraction."""

from app.repositories.alert import AlertRepository
from app.repositories.base import BaseRepository

__all__ = ["AlertRepository", "BaseRepository"]
