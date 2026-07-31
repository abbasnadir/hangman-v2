'use client';

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import Card from "@/components/Card";
import { Gamepad2, Swords, History, LogIn, X, Play, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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

  const [loadingWordlists, setLoadingWordlists] = useState(false);

  const loadWordlists = async (forceRefresh = false) => {
    if (!forceRefresh && wordlists.length > 0) return true; // Already loaded
    
    setLoadingWordlists(true);
    setError('');
    try {
      const fetchedWordlists = await WordlistAPI.getAllAvailableWordlists(forceRefresh);
      if (!fetchedWordlists || fetchedWordlists.length === 0) {
        throw new Error("No wordlists available.");
      }
      setWordlists(fetchedWordlists);
      if (fetchedWordlists.length > 0 && (!selectedWordlist || forceRefresh)) {
        setSelectedWordlist(fetchedWordlists[0].id);
      }
      return true;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load wordlists");
      return false;
    } finally {
      setLoadingWordlists(false);
    }
  };

  useEffect(() => {
    if (session) {
      // Prefetch wordlists in background when authenticated
      loadWordlists();
    }
  }, [session]);

  const [loadingMode, setLoadingMode] = useState<number | null>(null);

  const handleOpenGameMenu = async (mode: number) => {
    if (!session) {
      setError("You must be logged in to play online.");
      return;
    }
    
    setLoadingMode(mode);
    setSelectedGamemode(mode);
    setError('');
    
    try {
      // It will just return true immediately if already prefetched
      const success = await loadWordlists();
      if (success) {
        setShowGameMenu(true);
      }
    } finally {
      setLoadingMode(null);
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

      // Navigate to game board (which for multiplayer might act as lobby first)
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

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchWordlists = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError('');
    try {
      const results = await WordlistAPI.searchPublicWordlists(searchQuery.trim());
      setWordlists(results);
      if (results.length > 0) setSelectedWordlist(results[0].id);
      else setSelectedWordlist('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResetWordlists = async () => {
    setSearchQuery('');
    try {
      const fetchedWordlists = await WordlistAPI.getAllAvailableWordlists();
      setWordlists(fetchedWordlists);
      if (fetchedWordlists.length > 0) setSelectedWordlist(fetchedWordlists[0].id);
    } catch (err) {}
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
              <Button 
                onClick={abandonActiveGame}
                disabled={loading}
                variant="secondary"
                className="flex-1 shadow-inner"
              >
                {loading ? 'WAIT...' : 'FORFEIT'}
              </Button>
              <Button 
                onClick={() => router.push(`/game?id=${pendingActiveGame}`)}
                disabled={loading}
                variant="emerald"
                className="flex-1"
              >
                REJOIN
              </Button>
            </div>
          </div>
        ) : !session ? (
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-4 items-center justify-center">
            <Card onClick={login} className="w-full sm:w-80 flex flex-col items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 border-violet-400/30 py-6">
              <LogIn className="w-8 h-8 text-white mb-2" />
              <span className="text-xl font-black text-white tracking-widest uppercase">Login to Play</span>
            </Card>
            <Card onClick={() => supabase.auth.signInAnonymously()} className="w-full sm:w-80 flex flex-col items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 py-6">
              <LogIn className="w-8 h-8 text-white mb-2" />
              <span className="text-xl font-black text-white tracking-widest uppercase">Play as Guest</span>
            </Card>
          </div>
        ) : !showGameMenu ? (
          <div className="flex flex-col gap-4 w-full sm:w-80">
            <Card onClick={() => handleOpenGameMenu(1)} delay={0.1} className="flex items-center gap-4 bg-violet-600 hover:bg-violet-500 border-violet-400/30">
              {loadingMode === 1 ? (
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
            
            <Card onClick={() => handleOpenGameMenu(2)} delay={0.2} className="flex items-center gap-4 bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30">
              {loadingMode === 2 ? (
                <div className="text-center w-full font-black text-white tracking-widest uppercase">Loading...</div>
              ) : (
                <>
                  <div className="bg-white/20 p-3 rounded-2xl">
                    <Swords className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xl font-black text-white tracking-widest uppercase text-left">Multiplayer</span>
                </>
              )}
            </Card>

            <div className="flex justify-center gap-4 mt-6">
              <Button 
                onClick={() => router.push('/logs')}
                variant="secondary"
                className="rounded-full flex items-center gap-2"
              >
                <History className="w-5 h-5" /> History
              </Button>
              <Button 
                onClick={() => router.push('/wordlists')}
                variant="secondary"
                className="rounded-full flex items-center gap-2"
              >
                <Swords className="w-5 h-5" /> Wordlists
              </Button>
              <Button 
                onClick={async () => { await supabase.auth.signOut(); }}
                variant="danger"
                className="rounded-full flex items-center gap-2"
              >
                <LogOut className="w-5 h-5" /> Logout
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-[#251A3D] p-6 sm:p-8 rounded-3xl border-t border-white/10 w-full flex flex-col gap-5 shadow-2xl">
            <h2 className="text-2xl text-white font-black font-fredoka tracking-wider mb-2">
              {selectedGamemode === 1 ? 'SINGLEPLAYER SETUP' : 'MULTIPLAYER SETUP'}
            </h2>
            
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Select Wordlist</label>
                  <Button onClick={() => loadWordlists(true)} disabled={loadingWordlists} variant="ghost" size="icon" className={loadingWordlists ? 'animate-spin' : ''} title="Refresh Wordlists">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                {searchQuery || wordlists.length === 0 || !wordlists.some(w => w.default) ? (
                  <Button onClick={handleResetWordlists} variant="ghost" className="text-[10px] uppercase">
                    My Library
                  </Button>
                ) : null}
              </div>
              
              <div className="flex gap-2">
                <Input 
                  type="text"
                  placeholder="Search public wordlists..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchWordlists()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSearchWordlists}
                  disabled={isSearching}
                  variant="primary"
                >
                  {isSearching ? '...' : 'Search'}
                </Button>
              </div>

              <select 
                className="bg-[#171124] text-white border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 transition-colors font-semibold shadow-inner mt-1"
                value={selectedWordlist}
                onChange={(e) => setSelectedWordlist(e.target.value)}
              >
                {wordlists.length === 0 && <option value="" disabled>No results found</option>}
                {wordlists.map(w => (
                  <option key={w.id} value={w.id}>{w.name} {w.default ? '(Default)' : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest pl-1">Number of Words</label>
              <Input 
                type="number"
                min="1"
                max="10"
                value={numberOfWords}
                onChange={(e) => setNumberOfWords(Number(e.target.value))}
              />
            </div>

            <div className="flex gap-3 mt-4">
              <Button 
                onClick={() => setShowGameMenu(false)}
                variant="secondary"
                className="flex-1 flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" /> Cancel
              </Button>
              <Button 
                onClick={createAndStartGame}
                disabled={loading}
                variant="primary"
                className="flex-1 flex items-center justify-center gap-2"
              >
                {loading ? 'STARTING...' : <><Play className="w-5 h-5 fill-current" /> PLAY</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
