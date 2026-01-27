"""Service functions for alert comment CRUD operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_comment import AlertComment
from app.models.user import User


async def get_alert_by_id(db: AsyncSession, alert_id: int) -> Alert | None:
    """Get an alert by ID."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    return result.scalar_one_or_none()


async def get_comments_for_alert(
    db: AsyncSession, alert_id: int
) -> list[tuple[AlertComment, str]]:
    """Get all comments for an alert with user email."""
    result = await db.execute(
        select(AlertComment, User.email)
        .join(User, AlertComment.user_id == User.id)
        .where(AlertComment.alert_id == alert_id)
        .order_by(AlertComment.created_at.asc())
    )
    return [(row[0], row[1]) for row in result.all()]


async def get_comment_by_id(
    db: AsyncSession, comment_id: int
) -> tuple[AlertComment, str] | None:
    """Get a comment by ID with user email."""
    result = await db.execute(
        select(AlertComment, User.email)
        .join(User, AlertComment.user_id == User.id)
        .where(AlertComment.id == comment_id)
    )
    row = result.first()
    if row is None:
        return None
    return row[0], row[1]


async def create_comment(
    db: AsyncSession, alert_id: int, user_id: int, comment: str
) -> AlertComment:
    """Create a new comment on an alert."""
    alert_comment = AlertComment(
        alert_id=alert_id,
        user_id=user_id,
        comment=comment,
    )
    db.add(alert_comment)
    await db.flush()
    await db.refresh(alert_comment)
    return alert_comment


async def update_comment(
    db: AsyncSession, comment: AlertComment, new_comment: str
) -> AlertComment:
    """Update an existing comment."""
    comment.comment = new_comment
    await db.flush()
    await db.refresh(comment)
    return comment


async def delete_comment(db: AsyncSession, comment: AlertComment) -> None:
    """Delete a comment."""
    await db.delete(comment)
    await db.flush()
