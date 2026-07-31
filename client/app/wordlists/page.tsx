'use client';

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { WordlistAPI, Wordlist } from "@/lib/api/wordlists";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import Card from "@/components/Card";
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
      <Button 
        onClick={() => router.push('/')}
        variant="ghost"
        className="mb-8 font-bold uppercase tracking-widest text-sm flex items-center gap-2"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Menu
      </Button>

      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-8 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-black font-fredoka text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
              MY WORDLISTS
            </h1>
            <p className="text-zinc-400 mt-2 font-medium">Create and manage your custom wordlists.</p>
          </div>
          {!isCreating && !editingId && (
            <Button 
              onClick={startCreating}
              variant="emerald"
              className="flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] font-black tracking-widest uppercase"
            >
              <Plus className="w-5 h-5" /> Create New
            </Button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl mb-6 font-bold flex items-center justify-between">
            {error}
            <Button onClick={() => setError('')} variant="ghost" size="icon"><X className="w-5 h-5" /></Button>
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
                <Input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Animals, Hard Words"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1 pl-1">Words (comma separated)</label>
                <Textarea 
                  value={editWords}
                  onChange={(e) => setEditWords(e.target.value)}
                  placeholder="apple, banana, cherry..."
                />
              </div>
              <div className="flex items-center gap-3 bg-[#171124] p-4 rounded-xl border border-white/10 w-fit">
                <Input 
                  type="checkbox" 
                  id="is_public"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                />
                <label htmlFor="is_public" className="font-bold flex items-center gap-2 cursor-pointer">
                  {editIsPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
                  Make Public
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={isCreating ? handleCreate : () => handleUpdate(editingId!)}
                  variant="primary"
                  className="flex-1 flex items-center gap-2 justify-center font-bold uppercase tracking-widest"
                >
                  <Save className="w-5 h-5" /> Save
                </Button>
                <Button 
                  onClick={cancelEdit}
                  variant="secondary"
                  className="flex-1 flex items-center gap-2 justify-center font-bold uppercase tracking-widest"
                >
                  Cancel
                </Button>
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
                  <Button 
                    onClick={startCreating}
                    variant="ghost"
                    className="mx-auto flex items-center justify-center gap-2 font-bold uppercase tracking-widest"
                  >
                    <Plus className="w-5 h-5" /> Create Your First Wordlist
                  </Button>
              </div>
            )}
            
            {wordlists.map(list => (
              <Card key={list.id} className="p-5 flex flex-col justify-between group">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-black text-white">{list.name}</h3>
                    {list.is_public ? (
                      <Badge variant="success"><Globe className="w-3 h-3" /> Public</Badge>
                    ) : (
                      <Badge variant="neutral"><Lock className="w-3 h-3" /> Private</Badge>
                    )}
                  </div>
                  <p className="text-zinc-400 text-sm mb-4"><span className="text-white font-bold">{list.words.length}</span> words</p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    onClick={() => startEditing(list)}
                    variant="primary"
                    className="flex-1 flex justify-center items-center gap-2 font-bold text-xs uppercase tracking-widest bg-violet-600/20 text-violet-300 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </Button>
                  <Button 
                    onClick={() => handleDelete(list.id)}
                    variant="danger"
                    className="flex-1 flex justify-center items-center gap-2 font-bold text-xs uppercase tracking-widest bg-rose-500/20 text-rose-300 hover:text-white"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
