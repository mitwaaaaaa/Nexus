from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.all_models import User
from app.schemas.all_schemas import NoteCreate, NoteUpdate, NoteResponse
from app.repositories.all_repositories import NoteRepository, WorkspaceRepository, ActivityRepository
from app.services.llm_service import LLMService

router = APIRouter(prefix="/api/notes", tags=["notes"])

class AIImproveRequest(BaseModel):
    prompt_instruction: str # "expand", "summarize", "fix_grammar", "add_examples", "simplify", "add_analogy"

@router.get("", response_model=List[NoteResponse])
def list_notes(
    workspace_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return NoteRepository.get_by_workspace(db, workspace_id)

@router.post("", response_model=NoteResponse)
def create_note(
    note_in: NoteCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, note_in.workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
        
    note = NoteRepository.create(
        db,
        title=note_in.title,
        content=note_in.content,
        workspace_id=note_in.workspace_id,
        document_id=note_in.document_id,
        owner_id=current_user.id
    )
    ActivityRepository.log(db, current_user.id, "create_note", f"Created note: {note.title}")
    return note

@router.get("/{note_id}", response_model=NoteResponse)
def get_note(
    note_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    note = NoteRepository.get_by_id(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Note access denied")
    return note

@router.put("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: str,
    note_in: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = NoteRepository.get_by_id(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Note access denied")
        
    updated = NoteRepository.update(db, note, note_in.model_dump(exclude_unset=True))
    return updated

@router.delete("/{note_id}")
def delete_note(
    note_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    note = NoteRepository.get_by_id(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Note access denied")
        
    NoteRepository.delete(db, note_id)
    ActivityRepository.log(db, current_user.id, "delete_note", f"Deleted note ID: {note_id}")
    return {"message": "Note deleted successfully"}

@router.post("/{note_id}/ai-improve", response_model=NoteResponse)
def ai_improve_note(
    note_id: str,
    req: AIImproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = NoteRepository.get_by_id(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Note access denied")

    instruction_map = {
        "expand": "Expand the details, elaborate on key topics, and add thorough explanations.",
        "summarize": "Condense the notes into a highly compact, key-takeaways summary.",
        "fix_grammar": "Improve the grammar, readability, flow, and professional tone.",
        "add_examples": "Add practical real-world code snippets, concrete examples, or equations to demonstrate the concepts.",
        "simplify": "Simplify the language, making it extremely clear and easy to understand.",
        "add_analogy": "Incorporate clear analogies to explain complex theories or terms."
    }

    instruction = instruction_map.get(req.prompt_instruction, req.prompt_instruction)
    
    prompt = (
        f"You are an AI editor inside a rich markdown workspace. Improve the following markdown text according to these instructions:\n"
        f"Instructions: {instruction}\n\n"
        f"Original Markdown:\n{note.content}\n\n"
        f"Improved Markdown Output:"
    )

    improved_content = LLMService._call_llm(
        prompt=prompt,
        system_instruction="You are a markdown editor. Return ONLY the updated markdown content without any surrounding explanations, intro, or triple backticks unless part of codeblocks.",
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )

    updated = NoteRepository.update(db, note, {"content": improved_content})
    ActivityRepository.log(db, current_user.id, "ai_improve_note", f"AI improved note: {note.title} using {req.prompt_instruction}")
    return updated
