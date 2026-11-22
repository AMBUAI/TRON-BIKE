import React, { useState } from 'react';
import {
  Bike,
  Car,
  Check,
  Copy,
  Crown,
  LogOut,
  Play,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import {
  CHARACTER_OPTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PublicPlayerProfile,
  type RoomStateSnapshot,
} from '../../shared/types';
import { AvatarBadge } from './Avatars';

interface LobbyScreenProps {
  room: RoomStateSnapshot;
  myPlayerId: string;
  friends: PublicPlayerProfile[];
  onToggleReady: (ready: boolean) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
  onInviteFriend: (targetPlayerId: string) => Promise<void>;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  myPlayerId,
  friends,
  onToggleReady,
  onStartMatch,
  onLeaveRoom,
  onInviteFriend,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const me = room.players.find((p) => p.playerId === myPlayerId);
  const isHost = room.hostId === myPlayerId;
  const allReady = room.players.every((p) => p.ready || p.isHost);
  const canStart = isHost && room.players.length >= MIN_PLAYERS && allReady;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleInvite = async (friend: PublicPlayerProfile) => {
    setInviteFeedback(null);
    try {
      await onInviteFriend(friend.id);
      setInvitedIds((prev) => new Set(prev).add(friend.id));
      setInviteFeedback(`Invitation sent to ${friend.username}`);
    } catch (err) {
      setInviteFeedback(
        err instanceof Error ? err.message : 'Could not send invite'
      );
    }
  };

  const slots = Array.from({ length: MAX_PLAYERS }, (_, idx) => room.players[idx] ?? null);
  const invitableFriends = friends.filter(
    (f) => !room.players.some((p) => p.playerId === f.id)
  );

  return (
    <div className="fixed inset-0 h-[100dvh] z-20 flex flex-col justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] bg-[#04060D]/80">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[#080D1B]/95 px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 transition shrink-0"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Leave</span>
          </button>
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] text-slate-400">Private Lobby</div>
            <div className="font-display text-xs sm:text-base font-bold text-white truncate">
              {room.players.length} / {MAX_PLAYERS} Riders Joined
            </div>
          </div>
        </div>

        {/* Room Code Copy Island */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] text-slate-400">Room Code</div>
            <div className="font-mono-tabular text-lg font-bold tracking-[0.2em] text-cyan-300">
              {room.roomCode}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-3.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 transition"
          >
            <span className="sm:hidden font-mono-tabular tracking-widest">
              {room.roomCode}
            </span>
            {copiedCode ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {copiedCode ? 'Copied' : 'Copy Code'}
            </span>
          </button>
        </div>
      </div>

      {/* 6 Player Slots Grid — scrollable safely if browser toolbar compresses height */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll flex items-center">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5 lg:gap-3 max-w-6xl w-full mx-auto py-1">
          {slots.map((slot, idx) => {
            if (!slot) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="rounded-xl border border-dashed border-white/15 bg-[#070B16]/85 p-2 sm:p-2.5 lg:p-3 flex flex-col items-center justify-center text-center min-h-[118px] lg:min-h-[175px]"
                >
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-slate-500 font-display text-xs lg:text-sm font-bold mb-1.5">
                    {idx + 1}
                  </div>
                  <div className="text-[11px] lg:text-xs font-semibold text-slate-400">
                    Open Slot
                  </div>
                  {isHost && room.players.length < MAX_PLAYERS && (
                    <button
                      type="button"
                      onClick={() => setShowInviteDrawer(true)}
                      className="mt-2 min-h-[32px] inline-flex items-center gap-1 rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2 text-[10px] lg:text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 transition"
                    >
                      <UserPlus className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      <span>Invite</span>
                    </button>
                  )}
                </div>
              );
            }

            const isMe = slot.playerId === myPlayerId;
            return (
              <div
                key={slot.playerId}
                style={{
                  borderColor: slot.color.hex,
                }}
                className="relative rounded-xl border bg-[#0A1124]/95 p-2 sm:p-2.5 lg:p-3 flex flex-col items-center justify-between text-center min-h-[118px] lg:min-h-[175px]"
              >
                <div className="w-full flex items-center justify-between text-[10px] lg:text-[11px] text-slate-300">
                  <span className="font-mono-tabular">P{idx + 1}</span>
                  {slot.isHost ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-300 font-bold">
                      <Crown className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      Host
                    </span>
                  ) : (
                    <span className="text-slate-400">{isMe ? 'You' : 'Rider'}</span>
                  )}
                </div>

                <div className="my-1 lg:my-2 flex flex-col items-center min-w-0 w-full">
                  <AvatarBadge
                    avatarId={slot.avatarId}
                    size={38}
                    borderColor={slot.color.hex}
                  />
                  <div className="mt-1.5 font-display text-[11px] sm:text-xs lg:text-sm font-bold text-white max-w-full truncate px-1">
                    {slot.username}
                  </div>
                  <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] lg:text-[11px] text-slate-300 max-w-full">
                    <span
                      className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: slot.color.hex }}
                    />
                    <span className="truncate">{slot.color.name}</span>
                  </div>
                  <div className="hidden md:flex mt-0.5 items-center justify-center gap-1 text-[10px] text-slate-400">
                    {slot.vehicleType === 'car' ? (
                      <Car className="w-3 h-3 text-cyan-300 shrink-0" />
                    ) : (
                      <Bike className="w-3 h-3 text-cyan-300 shrink-0" />
                    )}
                    <span className="truncate">
                      {slot.vehicleType === 'car' ? 'Car' : 'Bike'} ·{' '}
                      {CHARACTER_OPTIONS.find((c) => c.id === slot.characterId)?.name.split(' ')[0] ?? 'Suit'}
                    </span>
                  </div>
                </div>

                <div className="w-full pt-1.5 border-t border-white/10 text-[10px] lg:text-xs font-bold">
                  {!slot.connected ? (
                    <span className="text-amber-400">Reconnecting...</span>
                  ) : slot.ready || slot.isHost ? (
                    <span className="text-emerald-300">READY</span>
                  ) : (
                    <span className="text-slate-400">NOT READY</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between gap-2.5 rounded-xl border border-white/12 bg-[#080D1B]/95 px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {isHost && (
            <button
              type="button"
              onClick={() => setShowInviteDrawer(true)}
              disabled={room.players.length >= MAX_PLAYERS}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-lg border border-pink-400/45 bg-pink-500/15 px-3.5 text-xs sm:text-sm font-bold text-pink-200 hover:bg-pink-500/25 disabled:opacity-40 transition whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite Friends</span>
            </button>
          )}
          <div className="text-xs text-slate-300 hidden lg:block truncate">
            {room.players.length < 2
              ? isHost
                ? `Solo grid run ready — or invite friends to join (1–${MAX_PLAYERS} players).`
                : 'Waiting for host to launch or more riders to join.'
              : !allReady
                ? 'Waiting for all riders to mark Ready.'
                : isHost
                  ? 'All riders ready. Launch when prepared!'
                  : 'Ready! Waiting for host to launch the grid.'}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {!isHost && me && (
            <button
              type="button"
              onClick={() => onToggleReady(!me.ready)}
              className={`min-h-[42px] px-5 rounded-lg font-display text-xs sm:text-sm font-bold transition ${
                me.ready
                  ? 'border border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
              }`}
            >
              {me.ready ? 'READY ✓' : 'MARK READY'}
            </button>
          )}

          {isHost && (
            <button
              type="button"
              onClick={onStartMatch}
              disabled={!canStart}
              className="min-h-[42px] inline-flex items-center gap-2 px-5 rounded-lg bg-cyan-500 text-slate-950 font-display text-xs sm:text-sm font-extrabold hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 transition whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>START MATCH</span>
            </button>
          )}
        </div>
      </div>

      {/* Invite Friends Drawer Modal */}
      {showInviteDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-cyan-500/40 bg-[#080D1B] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white">
                Invite Friends to Room {room.roomCode}
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteDrawer(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inviteFeedback && (
              <div className="text-xs text-cyan-300 font-medium">
                {inviteFeedback}
              </div>
            )}

            <div className="max-h-60 overflow-y-auto custom-scroll space-y-2">
              {invitableFriends.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No available friends outside this lobby. Add friends via
                  their 12-character Player ID from the main menu.
                </div>
              ) : (
                invitableFriends.map((friend) => {
                  const alreadySent = invitedIds.has(friend.id);
                  return (
                    <div
                      key={friend.id}
                      className="rounded-lg border border-white/10 bg-[#0D1528] p-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarBadge avatarId={friend.avatarId} size={36} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {friend.username}
                          </div>
                          <div className="text-xs text-slate-400">
                            {friend.onlineStatus === 'online'
                              ? 'Online'
                              : friend.onlineStatus === 'offline'
                                ? 'Offline'
                                : 'In another room'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={alreadySent || friend.onlineStatus === 'offline'}
                        onClick={() => void handleInvite(friend)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{alreadySent ? 'Invited' : 'Invite'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
