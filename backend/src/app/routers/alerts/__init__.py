"""Alerts management endpoints — split into focused sub-routers."""

from fastapi import APIRouter

from .actions import router as actions_router
from .comments import router as comments_router
from .detail import router as detail_router
from .list import router as list_router
from .workflow import router as workflow_router

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# Order matters: static paths before parameterised ones.
router.include_router(list_router)
router.include_router(actions_router)
router.include_router(comments_router)
router.include_router(workflow_router)
router.include_router(detail_router)
