from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

# User Schemas
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    openai_key: Optional[str] = None
    gemini_key: Optional[str] = None

class ForgotPassword(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token: str
    new_password: str

# Workspace Schemas
class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Folder Schemas
class FolderCreate(BaseModel):
    name: str
    workspace_id: str
    parent_id: Optional[str] = None

class FolderResponse(BaseModel):
    id: str
    name: str
    workspace_id: str
    parent_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Tag Schemas
class TagResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True

# Document Schemas
class DocumentRename(BaseModel):
    name: str

class DocumentResponse(BaseModel):
    id: str
    name: str
    file_type: str
    file_size: int
    num_pages: int
    ai_status: str
    is_favorite: bool
    workspace_id: str
    folder_id: Optional[str] = None
    tags: List[TagResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Bookmark Schemas
class BookmarkCreate(BaseModel):
    document_id: str
    page_number: Optional[int] = None
    type: str # page, paragraph, note, chat
    content: str

class BookmarkResponse(BaseModel):
    id: str
    user_id: str
    document_id: str
    page_number: Optional[int] = None
    type: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

# Note Schemas
class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = None
    workspace_id: str
    document_id: Optional[str] = None

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class NoteResponse(BaseModel):
    id: str
    title: str
    content: Optional[str] = None
    workspace_id: str
    document_id: Optional[str] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Chat Schemas
class ChatMessageCreate(BaseModel):
    content: str

class ChatMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: Optional[List[Dict[str, Any]]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatConversationCreate(BaseModel):
    title: str
    workspace_id: str
    document_ids: List[str] = []

class ChatConversationResponse(BaseModel):
    id: str
    title: str
    workspace_id: str
    owner_id: str
    is_multi_doc: bool
    created_at: datetime
    updated_at: datetime
    documents: List[DocumentResponse] = []

    class Config:
        from_attributes = True

# Flashcard Schemas
class FlashcardCreate(BaseModel):
    question: str
    answer: str
    document_id: str
    workspace_id: str

class FlashcardResponse(BaseModel):
    id: str
    question: str
    answer: str
    document_id: str
    workspace_id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Quiz Schemas
class QuizCreate(BaseModel):
    title: str
    questions: List[Dict[str, Any]]
    document_id: str
    workspace_id: str

class QuizResponse(BaseModel):
    id: str
    title: str
    questions: List[Dict[str, Any]]
    document_id: str
    workspace_id: str
    created_at: datetime

    class Config:
        from_attributes = True

# Activity Logs
class ActivityLogResponse(BaseModel):
    id: str
    action: str
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Dashboard/Stats
class DashboardStatsResponse(BaseModel):
    total_documents: int
    recent_uploads: List[DocumentResponse]
    ai_conversations_count: int
    flashcards_count: int
    quizzes_count: int
    storage_used_bytes: int
    activity_timeline: List[ActivityLogResponse]
