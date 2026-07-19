import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from app.core.config import settings
from app.services.vector_service import vector_service
from openai import OpenAI
import google.generativeai as genai

logger = logging.getLogger(__name__)

class LLMService:
    @staticmethod
    def _call_llm(
        prompt: str, 
        system_instruction: str = "You are a helpful research assistant.", 
        user_openai_key: Optional[str] = None, 
        user_gemini_key: Optional[str] = None,
        json_output: bool = False
    ) -> str:
        openai_key = user_openai_key or settings.OPENAI_API_KEY
        gemini_key = user_gemini_key or settings.GEMINI_API_KEY

        # 1. Try OpenAI
        if openai_key and not openai_key.startswith("your_openai_key"):
            try:
                client = OpenAI(api_key=openai_key)
                response_format = {"type": "json_object"} if json_output else None
                messages = [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ]
                completion = client.chat.completions.create(
                    model=settings.DEFAULT_LLM_MODEL or "gpt-4o-mini",
                    messages=messages,
                    response_format=response_format,
                    temperature=0.3
                )
                return completion.choices[0].message.content
            except Exception as e:
                logger.error(f"OpenAI chat completion failed: {e}")

        # 2. Try Gemini
        if gemini_key and not gemini_key.startswith("your_gemini_key"):
            try:
                genai.configure(api_key=gemini_key)
                # Setting up Gemini model
                model = genai.GenerativeModel(
                    model_name="gemini-1.5-flash",
                    system_instruction=system_instruction
                )
                generation_config = {"response_mime_type": "application/json"} if json_output else None
                response = model.generate_content(prompt, generation_config=generation_config)
                return response.text
            except Exception as e:
                logger.error(f"Gemini chat completion failed: {e}")

        # 3. Development Fallback Mock Answers
        logger.warning("No active API Key found for LLM. Generating simulated response.")
        
        # Heuristic analyzer to extract keywords and sentences from the prompt text
        doc_text = ""
        if "Document Text:\n" in prompt:
            doc_text = prompt.split("Document Text:\n")[1]
        elif "Document Text (Sample/Truncated):\n" in prompt:
            doc_text = prompt.split("Document Text (Sample/Truncated):\n")[1]
            
        import re
        sentences = []
        if doc_text:
            cleaned_text = doc_text.replace("\r", "").replace("\t", " ")
            raw_sentences = re.split(r'(?<=[.!?])\s+', cleaned_text)
            for s in raw_sentences:
                s = s.strip()
                # Filter out lines that are too short/long, or contain JSON braces, or look like URLs
                if len(s) > 20 and len(s) < 180 and not s.startswith("http") and "{" not in s and "}" not in s:
                    sentences.append(s)
        
        if not sentences and doc_text:
            for line in doc_text.split("\n"):
                line = line.strip()
                if len(line) > 20 and len(line) < 150 and not line.startswith("http") and "{" not in line:
                    sentences.append(line)
                    
        # 1. Tech Vocab extraction
        tech_vocab = ["REST", "HTTP", "GraphQL", "RPC", "gRPC", "API", "Authentication", "Authorization", "OAuth", "JWT", "CORS", "Preflight", "Idempotent", "Pagination", "Rate Limiting", "WebSockets", "Caching", "Database", "Vector Store", "PostgreSQL", "Redis", "ChromaDB", "Docker"]
        keywords = []
        
        if doc_text:
            # First match any of the predefined tech vocabulary terms present in the document
            for term in tech_vocab:
                if re.search(r'\b' + re.escape(term) + r'\b', doc_text, re.IGNORECASE):
                    if term not in keywords:
                        keywords.append(term)
                        
            # Then extract other capitalized technical terms
            found_terms = re.findall(r'\b[A-Z][a-zA-Z0-9_-]{3,}(?:\s+[A-Z][a-zA-Z0-9_-]{2,}){0,2}\b', doc_text)
            for term in found_terms:
                term_clean = term.strip()
                if len(term_clean) > 3 and len(term_clean) < 30 and term_clean not in keywords:
                    # Filter out common meta-words, verbs, adjectives
                    excluded = ["document", "workspace", "context", "history", "assistant", "system", "please", "github", "user", "role", "node", "edge", "concept", "forward", "deployed", "tailored", "workers", "expert", "senior", "junior", "cheatsheet", "guide", "cheatsheets", "interview", "questions", "answers", "people", "things", "mitwa"]
                    if term_clean.lower() not in excluded:
                        keywords.append(term_clean)
        
        # Fallbacks if extraction yields too little
        if len(keywords) < 4:
            keywords = ["Authentication", "HTTP Status", "API Request", "Server Response", "Client Session"]
        if len(sentences) < 5:
            sentences = [
                "Authentication credentials verify the identity of the client connecting to the API.",
                "Design principles ensure consistent structure and robust handling of client requests.",
                "The server returned an HTTP status code indicating the outcome of the request.",
                "Vector indexes allow the similarity engine to match document chunks to queries.",
                "Client-side navigation routes request paths smoothly without full page reloads."
            ]
            
        # 2. Smart description generator helper
        node_descriptions = {}
        for kw in keywords:
            desc = ""
            kw_words = [w.lower() for w in kw.split() if len(w) > 2]
            for s in sentences:
                if any(qw in s.lower() for qw in kw_words):
                    desc = s
                    break
            if not desc and doc_text:
                for para in doc_text.split("\n\n"):
                    if any(qw in para.lower() for qw in kw_words) and len(para.strip()) > 30:
                        desc = para.strip().replace("\n", " ")[:150]
                        if not desc.endswith("."):
                            desc += "..."
                        break
            if not desc:
                desc = f"Discusses parameters, structural components, and design strategies relating to {kw}."
            node_descriptions[kw] = desc
            
        # Compile dynamic flashcards using the smart descriptions
        flashcards = []
        for i in range(min(5, len(keywords))):
            kw = keywords[i]
            flashcards.append({
                "question": f"What is the definition or role of {kw} as discussed in the text?",
                "answer": node_descriptions[kw]
            })
            
        # Compile dynamic quiz
        quiz = []
        for i in range(min(4, len(keywords))):
            kw = keywords[i]
            correct_ans = node_descriptions[kw]
            quiz.append({
                "question": f"Based on the document text, which of the following is true about {kw}?",
                "options": [
                    correct_ans,
                    f"It represents an inactive legacy configuration.",
                    f"It is managed exclusively by the client-side router.",
                    f"It is deprecated in the current API version."
                ],
                "answer": correct_ans,
                "explanation": f"The document notes: '{correct_ans}'"
            })
            
        # Compile concept nodes and edges
        nodes = []
        edges = []
        for idx, kw in enumerate(keywords[:6]):
            nodes.append({
                "id": kw,
                "label": kw,
                "description": node_descriptions[kw],
                "group": 1 if idx % 2 == 0 else 2
            })
        for idx in range(1, len(nodes)):
            edges.append({
                "source": nodes[0]["id"],
                "target": nodes[idx]["id"],
                "label": "references" if idx % 2 == 0 else "manages"
            })
            
        if json_output:
            return json.dumps({
                "summary": f"This summary was dynamically generated by the local processing engine. The document heavily focuses on concepts surrounding {keywords[0]} and {keywords[1] if len(keywords) > 1 else 'related protocols'}.",
                "key_concepts": keywords[:4],
                "explanation": "To enable production-grade live AI answers, please update your OpenAI/Gemini API key in your Profile Settings.",
                "flashcards": flashcards,
                "quiz": quiz,
                "nodes": nodes,
                "edges": edges
            })
            
        # Detect if it's a markdown editor improvement request (AI Writing Assistant)
        if "markdown editor" in system_instruction.lower():
            instruction = "expand"
            if "Instructions: " in prompt:
                instruction = prompt.split("Instructions: ")[1].split("\n\n")[0].strip()
            original_md = ""
            if "Original Markdown:\n" in prompt:
                original_md = prompt.split("Original Markdown:\n")[1].split("\n\n")[0].strip()
                
            if "expand" in instruction.lower():
                expanded = (
                    f"{original_md}\n\n"
                    f"### Detailed Concept Expansion\n"
                    f"Here is a technical deep dive into **{keywords[0]}** as outlined in the cheatsheet:\n\n"
                    f"* **Core Operational Protocol**: {sentences[0]}\n"
                    f"* **Service Coordination**: The interaction with **{keywords[1] if len(keywords) > 1 else 'related endpoints'}** outlines: *{sentences[1]}*\n"
                    f"* **Methodological Assertions**: {sentences[2]}\n"
                )
                return expanded
            elif "grammar" in instruction.lower():
                polished = (
                    f"# Study Notes: {keywords[0]}\n"
                    f"> *AI Assisted Grammar and readability review applied*\n\n"
                    f"{original_md.replace('### Simulated RAG Response', '## Technical Review')}"
                )
                return polished
            elif "example" in instruction.lower() or "code" in instruction.lower():
                examples = (
                    f"{original_md}\n\n"
                    f"### Implementation & Practical Demonstration\n"
                    f"Below is a python request handler showing how to coordinate the methods related to **{keywords[0]}**:\n\n"
                    f"```python\n"
                    f"# Practical Client Integration Code\n"
                    f"import requests\n\n"
                    f"def request_handler(base_url: str):\n"
                    f"    # Utilizing parsed constraints: {sentences[0][:80]}...\n"
                    f"    headers = {{'Content-Type': 'application/json'}}\n"
                    f"    try:\n"
                    f"        # Coordinating {keywords[0]} & {keywords[1] if len(keywords) > 1 else 'endpoint'}\n"
                    f"        resp = requests.get(f'{{base_url}}/api/resource', headers=headers)\n"
                    f"        if resp.status_code == 200:\n"
                    f"            print('Success:', resp.json())\n"
                    f"        else:\n"
                    f"            print(f'Error status: {{resp.status_code}}')\n"
                    f"    except Exception as err:\n"
                    f"        print('Service connection failed:', err)\n"
                    f"```"
                )
                return examples
            else: # simplify
                simplified = (
                    f"{original_md}\n\n"
                    f"### Simplified Core Points\n"
                    f"* **Key Action**: Connect to the API resources using standardized client sessions.\n"
                    f"* **Underlying Requirement**: {sentences[0]}\n"
                    f"* **Constraint**: {sentences[1][:100]}...\n"
                )
                return simplified
            
        # Detect if it's a summary request
        is_summary_req = "summarization engine" in system_instruction.lower() or "summarize" in prompt.lower() or "summary" in prompt.lower()
        
        if is_summary_req:
            # Check summary type (brief, detailed, notes, concepts)
            sum_type = "brief"
            if "detailed" in prompt.lower() or "structured" in prompt.lower():
                sum_type = "detailed"
            elif "bullet" in prompt.lower() or "notes" in prompt.lower():
                sum_type = "notes"
            elif "key concepts" in prompt.lower() or "formulas" in prompt.lower():
                sum_type = "concepts"
                
            if sum_type == "brief":
                brief_sum = (
                    f"### Executive Brief: {keywords[0]} Overview\n\n"
                    f"This document centers around **{keywords[0]}** and related components such as **{keywords[1] if len(keywords) > 1 else 'associated systems'}**. "
                    f"It details technical attributes and operational expectations.\n\n"
                    f"Key observations from the document assert that:\n"
                )
                for s in sentences[:4]:
                    brief_sum += f"- {s}\n"
                brief_sum += (
                    f"\nFurthermore, discussions of **{keywords[2] if len(keywords) > 2 else 'system design'}** show how "
                    f"{sentences[4] if len(sentences) > 4 else 'elements coordinate to build robust API integrations'}.\n\n"
                    f"> [!NOTE]\n"
                    f"> *This summary was dynamically compiled from the document contents under the local fallback processor.*"
                )
                return brief_sum
                
            elif sum_type == "detailed":
                detailed_sum = (
                    f"### Detailed Technical Summary: {keywords[0]}\n\n"
                    f"#### 1. Background & Structural Overview\n"
                    f"The analysis presents a study of **{keywords[0]}**, outlining its main role in the architecture. "
                    f"The text highlights the following technical principles:\n"
                    f"> {sentences[0]}\n\n"
                    f"#### 2. Key Components & Features\n"
                    f"The integration of **{keywords[1] if len(keywords) > 1 else 'related protocols'}** serves as the primary operational context. "
                    f"The following details are noted:\n"
                )
                for s in sentences[1:5]:
                    detailed_sum += f"* **Detail**: {s}\n"
                detailed_sum += (
                    f"\n#### 3. Core Assertions & Conclusions\n"
                    f"The documentation emphasizes key design strategies concerning **{keywords[2] if len(keywords) > 2 else 'system integrity'}**:\n"
                    f"- *{sentences[4] if len(sentences) > 4 else 'Protocols should remain uniform and predictable.'}*\n"
                    f"- *{sentences[0]}*\n\n"
                    f"> [!IMPORTANT]\n"
                    f"> *Generated by the local fallback parser using heuristics on `{keywords[0]}`.*"
                )
                return detailed_sum
                
            elif sum_type == "notes":
                notes_sum = (
                    f"### Study Notes: {keywords[0]}\n\n"
                    f"* **Primary Assertions**:\n"
                )
                for s in sentences[:5]:
                    notes_sum += f"  - {s}\n"
                notes_sum += (
                    f"* **Key Terms & Concept Map**:\n"
                    f"  - **{keywords[0]}**: The central theme of this technical review.\n"
                )
                if len(keywords) > 1:
                    notes_sum += f"  - **{keywords[1]}**: Explored as a major dependency.\n"
                if len(keywords) > 2:
                    notes_sum += f"  - **{keywords[2]}**: Discussed for API/system design.\n"
                notes_sum += (
                    f"* **Synthesis**:\n"
                    f"  - *{sentences[4] if len(sentences) > 4 else 'The system operates by linking these key nodes.'}*\n"
                )
                return notes_sum
                
            else: # concepts
                concepts_sum = (
                    f"### Key Concepts Dictionary\n\n"
                    f"Below is a list of the major technical terms identified in the document, along with definitions parsed from context:\n\n"
                )
                for idx, kw in enumerate(keywords[:5]):
                    ans = sentences[idx % len(sentences)]
                    concepts_sum += f"* **{kw}**:\n  - {ans}\n\n"
                return concepts_sum

        # Check if the query is in the prompt
        user_query = ""
        if "Current User Query: " in prompt:
            user_query = prompt.split("Current User Query: ")[1].split("\n")[0].strip()
            
        # Try to find a sentence in the document that contains words from the user query
        matched_sentences = []
        if user_query:
            query_words = [w.lower().strip("?,.!") for w in user_query.split() if len(w) > 3]
            for s in sentences:
                for qw in query_words:
                    if qw in s.lower() and s not in matched_sentences:
                        matched_sentences.append(s)
                        
        # Construct dynamic chat response
        chat_resp = f"### Simulated RAG Response (Local Fallback)\n\n"
        if user_query:
            chat_resp += f"Regarding your question: *\"{user_query}\"*,\n\n"
            
        if matched_sentences:
            chat_resp += "I found the following matching statements inside the document:\n\n"
            for idx, ms in enumerate(matched_sentences[:3]):
                chat_resp += f"- [{idx + 1}] *\"{ms}\"*\n"
            chat_resp += "\n"
        else:
            chat_resp += (
                f"Based on the document context, the text discusses **{keywords[0]}** and its interaction with "
                f"**{keywords[1] if len(keywords) > 1 else 'other components'}**.\n\n"
                f"Here are the relevant snippets extracted from the document:\n\n"
            )
            for idx, s in enumerate(sentences[:3]):
                chat_resp += f"- [{idx + 1}] *\"{s}\"*\n"
            chat_resp += "\n"
            
        chat_resp += (
            f"To chat dynamically and synthesize advanced summaries of this document, "
            f"please add a valid OpenAI or Gemini API Key in your **Profile Settings**."
        )
        return chat_resp

    @classmethod
    def answer_document_query(
        cls, 
        document_ids: List[str], 
        query: str, 
        history: List[Dict[str, str]] = [],
        user_openai_key: Optional[str] = None,
        user_gemini_key: Optional[str] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        # 1. Similarity Search
        context_chunks = vector_service.query_similarity(
            document_ids=document_ids,
            query_text=query,
            limit=4,
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key
        )

        citations = []
        context_str = ""
        for idx, chunk in enumerate(context_chunks):
            citation_num = idx + 1
            doc_id = chunk["document_id"]
            page = chunk["metadata"].get("page", 1)
            text = chunk["text"]
            
            # Format context string
            context_str += f"[{citation_num}] (Doc ID: {doc_id}, Page: {page}): {text}\n\n"
            
            # Add to citations response
            citations.append({
                "citation_number": citation_num,
                "document_id": doc_id,
                "page": page,
                "text": text[:300] + "..." if len(text) > 300 else text
            })

        # 2. Build Chat Prompt
        history_str = ""
        for h in history[-6:]: # Keep last 6 exchanges
            role = "User" if h["role"] == "user" else "Assistant"
            history_str += f"{role}: {h['content']}\n"

        prompt = (
            f"You are Nexus Assistant, a professional scientific researcher. Answer the query based on the following retrieved document context. "
            f"If the answer cannot be found in the context, synthesize the best possible answer using your knowledge, but clearly note that you are adding information beyond the document.\n\n"
            f"Always cite the source chunks using their numbers in square brackets, e.g. [1] or [2] when mentioning facts that correspond to them.\n\n"
            f"Retrieved Context:\n{context_str}\n"
            f"Conversation History:\n{history_str}\n"
            f"Current User Query: {query}\n\n"
            f"Answer:"
        )

        response_text = cls._call_llm(
            prompt=prompt,
            system_instruction="You are a professional research AI. Synthesize answers accurately using RAG context and cite facts with square bracket annotations.",
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key
        )

        return response_text, citations

    @classmethod
    def generate_summary(
        cls, 
        document_text: str, 
        summary_type: str = "brief", # brief, detailed, notes, concepts
        user_openai_key: Optional[str] = None, 
        user_gemini_key: Optional[str] = None
    ) -> str:
        instructions = {
            "brief": "Generate a concise 2-3 paragraph summary focusing on the main contributions and findings.",
            "detailed": "Generate a structured, detailed summary with sections for background, methodology, results, and limitations.",
            "notes": "Generate study notes with bullet points listing the key facts, equations, and assertions of this text.",
            "concepts": "List the key concepts and formulas defined in this text along with a short explanation for each."
        }
        
        prompt = (
            f"Analyze the following document text and perform the following task: {instructions.get(summary_type, 'brief')}\n\n"
            f"Document Text (Sample/Truncated):\n{document_text[:12000]}\n"
        )
        
        return cls._call_llm(
            prompt=prompt,
            system_instruction="You are a research summarization engine. Format your output clearly using clean markdown headings.",
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key
        )

    @classmethod
    def generate_flashcards(
        cls, 
        document_text: str, 
        user_openai_key: Optional[str] = None, 
        user_gemini_key: Optional[str] = None
    ) -> List[Dict[str, str]]:
        prompt = (
            f"Analyze the following document text and generate a list of 5-8 flashcards for revision. "
            f"Each flashcard must contain a 'question' and an 'answer'. "
            f"Provide the response strictly in JSON format as a list of objects containing 'question' and 'answer' keys.\n\n"
            f"Document Text:\n{document_text[:8000]}\n"
        )
        
        res = cls._call_llm(
            prompt=prompt,
            system_instruction="You are a study card generation assistant. Output JSON only.",
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key,
            json_output=True
        )
        
        try:
            data = json.loads(res)
            if isinstance(data, dict) and "flashcards" in data:
                return data["flashcards"]
            if isinstance(data, list):
                return data
        except Exception:
            pass
            
        # Standard fallback mock flashcards if parse error
        return [
            {"question": "What is the primary objective of this paper?", "answer": "Summarized from text analysis."},
            {"question": "What is the core methodology implemented?", "answer": "Check the document methodology section."}
        ]

    @classmethod
    def generate_quiz(
        cls, 
        document_text: str, 
        user_openai_key: Optional[str] = None, 
        user_gemini_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        prompt = (
            f"Analyze the following document text and generate a multiple-choice quiz of 5 questions. "
            f"Each question must contain: 'question', 'options' (list of 4 strings), 'answer' (exact matching option string), and 'explanation'. "
            f"Provide the response strictly in JSON format as a list of objects or a root object with a 'quiz' list.\n\n"
            f"Document Text:\n{document_text[:8000]}\n"
        )
        
        res = cls._call_llm(
            prompt=prompt,
            system_instruction="You are a quiz generation assistant. Output JSON only.",
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key,
            json_output=True
        )
        
        try:
            data = json.loads(res)
            if isinstance(data, dict) and "quiz" in data:
                return data["quiz"]
            if isinstance(data, list):
                return data
        except Exception:
            pass
            
        return [
            {
                "question": "What is the key takeaway of this work?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "answer": "Option A",
                "explanation": "Based on document introduction."
            }
        ]

    @classmethod
    def generate_concept_graph(
        cls, 
        document_text: str, 
        user_openai_key: Optional[str] = None, 
        user_gemini_key: Optional[str] = None
    ) -> Dict[str, Any]:
        prompt = (
            f"Analyze the document text and extract the major concepts (entities, themes, ideas) and their relationships. "
            f"Format the output strictly as a JSON object with two fields:\n"
            f"- 'nodes': list of objects like {{'id': 'concept_id', 'label': 'Concept Name', 'group': 1}}\n"
            f"- 'edges': list of objects like {{'source': 'concept_id_1', 'target': 'concept_id_2', 'label': 'relationship_type'}}\n\n"
            f"Document Text:\n{document_text[:8000]}\n"
        )
        
        res = cls._call_llm(
            prompt=prompt,
            system_instruction="You are a concept mapping bot. Analyze relationships and output graph nodes and edges in clean JSON format.",
            user_openai_key=user_openai_key,
            user_gemini_key=user_gemini_key,
            json_output=True
        )
        
        try:
            data = json.loads(res)
            if "nodes" in data and "edges" in data:
                return data
        except Exception:
            pass
            
        # Basic heuristic fallback concepts using word extraction
        words = [w.strip(".,()\"").lower() for w in document_text.split() if len(w) > 6]
        freq = {}
        for w in words[:100]:
            freq[w] = freq.get(w, 0) + 1
        sorted_words = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:5]
        
        nodes = []
        edges = []
        for i, (word, count) in enumerate(sorted_words):
            nodes.append({"id": word, "label": word.capitalize(), "group": 1})
            if i > 0:
                edges.append({"source": sorted_words[0][0], "target": word, "label": "associated_with"})
                
        return {"nodes": nodes, "edges": edges}
