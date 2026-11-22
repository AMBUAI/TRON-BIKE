import React, { useState } from 'react';
import {
  Check,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  FriendRequestItem,
  PublicPlayerProfile,
  RoomInviteItem,
} from '../../shared/types';
import { AvatarBadge } from './Avatars';

interface FriendsModalProps {
  myPlayerId: string;
  friends: PublicPlayerProfile[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  roomInvites: RoomInviteItem[];
  activeHostingRoomCode: string | null;
  onSearchPlayer: (playerId: string) => Promise<PublicPlayerProfile>;
  onSendFriendRequest: (targetPlayerId: string) => Promise<void>;
  onRespondFriendRequest: (requestId: string, accept: boolean) => Promise<void>;
  onRemoveFriend: (friendId: string) => Promise<void>;
  onInviteFriendToRoom: (targetPlayerId: string) => Promise<void>;
  onRespondRoomInvite: (inviteId: string, accept: boolean) => Promise<void>;
  onClose: () => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  myPlayerId,
  friends,
  incomingRequests,
  outgoingRequests,
  roomInvites,
  activeHostingRoomCode,
  onSearchPlayer,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriend,
  onInviteFriendToRoom,
  onRespondRoomInvite,
  onClose,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState<PublicPlayerProfile | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSearchResult(null);
    const code = searchInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{12}$/.test(code)) {
      setFeedback({
        type: 'err',
        text: 'Enter an exact 12-character alphanumeric Player ID',
      });
      return;
    }
    setBusy(true);
    try {
      const player = await onSearchPlayer(code);
      setSearchResult(player);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Player not found',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendReq = async (targetId: string) => {
    setFeedback(null);
    setBusy(true);
    try {
      await onSendFriendRequest(targetId);
      setFeedback({ type: 'ok', text: `Friend request sent to ${targetId}` });
      setSearchResult(null);
      setSearchInput('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to send request',
      });
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s: PublicPlayerProfile['onlineStatus']) => {
    switch (s) {
      case 'playing':
        return 'In Match';
      case 'lobby':
        return 'In Lobby';
      case 'online':
        return 'Online';
      default:
        return 'Offline';
    }
  };

  const statusTextColor = (s: PublicPlayerProfile['onlineStatus']) => {
    switch (s) {
      case 'playing':
        return 'text-amber-300';
      case 'lobby':
        return 'text-pink-300';
      case 'online':
        return 'text-emerald-300';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[94dvh] rounded-xl border border-cyan-500/35 bg-[#080D1B] text-slate-100">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
              Friends & Invitations
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close friends"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-3 sm:p-5 space-y-3.5">
          {/* Search by exact 12-char Player ID */}
          <form
            onSubmit={handleSearch}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={12}
                placeholder="Search exact 12-char Player ID (e.g. A7K9P2X5M8Q4)"
                value={searchInput}
                onChange={(e) =>
                  setSearchInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                className="w-full min-h-[44px] pl-10 pr-4 rounded-lg border border-white/15 bg-[#060913] text-base sm:text-sm font-mono-tabular text-white placeholder:text-slate-500 focus:border-cyan-400 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] px-5 rounded-lg bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400 disabled:opacity-50 transition whitespace-nowrap"
            >
              Find Player
            </button>
          </form>

          {feedback && (
            <div
              className={`text-xs font-medium px-3 py-2 rounded-lg border ${
                feedback.type === 'ok'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {searchResult && (
            <div className="rounded-lg border border-cyan-400/40 bg-[#0D1528] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <AvatarBadge avatarId={searchResult.avatarId} size={42} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {searchResult.username}
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-400">
                    {searchResult.id} · {searchResult.matchesWon} Wins
                  </div>
                </div>
              </div>
              {searchResult.id === myPlayerId ? (
                <span className="text-xs text-slate-400">That is you</span>
              ) : friends.some((f) => f.id === searchResult.id) ? (
                <span className="text-xs font-semibold text-emerald-300">
                  Already Friends
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSendReq(searchResult.id)}
                  disabled={busy}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Friend</span>
                </button>
              )}
            </div>
          )}

          {/* Direct Room Invitations */}
          {roomInvites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-pink-300">
                Direct Match Invitations
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {roomInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-pink-500/40 bg-[#170B1E] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarBadge avatarId={inv.hostAvatarId} size={38} />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {inv.hostUsername}
                        </div>
                        <div className="text-xs text-slate-300">
                          Private Lobby · {inv.playerCount}/6 Riders
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onRespondRoomInvite(inv.id, true)}
                        className="min-h-[38px] px-3 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition"
                      >
                        ACCEPT
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRespondRoomInvite(inv.id, false)}
                        className="min-h-[38px] px-2.5 rounded-lg border border-white/15 text-slate-300 text-xs font-semibold hover:bg-white/10 transition"
                      >
                        DECLINE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-column Friends & Requests */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Friends List */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-400">
                Friends ({friends.length})
              </div>
              {friends.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-[#0D1528] p-4 text-xs text-slate-400">
                  No friends added yet. Search by 12-character Player ID above
                  to connect.
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="rounded-lg border border-white/10 bg-[#0D1528] p-3 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarBadge avatarId={friend.avatarId} size={38} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {friend.username}
                          </div>
                          <div className="text-xs font-mono-tabular text-slate-400 truncate">
                            {friend.id} ·{' '}
                            <span className={statusTextColor(friend.onlineStatus)}>
                              {statusLabel(friend.onlineStatus)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeHostingRoomCode &&
                          friend.onlineStatus === 'online' && (
                            <button
                              type="button"
                              onClick={() => {
                                void onInviteFriendToRoom(friend.id)
                                  .then(() =>
                                    setFeedback({
                                      type: 'ok',
                                      text: `Invited ${friend.username} to room ${activeHostingRoomCode}`,
                                    })
                                  )
                                  .catch((err) =>
                                    setFeedback({
                                      type: 'err',
                                      text:
                                        err instanceof Error
                                          ? err.message
                                          : 'Invite failed',
                                    })
                                  );
                              }}
                              className="min-h-[38px] inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Invite</span>
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => void onRemoveFriend(friend.id)}
                          aria-label={`Remove ${friend.username}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Incoming & Outgoing Friend Requests */}
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  Incoming Requests ({incomingRequests.length})
                </div>
                {incomingRequests.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-[#0D1528] p-3.5 text-xs text-slate-400">
                    No pending incoming friend requests.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border border-cyan-500/30 bg-[#0D1528] p-3 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge
                            avatarId={req.fromPlayer.avatarId}
                            size={36}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {req.fromPlayer.username}
                            </div>
                            <div className="text-xs font-mono-tabular text-slate-400">
                              {req.fromPlayer.id}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void onRespondFriendRequest(req.id, true)
                            }
                            aria-label="Accept friend request"
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void onRespondFriendRequest(req.id, false)
                            }
                            aria-label="Decline friend request"
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  Outgoing Requests ({outgoingRequests.length})
                </div>
                {outgoingRequests.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-[#0D1528] p-3.5 text-xs text-slate-400">
                    No outgoing requests pending.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outgoingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border border-white/10 bg-[#0D1528] p-3 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge
                            avatarId={req.toPlayer.avatarId}
                            size={34}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {req.toPlayer.username}
                            </div>
                            <div className="text-xs font-mono-tabular text-slate-400">
                              {req.toPlayer.id} · Pending
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
