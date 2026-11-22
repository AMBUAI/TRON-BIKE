import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bike,
  BookOpen,
  Car,
  Gamepad2,
  Hash,
  Maximize2,
  Minimize2,
  Play,
  PlusSquare,
  SlidersHorizontal,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CHARACTER_OPTIONS,
  NEON_PALETTE,
  type AudioSettings,
  type CharacterModelId,
  type ClientWsMessage,
  type DeathAnnouncement,
  type FriendRequestItem,
  type PlayerAccount,
  type PublicPlayerProfile,
  type RoomInviteItem,
  type RoomStateSnapshot,
  type ServerWsMessage,
  type VehicleType,
} from '../shared/types';
import { AvatarBadge } from './components/Avatars';
import { FriendsModal } from './components/FriendsModal';
import { GameplayHUD } from './components/GameplayHUD';
import { LobbyScreen } from './components/LobbyScreen';
import {
  enterFullscreenAndLandscape,
  isTouchMobileDevice,
  PortraitLockOverlay,
  tryLockLandscapeOrientation,
  useFullscreenState,
} from './components/PortraitLockOverlay';
import { ProfileModal } from './components/ProfileModal';
import { ResultsScreen } from './components/ResultsScreen';
import { RuleBookModal } from './components/RuleBookModal';
import { SettingsModal } from './components/SettingsModal';
import { audioEngine, loadAudioSettings } from './game/audioEngine';
import { TronEngine, type CameraMode } from './game/TronEngine';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const CREDENTIALS_STORAGE_KEY = 'tronbike_credentials_v1';

interface StoredCredentials {
  playerId: string;
  recoverySecret: string;
}

function loadStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (parsed.playerId && parsed.recoverySecret) {
      return {
        playerId: parsed.playerId,
        recoverySecret: parsed.recoverySecret,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredCredentials(creds: StoredCredentials) {
  try {
    localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // ignore storage errors
  }
}

type ActiveModal =
  | null
  | 'play_online'
  | 'join_room'
  | 'friends'
  | 'profile'
  | 'settings'
  | 'rulebook';

export default function App() {
  const isOnline = useOnlineStatus();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreenState();

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TronEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const turnSeqRef = useRef(0);
  const accountRef = useRef<PlayerAccount | null>(null);

  const [account, setAccount] = useState<PlayerAccount | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomStateSnapshot | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [friends, setFriends] = useState<PublicPlayerProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>(
    []
  );
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>(
    []
  );
  const [roomInvites, setRoomInvites] = useState<RoomInviteItem[]>([]);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    loadAudioSettings()
  );
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    () => loadAudioSettings().defaultCamera
  );
  const [announcement, setAnnouncement] = useState<DeathAnnouncement | null>(
    null
  );
  const announcementTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setErrorToast(msg);
    window.setTimeout(() => {
      setErrorToast((prev) => (prev === msg ? null : prev));
    }, 3600);
  }, []);

  const authHeaders = useCallback((): HeadersInit => {
    const acc = accountRef.current;
    if (!acc) return { 'Content-Type': 'application/json' };
    return {
      'Content-Type': 'application/json',
      'x-player-id': acc.id,
      'x-recovery-secret': acc.recoverySecret,
    };
  }, []);

  const refreshSocial = useCallback(async () => {
    if (!accountRef.current || !navigator.onLine) return;
    try {
      const res = await fetch('/api/friends', { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as {
        friends: PublicPlayerProfile[];
        incomingRequests: FriendRequestItem[];
        outgoingRequests: FriendRequestItem[];
        roomInvites: RoomInviteItem[];
      };
      setFriends(data.friends);
      setIncomingRequests(data.incomingRequests);
      setOutgoingRequests(data.outgoingRequests);
      setRoomInvites(data.roomInvites);
    } catch {
      // ignore transient network errors
    }
  }, [authHeaders]);

  const refreshAccountStats = useCallback(async () => {
    if (!accountRef.current || !navigator.onLine) return;
    try {
      const res = await fetch('/api/account/me', { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { account: PlayerAccount };
      accountRef.current = data.account;
      setAccount(data.account);
    } catch {
      // ignore
    }
  }, [authHeaders]);

  // Mount Three.js WebGL Engine once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new TronEngine(
      canvasMountRef.current,
      audioSettings.defaultCamera
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize persistent account on startup
  useEffect(() => {
    let cancelled = false;
    const initAccount = async () => {
      const stored = loadStoredCredentials();
      try {
        const res = await fetch('/api/account/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stored ?? {}),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { account: PlayerAccount };
        if (cancelled) return;
        accountRef.current = data.account;
        setAccount(data.account);
        saveStoredCredentials({
          playerId: data.account.id,
          recoverySecret: data.account.recoverySecret,
        });
        engineRef.current?.setLocalPlayerId(data.account.id);
      } catch {
        // Offline fallback: retain stored credentials if cached
        if (stored && !cancelled) {
          const offlineAcc: PlayerAccount = {
            id: stored.playerId,
            recoverySecret: stored.recoverySecret,
            username: `RIDER_${stored.playerId.slice(0, 4)}`,
            avatarId: 0,
            characterId: 'tron1',
            preferredColorId: 'cyan',
            vehicleType: 'bike',
            matchesPlayed: 0,
            matchesWon: 0,
            eliminations: 0,
          };
          accountRef.current = offlineAcc;
          setAccount(offlineAcc);
        }
      }
    };
    void initAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep 3D Main Menu showcase synchronized with player's character, color & vehicle
  useEffect(() => {
    if (!account || !engineRef.current) return;
    const colorObj =
      NEON_PALETTE.find((c) => c.id === account.preferredColorId) ??
      NEON_PALETTE[0];
    engineRef.current.setShowcaseConfig(
      account.characterId ?? 'tron1',
      colorObj.hex,
      account.vehicleType ?? 'bike'
    );
  }, [account]);

  const sendWs = useCallback((msg: ClientWsMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // WebSocket connection + auto-reconnect
  useEffect(() => {
    if (!account || !isOnline) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        setWsConnected(true);
        const acc = accountRef.current;
        if (acc) {
          ws.send(
            JSON.stringify({
              type: 'auth',
              playerId: acc.id,
              recoverySecret: acc.recoverySecret,
            } satisfies ClientWsMessage)
          );
        }
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
          }
        }, 12000);
      };

      ws.onmessage = (ev) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(ev.data) as ServerWsMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'auth:ok': {
            engineRef.current?.setLocalPlayerId(msg.playerId);
            void refreshSocial();
            break;
          }
          case 'error': {
            showToast(msg.message);
            break;
          }
          case 'room:closed': {
            setRoomState(null);
            engineRef.current?.enterShowcaseMode();
            audioEngine.stopEngineHum();
            audioEngine.startMusic('menu');
            showToast(msg.reason);
            break;
          }
          case 'room:state': {
            const st = msg.state;
            setRoomState(st);
            setActiveModal(null);

            if (st.phase === 'lobby') {
              engineRef.current?.enterShowcaseMode();
              audioEngine.stopEngineHum();
              audioEngine.startMusic('menu');
            } else {
              engineRef.current?.syncMatchSnapshot(
                st.phase,
                st.bikes.map((b) => ({
                  playerId: b.playerId,
                  colorHex: b.color.hex,
                  characterId: b.characterId,
                  vehicleType: b.vehicleType,
                  x: b.x,
                  z: b.z,
                  dir: b.dir,
                  alive: b.alive,
                  trail: b.trail,
                })),
                st.results?.winnerId ?? null
              );
              if (st.phase === 'countdown') {
                // Reset camera mode to user's saved default for fresh match
                const prefCam = audioEngine.getSettings().defaultCamera;
                setCameraMode(prefCam);
                engineRef.current?.setCameraMode(prefCam);
                audioEngine.startMusic('match');
              } else if (st.phase === 'playing') {
                const meBike = st.bikes.find(
                  (b) => b.playerId === accountRef.current?.id
                );
                if (meBike?.alive) {
                  audioEngine.startEngineHum();
                } else {
                  audioEngine.stopEngineHum();
                }
              } else if (st.phase === 'results') {
                audioEngine.stopEngineHum();
                void refreshAccountStats();
              }
            }
            break;
          }
          case 'game:countdown': {
            audioEngine.playCountdown(msg.value);
            if (msg.value === 0) {
              audioEngine.startEngineHum();
            }
            break;
          }
          case 'game:tick': {
            engineRef.current?.applyTickUpdate(msg.bikes);
            setRoomState((prev) =>
              prev ? { ...prev, aliveCount: msg.aliveCount } : prev
            );
            break;
          }
          case 'game:eliminated': {
            engineRef.current?.spawnEliminationEffect(
              msg.x,
              msg.z,
              msg.colorHex
            );
            audioEngine.playElimination(msg.isBoundary);
            if (msg.playerId === accountRef.current?.id) {
              audioEngine.stopEngineHum();
            }
            break;
          }
          case 'game:announcement': {
            setAnnouncement(msg.announcement);
            if (announcementTimerRef.current !== null) {
              window.clearTimeout(announcementTimerRef.current);
            }
            announcementTimerRef.current = window.setTimeout(() => {
              setAnnouncement(null);
            }, 3800);
            break;
          }
          case 'game:winner': {
            audioEngine.stopEngineHum();
            if (msg.winnerId && msg.winnerId === accountRef.current?.id) {
              audioEngine.playVictoryWheelie();
            } else if (msg.winnerId) {
              audioEngine.playVictoryWheelie();
            } else {
              audioEngine.playDefeat();
            }
            break;
          }
          case 'social:friend_request': {
            setIncomingRequests((prev) => [
              msg.request,
              ...prev.filter((r) => r.id !== msg.request.id),
            ]);
            showToast(
              `Friend request from ${msg.request.fromPlayer.username}`
            );
            break;
          }
          case 'social:friend_accepted': {
            void refreshSocial();
            showToast(`${msg.friend.username} accepted your friend request`);
            break;
          }
          case 'social:friend_removed': {
            setFriends((prev) => prev.filter((f) => f.id !== msg.friendId));
            break;
          }
          case 'social:room_invite': {
            setRoomInvites((prev) => [
              msg.invite,
              ...prev.filter((i) => i.id !== msg.invite.id),
            ]);
            audioEngine.playUiTap();
            break;
          }
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer !== null) window.clearInterval(pingTimer);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (pingTimer !== null) window.clearInterval(pingTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [account?.id, isOnline, refreshSocial, refreshAccountStats, showToast]);

  // Periodically refresh friends presence when modal is open or in lobby
  useEffect(() => {
    if (activeModal === 'friends' || roomState?.phase === 'lobby') {
      void refreshSocial();
      const id = window.setInterval(() => void refreshSocial(), 5000);
      return () => window.clearInterval(id);
    }
  }, [activeModal, roomState?.phase, refreshSocial]);

  const unlockAudioAndOrientation = () => {
    audioEngine.unlock();
    audioEngine.playUiTap();
    if (isTouchMobileDevice()) {
      void enterFullscreenAndLandscape();
    } else {
      tryLockLandscapeOrientation();
    }
  };

  const handleHostGame = () => {
    unlockAudioAndOrientation();
    if (!isOnline || !wsConnected) {
      showToast('Online connection required to host a multiplayer match');
      return;
    }
    sendWs({ type: 'room:host' });
  };

  const handleJoinGameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudioAndOrientation();
    if (!isOnline || !wsConnected) {
      showToast('Online connection required to join a match');
      return;
    }
    const clean = joinCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      showToast('Enter a valid 6-character alphanumeric room code');
      return;
    }
    sendWs({ type: 'room:join', roomCode: clean });
  };

  const handleReturnToMenu = () => {
    audioEngine.playUiTap();
    sendWs({ type: 'room:leave' });
    setRoomState(null);
    setAnnouncement(null);
    audioEngine.stopEngineHum();
    audioEngine.startMusic('menu');
    engineRef.current?.enterShowcaseMode();
  };

  const handleToggleCamera = useCallback(() => {
    audioEngine.playUiTap();
    setCameraMode((prev) => {
      const next: CameraMode = prev === 'third' ? 'first' : 'third';
      engineRef.current?.setCameraMode(next);
      return next;
    });
  }, []);

  const handleTurn = useCallback(
    (turn: 'left' | 'right') => {
      turnSeqRef.current += 1;
      audioEngine.playTurn();
      sendWs({ type: 'game:turn', turn, seq: turnSeqRef.current });
    },
    [sendWs]
  );

  // REST handlers for Profile & Friends
  const handleSaveProfile = async (
    username: string,
    avatarId: number,
    characterId: CharacterModelId,
    preferredColorId: string,
    vehicleType: VehicleType
  ) => {
    const res = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        username,
        avatarId,
        characterId,
        preferredColorId,
        vehicleType,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    accountRef.current = data.account;
    setAccount(data.account);
  };

  const handleRecoverAccount = async (
    playerId: string,
    recoverySecret: string
  ) => {
    const res = await fetch('/api/account/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, recoverySecret }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Account recovery failed');
    accountRef.current = data.account;
    setAccount(data.account);
    saveStoredCredentials({
      playerId: data.account.id,
      recoverySecret: data.account.recoverySecret,
    });
    engineRef.current?.setLocalPlayerId(data.account.id);
    // Re-authenticate WS with restored identity
    sendWs({
      type: 'auth',
      playerId: data.account.id,
      recoverySecret: data.account.recoverySecret,
    });
    void refreshSocial();
  };

  const handleSearchPlayer = async (playerId: string) => {
    const res = await fetch('/api/friends/search', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ playerId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Player not found');
    return data.player as PublicPlayerProfile;
  };

  const handleSendFriendRequest = async (targetPlayerId: string) => {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ targetPlayerId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not send request');
    await refreshSocial();
  };

  const handleRespondFriendRequest = async (
    requestId: string,
    accept: boolean
  ) => {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ requestId, accept }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Action failed');
      return;
    }
    await refreshSocial();
  };

  const handleRemoveFriend = async (friendId: string) => {
    await fetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await refreshSocial();
  };

  const handleInviteFriendToRoom = async (targetPlayerId: string) => {
    if (!roomState) return;
    const res = await fetch('/api/rooms/invite', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        roomCode: roomState.roomCode,
        targetPlayerId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invite failed');
  };

  const handleRespondRoomInvite = async (inviteId: string, accept: boolean) => {
    unlockAudioAndOrientation();
    const res = await fetch('/api/rooms/invite/respond', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ inviteId, accept }),
    });
    const data = await res.json();
    setRoomInvites((prev) => prev.filter((i) => i.id !== inviteId));
    if (!res.ok) {
      showToast(data.error || 'Invitation expired');
      return;
    }
    if (accept && data.roomCode) {
      sendWs({ type: 'room:join', roomCode: data.roomCode });
    }
  };

  const handleUpdateSettings = (next: AudioSettings) => {
    setAudioSettings(next);
    audioEngine.updateSettings(next);
  };

  const notificationCount = incomingRequests.length + roomInvites.length;
  const inMatchOrLobby = roomState !== null;

  return (
    <div
      className="relative w-full h-[100dvh] overflow-hidden bg-[#04060D]"
      onPointerDown={() => audioEngine.unlock()}
    >
      {/* Dedicated WebGL 3D Canvas Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Portrait Mobile Orientation Lock */}
      <PortraitLockOverlay />

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-amber-400/60 bg-[#1B1204]/95 px-4 py-2 text-xs font-semibold text-amber-200">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            Offline — Online multiplayer requires an active internet connection.
          </span>
        </div>
      )}

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rounded-lg border border-rose-500/60 bg-[#1D0810]/95 px-4 py-2.5 text-xs sm:text-sm font-semibold text-rose-200 shadow-lg">
          {errorToast}
        </div>
      )}

      {/* Direct Friend Room Invitation Toast (when on Main Menu) */}
      {!inMatchOrLobby && roomInvites.length > 0 && activeModal !== 'friends' && (
        <div className="fixed top-3 right-3 z-40 w-80 rounded-xl border border-pink-500/60 bg-[#12071A]/95 p-3.5 shadow-xl">
          <div className="text-xs font-bold text-pink-300">
            Match Invitation from {roomInvites[0].hostUsername}
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">
            Private Lobby · {roomInvites[0].playerCount}/6 Riders
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void handleRespondRoomInvite(roomInvites[0].id, true)
              }
              className="flex-1 min-h-[38px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 transition"
            >
              ACCEPT
            </button>
            <button
              type="button"
              onClick={() =>
                void handleRespondRoomInvite(roomInvites[0].id, false)
              }
              className="flex-1 min-h-[38px] rounded-lg border border-white/15 text-slate-200 text-xs font-semibold hover:bg-white/10 transition"
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {/* MAIN MENU — Full-Width Horizontal Transparent Dashboard over Rotating 3D Showcase */}
      {!inMatchOrLobby && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between gap-1.5 pt-[max(0.45rem,env(safe-area-inset-top))] pr-[max(0.65rem,env(safe-area-inset-right))] pb-[max(0.4rem,env(safe-area-inset-bottom))] pl-[max(0.65rem,env(safe-area-inset-left))] sm:p-4 pointer-events-none">
          {/* Top Full-Width Translucent Header Strip */}
          <div className="pointer-events-auto w-full rounded-xl border border-white/15 bg-[#050914]/55 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2 sm:gap-4 shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <img
                src="/icon-192x192.png"
                alt="TRON BIKE Logo"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-cyan-400/40 object-cover shrink-0"
              />
              <div className="font-display text-lg sm:text-2xl md:text-3xl font-black tracking-[0.14em] text-white shrink-0">
                TRON <span className="text-cyan-400">BIKE</span>
              </div>
              <span className="hidden lg:inline text-xs text-slate-300 border-l border-white/15 pl-3 truncate">
                6-Player Light-Cycle &amp; Car Arena
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  audioEngine.unlock();
                  audioEngine.playUiTap();
                  toggleFullscreen();
                }}
                aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                className="min-h-[40px] sm:min-h-[44px] inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-3 sm:px-4 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 active:scale-[0.98] transition whitespace-nowrap shrink-0"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 shrink-0 text-cyan-300" />
                ) : (
                  <Maximize2 className="w-4 h-4 shrink-0 text-cyan-300" />
                )}
                <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
              </button>

              {account && (() => {
                const activeColor =
                  NEON_PALETTE.find((c) => c.id === account.preferredColorId) ??
                  NEON_PALETTE[0];
                const charName =
                  CHARACTER_OPTIONS.find((c) => c.id === account.characterId)
                    ?.name ?? 'Vanguard Rider';
                return (
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudioAndOrientation();
                      setActiveModal('profile');
                    }}
                    className="min-h-[40px] sm:min-h-[44px] inline-flex items-center gap-2 sm:gap-2.5 rounded-xl border border-white/15 bg-[#070C18]/75 px-2.5 sm:px-3 py-1 hover:border-cyan-400/60 transition"
                  >
                    <AvatarBadge
                      avatarId={account.avatarId}
                      size={30}
                      borderColor={activeColor.hex}
                    />
                    <div className="text-left leading-tight">
                      <div className="text-[11px] sm:text-xs font-bold text-white max-w-[90px] sm:max-w-[120px] truncate">
                        {account.username}
                      </div>
                      <div className="font-mono-tabular text-[9px] sm:text-[10px] text-cyan-300">
                        {account.id}
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 border-l border-white/15 pl-2.5 text-[11px] text-slate-300">
                      {account.vehicleType === 'car' ? (
                        <Car className="w-3.5 h-3.5 text-cyan-300" />
                      ) : (
                        <Bike className="w-3.5 h-3.5 text-cyan-300" />
                      )}
                      <span>{charName.split(' ')[0]}</span>
                    </div>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Open Transparent Middle Stage — Keeps Rotating 3D Showcase Fully Visible */}
          <div className="flex-1 flex items-center justify-between px-1 sm:px-2 pointer-events-none">
            {account && (
              <div className="hidden lg:flex flex-col gap-1.5 rounded-xl border border-white/12 bg-[#050914]/45 px-3.5 py-2.5 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Rider Career
                </div>
                <div className="flex items-center gap-4 font-mono-tabular">
                  <div>
                    <div className="text-sm font-bold text-white">
                      {account.matchesPlayed}
                    </div>
                    <div className="text-[10px] text-slate-400">Matches</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-cyan-300">
                      {account.matchesWon}
                    </div>
                    <div className="text-[10px] text-slate-400">Wins</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-pink-400">
                      {account.eliminations}
                    </div>
                    <div className="text-[10px] text-slate-400">Kills</div>
                  </div>
                </div>
              </div>
            )}

            {account && (() => {
              const activeColor =
                NEON_PALETTE.find((c) => c.id === account.preferredColorId) ??
                NEON_PALETTE[0];
              const charName =
                CHARACTER_OPTIONS.find((c) => c.id === account.characterId)
                  ?.name ?? 'Vanguard Rider';
              return (
                <div className="hidden lg:flex flex-col items-end gap-1 rounded-xl border border-white/12 bg-[#050914]/45 px-3.5 py-2.5 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Active Loadout
                  </div>
                  <div className="font-display text-xs font-bold text-white flex items-center gap-1.5">
                    {account.vehicleType === 'car' ? (
                      <Car className="w-3.5 h-3.5 text-cyan-300" />
                    ) : (
                      <Bike className="w-3.5 h-3.5 text-cyan-300" />
                    )}
                    <span>
                      {charName} ·{' '}
                      {account.vehicleType === 'car' ? 'Neon Car' : 'Light Cycle'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: activeColor.hex }}
                    />
                    <span>{activeColor.name}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Bottom Full-Width Horizontal Transparent Action Dashboard */}
          <div className="pointer-events-auto w-full space-y-1.5 shrink-0">
            <div className="w-full rounded-2xl border border-cyan-400/25 bg-[#050914]/58 p-2 sm:p-3 md:p-4 space-y-2">
              {/* Row 1: Primary Match Launch Bar (always single horizontal row in landscape) */}
              <div className="grid grid-cols-12 gap-2">
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setActiveModal('play_online');
                  }}
                  className="col-span-6 min-h-[42px] md:min-h-[50px] flex items-center justify-between px-3 sm:px-5 rounded-xl bg-cyan-500/95 text-slate-950 font-display text-xs sm:text-sm md:text-base font-black hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 transition"
                >
                  <span className="flex items-center gap-2 sm:gap-3">
                    <Play className="w-4 h-4 md:w-5 md:h-5 fill-current shrink-0" />
                    <span className="truncate">PLAY ONLINE</span>
                  </span>
                  <span className="hidden sm:inline text-[11px] md:text-xs font-sans font-bold shrink-0">
                    1–6 Riders
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={handleHostGame}
                  className="col-span-3 min-h-[42px] md:min-h-[50px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-2 sm:px-3 text-[11px] sm:text-xs md:text-sm font-display font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 transition"
                >
                  <PlusSquare className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                  <span className="truncate">HOST</span>
                </button>

                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setJoinCodeInput('');
                    setActiveModal('join_room');
                  }}
                  className="col-span-3 min-h-[42px] md:min-h-[50px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-pink-400/50 bg-pink-500/15 px-2 sm:px-3 text-[11px] sm:text-xs md:text-sm font-display font-bold text-pink-200 hover:bg-pink-500/25 disabled:opacity-40 transition"
                >
                  <Hash className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                  <span className="truncate">JOIN</span>
                </button>
              </div>

              {/* Row 2: Secondary Modules Ordered Across Full Width */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setActiveModal('friends');
                  }}
                  className="relative min-h-[38px] md:min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-white/15 bg-[#080F20]/70 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-display font-bold text-slate-100 hover:border-cyan-400/55 hover:bg-[#0D1830]/80 transition"
                >
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300 shrink-0" />
                  <span className="truncate">FRIENDS</span>
                  {notificationCount > 0 && (
                    <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white font-mono-tabular text-[10px] font-bold flex items-center justify-center shrink-0">
                      {notificationCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setActiveModal('profile');
                  }}
                  className="min-h-[38px] md:min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-white/15 bg-[#080F20]/70 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-display font-bold text-slate-100 hover:border-cyan-400/55 hover:bg-[#0D1830]/80 transition"
                >
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300 shrink-0" />
                  <span className="truncate">PROFILE</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setActiveModal('settings');
                  }}
                  className="min-h-[38px] md:min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-white/15 bg-[#080F20]/70 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-display font-bold text-slate-100 hover:border-cyan-400/55 hover:bg-[#0D1830]/80 transition"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300 shrink-0" />
                  <span className="truncate">SETTINGS</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    unlockAudioAndOrientation();
                    setActiveModal('rulebook');
                  }}
                  className="min-h-[38px] md:min-h-[44px] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-white/15 bg-[#080F20]/70 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-display font-bold text-slate-100 hover:border-cyan-400/55 hover:bg-[#0D1830]/80 transition"
                >
                  <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-300 shrink-0" />
                  <span className="truncate">RULES</span>
                </button>
              </div>
            </div>

            {/* Quiet Footer Info & Studio Attribution */}
            <div className="flex items-center justify-between gap-2 px-1 text-[10px] sm:text-[11px] text-slate-300/85 pointer-events-none">
              <span className="hidden md:inline truncate">
                Swipe Left / Right to Steer · Last Rider Standing Wins
              </span>
              <span className="font-display tracking-wider text-[10px] sm:text-[11px] text-slate-300/90 shrink-0">
                Developed by <span className="text-cyan-300 font-bold">PRAKALP STUDIOS</span>
              </span>
              <span className="shrink-0">
                {wsConnected
                  ? 'Multiplayer Ready'
                  : isOnline
                    ? 'Connecting...'
                    : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PLAY ONLINE Modal (chooses Host or Join cleanly) */}
      {activeModal === 'play_online' && (
        <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-3">
          <div className="w-full max-w-md max-h-[94dvh] overflow-y-auto custom-scroll rounded-xl border border-cyan-500/40 bg-[#080D1B] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
                <h2 className="font-display text-lg font-bold text-white">
                  Play Online
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Host a private 6-player arena and invite friends directly, or join
              an existing match using a 6-character room code.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleHostGame}
                className="min-h-[48px] rounded-xl bg-cyan-500 text-slate-950 font-display text-sm font-black hover:bg-cyan-400 transition"
              >
                HOST GAME
              </button>
              <button
                type="button"
                onClick={() => {
                  setJoinCodeInput('');
                  setActiveModal('join_room');
                }}
                className="min-h-[48px] rounded-xl border border-pink-400/50 bg-pink-500/15 text-pink-200 font-display text-sm font-black hover:bg-pink-500/25 transition"
              >
                JOIN GAME
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOIN GAME Room Code Modal */}
      {activeModal === 'join_room' && (
        <div className="fixed inset-0 h-[100dvh] z-50 flex items-center justify-center bg-black/80 p-3">
          <form
            onSubmit={handleJoinGameSubmit}
            className="w-full max-w-sm max-h-[94dvh] overflow-y-auto custom-scroll rounded-xl border border-pink-500/40 bg-[#080D1B] p-4 sm:p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                Join Private Match
              </h2>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="room-code-input"
                className="block text-xs font-semibold text-slate-300 mb-1.5"
              >
                6-Character Room Code
              </label>
              <input
                id="room-code-input"
                type="text"
                maxLength={6}
                autoFocus
                placeholder="e.g. X7K9Q2"
                value={joinCodeInput}
                onChange={(e) =>
                  setJoinCodeInput(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  )
                }
                className="w-full min-h-[48px] rounded-lg border border-white/20 bg-[#040710] px-4 text-center font-mono-tabular text-xl font-bold tracking-[0.28em] text-cyan-300 placeholder:text-slate-600 focus:border-cyan-400 outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-lg bg-pink-500 text-white font-display text-sm font-black hover:bg-pink-400 transition"
            >
              ENTER LOBBY
            </button>
          </form>
        </div>
      )}

      {/* FRIENDS MODAL */}
      {activeModal === 'friends' && account && (
        <FriendsModal
          myPlayerId={account.id}
          friends={friends}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          roomInvites={roomInvites}
          activeHostingRoomCode={
            roomState &&
            roomState.phase === 'lobby' &&
            roomState.hostId === account.id
              ? roomState.roomCode
              : null
          }
          onSearchPlayer={handleSearchPlayer}
          onSendFriendRequest={handleSendFriendRequest}
          onRespondFriendRequest={handleRespondFriendRequest}
          onRemoveFriend={handleRemoveFriend}
          onInviteFriendToRoom={handleInviteFriendToRoom}
          onRespondRoomInvite={handleRespondRoomInvite}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* PROFILE MODAL */}
      {activeModal === 'profile' && account && (
        <ProfileModal
          account={account}
          onSaveProfile={handleSaveProfile}
          onRecoverAccount={handleRecoverAccount}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* SETTINGS MODAL */}
      {activeModal === 'settings' && (
        <SettingsModal
          settings={audioSettings}
          onChange={handleUpdateSettings}
          onOpenRuleBook={() => setActiveModal('rulebook')}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* RULE BOOK MODAL */}
      {activeModal === 'rulebook' && (
        <RuleBookModal onClose={() => setActiveModal(null)} />
      )}

      {/* MULTIPLAYER LOBBY */}
      {roomState && roomState.phase === 'lobby' && account && (
        <LobbyScreen
          room={roomState}
          myPlayerId={account.id}
          friends={friends}
          onToggleReady={(ready) => sendWs({ type: 'room:ready', ready })}
          onStartMatch={() => sendWs({ type: 'room:start' })}
          onLeaveRoom={handleReturnToMenu}
          onInviteFriend={handleInviteFriendToRoom}
        />
      )}

      {/* ACTIVE GAMEPLAY / COUNTDOWN / SPECTATOR / VICTORY WHEELIE HUD */}
      {roomState &&
        (roomState.phase === 'countdown' ||
          roomState.phase === 'playing' ||
          roomState.phase === 'victory_stunt') &&
        account && (
          <GameplayHUD
            room={roomState}
            myPlayerId={account.id}
            cameraMode={cameraMode}
            announcement={announcement}
            onToggleCamera={handleToggleCamera}
            onTurn={handleTurn}
            onSpectatorLook={(dyaw, dpitch) =>
              engineRef.current?.rotateSpectator(dyaw, dpitch)
            }
            onSpectatorMove={(fwd, strafe, vert) =>
              engineRef.current?.setSpectatorMove(fwd, strafe, vert)
            }
            onSpectatorJumpNext={() =>
              engineRef.current?.jumpSpectatorToNextAlive()
            }
          />
        )}

      {/* FINAL RESULTS SCREEN */}
      {roomState && roomState.phase === 'results' && account && (
        <ResultsScreen
          room={roomState}
          myPlayerId={account.id}
          onVoteRematch={(vote) =>
            sendWs({ type: 'room:rematch_vote', vote })
          }
          onReturnToMenu={handleReturnToMenu}
        />
      )}
    </div>
  );
}
