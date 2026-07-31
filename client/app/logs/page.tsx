'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import Card from "@/components/Card";
import { LogsAPI, GameEntry } from '@/lib/api/logs';

export default function LogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<GameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  
  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState(''); // for debouncing or explicitly submitting
  const limit = 10;

  useEffect(() => {
    fetchLogs();
  }, [page, search]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await LogsAPI.getLogs(page, limit, search);
      setLogs(data.logs);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to page 1 on new search
    setSearch(searchInput);
  };

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-200 font-sans">
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 bg-zinc-900 p-4 rounded-2xl shadow-lg border border-white/5">
          <Button 
            onClick={() => router.push('/')}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </Button>
          
          <form onSubmit={handleSearch} className="flex gap-3 w-full sm:w-auto">
            <select 
              value={modeFilter} 
              onChange={(e) => setModeFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-700 transition-colors text-white text-sm font-semibold cursor-pointer shadow-inner"
            >
              <option value="all">All Modes</option>
              <option value="Single Player">Single Player</option>
              <option value="Multiplayer">Multiplayer</option>
            </select>

            <div className="relative flex-1 sm:w-48">
              <Input 
                type="text" 
                placeholder="Search word..." 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </form>
        </div>

        <div className="flex gap-4 text-xs font-bold text-zinc-400 mb-6 bg-zinc-900 p-4 rounded-xl border border-white/5 w-fit shadow-md">
          <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-green-900/50 text-green-400 border border-green-500/20 flex items-center justify-center">W</span> Won</div>
          <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-red-900/50 text-red-400 border border-red-500/20 flex items-center justify-center">L</span> Lost</div>
          <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 border border-white/5 flex items-center justify-center">A</span> Abandoned</div>
        </div>

        {error && <div className="bg-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-center font-bold">{error}</div>}

        <div className="flex flex-col gap-6 mb-8">
              {loading ? (
                <div className="py-12 text-center text-zinc-500 animate-pulse font-bold text-lg">
                  Loading matches...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 font-bold text-lg bg-zinc-900 rounded-2xl border border-dashed border-zinc-700">
                  No matches found.
                </div>
              ) : (
                logs.filter(g => modeFilter === 'all' || g.gameMode === modeFilter).map((game) => (
                  <Card key={game.id} className="p-0 overflow-hidden flex flex-col">
                    {/* Game Header */}
                    <div className="bg-zinc-900 px-6 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/5 shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-zinc-200 uppercase tracking-widest">{game.gameMode} Match</span>
                        <span className="text-xs text-zinc-500 font-semibold">{new Date(game.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Rounds: {game.rounds.length} / {game.totalWords}</span>
                        <Badge variant={game.gameResult === 'won' ? 'success' : game.gameResult === 'lost' ? 'danger' : 'neutral'}>
                          {game.gameResult === 'won' ? 'VICTORY' : game.gameResult === 'lost' ? 'DEFEAT' : 'ABANDONED'}
                        </Badge>
                      </div>
                    </div>

                    {/* Rounds List */}
                    <div className="p-2 sm:p-3 flex flex-col gap-2 bg-zinc-950/50">
                      {game.rounds.map((round) => {
                        const isWon = round.result === 'won';
                        const isLost = round.result === 'lost';
                        const livesRemaining = game.totalLives - round.usedLives;
                        
                        return (
                          <div 
                            key={round.id} 
                            className="group relative flex flex-col sm:flex-row items-center justify-between p-3 sm:p-4 bg-zinc-900 hover:bg-zinc-800/80 rounded-2xl border border-white/5 transition-colors shadow-md overflow-hidden"
                          >
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${isWon ? 'bg-green-500' : isLost ? 'bg-red-500' : 'bg-zinc-500'}`} />
                            
                            <div className="flex items-center gap-4 pl-3 w-full sm:w-auto">
                              <div className={`flex items-center justify-center w-10 h-10 rounded-full font-black text-lg shadow-inner shrink-0 border ${
                                isWon ? 'bg-green-900/50 text-green-400 border-green-500/20' : 
                                isLost ? 'bg-red-900/50 text-red-400 border-red-500/20' : 
                                'bg-zinc-800 text-zinc-300 border-white/5'
                              }`}>
                                {isWon ? 'W' : isLost ? 'L' : 'A'}
                              </div>
                              
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">
                                  Round {round.roundIndex}
                                </span>
                                <span className="text-xl sm:text-2xl font-black text-white tracking-widest uppercase">
                                  {round.word || "???"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 mt-4 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end pl-3 sm:pl-0 pt-3 sm:pt-0 border-t border-white/5 sm:border-0">
                              <div className="flex flex-col items-start sm:items-end">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Time Taken</span>
                                <span className="font-mono font-bold text-zinc-200 bg-zinc-950 px-4 py-2 rounded-xl border border-white/5 shadow-inner text-sm">
                                  {round.timeTaken}
                                </span>
                              </div>
                              
                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1 flex justify-end w-full">Lives</span>
                                <div className="flex items-center gap-1.5 bg-zinc-950 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                                  <span className="text-red-500 text-sm">❤️</span>
                                  <span className="font-mono font-bold text-zinc-200 text-sm">{Math.max(0, livesRemaining)} / {game.totalLives}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))
              )}
        </div>

        {/* Pagination Controls */}
        <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-2xl shadow-lg border border-white/5">
          <p className="text-zinc-400 font-semibold tracking-wide">
            Page <span className="text-white">{page}</span> of <span className="text-white">{totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              variant="secondary"
            >
              PREV
            </Button>
            <Button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              variant="secondary"
            >
              NEXT
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
