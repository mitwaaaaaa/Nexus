import React, { useEffect, useState, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { WorkspaceItem } from '../components/SidebarLayout';
import api from '../services/api';
import { 
  Folder, FolderPlus, Plus, Search, Tag, Star, 
  Trash2, Download, Edit3, Loader2, Sparkles, Filter, ChevronRight, File
} from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
}

interface DocItem {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  ai_status: string;
  is_favorite: boolean;
  folder_id: string | null;
  tags: TagItem[];
  created_at: string;
}

interface FolderItem {
  id: string;
  name: string;
}

const Workspace: React.FC = () => {
  const { activeWorkspace } = useOutletContext<{ activeWorkspace: WorkspaceItem | null }>();
  const navigate = useNavigate();
  
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering and Searching
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filterFavorites, setFilterFavorites] = useState(false);
  
  // Upload and Creation loading
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchWorkspaceData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [docRes, foldRes] = await Promise.all([
        api.get(`/api/documents/workspace/${activeWorkspace.id}`),
        api.get(`/api/workspaces/${activeWorkspace.id}/folders`)
      ]);
      setDocuments(docRes.data);
      setFolders(foldRes.data);
    } catch (e) {
      console.error("Failed to load workspace files data.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchWorkspaceData();
  }, [activeWorkspace]);

  useEffect(() => {
    // Poll document statuses while any are in ingestion/pending state
    const interval = setInterval(() => {
      const hasIngesting = documents.some(d => d.ai_status === 'ingesting' || d.ai_status === 'pending');
      if (hasIngesting && activeWorkspace) {
        api.get(`/api/documents/workspace/${activeWorkspace.id}`).then(res => {
          setDocuments(res.data);
        }).catch(err => console.error(err));
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeWorkspace, documents]);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeWorkspace) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspace_id', activeWorkspace.id);
    if (selectedFolderId) {
      formData.append('folder_id', selectedFolderId);
    }
    
    setUploading(true);
    try {
      const res = await api.post('/api/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocuments(prev => [res.data, ...prev]);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to upload file. Size or format error.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (!name || !activeWorkspace) return;
    try {
      const res = await api.post(`/api/workspaces/${activeWorkspace.id}/folders`, {
        name,
        workspace_id: activeWorkspace.id
      });
      setFolders(prev => [...prev, res.data]);
    } catch (e) {
      alert("Failed to create folder");
    }
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document? Vector indices will be cleaned up.")) return;
    try {
      await api.delete(`/api/documents/${id}`);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      alert("Delete failed.");
    }
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/api/documents/${id}/favorite`);
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, is_favorite: res.data.is_favorite } : d));
    } catch (e) {
      alert("Favorite toggle failed.");
    }
  };

  const handleRenameDoc = async (doc: DocItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("Rename document:", doc.name);
    if (!newName || newName === doc.name) return;
    try {
      const res = await api.put(`/api/documents/${doc.id}/rename`, { name: newName });
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, name: res.data.name } : d));
    } catch (e) {
      alert("Rename failed.");
    }
  };

  const handleDownloadDoc = async (id: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.get(`/api/documents/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert("Download failed.");
    }
  };

  const handleAddTag = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tag = prompt("Enter tag name:");
    if (!tag) return;
    try {
      const res = await api.post(`/api/documents/${docId}/tags?tag_name=${tag}`);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, tags: [...d.tags, res.data] } : d));
    } catch (e) {
      alert("Failed to add tag");
    }
  };

  // Compile unique tags for filtering
  const allTagsSet = new Set<string>();
  documents.forEach(d => d.tags.forEach(t => allTagsSet.add(t.name)));
  const allTags = Array.from(allTagsSet);

  // Filter logic
  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolderId ? doc.folder_id === selectedFolderId : true;
    const matchesTag = selectedTag ? doc.tags.some(t => t.name === selectedTag) : true;
    const matchesFavorite = filterFavorites ? doc.is_favorite === true : true;
    return matchesSearch && matchesFolder && matchesTag && matchesFavorite;
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!activeWorkspace) return <div className="text-center p-8">Loading workspace...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Your Library</h1>
          <p className="text-xs text-muted-foreground mt-1">A curated collection of your knowledge, organized for focused discovery and quiet reflection.</p>
        </div>
        
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            type="text"
            placeholder="Search your library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-xs text-foreground"
          />
        </div>
      </div>

      {/* Horizontal Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
        <button
          onClick={() => {
            setSelectedFolderId(null);
            setSelectedTag(null);
            setFilterFavorites(false);
          }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
            selectedFolderId === null && selectedTag === null && !filterFavorites
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground border border-border/80'
          }`}
        >
          All Files
        </button>

        <button
          onClick={() => setFilterFavorites(!filterFavorites)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center space-x-1.5 ${
            filterFavorites
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground border border-border/80'
          }`}
        >
          <Star size={12} className={filterFavorites ? 'fill-primary-foreground text-primary-foreground border-none' : ''} />
          <span>Favorites</span>
        </button>

        {/* Folder pills */}
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedFolderId(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
              selectedFolderId === f.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/80'
            }`}
          >
            {f.name}
          </button>
        ))}

        <div className="h-5 w-px bg-border/60 mx-1"></div>

        {/* Folder Creator */}
        <button
          onClick={handleCreateFolder}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-full border border-dashed border-border hover:border-primary text-xs font-semibold text-primary transition"
        >
          <Plus size={12} />
          <span>New Folder</span>
        </button>
      </div>

      {/* Tag pills bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mr-1.5">Tags:</span>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition flex items-center space-x-1 ${
                selectedTag === tag
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-card border-border hover:bg-accent text-muted-foreground'
              }`}
            >
              <Tag size={8} />
              <span>{tag}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Upload Card at the beginning */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-card/40 hover:bg-card/80 transition p-6 flex flex-col items-center justify-center space-y-3 cursor-pointer min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Plus size={20} />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-foreground">Upload New Content</p>
            <p className="text-[10px] text-muted-foreground mt-1">Drag and drop or click to browse</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.png,.jpg,.jpeg,.webp"
          />
        </div>

        {/* Documents mapping */}
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="min-h-[220px] shimmer-bg rounded-2xl border border-border"></div>
          ))
        ) : filteredDocs.length === 0 ? (
          <div className="col-span-1 md:col-span-2 lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center space-y-3 text-center min-h-[220px]">
            <File size={36} className="text-muted/40" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-foreground">No matches found</p>
              <p className="text-[10px] text-muted-foreground max-w-xs">No documents fit the selected filter settings. Click "All Files" to reset.</p>
            </div>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            // Generate a beautiful consistent color gradient cover depending on doc.id hash
            const colors = [
              ['from-[#E2D4C9] to-[#C9DFE2]', 'text-amber-800 bg-amber-500/10 border-amber-500/20'],
              ['from-[#C9E2CC] to-[#D5C9E2]', 'text-green-800 bg-green-500/10 border-green-500/20'],
              ['from-[#E2C9C9] to-[#C9DCE2]', 'text-red-800 bg-red-500/10 border-red-500/20'],
              ['from-[#DFE2C9] to-[#C9CFE2]', 'text-teal-800 bg-teal-500/10 border-teal-500/20']
            ];
            const hash = doc.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const coverStyle = colors[hash % colors.length];

            return (
              <div 
                key={doc.id} 
                onClick={() => navigate(`/workspace/${activeWorkspace.id}/document/${doc.id}`)}
                className="rounded-2xl border border-border/80 bg-card hover:border-primary/40 transition shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between overflow-hidden group min-h-[220px]"
              >
                {/* Visual Cover Header */}
                <div className={`h-24 bg-gradient-to-br ${coverStyle[0]} relative flex items-center justify-center p-4 border-b border-border/30`}>
                  <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition"></div>
                  <div className="w-10 h-10 rounded-xl bg-white/95 shadow-sm border border-border/20 flex items-center justify-center text-primary font-bold uppercase text-[10px] z-10">
                    {doc.file_type}
                  </div>
                  <button
                    onClick={(e) => handleToggleFavorite(doc.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 hover:bg-white border border-border/20 text-muted-foreground hover:text-foreground z-10 shadow-sm"
                  >
                    <Star size={11} className={doc.is_favorite ? 'fill-amber-500 text-amber-500 border-none' : ''} />
                  </button>
                </div>

                {/* Info and tags */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-xs truncate leading-tight text-foreground group-hover:text-primary transition">{doc.name}</h4>
                    <span className="text-[10px] text-muted-foreground block">{formatBytes(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>

                  {/* Tags segments */}
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map(t => (
                      <span key={t.id} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[8px] font-semibold flex items-center space-x-0.5">
                        <Tag size={7} />
                        <span>{t.name}</span>
                      </span>
                    ))}
                    <button
                      onClick={(e) => handleAddTag(doc.id, e)}
                      className="px-1.5 py-0.5 rounded border border-border border-dashed hover:bg-accent hover:border-solid text-[8px] font-bold text-primary transition"
                    >
                      + tag
                    </button>
                  </div>

                  {/* Actions line: AI status & Operations */}
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    {/* Status badge */}
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                        doc.ai_status === 'ready' ? 'bg-primary' :
                        doc.ai_status === 'ingesting' ? 'bg-yellow-500 animate-pulse' :
                        doc.ai_status === 'failed' ? 'bg-red-500' :
                        'bg-muted'
                      }`}></span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">AI {doc.ai_status}</span>
                    </div>

                    {/* Operations */}
                    <div className="flex items-center space-x-1 opacity-70 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => handleRenameDoc(doc, e)}
                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={(e) => handleDownloadDoc(doc.id, doc.name, e)}
                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Download"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDoc(doc.id, e)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default Workspace;
