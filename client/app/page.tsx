'use client';

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import Card from "@/components/Card";
import Image from "next/image";
import { GameAPI } from "@/lib/api/game";
import { WordlistAPI, Wordlist } from "@/lib/api/wordlists";
import { socketService } from "@/lib/socket/socketService";

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
      await socketService.connect();
      socketService.emit('game:join', { gameId: pendingActiveGame });
      
      // Wait a moment for join to process, then leave to trigger abandon logic
      setTimeout(() => {
        socketService.emit('game:leave', {});
        socketService.disconnect();
        setPendingActiveGame(null);
        setLoading(false);
        setError("Previous game abandoned. You can now start a new game.");
      }, 1500);
      
    } catch (err) {
      console.error("Failed to abandon game:", err);
      setLoading(false);
      setError("Failed to abandon previous game.");
    }
  };

  return (
    <div className={`bg-cover bg-center bg-[url('/background.jpg')] flex flex-col items-center justify-center w-full min-h-dvh py-2 overflow-hidden`}>
      <h1 className="text-6xl font-bold text-shadow-sm text-shadow-black text-white flex mb-12 drop-shadow-xl">
        Hangman
      </h1>

      <div className="relative flex flex-col items-center max-w-md w-full px-4">
        {error && <div className="bg-red-500 text-white p-3 rounded mb-4 shadow text-center w-full">{error}</div>}
        
        {pendingActiveGame ? (
          <div className="bg-black/60 backdrop-blur-xl p-8 rounded-2xl border border-red-500/50 w-full flex flex-col gap-6 text-center shadow-2xl">
            <h2 className="text-2xl text-white font-bold">Active Game Found</h2>
            <p className="text-white/80">You are already in an active game session. What would you like to do?</p>
            <div className="flex gap-4">
              <button 
                onClick={abandonActiveGame}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500 transition-colors text-white py-3 rounded-xl font-bold uppercase tracking-wider"
              >
                {loading ? 'Disconnecting...' : 'Disconnect'}
              </button>
              <button 
                onClick={() => router.push(`/game?id=${pendingActiveGame}`)}
                disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-400 transition-colors text-white py-3 rounded-xl font-bold uppercase tracking-wider"
              >
                Rejoin Game
              </button>
            </div>
          </div>
        ) : !session ? (
          <Card className="bg-primary text-white flex items-center justify-center w-64 h-16 relative overflow-clip circle" onClick={login}>
            Login with Google to Play
          </Card>
        ) : !showGameMenu ? (
          <span className="flex flex-col sm:flex-row gap-4">
            <Card className="bg-primary text-white flex items-center w-auto h-min gap-2 relative overflow-clip circle" onClick={handleOpenGameMenu}>
              {loading ? "Loading..." : (
                <>
                  <Image src="/singleplayer.png" alt="Single Player" width={30} height={30} className="m-1" />
                  Play Online
                </>
              )}
            </Card>
            <Card className="bg-zinc-800 text-white flex items-center w-auto h-min gap-2 relative overflow-clip circle opacity-50 cursor-not-allowed">
              <Image src="/swords.png" alt="Multiplayer" width={30} height={30} className="m-1" />
              Multiplayer (Coming Soon)
            </Card>
          </span>
        ) : (
          <div className="bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-white/10 w-full flex flex-col gap-4">
            <h2 className="text-2xl text-white font-bold mb-2">Game Setup</h2>
            
            <div className="flex flex-col">
              <label className="text-white/80 mb-1 text-sm font-semibold">Select Wordlist</label>
              <select 
                className="bg-white/10 text-white border border-white/20 rounded-md p-2 outline-none focus:border-primary transition-colors"
                value={selectedWordlist}
                onChange={(e) => setSelectedWordlist(e.target.value)}
              >
                {wordlists.map(w => (
                  <option key={w.id} value={w.id} className="text-black">{w.name} {w.default ? '(Default)' : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-white/80 mb-1 text-sm font-semibold">Game Mode</label>
              <select 
                className="bg-white/10 text-white border border-white/20 rounded-md p-2 outline-none focus:border-primary transition-colors"
                value={selectedGamemode}
                onChange={(e) => setSelectedGamemode(Number(e.target.value))}
              >
                <option value={1} className="text-black">Classic Singleplayer (Mode ID: 1)</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-white/80 mb-1 text-sm font-semibold">Number of Words</label>
              <input 
                type="number"
                min="1"
                max="10"
                className="bg-white/10 text-white border border-white/20 rounded-md p-2 outline-none focus:border-primary transition-colors"
                value={numberOfWords}
                onChange={(e) => setNumberOfWords(Number(e.target.value))}
              />
            </div>

            <div className="flex gap-4 mt-4">
              <button 
                onClick={() => setShowGameMenu(false)}
                className="flex-1 bg-zinc-700/80 hover:bg-zinc-600 transition-colors text-white py-2 rounded-md font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={createAndStartGame}
                disabled={loading}
                className="flex-1 bg-primary hover:bg-primary/80 transition-colors text-white py-2 rounded-md font-semibold"
              >
                {loading ? 'Starting...' : 'Start Game'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
