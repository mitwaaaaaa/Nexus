from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.all_models import User, Document, Bookmark, Flashcard, Quiz
from app.schemas.all_schemas import (
    BookmarkCreate, BookmarkResponse, FlashcardResponse, QuizResponse, 
    DashboardStatsResponse, DocumentResponse, ActivityLogResponse
)
from app.repositories.all_repositories import (
    DocumentRepository, BookmarkRepository, ActivityRepository, WorkspaceRepository
)
from app.services.llm_service import LLMService
from app.services.ingestion_service import IngestionService
from app.services.vector_service import vector_service

router = APIRouter(prefix="/api/features", tags=["features"])

class SummaryRequest(BaseModel):
    document_id: str
    summary_type: str = "brief" # brief, detailed, notes, concepts

class PageAIRequest(BaseModel):
    document_id: str
    page_number: int
    task_type: str # summarize, explain, concepts, simple, highlight

class FlashcardGenRequest(BaseModel):
    document_id: str
    workspace_id: str

class QuizGenRequest(BaseModel):
    document_id: str
    workspace_id: str

@router.post("/summary")
def get_summary(req: SummaryRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = DocumentRepository.get_by_id(db, req.document_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Extract text from doc
    import json
    if doc.extracted_chunks_json:
        chunks = json.loads(doc.extracted_chunks_json)
    else:
        chunks, _ = IngestionService.process_document(doc.file_path, doc.file_type)
    full_text = "\n".join([c["text"] for c in chunks[:15]]) # Limit to first 15 chunks for summaries
    
    summary = LLMService.generate_summary(
        document_text=full_text,
        summary_type=req.summary_type,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    
    ActivityRepository.log(db, current_user.id, "generate_summary", f"Generated {req.summary_type} summary for {doc.name}")
    return {"summary": summary}

@router.post("/page-ai")
def page_ai_operation(req: PageAIRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = DocumentRepository.get_by_id(db, req.document_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Extract pages and match page_number
    import json
    if doc.extracted_chunks_json:
        chunks = json.loads(doc.extracted_chunks_json)
    else:
        chunks, _ = IngestionService.process_document(doc.file_path, doc.file_type)
    page_chunks = [c["text"] for c in chunks if c["page"] == req.page_number]
    
    if not page_chunks:
        raise HTTPException(status_code=404, detail="Page number not found or has no extractable text")
        
    page_text = "\n".join(page_chunks)
    
    task_instructions = {
        "summarize": "Provide a clean, bulleted summary of this page.",
        "explain": "Explain the major concepts, theories, and details presented on this page.",
        "concepts": "List the most important keywords, formulas, and concepts defined here.",
        "simple": "Explain this page in very simple terms (like I'm a beginner/student).",
        "highlight": "What are the absolute critical sections or sentences that should be highlighted on this page?"
    }
    
    instruction = task_instructions.get(req.task_type, req.task_type)
    
    prompt = (
        f"You are a research page analyser. Analyze the following text extracted from page {req.page_number} of '{doc.name}':\n\n"
        f"{page_text}\n\n"
        f"Task: {instruction}\n"
    )
    
    response = LLMService._call_llm(
        prompt=prompt,
        system_instruction="You are an expert document tutor. Answer page-specific requests with high clarity.",
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    
    ActivityRepository.log(db, current_user.id, "page_ai", f"Run Page AI {req.task_type} on page {req.page_number} of {doc.name}")
    return {"result": response}

@router.post("/flashcards", response_model=List[FlashcardResponse])
def generate_flashcards(req: FlashcardGenRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = DocumentRepository.get_by_id(db, req.document_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    import json
    if doc.extracted_chunks_json:
        chunks = json.loads(doc.extracted_chunks_json)
    else:
        chunks, _ = IngestionService.process_document(doc.file_path, doc.file_type)
    full_text = "\n".join([c["text"] for c in chunks[:10]]) # First 10 chunks for card generation
    
    cards_data = LLMService.generate_flashcards(
        document_text=full_text,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    
    created_cards = []
    import uuid
    for c in cards_data:
        fc = Flashcard(
            id=str(uuid.uuid4()),
            question=c.get("question", "Sample Question"),
            answer=c.get("answer", "Sample Answer"),
            document_id=req.document_id,
            workspace_id=req.workspace_id,
            owner_id=current_user.id
        )
        db.add(fc)
        created_cards.append(fc)
        
    db.commit()
    ActivityRepository.log(db, current_user.id, "generate_flashcards", f"Created {len(created_cards)} flashcards for {doc.name}")
    return created_cards

@router.get("/flashcards", response_model=List[FlashcardResponse])
def list_flashcards(workspace_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Flashcard).filter(Flashcard.workspace_id == workspace_id, Flashcard.owner_id == current_user.id).all()

@router.post("/quizzes", response_model=QuizResponse)
def generate_quiz(req: QuizGenRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = DocumentRepository.get_by_id(db, req.document_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    import json
    if doc.extracted_chunks_json:
        chunks = json.loads(doc.extracted_chunks_json)
    else:
        chunks, _ = IngestionService.process_document(doc.file_path, doc.file_type)
    full_text = "\n".join([c["text"] for c in chunks[:10]])
    
    quiz_questions = LLMService.generate_quiz(
        document_text=full_text,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    
    import uuid
    quiz = Quiz(
        id=str(uuid.uuid4()),
        title=f"Quiz: {doc.name}",
        questions=quiz_questions,
        document_id=req.document_id,
        workspace_id=req.workspace_id,
        owner_id=current_user.id
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    
    ActivityRepository.log(db, current_user.id, "generate_quiz", f"Generated quiz: {quiz.title}")
    return quiz

@router.get("/quizzes", response_model=List[QuizResponse])
def list_quizzes(workspace_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Quiz).filter(Quiz.workspace_id == workspace_id, Quiz.owner_id == current_user.id).all()

@router.get("/concept-graph")
def get_concept_graph(document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = DocumentRepository.get_by_id(db, document_id)
    if not doc or doc.workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    import json
    if doc.extracted_chunks_json:
        chunks = json.loads(doc.extracted_chunks_json)
    else:
        chunks, _ = IngestionService.process_document(doc.file_path, doc.file_type)
    full_text = "\n".join([c["text"] for c in chunks])
    
    graph = LLMService.generate_concept_graph(
        document_text=full_text,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    return graph

@router.get("/semantic-search")
def run_semantic_search(
    workspace_id: str, 
    query: str, 
    document_ids: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    ws = WorkspaceRepository.get_by_id(db, workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    # parse document list
    if document_ids:
        doc_list = document_ids.split(",")
    else:
        doc_list = [d.id for d in ws.documents]
        
    if not doc_list:
        return []
        
    results = vector_service.query_similarity(
        document_ids=doc_list,
        query_text=query,
        limit=10,
        user_openai_key=current_user.openai_key,
        user_gemini_key=current_user.gemini_key
    )
    
    # Map document IDs to names for rich visual outputs
    doc_mapping = {d.id: d.name for d in ws.documents}
    
    formatted_results = []
    for r in results:
        doc_id = r["document_id"]
        formatted_results.append({
            "document_id": doc_id,
            "document_name": doc_mapping.get(doc_id, "Unknown Doc"),
            "text": r["text"],
            "page": r["metadata"].get("page", 1),
            "score": r["distance"]
        })
        
    return formatted_results

# Bookmarks
@router.post("/bookmarks", response_model=BookmarkResponse)
def create_bookmark(bm_in: BookmarkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bm = BookmarkRepository.create(
        db,
        user_id=current_user.id,
        doc_id=bm_in.document_id,
        page_number=bm_in.page_number,
        bookmark_type=bm_in.type,
        content=bm_in.content
    )
    return bm

@router.get("/bookmarks", response_model=List[BookmarkResponse])
def list_bookmarks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return BookmarkRepository.get_by_user(db, current_user.id)

@router.delete("/bookmarks/{bm_id}")
def delete_bookmark(bm_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify owner
    bm = db.query(Bookmark).filter(Bookmark.id == bm_id).first()
    if not bm or bm.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bookmark access denied")
        
    BookmarkRepository.delete(db, bm_id)
    return {"message": "Bookmark deleted"}

# Dashboard stats
@router.get("/dashboard-stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(workspace_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ws = WorkspaceRepository.get_by_id(db, workspace_id)
    if not ws or ws.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    docs = ws.documents
    recent = sorted(docs, key=lambda x: x.created_at, reverse=True)[:5]
    
    total_docs = len(docs)
    conversations_count = len(ws.conversations)
    flashcards_count = db.query(Flashcard).filter(Flashcard.workspace_id == workspace_id).count()
    quizzes_count = db.query(Quiz).filter(Quiz.workspace_id == workspace_id).count()
    storage_used = sum([d.file_size for d in docs])
    
    # Timeline logs
    logs = ActivityRepository.get_by_user(db, current_user.id, limit=8)
    
    return {
        "total_documents": total_docs,
        "recent_uploads": recent,
        "ai_conversations_count": conversations_count,
        "flashcards_count": flashcards_count,
        "quizzes_count": quizzes_count,
        "storage_used_bytes": storage_used,
        "activity_timeline": logs
    }
