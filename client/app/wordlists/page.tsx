'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { WordlistAPI, Wordlist } from "@/lib/api/wordlists";
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, Globe, Lock } from "lucide-react";

export default function WordlistsPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [wordlists, setWordlists] = useState<(Wordlist & { words: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWords, setEditWords] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(false);

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        router.push('/');
      } else {
        loadWordlists();
      }
    });
  }, [router]);

  const loadWordlists = async () => {
    setLoading(true);
    try {
      const data = await WordlistAPI.getMyWordlists();
      setWordlists(data);
    } catch (err: any) {
      setError(err.message || "Failed to load wordlists");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const wordsArray = editWords.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
      if (wordsArray.length === 0) throw new Error("Please enter at least one word.");
      if (!editName.trim()) throw new Error("Please enter a name.");

      await WordlistAPI.createWordlist(editName.trim(), wordsArray, editIsPublic);
      setIsCreating(false);
      resetEditState();
      await loadWordlists();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const wordsArray = editWords.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
      if (wordsArray.length === 0) throw new Error("Please enter at least one word.");
      if (!editName.trim()) throw new Error("Please enter a name.");

      await WordlistAPI.updateWordlist(id, { name: editName.trim(), words: wordsArray, is_public: editIsPublic });
      setEditingId(null);
      resetEditState();
      await loadWordlists();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this wordlist?")) return;
    try {
      await WordlistAPI.deleteWordlist(id);
      await loadWordlists();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditing = (list: Wordlist & { words: string[] }) => {
    setEditingId(list.id);
    setEditName(list.name);
    setEditWords(list.words.join(', '));
    setEditIsPublic(list.is_public);
    setIsCreating(false);
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingId(null);
    resetEditState();
  };

  const resetEditState = () => {
    setEditName('');
    setEditWords('');
    setEditIsPublic(false);
    setError('');
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingId(null);
    resetEditState();
  };

  if (!session) return <div className="bg-[#171124] min-h-dvh"></div>;

  return (
    <div className="bg-[#171124] min-h-dvh p-8 font-quicksand text-white">
      <button 
        onClick={() => router.push('/')}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8 font-bold uppercase tracking-widest text-sm"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Menu
      </button>

      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-black font-fredoka text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
              MY WORDLISTS
            </h1>
            <p className="text-zinc-400 mt-2 font-medium">Create and manage your custom wordlists.</p>
          </div>
          {!isCreating && !editingId && (
            <button 
              onClick={startCreating}
              className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-6 py-3 rounded-xl font-black tracking-widest uppercase transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Create New
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl mb-6 font-bold flex items-center justify-between">
            {error}
            <button onClick={() => setError('')}><X className="w-5 h-5" /></button>
          </div>
        )}

        {(isCreating || editingId) && (
          <div className="bg-[#251A3D] p-6 rounded-2xl border border-violet-500/30 mb-8 shadow-xl">
            <h2 className="text-xl font-black font-fredoka mb-4 text-violet-300">
              {isCreating ? "CREATE NEW WORDLIST" : "EDIT WORDLIST"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1 pl-1">Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#171124] border border-white/10 rounded-xl p-3 text-white outline-none focus:border-violet-500 transition-colors"
                  placeholder="e.g. Animals, Hard Words"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1 pl-1">Words (comma separated)</label>
                <textarea 
                  value={editWords}
                  onChange={(e) => setEditWords(e.target.value)}
                  className="w-full bg-[#171124] border border-white/10 rounded-xl p-3 text-white outline-none focus:border-violet-500 transition-colors h-32 resize-y"
                  placeholder="apple, banana, cherry..."
                />
              </div>
              <div className="flex items-center gap-3 bg-[#171124] p-4 rounded-xl border border-white/10 w-fit">
                <input 
                  type="checkbox" 
                  id="is_public"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="w-5 h-5 accent-violet-500"
                />
                <label htmlFor="is_public" className="font-bold flex items-center gap-2 cursor-pointer">
                  {editIsPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
                  Make Public
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={isCreating ? handleCreate : () => handleUpdate(editingId!)}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center gap-2 flex-1 justify-center transition-colors"
                >
                  <Save className="w-5 h-5" /> Save
                </button>
                <button 
                  onClick={cancelEdit}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center gap-2 flex-1 justify-center transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-zinc-500 py-12 font-bold uppercase tracking-widest animate-pulse">Loading wordlists...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wordlists.length === 0 && !isCreating && !editingId && (
              <div className="col-span-full text-center py-12 bg-[#251A3D]/50 rounded-2xl border border-dashed border-white/10">
                <p className="text-zinc-500 font-medium mb-4">You haven't created any wordlists yet.</p>
                <button 
                  onClick={startCreating}
                  className="text-violet-400 font-bold hover:text-violet-300 uppercase tracking-widest flex items-center justify-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" /> Create Your First Wordlist
                </button>
              </div>
            )}
            
            {wordlists.map(list => (
              <div key={list.id} className="bg-[#251A3D] p-5 rounded-2xl border border-white/5 hover:border-violet-500/30 transition-colors group flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-black text-white">{list.name}</h3>
                    {list.is_public ? (
                      <span className="text-[10px] uppercase font-bold px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold px-2 py-1 bg-zinc-500/20 text-zinc-400 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> Private</span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-sm mb-4"><span className="text-white font-bold">{list.words.length}</span> words</p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => startEditing(list)}
                    className="flex-1 bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white py-2 rounded-lg font-bold text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(list.id)}
                    className="flex-1 bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white py-2 rounded-lg font-bold text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
