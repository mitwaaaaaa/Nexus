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

  // Load Concept Graph
  useEffect(() => {
    if (activeTab === 'graph' && !graphData) {
      const fetchGraph = async () => {
        setLoadingGraph(true);
        try {
          const res = await api.get(`/api/features/concept-graph?document_id=${doc_id}`);
          
          // Compute simple layout positions for nodes to render in SVG
          const nodes = res.data.nodes.map((n: GraphNode, idx: number) => {
            const angle = (idx / res.data.nodes.length) * 2 * Math.PI;
            return {
              ...n,
              // circular spacing
              x: 180 + 120 * Math.cos(angle),
              y: 180 + 120 * Math.sin(angle)
            };
          });
          setGraphData({ nodes, edges: res.data.edges });
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingGraph(false);
        }
      };
      fetchGraph();
    }
  }, [activeTab, doc_id, graphData]);

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
              <div className="h-full flex flex-col justify-between min-h-[450px] space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Document Concept Graph</h4>
                  <span className="text-[10px] text-muted-foreground">Click nodes to inspect definitions</span>
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
                    {/* SVG RENDER */}
                    <div className="aspect-square w-full max-w-[360px] mx-auto border border-border bg-background/50 rounded-xl overflow-hidden relative shadow-inner">
                      <svg width="100%" height="100%" viewBox="0 0 360 360" className="cursor-grab select-none">
                        {/* Render Links / Edges */}
                        {graphData.edges.map((edge, i) => {
                          const srcNode = graphData.nodes.find(n => n.id === edge.source);
                          const tgtNode = graphData.nodes.find(n => n.id === edge.target);
                          if (!srcNode || !tgtNode) return null;
                          return (
                            <g key={i}>
                              <line
                                x1={srcNode.x}
                                y1={srcNode.y}
                                x2={tgtNode.x}
                                y2={tgtNode.y}
                                stroke="hsl(var(--muted-foreground) / 0.3)"
                                strokeWidth="1.5"
                              />
                            </g>
                          );
                        })}

                        {/* Render Nodes */}
                        {graphData.nodes.map((node) => (
                          <g 
                            key={node.id} 
                            transform={`translate(${node.x}, ${node.y})`}
                            onClick={() => setSelectedGraphNode(node.id)}
                            className="cursor-pointer"
                          >
                            <circle
                              r="8"
                              fill={selectedGraphNode === node.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)"}
                              stroke="hsl(var(--border))"
                              strokeWidth="2"
                              className="transition-all duration-300 hover:scale-125"
                            />
                            <text
                              y="-12"
                              textAnchor="middle"
                              fill="currentColor"
                              fontSize="8"
                              fontWeight="bold"
                              className="pointer-events-none"
                            >
                              {node.label}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>

                    {/* Selection info Card */}
                    {selectedGraphNode ? (
                      <div className="p-3.5 rounded-lg border border-border bg-card text-xs space-y-1">
                        <p className="font-bold text-primary">Concept: {graphData.nodes.find(n => n.id === selectedGraphNode)?.label}</p>
                        <p className="text-muted-foreground mt-0.5 leading-normal">
                          {graphData.nodes.find(n => n.id === selectedGraphNode)?.description || 
                           "This concept was extracted from the paper text as a primary subject key identifier."}
                        </p>
                      </div>
                    ) : (
                      <p className="text-center text-[10px] text-muted-foreground">Select a circular concept node inside the graph to review description.</p>
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
