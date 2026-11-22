import React from 'react';
import { Home, RotateCcw, Trophy } from 'lucide-react';
import { MIN_PLAYERS, type RoomStateSnapshot } from '../../shared/types';
import { AvatarBadge } from './Avatars';

interface ResultsScreenProps {
  room: RoomStateSnapshot;
  myPlayerId: string;
  onVoteRematch: (vote: boolean) => void;
  onReturnToMenu: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  room,
  myPlayerId,
  onVoteRematch,
  onReturnToMenu,
}) => {
  const results = room.results;
  if (!results) return null;

  const me = room.players.find((p) => p.playerId === myPlayerId);
  const connectedPlayers = room.players.filter((p) => p.connected);
  const rematchVotes = connectedPlayers.filter((p) => p.rematchVote).length;
  const enoughPlayers = connectedPlayers.length >= MIN_PLAYERS;

  return (
    <div className="fixed inset-0 h-[100dvh] z-30 flex items-center justify-center bg-[#04060D]/80 p-2.5 sm:p-5">
      <div className="w-full max-w-4xl max-h-[94dvh] flex flex-col rounded-xl border border-cyan-500/40 bg-[#080D1B]/95 text-slate-100">
        {/* Header Winner Highlight */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                borderColor: results.winnerColor?.hex ?? '#F43F5E',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
              }}
            >
              <Trophy
                className="w-5 h-5 sm:w-6 sm:h-6"
                style={{ color: results.winnerColor?.hex ?? '#F43F5E' }}
              />
            </div>
            <div>
              <div className="font-display text-xs font-bold tracking-wider text-amber-300">
                {results.isSolo
                  ? 'SOLO GRID RUN — COMPLETE'
                  : results.isDraw
                    ? 'MUTUAL ELIMINATION — DRAW'
                    : 'LAST SURVIVOR — WINNER'}
              </div>
              <div className="font-display text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>
                  {results.isSolo
                    ? results.standings[0]?.username ?? 'Solo Rider'
                    : results.isDraw
                      ? 'No Survivor'
                      : results.winnerUsername}
                </span>
                {results.winnerColor && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold text-slate-300">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: results.winnerColor.hex }}
                    />
                    {results.winnerColor.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono-tabular">
            {results.totalPlayers} Riders · Room {room.roomCode}
          </div>
        </div>

        {/* Standings Table */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
          {results.standings.map((s) => (
            <div
              key={s.playerId}
              className="rounded-lg border border-white/10 bg-[#0D1528] px-3.5 py-2.5 flex items-center justify-between gap-3"
              style={{
                borderColor: s.isWinner ? s.color.hex : undefined,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="font-mono-tabular text-sm font-black w-6 text-center text-cyan-300">
                  #{s.placement}
                </div>
                <AvatarBadge
                  avatarId={s.avatarId}
                  size={36}
                  borderColor={s.color.hex}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-white truncate">
                      {s.username}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: s.color.hex }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {s.eliminationReason}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono-tabular text-xs font-bold text-slate-200">
                  {(s.survivedMs / 1000).toFixed(1)}s
                </div>
                <div className="text-[11px] text-slate-400">
                  {s.isWinner ? 'Victory' : 'Eliminated'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Rematch & Menu Actions */}
        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onReturnToMenu}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-xs sm:text-sm font-bold text-white hover:bg-white/10 transition"
          >
            <Home className="w-4 h-4" />
            <span>RETURN TO MENU</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-tabular text-slate-300">
              {enoughPlayers
                ? `Rematch Ready: ${rematchVotes}/${connectedPlayers.length}`
                : 'Waiting for connection'}
            </span>
            <button
              type="button"
              disabled={!enoughPlayers}
              onClick={() => onVoteRematch(!(me?.rematchVote ?? false))}
              className={`min-h-[46px] inline-flex items-center gap-2 rounded-lg px-6 font-display text-sm font-extrabold transition ${
                me?.rematchVote
                  ? 'border border-emerald-400 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>{me?.rematchVote ? 'WAITING FOR OTHERS' : 'PLAY AGAIN'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
