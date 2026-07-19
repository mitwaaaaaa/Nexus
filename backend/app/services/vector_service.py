import chromadb
import logging
import hashlib
from typing import List, Dict, Any, Optional
from app.core.config import settings
from openai import OpenAI
import google.generativeai as genai

logger = logging.getLogger(__name__)

class VectorService:
    def __init__(self):
        try:
            self.client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
            logger.info("Connected to ChromaDB container successfully.")
        except Exception as e:
            logger.warning(f"Could not connect to ChromaDB container: {e}. Falling back to PersistentClient.")
            self.client = chromadb.PersistentClient(path="/app/chroma_persistent")

    def _get_embedding(self, text: str, user_openai_key: Optional[str] = None, user_gemini_key: Optional[str] = None) -> List[float]:
        # Choose API Key
        openai_key = user_openai_key or settings.OPENAI_API_KEY
        gemini_key = user_gemini_key or settings.GEMINI_API_KEY
        
        if openai_key and not openai_key.startswith("your_openai_key"):
            try:
                client = OpenAI(api_key=openai_key)
                response = client.embeddings.create(
                    input=[text],
                    model="text-embedding-3-small"
                )
                return response.data[0].embedding
            except Exception as e:
                logger.error(f"OpenAI embedding generation failed: {e}")
                
        if gemini_key and not gemini_key.startswith("your_gemini_key"):
            try:
                genai.configure(api_key=gemini_key)
                # Model for embeddings in Gemini is text-embedding-004
                response = genai.embed_content(
                    model="models/text-embedding-004",
                    content=text,
                    task_type="retrieval_document"
                )
                return response['embedding']
            except Exception as e:
                logger.error(f"Gemini embedding generation failed: {e}")
                
        # Deterministic mock embedding (length 1536) for development without keys
        logger.warning("No active API Key found for embeddings. Generating mock embedding.")
        h = hashlib.sha256(text.encode('utf-8')).hexdigest()
        emb = []
        for i in range(1536):
            # Create a float between -1 and 1 based on hash value
            val = ((int(h[i % 64], 16) * (i + 1)) % 1000) / 500.0 - 1.0
            emb.append(val)
        return emb

    def get_or_create_collection(self, document_id: str):
        collection_name = f"doc_{document_id.replace('-', '_')}"
        return self.client.get_or_create_collection(name=collection_name)

    def delete_collection(self, document_id: str):
        collection_name = f"doc_{document_id.replace('-', '_')}"
        try:
            self.client.delete_collection(name=collection_name)
            logger.info(f"Deleted vector collection for document {document_id}")
        except Exception as e:
            logger.error(f"Error deleting collection: {e}")

    def add_chunks(self, document_id: str, chunks: List[Dict[str, Any]], user_openai_key: Optional[str] = None, user_gemini_key: Optional[str] = None):
        collection = self.get_or_create_collection(document_id)
        
        ids = []
        documents = []
        embeddings = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            chunk_id = f"{document_id}_chunk_{i}"
            text = chunk["text"]
            
            emb = self._get_embedding(text, user_openai_key, user_gemini_key)
            
            ids.append(chunk_id)
            documents.append(text)
            embeddings.append(emb)
            metadatas.append({
                "page": chunk["page"],
                "document_id": document_id
            })
            
        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )
        logger.info(f"Added {len(chunks)} vectors to collection for document {document_id}")

    def query_similarity(self, document_ids: List[str], query_text: str, limit: int = 5, user_openai_key: Optional[str] = None, user_gemini_key: Optional[str] = None) -> List[Dict[str, Any]]:
        results = []
        query_emb = self._get_embedding(query_text, user_openai_key, user_gemini_key)
        
        for doc_id in document_ids:
            try:
                collection = self.get_or_create_collection(doc_id)
                res = collection.query(
                    query_embeddings=[query_emb],
                    n_results=limit,
                    include=["documents", "metadatas", "distances"]
                )
                
                if res and res["documents"] and len(res["documents"][0]) > 0:
                    for i in range(len(res["documents"][0])):
                        results.append({
                            "document_id": doc_id,
                            "text": res["documents"][0][i],
                            "metadata": res["metadatas"][0][i],
                            "distance": res["distances"][0][i] if "distances" in res else 0.5
                        })
            except Exception as e:
                logger.error(f"Error querying document collection for {doc_id}: {e}")
                
        # Sort results by similarity (lower distance is better)
        results.sort(key=lambda x: x["distance"])
        return results[:limit]

vector_service = VectorService()
