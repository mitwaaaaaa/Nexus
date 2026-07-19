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
    <div className="space-y-6">
      
      {/* Search and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input widget */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search documents instantly..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-sm text-foreground"
          />
        </div>

        {/* Buttons: Folder and Upload */}
        <div className="flex items-center space-x-3.5 self-end md:self-auto">
          <button
            onClick={handleCreateFolder}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-border bg-card font-semibold hover:bg-accent/40 transition text-sm"
          >
            <FolderPlus size={16} />
            <span>New Folder</span>
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition shadow-lg shadow-primary/10 text-sm"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Upload Document</span>
              </>
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.png,.jpg,.jpeg,.webp"
          />
        </div>

      </div>

      {/* Grid splits into tags filters on left, documents on right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar filters */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Folders grid block */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Folders</h3>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedFolderId === null ? 'bg-secondary text-primary font-bold' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Folder size={14} />
                <span>All Documents</span>
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    selectedFolderId === f.id ? 'bg-secondary text-primary font-bold' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Folder size={14} className={selectedFolderId === f.id ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="truncate">{f.name}</span>
                  </div>
                  <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Filtering sidebar options */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filters</h3>
            
            {/* Favorites filter toggle */}
            <button
              onClick={() => setFilterFavorites(!filterFavorites)}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                filterFavorites ? 'bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star size={14} className={filterFavorites ? 'fill-amber-500 text-amber-500' : ''} />
              <span>Starred Favorites</span>
            </button>

            {/* Tag cloud listing */}
            <div className="border-t border-border pt-4 space-y-2.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Filter by Tag</span>
              {allTags.length === 0 ? (
                <span className="text-xs text-muted-foreground block pl-3">No tags available.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5 pl-1.5">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${
                      selectedTag === null 
                        ? 'bg-primary border-primary text-white' 
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    Clear Tag
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition flex items-center space-x-1 ${
                        selectedTag === tag 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-border hover:bg-accent text-muted-foreground'
                      }`}
                    >
                      <Tag size={9} />
                      <span>{tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Documents listing block */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Active filters summary */}
          {(selectedFolderId || selectedTag || filterFavorites) && (
            <div className="flex items-center space-x-2.5 text-xs text-muted-foreground pb-1">
              <Filter size={12} />
              <span>Active filters:</span>
              {selectedFolderId && (
                <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                  Folder: {folders.find(f => f.id === selectedFolderId)?.name}
                </span>
              )}
              {selectedTag && <span className="px-2 py-0.5 rounded bg-muted text-foreground">Tag: {selectedTag}</span>}
              {filterFavorites && <span className="px-2 py-0.5 rounded bg-muted text-foreground">Starred</span>}
              <button 
                onClick={() => {
                  setSelectedFolderId(null);
                  setSelectedTag(null);
                  setFilterFavorites(false);
                }}
                className="text-primary hover:underline font-bold"
              >
                Clear all
              </button>
            </div>
          )}

          {/* List display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-44 shimmer-bg rounded-2xl border border-border"></div>
              ))
            ) : filteredDocs.length === 0 ? (
              <div className="col-span-2 py-24 text-center rounded-2xl border border-border bg-card flex flex-col items-center justify-center space-y-4">
                <File size={48} className="text-muted/30" />
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">No documents found</h3>
                  <p className="text-xs text-muted-foreground max-w-xs leading-normal">Try clearing filters, searching different keywords, or upload a research paper to get started.</p>
                </div>
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <div 
                  key={doc.id} 
                  onClick={() => navigate(`/workspace/${activeWorkspace.id}/document/${doc.id}`)}
                  className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between space-y-5 hover:border-primary/45 transition shadow-sm hover:shadow-md cursor-pointer relative group"
                >
                  {/* Top line: file type & favorite */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary/10 to-indigo-500/10 border border-primary/20 flex items-center justify-center text-primary font-bold uppercase text-xs">
                        {doc.file_type}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm truncate leading-tight group-hover:text-primary transition">{doc.name}</h4>
                        <span className="text-[10px] text-muted-foreground block mt-1">{formatBytes(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleToggleFavorite(doc.id, e)}
                      className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Star size={14} className={doc.is_favorite ? 'fill-amber-500 text-amber-500 border-none' : ''} />
                    </button>
                  </div>

                  {/* Tags segment */}
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map(t => (
                      <span key={t.id} className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[9px] font-semibold flex items-center space-x-0.5">
                        <Tag size={8} />
                        <span>{t.name}</span>
                      </span>
                    ))}
                    <button
                      onClick={(e) => handleAddTag(doc.id, e)}
                      className="px-2 py-0.5 rounded-md border border-border border-dashed hover:bg-accent hover:border-solid text-[9px] font-bold text-primary transition"
                    >
                      + Add Tag
                    </button>
                  </div>

                  {/* Actions line: AI status & Operations */}
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    {/* Status widget */}
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full inline-block ${
                        doc.ai_status === 'ready' ? 'bg-green-500' :
                        doc.ai_status === 'ingesting' ? 'bg-yellow-500 animate-pulse' :
                        doc.ai_status === 'failed' ? 'bg-red-500' :
                        'bg-muted'
                      }`}></span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AI {doc.ai_status}</span>
                    </div>

                    {/* Operations */}
                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => handleRenameDoc(doc, e)}
                        className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDownloadDoc(doc.id, doc.name, e)}
                        className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Download"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDoc(doc.id, e)}
                        className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default Workspace;
