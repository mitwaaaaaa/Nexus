from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.all_models import User, Document, ChatConversation, Note, ActivityLog
from app.schemas.all_schemas import UserResponse, ActivityLogResponse
from app.repositories.all_repositories import UserRepository, ActivityRepository

router = APIRouter(prefix="/api/admin", tags=["admin"])

def check_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires administrative privileges."
        )
    return current_user

@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db), 
    admin: User = Depends(check_admin)
):
    return db.query(User).all()

@router.put("/users/{user_id}/status")
def toggle_user_status(
    user_id: str, 
    db: Session = Depends(get_db), 
    admin: User = Depends(check_admin)
):
    user = UserRepository.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    
    status_str = "activated" if user.is_active else "deactivated"
    ActivityRepository.log(db, admin.id, "admin_action", f"Admin {status_str} user {user.email}")
    return {"message": f"User status updated to {status_str}.", "is_active": user.is_active}

@router.get("/logs", response_model=List[ActivityLogResponse])
def get_all_logs(
    db: Session = Depends(get_db), 
    admin: User = Depends(check_admin)
):
    return ActivityRepository.get_all(db, limit=100)

@router.get("/metrics")
def get_system_metrics(
    db: Session = Depends(get_db), 
    admin: User = Depends(check_admin)
):
    total_users = db.query(User).count()
    total_docs = db.query(Document).count()
    total_chats = db.query(ChatConversation).count()
    total_notes = db.query(Note).count()
    
    all_docs = db.query(Document).all()
    total_storage = sum([d.file_size for d in all_docs])
    
    return {
        "total_users": total_users,
        "total_documents": total_docs,
        "total_chats": total_chats,
        "total_notes": total_notes,
        "total_storage_bytes": total_storage
    }
