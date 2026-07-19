from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.all_models import User
from app.schemas.all_schemas import WorkspaceCreate, WorkspaceResponse, FolderCreate, FolderResponse
from app.repositories.all_repositories import WorkspaceRepository, FolderRepository, ActivityRepository

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

@router.get("", response_model=List[WorkspaceResponse])
def list_workspaces(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get user's workspaces
    workspaces = WorkspaceRepository.get_by_user(db, current_user.id)
    # If user has no workspaces, create a default one to improve onboarding UX!
    if not workspaces:
        default_ws = WorkspaceRepository.create(
            db, 
            name="My Workspace", 
            description="Default workspace created automatically.", 
            owner_id=current_user.id
        )
        workspaces = [default_ws]
        ActivityRepository.log(db, current_user.id, "create_workspace", "Default workspace auto-created")
    return workspaces

@router.post("", response_model=WorkspaceResponse)
def create_workspace(ws_in: WorkspaceCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = WorkspaceRepository.create(db, name=ws_in.name, description=ws_in.description, owner_id=current_user.id)
    ActivityRepository.log(db, current_user.id, "create_workspace", f"Created workspace: {ws.name}")
    return ws

@router.delete("/{ws_id}")
def delete_workspace(ws_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = WorkspaceRepository.get_by_id(db, ws_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this workspace")
        
    WorkspaceRepository.delete(db, ws_id)
    ActivityRepository.log(db, current_user.id, "delete_workspace", f"Deleted workspace ID: {ws_id}")
    return {"message": "Workspace deleted successfully"}

# Folders inside workspace
@router.get("/{ws_id}/folders", response_model=List[FolderResponse])
def list_folders(ws_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = WorkspaceRepository.get_by_id(db, ws_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return FolderRepository.get_by_workspace(db, ws_id)

@router.post("/{ws_id}/folders", response_model=FolderResponse)
def create_folder(ws_id: str, folder_in: FolderCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = WorkspaceRepository.get_by_id(db, ws_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    folder = FolderRepository.create(db, name=folder_in.name, workspace_id=ws_id, parent_id=folder_in.parent_id)
    ActivityRepository.log(db, current_user.id, "create_folder", f"Created folder {folder.name} in workspace {ws.name}")
    return folder

@router.delete("/{ws_id}/folders/{folder_id}")
def delete_folder(ws_id: str, folder_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = WorkspaceRepository.get_by_id(db, ws_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    FolderRepository.delete(db, folder_id)
    ActivityRepository.log(db, current_user.id, "delete_folder", f"Deleted folder ID {folder_id}")
    return {"message": "Folder deleted successfully"}
