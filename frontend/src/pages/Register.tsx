import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BrainCircuit, Lock, Mail, User as UserIcon, AlertCircle } from 'lucide-react';

const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, fullName);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Email might already exist.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/20 via-background to-background">
      
      {/* Background glowing blurs */}
      <div className="absolute top-1/4 right-1/4 w-80 h-80 rounded-full bg-primary/10 blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl -z-10 animate-pulse" style={{ animationDelay: '2s' }}></div>

      {/* Main card */}
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/60 glass p-8 shadow-premium relative">
        
        {/* Header Logo */}
        <div className="flex flex-col items-center space-y-2 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center text-white glow-primary">
            <BrainCircuit size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Get Started</h1>
          <p className="text-xs text-muted-foreground text-center">Create your Nexus AI account</p>
        </div>

        {/* Success Alert */}
        {success && (
          <div className="mb-5 flex items-start space-x-2.5 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-sm leading-tight">
            <span>Registration successful! Redirecting to login...</span>
          </div>
        )}

        {/* Errors Alert */}
        {error && (
          <div className="mb-5 flex items-start space-x-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm leading-tight">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                required
                placeholder="Dr. John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-sm text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-sm text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition text-sm text-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || success}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition shadow-lg shadow-primary/10 flex items-center justify-center text-sm disabled:opacity-50"
          >
            {submitting ? 'Registering...' : 'Sign Up'}
          </button>
        </form>

        {/* Redirect Footer */}
        <div className="mt-8 border-t border-border/50 pt-5 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </div>

      </div>
    </div>
  );
};

export default Register;
