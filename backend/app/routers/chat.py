from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.all_models import User
from app.schemas.all_schemas import (
    ChatConversationCreate, ChatConversationResponse, 
    ChatMessageCreate, ChatMessageResponse
)
from app.repositories.all_repositories import ChatRepository, WorkspaceRepository, ActivityRepository
from app.services.llm_service import LLMService

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.get("/conversations", response_model=List[ChatConversationResponse])
def list_conversations(
    workspace_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return ChatRepository.get_conversations_by_workspace(db, workspace_id)

@router.post("/conversations", response_model=ChatConversationResponse)
def create_conversation(
    conv_in: ChatConversationCreate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, conv_in.workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
        
    conv = ChatRepository.create_conversation(
        db,
        title=conv_in.title,
        workspace_id=conv_in.workspace_id,
        owner_id=current_user.id,
        document_ids=conv_in.document_ids
    )
    ActivityRepository.log(db, current_user.id, "create_chat", f"Created chat: {conv.title}")
    return conv

@router.get("/conversations/{conv_id}", response_model=ChatConversationResponse)
def get_conversation(
    conv_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    conv = ChatRepository.get_conversation(db, conv_id)
    if not conv or conv.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Chat access denied")
    return conv

@router.get("/conversations/{conv_id}/messages", response_model=List[ChatMessageResponse])
def get_messages(
    conv_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    conv = ChatRepository.get_conversation(db, conv_id)
    if not conv or conv.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Chat access denied")
    return ChatRepository.get_messages(db, conv_id)

@router.post("/conversations/{conv_id}/messages", response_model=ChatMessageResponse)
def send_message(
    conv_id: str,
    msg_in: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    conv = ChatRepository.get_conversation(db, conv_id)
    if not conv or conv.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Chat access denied")
        
    if not conv.documents:
        raise HTTPException(status_code=400, detail="This conversation has no linked documents to query.")

    # 1. Fetch History
    past_messages = ChatRepository.get_messages(db, conv_id)
    history_list = [{"role": m.role, "content": m.content} for m in past_messages]

    # 2. Add user message to database
    ChatRepository.add_message(db, conversation_id=conv_id, role="user", content=msg_in.content)

    # 3. Call RAG Chat LLM Service
    document_ids = [doc.id for doc in conv.documents]
    response_content, citations = LLMService.answer_document_query(
        document_ids=document_ids,
        query=msg_in.content,
        history=history_list,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )

    # 4. Save Assistant response to database
    assistant_msg = ChatRepository.add_message(
        db, 
        conversation_id=conv_id, 
        role="assistant", 
        content=response_content, 
        citations=citations
    )

    ActivityRepository.log(db, current_user.id, "ask_ai", f"Asked AI in conversation: {conv.title}")
    return assistant_msg
