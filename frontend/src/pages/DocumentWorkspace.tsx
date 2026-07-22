import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  FileText, MessageSquare, Sparkles, BookOpen, 
  Settings, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, 
  CornerDownRight, Copy, HelpCircle, Check, BookMarked, BrainCircuit,
  CornerDownLeft, Play, ArrowRight, Save, Trash, Loader2
} from 'lucide-react';

interface ChunkItem {
  page: number;
  text: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: { citation_number: number; page: number; text: string }[];
  created_at: string;
}

interface GraphNode {
  id: string;
  label: string;
  group: number;
  description?: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const DocumentWorkspace: React.FC = () => {
  const { ws_id, doc_id } = useParams<{ ws_id: string; doc_id: string }>();
  const navigate = useNavigate();

  // Document details
  const [docName, setDocName] = useState('Loading...');
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [numPages, setNumPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  
  // UI Panels / Tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'smart' | 'graph' | 'notes' | 'bookmarks'>('chat');
  const [loadingDoc, setLoadingDoc] = useState(true);
  
  // Search Inside Doc
  const [viewerSearchQuery, setViewerSearchQuery] = useState('');
  const [viewerSearchMatches, setViewerSearchMatches] = useState<number[]>([]); // Page numbers matching search

  // Zoom controls (mock visual)
  const [zoomScale, setZoomScale] = useState(100);

  // Tab 1: AI Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Tab 2: Smart features states
  const [summaryOutput, setSummaryOutput] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryType, setSummaryType] = useState('brief');
  const [flashcards, setFlashcards] = useState<{ id: string; question: string; answer: string }[]>([]);
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [generatingCards, setGeneratingCards] = useState(false);
  const [quiz, setQuiz] = useState<{ question: string; options: string[]; answer: string; explanation: string }[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState<Record<number, string>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);

  // Tab 3: Interactive SVG Concept Graph states
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);

  // Tab 4: Markdown notes editor states
  const [noteTitle, setNoteTitle] = useState('My Study Notes');
  const [noteContent, setNoteContent] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notesEditMode, setNotesEditMode] = useState(true);
  const [improvingNote, setImprovingNote] = useState(false);

  // Tab 5: Bookmarks
  const [bookmarks, setBookmarks] = useState<{ id: string; page_number: number; content: string }[]>([]);

  // Fetch document text and set details
  useEffect(() => {
    const fetchDocData = async () => {
      setLoadingDoc(true);
      try {
        const docRes = await api.get(`/api/documents/workspace/${ws_id}`);
        const currentDoc = docRes.data.find((d: any) => d.id === doc_id);
        if (currentDoc) {
          setDocName(currentDoc.name);
        }

        const chunkRes = await api.get(`/api/documents/${doc_id}/raw`);
        setChunks(chunkRes.data.chunks);
        setNumPages(chunkRes.data.num_pages || 1);
        
        // Load or auto-create a chat conversation
        const convRes = await api.get(`/api/chat/conversations?workspace_id=${ws_id}`);
        const docConv = convRes.data.find((c: any) => !c.is_multi_doc && c.documents.some((d: any) => d.id === doc_id));
        if (docConv) {
          setActiveConversationId(docConv.id);
          const msgRes = await api.get(`/api/chat/conversations/${docConv.id}/messages`);
          setMessages(msgRes.data);
        } else {
          // create new conversation
          const newConv = await api.post('/api/chat/conversations', {
            title: `Chat: ${currentDoc?.name || 'Doc'}`,
            workspace_id: ws_id,
            document_ids: [doc_id]
          });
          setActiveConversationId(newConv.data.id);
        }

        // Load Notes
        const notesRes = await api.get(`/api/notes?workspace_id=${ws_id}`);
        const docNote = notesRes.data.find((n: any) => n.document_id === doc_id);
        if (docNote) {
          setNoteId(docNote.id);
          setNoteTitle(docNote.title);
          setNoteContent(docNote.content || '');
        } else {
          // Auto-initialize a note template
          const newNote = await api.post('/api/notes', {
            title: `Study Notes: ${currentDoc?.name.split('.')[0]}`,
            content: `# Study Notes for ${currentDoc?.name}\n\nUse the AI improved panel to summarize equations, compile formulas or generate study lists here.`,
            workspace_id: ws_id,
            document_id: doc_id
          });
          setNoteId(newNote.data.id);
          setNoteTitle(newNote.data.title);
          setNoteContent(newNote.data.content);
        }

        // Load Bookmarks
        const bmRes = await api.get('/api/features/bookmarks');
        const docBms = bmRes.data.filter((b: any) => b.document_id === doc_id);
        setBookmarks(docBms);

      } catch (e) {
        console.error(e);
      } finally {
        setLoadingDoc(false);
      }
    };
    fetchDocData();
  }, [doc_id, ws_id]);

  // Handle document viewer search match calculation
  useEffect(() => {
    if (!viewerSearchQuery.trim()) {
      setViewerSearchMatches([]);
      return;
    }
    const matchingPages: number[] = [];
    chunks.forEach(c => {
      if (c.text.toLowerCase().includes(viewerSearchQuery.toLowerCase())) {
        matchingPages.push(c.page);
      }
    });
    setViewerSearchMatches(Array.from(new Set(matchingPages)));
  }, [viewerSearchQuery, chunks]);

  // Load Concept Graph and Physics simulation
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [graphFilter, setGraphFilter] = useState<'all' | 'concepts' | 'algorithms' | 'datasets' | 'formulae' | 'examples'>('all');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const [simNodes, setSimNodes] = useState<any[]>([]);
  const simRef = useRef<any[]>([]);
  const [simAlpha, setSimAlpha] = useState(1.0);

  useEffect(() => {
    if (activeTab === 'graph' && !graphData) {
      const fetchGraph = async () => {
        setLoadingGraph(true);
        try {
          const res = await api.get(`/api/features/concept-graph?document_id=${doc_id}`);
          setGraphData(res.data);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingGraph(false);
        }
      };
      fetchGraph();
    }
  }, [activeTab, doc_id, graphData]);

  useEffect(() => {
    if (!graphData) return;

    // Inject main topic representing the document
    const hasMainTopic = graphData.nodes.some(n => n.id === 'main_topic');
    let initNodes = [...graphData.nodes];
    if (!hasMainTopic) {
      initNodes.unshift({
        id: 'main_topic',
        label: docName.length > 25 ? docName.substring(0, 25) + '...' : docName,
        group: 0,
        description: 'Main topic structure and entity graph of this document.'
      });
    }

    const positioned = initNodes.map((n, idx) => {
      if (n.id === 'main_topic') {
        return { ...n, x: 200, y: 200, vx: 0, vy: 0, size: 22, category: 'main' };
      }
      
      const angle = (idx / initNodes.length) * 2 * Math.PI;
      const isFirstLevel = idx < 6;
      const radius = isFirstLevel ? 100 : 160;

      let category: 'concepts' | 'algorithms' | 'datasets' | 'formulae' | 'examples' | 'misc' = 'concepts';
      const labelLower = n.label.toLowerCase();
      if (n.group === 2 || labelLower.includes('algorithm') || labelLower.includes('method') || labelLower.includes('sort') || labelLower.includes('search') || labelLower.includes('clustering') || labelLower.includes('sampling') || labelLower.includes('regression')) {
        category = 'algorithms';
      } else if (n.group === 3 || labelLower.includes('dataset') || labelLower.includes('data') || labelLower.includes('mnist') || labelLower.includes('corpus')) {
        category = 'datasets';
      } else if (n.group === 4 || labelLower.includes('formula') || labelLower.includes('equation') || labelLower.includes('theorem') || labelLower.includes('math')) {
        category = 'formulae';
      } else if (n.group === 5 || labelLower.includes('example') || labelLower.includes('sample') || labelLower.includes('case')) {
        category = 'examples';
      } else if (n.group === 1 || labelLower.includes('concept') || labelLower.includes('theory')) {
        category = 'concepts';
      } else {
        category = 'misc';
      }

      return {
        ...n,
        x: 200 + radius * Math.cos(angle) + (Math.random() - 0.5) * 15,
        y: 200 + radius * Math.sin(angle) + (Math.random() - 0.5) * 15,
        vx: 0,
        vy: 0,
        size: isFirstLevel ? 14 : 9,
        category
      };
    });

    simRef.current = positioned;
    setSimNodes(positioned);
    setSimAlpha(1.0);
  }, [graphData, docName]);

  useEffect(() => {
    if (simNodes.length === 0 || simAlpha <= 0.005) return;

    let frameId: number;
    const tick = () => {
      const currentNodes = [...simRef.current];
      const edges = graphData?.edges || [];
      
      const allEdges = [...edges];
      const hasMainTopic = graphData?.nodes.some(n => n.id === 'main_topic');
      if (!hasMainTopic) {
        const firstFew = graphData?.nodes.slice(0, 6) || [];
        firstFew.forEach(fn => {
          allEdges.push({ source: 'main_topic', target: fn.id, label: 'parent' });
        });
      }

      // Repulsion
      for (let i = 0; i < currentNodes.length; i++) {
        const n1 = currentNodes[i];
        for (let j = i + 1; j < currentNodes.length; j++) {
          const n2 = currentNodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = n1.id === 'main_topic' || n2.id === 'main_topic' ? 100 : 70;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.05 * simAlpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (n1.id !== 'main_topic') { n1.vx += fx; n1.vy += fy; }
            if (n2.id !== 'main_topic') { n2.vx -= fx; n2.vy -= fy; }
          }
        }
      }

      // Attraction
      allEdges.forEach(edge => {
        const n1 = currentNodes.find(n => n.id === edge.source);
        const n2 = currentNodes.find(n => n.id === edge.target);
        if (n1 && n2) {
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = n1.id === 'main_topic' || n2.id === 'main_topic' ? 120 : 80;
          const force = (dist - desiredDist) * 0.03 * simAlpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (n1.id !== 'main_topic') { n1.vx -= fx; n1.vy -= fy; }
          if (n2.id !== 'main_topic') { n2.vx += fx; n2.vy += fy; }
        }
      });

      // Update positions
      currentNodes.forEach(n => {
        if (n.id === 'main_topic') {
          n.x = 200;
          n.y = 200;
          return;
        }

        const dx = 200 - n.x;
        const dy = 200 - n.y;
        n.vx += dx * 0.003;
        n.vy += dy * 0.003;

        n.vx *= 0.85;
        n.vy *= 0.85;

        n.x += n.vx;
        n.y += n.vy;
      });

      simRef.current = currentNodes;
      setSimNodes([...currentNodes]);
      setSimAlpha(prev => Math.max(0, prev - 0.005));
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [simNodes, simAlpha, graphData]);

  // Actions
  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeConversationId || sendingMsg) return;
    
    const userText = chatInput;
    setChatInput('');
    setSendingMsg(true);

    // optimistically add user message to list
    const tempUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await api.post(`/api/chat/conversations/${activeConversationId}/messages`, {
        content: userText
      });
      setMessages(prev => [...prev, res.data]);
    } catch (err) {
      alert("Failed to send message to assistant.");
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSmartFeature = async (type: string) => {
    if (type === 'summary') {
      setGeneratingSummary(true);
      try {
        const res = await api.post('/api/features/summary', {
          document_id: doc_id,
          summary_type: summaryType
        });
        setSummaryOutput(res.data.summary);
      } catch (e) {
        alert("Failed to generate summary.");
      } finally {
        setGeneratingSummary(false);
      }
    } else if (type === 'flashcards') {
      setGeneratingCards(true);
      try {
        const res = await api.post('/api/features/flashcards', {
          document_id: doc_id,
          workspace_id: ws_id
        });
        setFlashcards(res.data);
      } catch (e) {
        alert("Failed to generate cards.");
      } finally {
        setGeneratingCards(false);
      }
    } else if (type === 'quiz') {
      setGeneratingQuiz(true);
      setQuizScore(null);
      setSelectedQuizAnswers({});
      try {
        const res = await api.post('/api/features/quizzes', {
          document_id: doc_id,
          workspace_id: ws_id
        });
        setQuiz(res.data.questions);
      } catch (e) {
        alert("Failed to generate quiz.");
      } finally {
        setGeneratingQuiz(false);
      }
    }
  };

  const handleSaveNote = async () => {
    if (!noteId) return;
    setSavingNote(true);
    try {
      await api.put(`/api/notes/${noteId}`, {
        title: noteTitle,
        content: noteContent
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      alert("Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  const handleAIEnhanceNote = async (instruction: string) => {
    if (!noteId) return;
    setImprovingNote(true);
    try {
      const res = await api.post(`/api/notes/${noteId}/ai-improve`, {
        prompt_instruction: instruction
      });
      setNoteContent(res.data.content);
    } catch (e) {
      alert("AI Improve operation failed.");
    } finally {
      setImprovingNote(false);
    }
  };

  const handleAddBookmark = async () => {
    const pageText = chunks.filter(c => c.page === currentPage).map(c => c.text).join('\n');
    if (!pageText) return;
    try {
      const res = await api.post('/api/features/bookmarks', {
        document_id: doc_id,
        page_number: currentPage,
        type: 'page',
        content: pageText.substring(0, 200) + '...'
      });
      setBookmarks(prev => [res.data, ...prev]);
    } catch (e) {
      alert("Failed to bookmark page");
    }
  };

  const handleDeleteBookmark = async (bmId: string) => {
    try {
      await api.delete(`/api/features/bookmarks/${bmId}`);
      setBookmarks(prev => prev.filter(b => b.id !== bmId));
    } catch (e) {
      alert("Failed to delete bookmark");
    }
  };

  const handlePageAIAction = async (task: string) => {
    try {
      alert(`Triggering AI on page ${currentPage}. AI output will append to chat...`);
      const res = await api.post('/api/features/page-ai', {
        document_id: doc_id,
        page_number: currentPage,
        task_type: task
      });
      
      // Post assistant response to messages list
      const msg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `### Page ${currentPage} - ${task.toUpperCase()} analysis:\n\n${res.data.result}`,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, msg]);
      setActiveTab('chat');
    } catch (e) {
      alert("Page AI action failed.");
    }
  };

  // Score Quiz
  const handleScoreQuiz = () => {
    let score = 0;
    quiz.forEach((q, idx) => {
      if (selectedQuizAnswers[idx] === q.answer) {
        score++;
      }
    });
    setQuizScore(score);
  };

  // Helper text highlighters
  const highlightSearchText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === search.toLowerCase() 
            ? <mark key={i} className="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">{part}</mark>
            : part
        )}
      </>
    );
  };

  const renderNotionMarkdown = (text: string) => {
    const lines = text.split('\n');
    let insideCodeBlock = false;
    let codeContent: string[] = [];

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('```')) {
        if (insideCodeBlock) {
          insideCodeBlock = false;
          const codeText = codeContent.join('\n');
          codeContent = [];
          return (
            <pre key={idx} className="my-3 p-3.5 rounded-xl bg-card border border-border text-[10px] font-mono text-foreground overflow-x-auto whitespace-pre leading-relaxed select-text">
              <code>{codeText}</code>
            </pre>
          );
        } else {
          insideCodeBlock = true;
          return null;
        }
      }

      if (insideCodeBlock) {
        codeContent.push(line);
        return null;
      }

      if (trimmed.startsWith('# ')) {
        return <h1 key={idx} className="text-sm font-bold tracking-tight text-foreground border-b border-border pb-1.5 mt-5 mb-2 leading-tight uppercase tracking-wider">{trimmed.substring(2)}</h1>;
      }
      if (trimmed.startsWith('## ')) {
        return <h2 key={idx} className="text-xs font-bold tracking-tight text-foreground mt-4 mb-1.5 leading-tight">{trimmed.substring(3)}</h2>;
      }
      if (trimmed.startsWith('### ')) {
        return <h3 key={idx} className="text-[11px] font-bold tracking-tight text-foreground mt-3 mb-1">{trimmed.substring(4)}</h3>;
      }
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        return <li key={idx} className="ml-4 list-disc text-[11px] text-muted-foreground leading-relaxed my-0.5">{trimmed.substring(2)}</li>;
      }
      if (trimmed.startsWith('> ')) {
        return (
          <blockquote key={idx} className="my-3 p-3 rounded-r-xl border-l-4 border-primary bg-card/40 text-[11px] text-muted-foreground leading-relaxed italic">
            {trimmed.substring(2)}
          </blockquote>
        );
      }
      if (!trimmed) return <div key={idx} className="h-2"></div>;
      
      const boldParts = line.split(/\*\*([^*]+)\*\*/g);
      if (boldParts.length > 1) {
        return (
          <p key={idx} className="text-[11px] text-muted-foreground leading-relaxed my-1.5 select-text">
            {boldParts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-bold text-foreground">{part}</strong> : part)}
          </p>
        );
      }

      return <p key={idx} className="text-[11px] text-muted-foreground leading-relaxed my-1.5 select-text">{line}</p>;
    });
  };

  // Get current page content
  const currentPageChunks = chunks.filter(c => c.page === currentPage);

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col space-y-4">
      
      {/* Title & Back breadcrumbs */}
      <div className="flex justify-between items-center bg-card border border-border/80 p-3 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-3 min-w-0">
          <button 
            onClick={() => navigate('/workspace')}
            className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0">
            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Document Workspace</span>
            <h2 className="text-xs font-bold truncate leading-none mt-1">{docName}</h2>
          </div>
        </div>

        {/* Quick Operations toolbar */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleAddBookmark}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold hover:bg-accent transition"
          >
            <BookMarked size={12} />
            <span>Bookmark Page</span>
          </button>
        </div>
      </div>

      {/* Split grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-0">
        
        {/* Left Side: Document Viewer */}
        <div className="rounded-2xl border border-border/80 bg-card flex flex-col overflow-hidden shadow-sm">
          
          {/* Viewer Toolbar */}
          <div className="p-3 border-b border-border bg-card flex items-center justify-between flex-wrap gap-2">
            
            {/* Page navigation */}
            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1 rounded-lg border border-border hover:bg-accent disabled:opacity-30 text-muted-foreground transition"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-bold text-foreground">Page {currentPage} of {numPages}</span>
              <button
                disabled={currentPage === numPages}
                onClick={() => setCurrentPage(prev => Math.min(numPages, prev + 1))}
                className="p-1 rounded-lg border border-border hover:bg-accent disabled:opacity-30 text-muted-foreground transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* In-doc search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={11} />
              <input
                type="text"
                placeholder="Search in paper..."
                value={viewerSearchQuery}
                onChange={(e) => setViewerSearchQuery(e.target.value)}
                className="pl-7 pr-3 py-1 rounded-lg bg-background border border-border/80 text-[11px] focus:outline-none focus:border-primary w-36 transition"
              />
              {viewerSearchMatches.length > 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary">
                  {viewerSearchMatches.length} pages
                </span>
              )}
            </div>

            {/* Quick Page AI Actions */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => handlePageAIAction('summarize')}
                className="px-3 py-1 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-bold transition"
              >
                Summarize Page
              </button>
              <button
                onClick={() => handlePageAIAction('explain')}
                className="px-3 py-1 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-bold transition"
              >
                Explain Page
              </button>
            </div>

          </div>

          {/* Viewer Pages panel container */}
          <div className="flex-1 overflow-y-auto p-6 bg-muted/40">
            {loadingDoc ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={36} className="animate-spin text-primary" />
              </div>
            ) : currentPageChunks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 p-6 text-muted-foreground text-xs">
                <FileText size={48} className="text-muted/20" />
                <p>No readable text extracted on this page.<br/>Try triggering OCR or check if this page is blank.</p>
              </div>
            ) : (
              <div className="bg-card border border-border/80 p-8 rounded-xl shadow-sm hover:shadow-md transition min-h-[550px] flex flex-col justify-between relative select-text leading-relaxed">
                
                {/* Search indicator */}
                {viewerSearchQuery && !viewerSearchMatches.includes(currentPage) && (
                  <div className="absolute top-3 right-3 text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">No matching search query on this page</div>
                )}
                
                <div className="text-sm space-y-4 whitespace-pre-wrap font-sans text-foreground/90">
                  {currentPageChunks.map((chunk, i) => (
                    <p key={i}>
                      {highlightSearchText(chunk.text, viewerSearchQuery)}
                    </p>
                  ))}
                </div>

                <div className="border-t border-border pt-4 mt-8 flex justify-between items-center text-[10px] text-muted-foreground font-semibold">
                  <span>Nexus AI Document Reader v1.0</span>
                  <span>PAGE {currentPage}</span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Interactive AI Assistant tabs */}
        <div className="rounded-2xl border border-border/80 bg-card flex flex-col overflow-hidden min-h-0 shadow-sm">
          
          {/* Tab Selector Header */}
          <div className="flex border-b border-border bg-card p-0">
            {[
              { id: 'chat', label: 'AI Chat', icon: MessageSquare },
              { id: 'smart', label: 'Smart Hub', icon: Sparkles },
              { id: 'graph', label: 'Concept Graph', icon: BrainCircuit },
              { id: 'notes', label: 'Study Notes', icon: BookOpen },
              { id: 'bookmarks', label: 'Bookmarks', icon: BookMarked },
            ].map(t => {
              const Icon = t.icon;
              const isSelected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`flex-1 flex items-center justify-center space-x-1.5 py-3 px-1 text-xs font-bold transition rounded-none border-b-2 ${
                    isSelected 
                      ? 'border-primary text-primary bg-primary/5' 
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/20'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab body contents */}
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            
            {/* Tab 1: AI Chat */}
            {activeTab === 'chat' && (
              <div className="h-full flex flex-col justify-between min-h-[450px]">
                
                {/* Message logs */}
                <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-4">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-xs text-muted-foreground py-16">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <MessageSquare size={20} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-foreground">Start RAG Conversation</h4>
                        <p className="max-w-xs leading-normal">Ask explainers, summaries, limitation reviews, or generate study prompts for this paper. Every detail is grounded in context.</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2 border ${
                          msg.role === 'user' 
                            ? 'bg-primary text-primary-foreground border-primary/20 rounded-br-none' 
                            : 'bg-background border-border/80 rounded-bl-none'
                        }`}>
                          <p className="font-medium whitespace-pre-wrap">{msg.content}</p>
                          
                          {/* Citations list */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="border-t border-border pt-2 mt-2 space-y-1">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold block">References / Citations:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.citations.map((cit) => (
                                  <button
                                    key={cit.citation_number}
                                    onClick={() => setCurrentPage(cit.page)}
                                    className="px-2 py-0.5 rounded bg-secondary text-[9px] font-semibold text-primary hover:bg-primary hover:text-white transition flex items-center space-x-1"
                                    title={cit.text}
                                  >
                                    <span>[{cit.citation_number}] Page {cit.page}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {sendingMsg && (
                    <div className="flex justify-start">
                      <div className="bg-background border border-border p-4 rounded-2xl rounded-bl-none flex items-center space-x-2">
                        <Loader2 size={14} className="animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Searching vectors & reading LLM context...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input block */}
                <form onSubmit={handleSendQuery} className="border-t border-border/40 pt-3 mt-2 flex items-center space-x-2 bg-card">
                  <div className="flex-1 relative flex items-center bg-muted/40 rounded-full border border-border/65 px-3 py-1">
                    <Sparkles size={13} className="text-muted-foreground/80 flex-shrink-0 mr-2" />
                    <input
                      type="text"
                      required
                      placeholder="Ask Nexus about this document..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 bg-transparent border-none py-1.5 focus:outline-none text-xs text-foreground placeholder-muted-foreground/75"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sendingMsg || !chatInput.trim()}
                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 flex-shrink-0"
                  >
                    <CornerDownLeft size={14} />
                  </button>
                </form>
              </div>
            )}

            {/* Tab 2: Smart features Hub */}
            {activeTab === 'smart' && (
              <div className="space-y-6">
                
                {/* 1. Summarizer tool */}
                <div className="p-4 rounded-xl border border-border bg-background/40 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Smart Summary Generator</h4>
                    <select
                      value={summaryType}
                      onChange={(e) => setSummaryType(e.target.value)}
                      className="px-2 py-1 rounded bg-card border border-border text-[10px] font-semibold focus:outline-none"
                    >
                      <option value="brief">Concise Brief</option>
                      <option value="detailed">Structured Detailed</option>
                      <option value="notes">Bullet Notes</option>
                      <option value="concepts">Key Concepts list</option>
                    </select>
                  </div>
                  <button
                    onClick={() => handleSmartFeature('summary')}
                    disabled={generatingSummary}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition flex items-center justify-center space-x-2"
                  >
                    {generatingSummary ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>{generatingSummary ? 'Synthesizing...' : 'Generate Summary'}</span>
                  </button>
                  {summaryOutput && (
                    <div className="p-3.5 rounded-lg bg-card border border-border text-xs leading-relaxed whitespace-pre-wrap select-text">
                      {summaryOutput}
                    </div>
                  )}
                </div>

                {/* 2. Flashcards */}
                <div className="p-4 rounded-xl border border-border bg-background/40 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Flashcards Generator</h4>
                  <button
                    onClick={() => handleSmartFeature('flashcards')}
                    disabled={generatingCards}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition flex items-center justify-center space-x-2"
                  >
                    {generatingCards ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>{generatingCards ? 'Compiling deck...' : 'Create Study Flashcards'}</span>
                  </button>
                  {flashcards.length > 0 && (
                    <div className="grid grid-cols-1 gap-4">
                      {flashcards.map((c, i) => (
                        <div 
                          key={i}
                          onClick={() => setFlippedCards(prev => ({ ...prev, [i]: !prev[i] }))}
                          className="w-full h-32 cursor-pointer [perspective:1000px]"
                        >
                          <div className={`relative w-full h-full duration-500 [transform-style:preserve-3d] transition-transform ${flippedCards[i] ? '[transform:rotateY(180deg)]' : ''}`}>
                            
                            {/* Front Face (Question) */}
                            <div className={`absolute inset-0 w-full h-full border rounded-xl p-4 flex flex-col justify-between [backface-visibility:hidden] ${
                              i % 2 === 0 ? 'bg-[#E2F0F3] border-[#C9E5EC]' : 'bg-[#F8ECE8] border-[#ECDCD9]'
                            }`}>
                              <span className="text-[9px] text-[#3B6634] uppercase font-bold tracking-wider">Question</span>
                              <p className="text-xs font-bold text-foreground text-center my-auto px-2">{c.question}</p>
                              <span className="text-[8px] text-muted-foreground/80 text-center">Click to flip</span>
                            </div>

                            {/* Back Face (Answer) */}
                            <div className="absolute inset-0 w-full h-full bg-card border border-border rounded-xl p-4 flex flex-col justify-between [transform:rotateY(180deg)] [backface-visibility:hidden]">
                              <span className="text-[9px] text-[#86A779] uppercase font-bold tracking-wider">Answer</span>
                              <p className="text-xs text-muted-foreground text-center my-auto leading-relaxed px-2 font-medium">{c.answer}</p>
                              <span className="text-[8px] text-muted-foreground text-center">Click to flip back</span>
                            </div>
                            
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Quiz */}
                <div className="p-4 rounded-xl border border-border bg-background/40 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">MCQ Quiz Generator</h4>
                  <button
                    onClick={() => handleSmartFeature('quiz')}
                    disabled={generatingQuiz}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/95 transition flex items-center justify-center space-x-2"
                  >
                    {generatingQuiz ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>{generatingQuiz ? 'Drafting quiz...' : 'Create MCQ Quiz'}</span>
                  </button>
                  {quiz.length > 0 && (
                    <div className="space-y-5">
                      {quiz.map((q, idx) => {
                        const isAnswered = selectedQuizAnswers[idx] !== undefined;
                        const selectedOpt = selectedQuizAnswers[idx];
                        
                        return (
                          <div key={idx} className="space-y-2.5 text-xs border-b border-border/40 pb-4 last:border-b-0">
                            <p className="font-semibold text-foreground">{idx + 1}. {q.question}</p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map(opt => {
                                const isSelected = selectedOpt === opt;
                                const isCorrectOpt = opt === q.answer;
                                
                                let btnClass = 'border-border bg-card hover:bg-accent';
                                if (isAnswered) {
                                  if (isCorrectOpt) {
                                    btnClass = 'bg-green-500/10 border-green-500 text-green-500 font-bold';
                                  } else if (isSelected) {
                                    btnClass = 'bg-red-500/10 border-red-500 text-red-500 font-bold';
                                  } else {
                                    btnClass = 'border-border/40 opacity-50 bg-card cursor-not-allowed';
                                  }
                                }
                                
                                return (
                                  <button
                                    key={opt}
                                    disabled={isAnswered}
                                    onClick={() => setSelectedQuizAnswers(prev => ({ ...prev, [idx]: opt }))}
                                    className={`px-3 py-2 text-left rounded-lg border text-xs transition-all duration-200 ${btnClass}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                            
                            {isAnswered && (
                              <div className="mt-2 p-3 rounded-xl bg-accent/40 border border-border text-[11px] leading-relaxed">
                                <p className="font-bold text-primary mb-0.5">
                                  {selectedOpt === q.answer ? '✓ Correct' : '✗ Incorrect'}
                                </p>
                                <p className="text-muted-foreground"><span className="font-semibold text-foreground">Explanation:</span> {q.explanation}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {Object.keys(selectedQuizAnswers).length === quiz.length && (
                        <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-center mt-4">
                          <p className="font-bold text-green-500 text-sm">
                            Quiz Completed: {quiz.filter((q, idx) => selectedQuizAnswers[idx] === q.answer).length} / {quiz.length}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Tab 3: Interactive SVG Concept Graph */}
            {activeTab === 'graph' && (
              <div className="h-full flex flex-col justify-between min-h-[480px] space-y-4">
                
                {/* Search & Filters Header */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2 justify-between sm:items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interactive Knowledge Graph</h4>
                    
                    {/* Graph search input */}
                    <div className="relative w-full sm:w-56">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                      <input
                        type="text"
                        placeholder="Search node..."
                        value={graphSearchQuery}
                        onChange={(e) => setGraphSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1 bg-background border border-border/80 rounded-lg text-[11px] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Filter chips */}
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border/40">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'concepts', label: 'Concepts' },
                      { id: 'algorithms', label: 'Algorithms' },
                      { id: 'datasets', label: 'Datasets' },
                      { id: 'formulae', label: 'Formulae' },
                      { id: 'examples', label: 'Examples' }
                    ].map(chip => (
                      <button
                        key={chip.id}
                        onClick={() => {
                          setGraphFilter(chip.id as any);
                          setSimAlpha(0.5); // kick physics slightly to re-center
                        }}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition ${
                          graphFilter === chip.id
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'bg-card border-border hover:bg-accent text-muted-foreground'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingGraph ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                ) : !graphData ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                    Could not parse concepts.
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-between space-y-4">
                    
                    {/* SVG GRAPH RENDER */}
                    <div 
                      className="aspect-video w-full border border-border bg-card rounded-xl overflow-hidden relative shadow-inner select-none cursor-grab active:cursor-grabbing"
                      onWheel={(e) => {
                        // Mouse zoom
                        const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
                        setZoom(prev => Math.min(3, Math.max(0.4, prev * zoomFactor)));
                      }}
                      onMouseDown={(e) => {
                        // Panning init
                        if (draggedNodeId) return;
                        const startX = e.clientX - pan.x;
                        const startY = e.clientY - pan.y;
                        
                        const handleMouseMove = (mvEvent: MouseEvent) => {
                          setPan({
                            x: mvEvent.clientX - startX,
                            y: mvEvent.clientY - startY
                          });
                        };
                        const handleMouseUp = () => {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        };
                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      {/* Grid background */}
                      <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:20px_20px]" />

                      <svg width="100%" height="100%" viewBox="0 0 400 400">
                        
                        {/* Pan/Zoom wrapper group */}
                        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                          
                          {/* Edges layer */}
                          {graphData.edges.map((edge, i) => {
                            const srcNode = simNodes.find(n => n.id === edge.source) || (edge.source === 'main_topic' ? simNodes.find(n => n.id === 'main_topic') : null);
                            const tgtNode = simNodes.find(n => n.id === edge.target);
                            if (!srcNode || !tgtNode) return null;

                            // Highlight neighborhood links
                            const isSearchFiltered = 
                              (graphSearchQuery && (!srcNode.label.toLowerCase().includes(graphSearchQuery.toLowerCase()) && !tgtNode.label.toLowerCase().includes(graphSearchQuery.toLowerCase()))) ||
                              (graphFilter !== 'all' && srcNode.category !== graphFilter && tgtNode.category !== graphFilter);

                            const isNeighbour = selectedGraphNode === srcNode.id || selectedGraphNode === tgtNode.id;
                            const isHovered = hoveredNodeId === srcNode.id || hoveredNodeId === tgtNode.id;
                            
                            let linkOpacity = 0.25;
                            let strokeWidth = srcNode.id === 'main_topic' ? 2 : 1;

                            if (graphSearchQuery || graphFilter !== 'all') {
                              linkOpacity = isSearchFiltered ? 0.05 : 0.4;
                            } else if (selectedGraphNode) {
                              linkOpacity = isNeighbour ? 0.8 : 0.05;
                              if (isNeighbour) strokeWidth += 1;
                            } else if (hoveredNodeId) {
                              linkOpacity = isHovered ? 0.8 : 0.05;
                              if (isHovered) strokeWidth += 1;
                            }

                            // Curved Bezier path calculation
                            const dx = tgtNode.x - srcNode.x;
                            const dy = tgtNode.y - srcNode.y;
                            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                            const midX = (srcNode.x + tgtNode.x) / 2 + (dy / dist) * 15;
                            const midY = (srcNode.y + tgtNode.y) / 2 - (dx / dist) * 15;
                            const path = `M ${srcNode.x} ${srcNode.y} Q ${midX} ${midY} ${tgtNode.x} ${tgtNode.y}`;

                            return (
                              <path
                                key={i}
                                d={path}
                                fill="transparent"
                                stroke="hsl(var(--primary) / 0.5)"
                                strokeWidth={strokeWidth}
                                style={{ opacity: linkOpacity, transition: 'opacity 0.2s' }}
                              />
                            );
                          })}

                          {/* Nodes layer */}
                          {simNodes.map((node) => {
                            // Filter matches check
                            const isSearchMatch = graphSearchQuery ? node.label.toLowerCase().includes(graphSearchQuery.toLowerCase()) : true;
                            const isFilterMatch = graphFilter === 'all' ? true : node.category === graphFilter;
                            const isDimmed = !isSearchMatch || !isFilterMatch;

                            // Category color palette mapping
                            const colors: Record<string, string> = {
                              main: '#3b82f6', // blue
                              concepts: '#10b981', // green
                              algorithms: '#f59e0b', // orange
                              datasets: '#8b5cf6', // purple
                              formulae: '#f43f5e', // red
                              examples: '#eab308', // yellow
                              misc: '#9ca3af' // gray
                            };
                            const nodeColor = colors[node.category] || colors.concepts;

                            // Connected highlight check
                            const allEdges = [...graphData.edges];
                            const firstFew = graphData?.nodes.slice(0, 6) || [];
                            firstFew.forEach(fn => { allEdges.push({ source: 'main_topic', target: fn.id, label: 'parent' }); });

                            const isConnected = selectedGraphNode ? (
                              selectedGraphNode === node.id ||
                              allEdges.some(e => (e.source === selectedGraphNode && e.target === node.id) || (e.target === selectedGraphNode && e.source === node.id))
                            ) : true;

                            const isHoverConnected = hoveredNodeId ? (
                              hoveredNodeId === node.id ||
                              allEdges.some(e => (e.source === hoveredNodeId && e.target === node.id) || (e.target === hoveredNodeId && e.source === node.id))
                            ) : true;

                            let nodeOpacity = 1;
                            if (isDimmed) {
                              nodeOpacity = 0.15;
                            } else if (selectedGraphNode) {
                              nodeOpacity = isConnected ? 1 : 0.2;
                            } else if (hoveredNodeId) {
                              nodeOpacity = isHoverConnected ? 1 : 0.2;
                            }

                            // Label short truncate
                            const truncatedLabel = node.label.length > 12 ? node.label.substring(0, 10) + '...' : node.label;

                            return (
                              <g 
                                key={node.id} 
                                transform={`translate(${node.x}, ${node.y})`}
                                className="cursor-pointer select-none"
                                onMouseEnter={() => setHoveredNodeId(node.id)}
                                onMouseLeave={() => setHoveredNodeId(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGraphNode(node.id);
                                }}
                                onDoubleClick={() => {
                                  // Double click: Zoom in and center on node coordinate
                                  setZoom(1.6);
                                  setPan({
                                    x: 200 - node.x * 1.6,
                                    y: 200 - node.y * 1.6
                                  });
                                }}
                                onMouseDown={(e) => {
                                  // Node drag init
                                  e.stopPropagation();
                                  setDraggedNodeId(node.id);
                                  setSimAlpha(0.8); // reactivate physics slightly
                                  
                                  const handleNodeDrag = (mvEvent: MouseEvent) => {
                                    // Translate page coordinate to local scale
                                    const svgBox = e.currentTarget.parentElement?.getBoundingClientRect();
                                    if (svgBox) {
                                      const clientX = (mvEvent.clientX - svgBox.left - pan.x) / zoom;
                                      const clientY = (mvEvent.clientY - svgBox.top - pan.y) / zoom;
                                      
                                      node.x = clientX;
                                      node.y = clientY;
                                      node.vx = 0;
                                      node.vy = 0;
                                      simRef.current = simRef.current.map(n => n.id === node.id ? node : n);
                                    }
                                  };
                                  const handleDragEnd = () => {
                                    window.removeEventListener('mousemove', handleNodeDrag);
                                    window.removeEventListener('mouseup', handleDragEnd);
                                    setDraggedNodeId(null);
                                  };
                                  window.addEventListener('mousemove', handleNodeDrag);
                                  window.addEventListener('mouseup', handleDragEnd);
                                }}
                                style={{ opacity: nodeOpacity, transition: 'opacity 0.2s' }}
                              >
                                {/* Glow active background */}
                                {selectedGraphNode === node.id && (
                                  <circle r={node.size + 5} fill="transparent" stroke={nodeColor} strokeWidth="1.5" className="animate-ping" style={{ opacity: 0.4 }} />
                                )}

                                {/* Main Node Circle */}
                                <circle
                                  r={node.size}
                                  fill={nodeColor}
                                  stroke="#ffffff"
                                  strokeWidth="1.5"
                                  className="transition-transform duration-200 shadow-sm hover:scale-115"
                                />

                                {/* Node Title Text label */}
                                <text
                                  y={node.size + 11}
                                  textAnchor="middle"
                                  fill="currentColor"
                                  fontSize={zoom < 0.75 ? "0" : "7.5"}
                                  fontWeight={node.id === 'main_topic' ? 'bold' : '600'}
                                  className="pointer-events-none text-[8px] bg-background px-1 border border-border"
                                >
                                  {truncatedLabel}
                                </text>
                              </g>
                            );
                          })}

                        </g>
                      </svg>

                      {/* Floating Graph Toolbar buttons */}
                      <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 z-10 bg-card/90 backdrop-blur border border-border/80 rounded-xl p-1 shadow-md">
                        <button
                          onClick={() => {
                            setZoom(1);
                            setPan({ x: 0, y: 0 });
                          }}
                          className="px-2 py-1 rounded-lg hover:bg-accent text-[9px] font-bold text-foreground transition"
                          title="Reset center alignment"
                        >
                          Reset View
                        </button>
                        <button
                          onClick={() => {
                            setZoom(0.8);
                            setPan({ x: 40, y: 40 });
                          }}
                          className="px-2 py-1 rounded-lg hover:bg-accent text-[9px] font-bold text-foreground transition"
                          title="Resize fit to screen"
                        >
                          Fit Screen
                        </button>
                      </div>
                    </div>

                    {/* Selection info Card */}
                    {selectedGraphNode ? (
                      <div className="p-3 rounded-xl border border-border bg-card text-xs space-y-1.5 shadow-sm">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-primary">Concept: {simNodes.find(n => n.id === selectedGraphNode)?.label}</p>
                          <span className="px-2 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-bold bg-muted text-muted-foreground">
                            {simNodes.find(n => n.id === selectedGraphNode)?.category}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 leading-normal">
                          {simNodes.find(n => n.id === selectedGraphNode)?.description || 
                           "This topic or structural key identifier is mapped dynamically based on similarity models of the document text."}
                        </p>
                      </div>
                    ) : (
                      <p className="text-center text-[10px] text-muted-foreground py-2 border border-dashed border-border/85 rounded-xl">Select a concept node to read its definition overview details.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Markdown notes editor */}
            {activeTab === 'notes' && (
              <div className="h-full flex flex-col min-h-[450px] space-y-4">
                
                {/* Notes Header with Toggle and Save button */}
                <div className="flex justify-between items-center border-b border-border/60 pb-3">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setNotesEditMode(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        notesEditMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      Edit Note
                    </button>
                    <button
                      onClick={() => setNotesEditMode(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        !notesEditMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      Notion Preview
                    </button>
                  </div>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold transition ${
                      saveSuccess 
                        ? 'bg-green-600 text-white' 
                        : 'bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50'
                    }`}
                  >
                    {saveSuccess ? (
                      <>
                        <Check size={12} />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <Save size={12} />
                        <span>{savingNote ? 'Saving...' : 'Save Notes'}</span>
                      </>
                    )}
                  </button>
                </div>

                {notesEditMode ? (
                  <div className="flex-1 flex flex-col space-y-3 min-h-0">
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="bg-transparent font-bold text-sm text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1"
                    />
                    
                    {/* AI improvement options row */}
                    <div className="flex flex-wrap gap-1 border-y border-border py-2 text-[10px] text-muted-foreground">
                      <span className="self-center font-bold mr-1">AI Writing Assistant:</span>
                      {[
                        { id: 'expand', label: 'Expand Details' },
                        { id: 'fix_grammar', label: 'Fix grammar' },
                        { id: 'add_examples', label: 'Add code/examples' },
                        { id: 'simplify', label: 'Simplify language' }
                      ].map(op => (
                        <button
                          key={op.id}
                          onClick={() => handleAIEnhanceNote(op.id)}
                          disabled={improvingNote}
                          className="px-2 py-0.5 rounded border border-border bg-card hover:bg-accent/40 disabled:opacity-40"
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>

                    {improvingNote && (
                      <div className="p-2 bg-primary/10 border border-primary/20 text-[10px] text-primary font-semibold flex items-center space-x-1.5 rounded-lg animate-pulse">
                        <Loader2 size={12} className="animate-spin" />
                        <span>AI editor running instructions to enhance notes content...</span>
                      </div>
                    )}

                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      className="flex-1 w-full p-4 rounded-xl border border-border bg-background focus:outline-none focus:border-primary text-xs leading-relaxed font-mono resize-none min-h-[300px]"
                      placeholder="# Enter your markdown study details here..."
                    />
                  </div>
                ) : (
                  <div className="flex-1 p-5 rounded-2xl border border-border bg-card overflow-y-auto max-h-[500px] shadow-inner select-text">
                    <h1 className="text-base font-extrabold tracking-tight text-foreground border-b border-border pb-2 mb-4 leading-snug uppercase tracking-wider">{noteTitle}</h1>
                    <div className="space-y-1">
                      {renderNotionMarkdown(noteContent)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Bookmarks list */}
            {activeTab === 'bookmarks' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved Document Bookmarks</h4>
                  <span className="text-[10px] text-muted-foreground">{bookmarks.length} bookmarked items</span>
                </div>

                {bookmarks.length === 0 ? (
                  <div className="py-16 text-center text-xs text-muted-foreground">
                    No pages bookmarked for this document yet. Click the "Bookmark Page" button at the top to save references.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {bookmarks.map((bm) => (
                      <div key={bm.id} className="p-3.5 rounded-xl border border-border bg-background/40 text-xs flex justify-between items-start space-x-3.5">
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setCurrentPage(bm.page_number)}
                            className="font-bold text-primary hover:underline block text-left"
                          >
                            Page {bm.page_number} Reference
                          </button>
                          <p className="text-muted-foreground leading-normal mt-1 truncate">{bm.content}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteBookmark(bm.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};

export default DocumentWorkspace;
export { Loader2 }; // Simple loader utility export
