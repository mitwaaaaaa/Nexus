from sqlalchemy.orm import Session
from typing import List, Optional, Type
import uuid
from app.models.all_models import (
    User, Workspace, Document, Folder, Tag, Bookmark, Note, 
    ChatConversation, ChatMessage, Flashcard, Quiz, ActivityLog, document_tags
)

def generate_id() -> str:
    return str(uuid.uuid4())

class UserRepository:
    @staticmethod
    def get_by_id(db: Session, user_id: str) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def create(db: Session, email: str, hashed_password: str, full_name: Optional[str] = None) -> User:
        user_id = generate_id()
        # First user is admin (simple default)
        is_first = db.query(User).count() == 0
        db_user = User(
            id=user_id,
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            is_admin=is_first
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def update(db: Session, user: User, data: dict) -> User:
        for key, val in data.items():
            if hasattr(user, key) and val is not None:
                setattr(user, key, val)
        db.commit()
        db.refresh(user)
        return user

class WorkspaceRepository:
    @staticmethod
    def get_by_id(db: Session, ws_id: str) -> Optional[Workspace]:
        return db.query(Workspace).filter(Workspace.id == ws_id).first()

    @staticmethod
    def get_by_user(db: Session, user_id: str) -> List[Workspace]:
        return db.query(Workspace).filter(Workspace.owner_id == user_id).all()

    @staticmethod
    def create(db: Session, name: str, description: Optional[str], owner_id: str) -> Workspace:
        ws = Workspace(id=generate_id(), name=name, description=description, owner_id=owner_id)
        db.add(ws)
        db.commit()
        db.refresh(ws)
        return ws

    @staticmethod
    def delete(db: Session, ws_id: str) -> bool:
        ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
        if ws:
            db.delete(ws)
            db.commit()
            return True
        return False

class FolderRepository:
    @staticmethod
    def get_by_workspace(db: Session, ws_id: str) -> List[Folder]:
        return db.query(Folder).filter(Folder.workspace_id == ws_id).all()

    @staticmethod
    def create(db: Session, name: str, workspace_id: str, parent_id: Optional[str] = None) -> Folder:
        folder = Folder(id=generate_id(), name=name, workspace_id=workspace_id, parent_id=parent_id)
        db.add(folder)
        db.commit()
        db.refresh(folder)
        return folder

    @staticmethod
    def delete(db: Session, folder_id: str) -> bool:
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if folder:
            db.delete(folder)
            db.commit()
            return True
        return False

class DocumentRepository:
    @staticmethod
    def get_by_id(db: Session, doc_id: str) -> Optional[Document]:
        return db.query(Document).filter(Document.id == doc_id).first()

    @staticmethod
    def get_by_workspace(db: Session, ws_id: str, folder_id: Optional[str] = None) -> List[Document]:
        query = db.query(Document).filter(Document.workspace_id == ws_id)
        if folder_id:
            query = query.filter(Document.folder_id == folder_id)
        return query.all()

    @staticmethod
    def create(db: Session, name: str, file_type: str, file_path: str, file_size: int, workspace_id: str, folder_id: Optional[str] = None) -> Document:
        doc = Document(
            id=generate_id(),
            name=name,
            file_type=file_type,
            file_path=file_path,
            file_size=file_size,
            workspace_id=workspace_id,
            folder_id=folder_id,
            ai_status="pending"
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc

    @staticmethod
    def update(db: Session, doc: Document, data: dict) -> Document:
        for key, val in data.items():
            if hasattr(doc, key):
                setattr(doc, key, val)
        db.commit()
        db.refresh(doc)
        return doc

    @staticmethod
    def delete(db: Session, doc_id: str) -> bool:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            db.delete(doc)
            db.commit()
            return True
        return False

    @staticmethod
    def add_tag(db: Session, doc: Document, tag_name: str) -> Tag:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if not tag:
            tag = Tag(id=generate_id(), name=tag_name)
            db.add(tag)
            db.commit()
            db.refresh(tag)
        
        if tag not in doc.tags:
            doc.tags.append(tag)
            db.commit()
        return tag

    @staticmethod
    def remove_tag(db: Session, doc: Document, tag_name: str) -> None:
        tag = db.query(Tag).filter(Tag.name == tag_name).first()
        if tag and tag in doc.tags:
            doc.tags.remove(tag)
            db.commit()

class NoteRepository:
    @staticmethod
    def get_by_id(db: Session, note_id: str) -> Optional[Note]:
        return db.query(Note).filter(Note.id == note_id).first()

    @staticmethod
    def get_by_workspace(db: Session, ws_id: str) -> List[Note]:
        return db.query(Note).filter(Note.workspace_id == ws_id).all()

    @staticmethod
    def create(db: Session, title: str, content: Optional[str], workspace_id: str, document_id: Optional[str], owner_id: str) -> Note:
        note = Note(
            id=generate_id(),
            title=title,
            content=content or "",
            workspace_id=workspace_id,
            document_id=document_id,
            owner_id=owner_id
        )
        db.add(note)
        db.commit()
        db.refresh(note)
        return note

    @staticmethod
    def update(db: Session, note: Note, data: dict) -> Note:
        for key, val in data.items():
            if hasattr(note, key):
                setattr(note, key, val)
        db.commit()
        db.refresh(note)
        return note

    @staticmethod
    def delete(db: Session, note_id: str) -> bool:
        note = db.query(Note).filter(Note.id == note_id).first()
        if note:
            db.delete(note)
            db.commit()
            return True
        return False

class ChatRepository:
    @staticmethod
    def get_conversation(db: Session, conv_id: str) -> Optional[ChatConversation]:
        return db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()

    @staticmethod
    def get_conversations_by_workspace(db: Session, ws_id: str) -> List[ChatConversation]:
        return db.query(ChatConversation).filter(ChatConversation.workspace_id == ws_id).all()

    @staticmethod
    def create_conversation(db: Session, title: str, workspace_id: str, owner_id: str, document_ids: List[str] = []) -> ChatConversation:
        conv = ChatConversation(
            id=generate_id(),
            title=title,
            workspace_id=workspace_id,
            owner_id=owner_id,
            is_multi_doc=len(document_ids) > 1
        )
        db.add(conv)
        db.commit()
        
        # Link documents
        for doc_id in document_ids:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                conv.documents.append(doc)
        
        db.commit()
        db.refresh(conv)
        return conv

    @staticmethod
    def add_message(db: Session, conversation_id: str, role: str, content: str, citations: Optional[List[dict]] = None) -> ChatMessage:
        msg = ChatMessage(
            id=generate_id(),
            conversation_id=conversation_id,
            role=role,
            content=content,
            citations=citations
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    @staticmethod
    def get_messages(db: Session, conversation_id: str) -> List[ChatMessage]:
        return db.query(ChatMessage).filter(ChatMessage.conversation_id == conversation_id).order_by(ChatMessage.created_at.asc()).all()

class BookmarkRepository:
    @staticmethod
    def get_by_user(db: Session, user_id: str) -> List[Bookmark]:
        return db.query(Bookmark).filter(Bookmark.user_id == user_id).all()

    @staticmethod
    def create(db: Session, user_id: str, doc_id: str, page_number: Optional[int], bookmark_type: str, content: str) -> Bookmark:
        bm = Bookmark(
            id=generate_id(),
            user_id=user_id,
            document_id=doc_id,
            page_number=page_number,
            type=bookmark_type,
            content=content
        )
        db.add(bm)
        db.commit()
        db.refresh(bm)
        return bm

    @staticmethod
    def delete(db: Session, bm_id: str) -> bool:
        bm = db.query(Bookmark).filter(Bookmark.id == bm_id).first()
        if bm:
            db.delete(bm)
            db.commit()
            return True
        return False

class ActivityRepository:
    @staticmethod
    def log(db: Session, user_id: str, action: str, details: Optional[str] = None) -> ActivityLog:
        log_entry = ActivityLog(
            id=generate_id(),
            user_id=user_id,
            action=action,
            details=details
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry

    @staticmethod
    def get_by_user(db: Session, user_id: str, limit: int = 20) -> List[ActivityLog]:
        return db.query(ActivityLog).filter(ActivityLog.user_id == user_id).order_by(ActivityLog.created_at.desc()).limit(limit).all()

    @staticmethod
    def get_all(db: Session, limit: int = 100) -> List[ActivityLog]:
        return db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit).all()
