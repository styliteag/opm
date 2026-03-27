"""Alert comment CRUD endpoints."""

from fastapi import APIRouter, Body, HTTPException, status

from app.core.deps import AnalystUser, CurrentUser, DbSession
from app.models.user import UserRole
from app.schemas.alert_comment import (
    AlertCommentCreate,
    AlertCommentListResponse,
    AlertCommentResponse,
    AlertCommentUpdate,
)
from app.services import alert_comments as alert_comments_service

router = APIRouter()


@router.post(
    "/{alert_id}/comments",
    response_model=AlertCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    user: AnalystUser,
    db: DbSession,
    alert_id: int,
    body: AlertCommentCreate,
) -> AlertCommentResponse:
    """Create a new comment on an alert."""
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    comment = await alert_comments_service.create_comment(
        db=db, alert_id=alert_id, user_id=user.id, comment=body.comment
    )
    await db.commit()
    await db.refresh(comment)

    return AlertCommentResponse(
        id=comment.id,
        alert_id=comment.alert_id,
        user_id=comment.user_id,
        user_email=user.email,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/{alert_id}/comments", response_model=AlertCommentListResponse)
async def list_comments(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
) -> AlertCommentListResponse:
    """List all comments for an alert."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get all comments for the alert
    comments_with_email = await alert_comments_service.get_comments_for_alert(db, alert_id)

    return AlertCommentListResponse(
        comments=[
            AlertCommentResponse(
                id=comment.id,
                alert_id=comment.alert_id,
                user_id=comment.user_id,
                user_email=email,
                comment=comment.comment,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
            )
            for comment, email in comments_with_email
        ]
    )


@router.patch("/{alert_id}/comments/{comment_id}", response_model=AlertCommentResponse)
async def update_comment(
    user: AnalystUser,
    db: DbSession,
    alert_id: int,
    comment_id: int,
    request: AlertCommentUpdate = Body(...),
) -> AlertCommentResponse:
    """Update a comment. Only the comment author or an admin can update."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get the comment
    comment_with_email = await alert_comments_service.get_comment_by_id(db, comment_id)
    if comment_with_email is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, email = comment_with_email

    # Verify comment belongs to this alert
    if comment.alert_id != alert_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check permission: only author or admin can update
    if comment.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    # Update the comment
    comment = await alert_comments_service.update_comment(db, comment, request.comment)
    await db.commit()
    await db.refresh(comment)

    return AlertCommentResponse(
        id=comment.id,
        alert_id=comment.alert_id,
        user_id=comment.user_id,
        user_email=email,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete(
    "/{alert_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    user: AnalystUser,
    db: DbSession,
    alert_id: int,
    comment_id: int,
) -> None:
    """Delete a comment. Only the comment author or an admin can delete."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get the comment
    comment_with_email = await alert_comments_service.get_comment_by_id(db, comment_id)
    if comment_with_email is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, _ = comment_with_email

    # Verify comment belongs to this alert
    if comment.alert_id != alert_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check permission: only author or admin can delete
    if comment.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    # Delete the comment
    await alert_comments_service.delete_comment(db, comment)
    await db.commit()
