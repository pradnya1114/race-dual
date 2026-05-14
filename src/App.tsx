/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { socket } from './services/socket';
import { Player } from './types';

export default function App() {
  const [view, setView] = useState<'landing' | 'lobby' | 'game' | 'results'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players, isHost }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setIsOffline(false);
      setView('lobby');
      setError('');
    });

    socket.on('roomJoined', ({ roomId, players, isHost }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setIsOffline(false);
      setView('lobby');
      setError('');
    });

    socket.on('playerJoinedRoom', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('gameStarted', (initialPlayers) => {
      setPlayers(initialPlayers);
      setIsOffline(false);
      setView('game');
    });

    socket.on('raceFinished', (raceResults) => {
      setResults(raceResults);
      setView('results');
    });

    socket.on('error', (msg) => {
      setError(msg);
    });
    
    socket.on('hostMigrated', (newHostId) => {
        if (socket.id === newHostId) {
            setIsHost(true);
        }
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('playerJoinedRoom');
      socket.off('playerDisconnected');
      socket.off('gameStarted');
      socket.off('error');
      socket.off('hostMigrated');
    };
  }, []);

  const handleCreate = () => {
    socket.emit('createRoom');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) {
        setError('Please enter a valid 6-character room code');
        return;
    }
    socket.emit('joinRoom', { roomId: joinCode.toUpperCase() });
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const handleOfflineStart = () => {
    const offlinePlayer: Player = {
        id: 'local-1',
        name: 'Player 1',
        color: 'hsl(0, 70%, 50%)',
        x: 650,
        y: 750,
        angle: Math.PI,
        speed: 0,
        laps: 0,
        bestLapTime: Infinity,
        nitro: 100,
        drifting: false
    };
    setPlayers({ 'local-1': offlinePlayer });
    setIsOffline(true);
    setView('game');
  };

  return (
    <div className={`min-h-screen bg-slate-900 flex flex-col items-center ${view === 'game' ? 'justify-start' : 'justify-center'} font-sans text-slate-100`}>
      <header className={`w-full max-w-4xl mx-auto ${view === 'game' ? 'p-2' : 'p-6'} flex justify-between items-center transition-all`}>
        <h1 className={`${view === 'game' ? 'text-2xl' : 'text-4xl'} font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 transform -skew-x-12 transition-all`}>
          TURBO RACE
        </h1>
        {view === 'game' && (
          <button 
            onClick={() => setView('landing')}
            className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded border border-slate-700"
          >
            QUIT
          </button>
        )}
      </header>

      <main className={`flex-1 w-full flex flex-col items-center ${view === 'game' ? 'p-0' : 'p-4'} transition-all`}>
        {view === 'landing' && (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center">Start Your Engines</h2>
            
            <div className="space-y-6">
              {error && <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{error}</div>}

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={handleOfflineStart}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-4 rounded-lg shadow-lg transition-transform active:scale-95 text-lg"
                >
                  OFFLINE RACE
                </button>

                <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="px-2 bg-slate-800 text-slate-500 uppercase tracking-widest font-bold">Multiplayer</span>
                    </div>
                </div>

                <button
                  onClick={handleCreate}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                >
                  CREATE ONLINE ROOM
                </button>
                
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-slate-800 text-slate-500">Or join a friend</span>
                    </div>
                </div>

                <form onSubmit={handleJoin} className="flex gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white uppercase tracking-widest font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="CODE"
                        maxLength={6}
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                    >
                        JOIN
                    </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {view === 'lobby' && (
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl w-full">
                <div className="text-center mb-8">
                    <h2 className="text-xl text-slate-400 mb-2">Room Code</h2>
                    <div className="text-6xl font-mono font-black tracking-widest text-yellow-400 bg-black/30 p-4 rounded-xl inline-block border-2 border-dashed border-slate-600 select-all">
                        {roomCode}
                    </div>
                    <p className="text-sm text-slate-500 mt-2">Share this code with your friends!</p>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                        <span>Racers ({Object.keys(players).length})</span>
                        {isHost && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">You are Host</span>}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {Object.values(players).map(p => (
                            <div key={p.id} className="bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-600">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                                <span className="font-bold truncate">{p.name}</span>
                                {p.id === socket.id && <span className="text-xs text-slate-400">(You)</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {isHost ? (
                    <button
                        onClick={handleStartGame}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg text-xl tracking-wide transition-transform active:scale-95 animate-pulse"
                    >
                        START RACE
                    </button>
                ) : (
                    <div className="text-center text-slate-400 italic animate-pulse">
                        Waiting for host to start the race...
                    </div>
                )}
            </div>
        )}

        {view === 'game' && (
          <GameCanvas 
            initialPlayers={players} 
            isOffline={isOffline} 
            onFinish={(res) => {
              setResults(res);
              setView('results');
            }}
          />
        )}

        {view === 'results' && (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-lg w-full text-center">
            <h2 className="text-3xl font-black italic mb-2 text-yellow-400">RACE FINISHED!</h2>
            <p className="text-slate-400 mb-8 uppercase tracking-widest text-sm">Podium Standings</p>
            
            <div className="space-y-4 mb-8">
              {results.map((res, i) => (
                <div 
                  key={res.id} 
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    i === 0 ? 'bg-yellow-500/10 border-yellow-500/50 scale-105 shadow-yellow-500/20 shadow-lg' : 
                    i === 1 ? 'bg-slate-300/10 border-slate-300/30' :
                    i === 2 ? 'bg-orange-600/10 border-orange-600/30' :
                    'bg-slate-700/30 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-black italic text-slate-500 w-8">#{res.rank}</span>
                    <span className="font-bold text-lg">{res.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter">Best Lap</div>
                    <div className="font-mono text-slate-200">
                      {res.bestLapTime === Infinity ? '--:--' : (
                        `${Math.floor(res.bestLapTime / 60000)}:${Math.floor((res.bestLapTime % 60000) / 1000).toString().padStart(2, '0')}.${Math.floor((res.bestLapTime % 1000) / 10).toString().padStart(2, '0')}`
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setView('landing')}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95"
            >
              BACK TO MAIN MENU
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
