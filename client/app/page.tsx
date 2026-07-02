'use client';

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import Card from "@/components/Card";
import { Gamepad2, Swords, History, LogIn, X, Play } from "lucide-react";
import { GameAPI } from "@/lib/api/game";
import { WordlistAPI, Wordlist } from "@/lib/api/wordlists";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Game Creation State
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [wordlists, setWordlists] = useState<Wordlist[]>([]);
  const [selectedWordlist, setSelectedWordlist] = useState<string>('');
  const [selectedGamemode, setSelectedGamemode] = useState<number>(1);
  const [numberOfWords, setNumberOfWords] = useState<number>(1);

  // Active Game State
  const [pendingActiveGame, setPendingActiveGame] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = () => {
    supabase.auth.signInWithOAuth({
      provider: "google",
    });
  };

  const handleOpenGameMenu = async () => {
    if (!session) {
      setError("You must be logged in to play online.");
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const fetchedWordlists = await WordlistAPI.getDefaultWordlists();
      if (!fetchedWordlists || fetchedWordlists.length === 0) {
        throw new Error("No wordlists available.");
      }
      setWordlists(fetchedWordlists);
      setSelectedWordlist(fetchedWordlists[0].id);
      setShowGameMenu(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load wordlists");
    } finally {
      setLoading(false);
    }
  };

  const createAndStartGame = async () => {
    if (!selectedWordlist) {
      setError("Please select a wordlist.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await GameAPI.createGame({
        gamemode: selectedGamemode, 
        wordlistId: selectedWordlist,
        totalLives: 5,
        number_of_words: numberOfWords
      });

      router.push(`/game?id=${res.gameId}`);
    } catch (err: any) {
      console.error(err);
      
      if (err.message?.startsWith("ACTIVE_GAME:")) {
        const activeGameId = err.message.split(":")[1];
        setPendingActiveGame(activeGameId);
        setLoading(false);
        return;
      }
      
      setError(err.message || "Failed to start game");
      setLoading(false);
    }
  };

  const abandonActiveGame = async () => {
    if (!pendingActiveGame) return;
    setLoading(true);
    try {
      await GameAPI.abandonGame(pendingActiveGame);
      setPendingActiveGame(null);
      setLoading(false);
      setError("Previous game abandoned. You can now start a new game.");
    } catch (err: any) {
      console.error("Failed to abandon game:", err);
      setLoading(false);
      setError(err.message || "Failed to abandon previous game.");
    }
  };

  return (
    <div className="bg-[#171124] flex flex-col items-center justify-center w-full min-h-dvh py-2 overflow-hidden">
      <h1 className="text-6xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-violet-400 to-emerald-400 flex mb-12 drop-shadow-xl font-fredoka tracking-wide">
        HANGMAN
      </h1>

      <div className="relative flex flex-col items-center max-w-md w-full px-4 font-quicksand">
        {error && <div className="bg-rose-500 text-white p-3 rounded-xl mb-4 shadow-md text-center w-full font-bold">{error}</div>}
        
        {pendingActiveGame ? (
          <div className="bg-[#251A3D] p-8 rounded-3xl border-t border-rose-500/30 w-full flex flex-col gap-6 text-center shadow-2xl">
            <h2 className="text-2xl text-white font-black font-fredoka tracking-wider">ACTIVE GAME FOUND</h2>
            <p className="text-zinc-400 font-semibold text-sm">You are already in an active game session. What would you like to do?</p>
            <div className="flex gap-4">
              <button 
                onClick={abandonActiveGame}
                disabled={loading}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-300 py-3 rounded-xl font-bold uppercase tracking-wider shadow-inner"
              >
                {loading ? 'WAIT...' : 'FORFEIT'}
              </button>
              <button 
                onClick={() => router.push(`/game?id=${pendingActiveGame}`)}
                disabled={loading}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 transition-colors text-emerald-950 py-3 rounded-xl font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              >
                REJOIN
              </button>
            </div>
          </div>
        ) : !session ? (
          <Card onClick={login} className="w-full sm:w-80 flex flex-col items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 border-violet-400/30 py-6">
            <LogIn className="w-8 h-8 text-white mb-2" />
            <span className="text-xl font-black text-white tracking-widest uppercase">Login to Play</span>
          </Card>
        ) : !showGameMenu ? (
          <div className="flex flex-col gap-4 w-full sm:w-80">
            <Card onClick={handleOpenGameMenu} delay={0.1} className="flex items-center gap-4 bg-violet-600 hover:bg-violet-500 border-violet-400/30">
              {loading ? (
                <div className="text-center w-full font-black text-white tracking-widest uppercase">Loading...</div>
              ) : (
                <>
                  <div className="bg-white/20 p-3 rounded-2xl">
                    <Gamepad2 className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xl font-black text-white tracking-widest uppercase">Play Online</span>
                </>
              )}
            </Card>
            
            <Card delay={0.2} className="flex items-center gap-4 bg-zinc-800 border-white/5 opacity-50 cursor-not-allowed">
              <div className="bg-white/10 p-3 rounded-2xl">
                <Swords className="w-6 h-6 text-zinc-400" />
              </div>
              <span className="text-xl font-black text-zinc-400 tracking-widest uppercase text-left">Multiplayer<br/><span className="text-xs text-zinc-500">Coming Soon</span></span>
            </Card>

            <button 
              onClick={() => router.push('/logs')}
              className="mt-6 mx-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-6 py-3 rounded-full border border-white/10 transition-colors font-bold flex items-center gap-2"
            >
              <History className="w-5 h-5" /> Match History
            </button>
          </div>
        ) : (
          <div className="bg-[#251A3D] p-6 sm:p-8 rounded-3xl border-t border-white/10 w-full flex flex-col gap-5 shadow-2xl">
            <h2 className="text-2xl text-white font-black font-fredoka tracking-wider mb-2">GAME SETUP</h2>
            
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest pl-1">Select Wordlist</label>
              <select 
                className="bg-[#171124] text-white border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-semibold shadow-inner"
                value={selectedWordlist}
                onChange={(e) => setSelectedWordlist(e.target.value)}
              >
                {wordlists.map(w => (
                  <option key={w.id} value={w.id}>{w.name} {w.default ? '(Default)' : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest pl-1">Game Mode</label>
              <select 
                className="bg-[#171124] text-white border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-semibold shadow-inner"
                value={selectedGamemode}
                onChange={(e) => setSelectedGamemode(Number(e.target.value))}
              >
                <option value={1}>Classic Singleplayer</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest pl-1">Number of Words</label>
              <input 
                type="number"
                min="1"
                max="10"
                className="bg-[#171124] text-white border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-semibold shadow-inner"
                value={numberOfWords}
                onChange={(e) => setNumberOfWords(Number(e.target.value))}
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => setShowGameMenu(false)}
                className="flex items-center justify-center gap-2 flex-1 bg-zinc-800 hover:bg-zinc-700 transition-colors text-white py-3 rounded-xl font-bold uppercase tracking-widest"
              >
                <X className="w-5 h-5" /> Cancel
              </button>
              <button 
                onClick={createAndStartGame}
                disabled={loading}
                className="flex items-center justify-center gap-2 flex-1 bg-violet-600 hover:bg-violet-500 transition-colors text-white py-3 rounded-xl font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(139,92,246,0.3)]"
              >
                {loading ? 'STARTING...' : <><Play className="w-5 h-5 fill-current" /> PLAY</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
