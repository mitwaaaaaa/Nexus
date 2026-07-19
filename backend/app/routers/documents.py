from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import shutil
import logging
from typing import List, Optional

from app.core.database import get_db, SessionLocal
from app.routers.auth import get_current_user
from app.models.all_models import User, Document
from app.schemas.all_schemas import DocumentResponse, DocumentRename, TagResponse
from app.repositories.all_repositories import DocumentRepository, WorkspaceRepository, ActivityRepository
from app.services.ingestion_service import IngestionService
from app.services.vector_service import vector_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def ingest_document_in_background(
    doc_id: str, 
    openai_key: Optional[str] = None, 
    gemini_key: Optional[str] = None
):
    """Background task to extract text, compute embeddings, and store in ChromaDB."""
    db: Session = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            logger.error(f"Document {doc_id} not found in background task.")
            return

        # Update status to ingesting
        doc.ai_status = "ingesting"
        db.commit()

        # Parse & Chunk Document
        chunks, pages_count = IngestionService.process_document(doc.file_path, doc.file_type)
        
        # Save pages count, full text, and serialized chunks json
        doc.num_pages = pages_count
        if chunks:
            import json
            doc.extracted_chunks_json = json.dumps(chunks)
            doc.extracted_text = "\n".join([c["text"] for c in chunks])
        db.commit()

        # Embed and Add to ChromaDB vector store
        if chunks:
            vector_service.add_chunks(
                document_id=doc.id,
                chunks=chunks,
                user_openai_key=openai_key,
                user_gemini_key=gemini_key
            )
            
        doc.ai_status = "ready"
        db.commit()
        logger.info(f"Successfully ingested document {doc_id} in background.")
        
    except Exception as e:
        logger.error(f"Failed to ingest document {doc_id}: {e}", exc_info=True)
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.ai_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()

@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    folder_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify workspace
    ws = WorkspaceRepository.get_by_id(db, workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    # Clean file name and compute path
    file_ext = file.filename.split(".")[-1].lower()
    allowed_exts = ["pdf", "docx", "doc", "pptx", "ppt", "txt", "png", "jpg", "jpeg", "webp"]
    if file_ext not in allowed_exts:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file format. Supported formats: {', '.join(allowed_exts)}"
        )

    # Save file to disk
    import uuid
    safe_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Error saving uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file on disk")

    # Get file size
    file_size = os.path.getsize(file_path)

    # Create Document record
    doc = DocumentRepository.create(
        db,
        name=file.filename,
        file_type=file_ext,
        file_path=file_path,
        file_size=file_size,
        workspace_id=workspace_id,
        folder_id=folder_id if folder_id and folder_id != "null" else None
    )

    ActivityRepository.log(db, current_user.id, "upload_document", f"Uploaded document: {doc.name}")

    # Launch background ingestion
    # Pass user custom keys to enable personalized embedding calculation
    background_tasks.add_task(
        ingest_document_in_background,
        doc.id,
        current_user.openai_key,
        current_user.gemini_key
    )

    return doc

@router.get("/workspace/{ws_id}", response_model=List[DocumentResponse])
def list_workspace_documents(
    ws_id: str, 
    folder_id: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, ws_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    
    # Get documents
    docs = DocumentRepository.get_by_workspace(db, ws_id, folder_id)
    return docs

@router.get("/{doc_id}/download")
def download_document(
    doc_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found on server storage")
        
    return FileResponse(doc.file_path, filename=doc.name)

@router.delete("/{doc_id}")
def delete_document(
    doc_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    # Delete from file system
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception as e:
            logger.error(f"Error removing file from disk: {e}")

    # Delete from vector database
    vector_service.delete_collection(doc_id)

    # Delete from db
    DocumentRepository.delete(db, doc_id)
    ActivityRepository.log(db, current_user.id, "delete_document", f"Deleted document ID: {doc_id}")
    return {"message": "Document deleted successfully"}

@router.put("/{doc_id}/rename", response_model=DocumentResponse)
def rename_document(
    doc_id: str, 
    rename_in: DocumentRename, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    updated = DocumentRepository.update(db, doc, {"name": rename_in.name})
    return updated

@router.post("/{doc_id}/favorite", response_model=DocumentResponse)
def toggle_favorite(
    doc_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    updated = DocumentRepository.update(db, doc, {"is_favorite": not doc.is_favorite})
    return updated

@router.post("/{doc_id}/tags", response_model=TagResponse)
def add_tag(
    doc_id: str, 
    tag_name: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    tag = DocumentRepository.add_tag(db, doc, tag_name)
    return tag

@router.delete("/{doc_id}/tags/{tag_name}")
def remove_tag(
    doc_id: str, 
    tag_name: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    DocumentRepository.remove_tag(db, doc, tag_name)
    return {"message": "Tag removed successfully"}

@router.get("/{doc_id}/raw")
def get_raw_chunks(
    doc_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Returns raw text chunks extracted from doc, sorted by page. Used in Document Viewer."""
    doc = DocumentRepository.get_by_id(db, doc_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Document access denied")
        
    # Process text again or read file text
    if doc.extracted_chunks_json:
        import json
        return {"chunks": json.loads(doc.extracted_chunks_json), "num_pages": doc.num_pages}

    try:
        chunks, pages_count = IngestionService.process_document(doc.file_path, doc.file_type)
        return {"chunks": chunks, "num_pages": pages_count}
    except Exception as e:
        logger.error(f"Error reading doc chunks: {e}")
        raise HTTPException(status_code=500, detail="Could not read document contents")
