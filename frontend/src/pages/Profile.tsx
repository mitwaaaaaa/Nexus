import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { User, Key, HardDrive, ShieldCheck, Check, Save } from 'lucide-react';

const Profile: React.FC = () => {
  const { user, updateUserKeys, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch full details
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get('/api/auth/me');
        setFullName(res.data.full_name || '');
        setOpenaiKey(res.data.openai_key || '');
        setGeminiKey(res.data.gemini_key || '');
      } catch (e) {
        console.error(e);
      }
    };
    loadProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setSuccess(false);
    try {
      // Save name
      await api.put('/api/auth/me', {
        full_name: fullName,
        openai_key: openaiKey,
        gemini_key: geminiKey
      });
      await updateUserKeys(openaiKey, geminiKey);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert("Failed to update profile settings.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account profile details, credentials, and API access keys</p>
      </div>

      {/* Main card form */}
      <form onSubmit={handleSave} className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6">
        
        {/* Success Banner */}
        {success && (
          <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-semibold flex items-center space-x-2">
            <Check size={16} />
            <span>Profile and AI API Keys updated successfully.</span>
          </div>
        )}

        {/* 1. Account Details */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-2">
            <User size={16} />
            <span>Account Details</span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
              <input
                type="text"
                required
                placeholder="Dr. Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 rounded-xl bg-background/50 border border-border text-xs text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border"></div>

        {/* 2. Custom AI API Keys */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-2">
            <Key size={16} />
            <span>Custom AI API Keys</span>
          </h3>
          <p className="text-xs text-muted-foreground leading-normal">
            By default, Nexus uses system-provided API credentials. To use your own limits and prevent rate restriction, enter your credentials below. Keys are stored securely and never shared.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">OpenAI API Key (Optional)</label>
              <input
                type="password"
                placeholder="sk-proj-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Google Gemini API Key (Optional)</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:outline-none focus:border-primary text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border"></div>

        {/* 3. Account Tier */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-2">
            <ShieldCheck size={16} />
            <span>Account Role & Tier</span>
          </h3>
          <div className="p-4 rounded-xl bg-secondary/35 border border-border flex justify-between items-center text-xs">
            <div>
              <p className="font-bold text-foreground">Free Research Tier</p>
              <p className="text-muted-foreground mt-0.5">Permissions: Document management, single-doc & multi-doc chat, quiz generation.</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider text-[10px]">
              {user?.is_admin ? 'Admin User' : 'Standard'}
            </span>
          </div>
        </div>

        {/* Save button */}
        <div className="border-t border-border pt-6 flex justify-end">
          <button
            type="submit"
            disabled={updating}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition shadow-lg shadow-primary/10 text-xs disabled:opacity-50"
          >
            <Save size={14} />
            <span>{updating ? 'Saving Changes...' : 'Save Settings'}</span>
          </button>
        </div>

      </form>

    </div>
  );
};

export default Profile;
