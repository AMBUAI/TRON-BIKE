export const ARENA_HALF = 400; // 800 x 800 enormous continuous open arena
export const BIKE_SPEED = 88; // world units per second (2x speed for bikes & cars)
export const MIN_TURN_DISTANCE = 4.5; // prevents accidental 180-degree self-reversals
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 1; // Host can start even alone
export const RECONNECT_GRACE_MS = 30_000;
export const SIMULTANEOUS_WINDOW_MS = 95;

export type Direction = 0 | 1 | 2 | 3; // 0: -Z (N), 1: +X (E), 2: +Z (S), 3: -X (W)

export type CharacterModelId = 'tron1' | 'tron2' | 'tron3';
export type VehicleType = 'bike' | 'car';

export interface CharacterOption {
  id: CharacterModelId;
  name: string;
  baseColorName: string;
}

export const CHARACTER_OPTIONS: CharacterOption[] = [
  { id: 'tron1', name: 'Vanguard Rider', baseColorName: 'Blue' },
  { id: 'tron2', name: 'Sentry Enforcer', baseColorName: 'Red' },
  { id: 'tron3', name: 'Iso Specialist', baseColorName: 'White' },
];

export interface NeonColor {
  id: string;
  name: string;
  hex: string;
}

export const NEON_PALETTE: NeonColor[] = [
  { id: 'cyan', name: 'Electric Blue', hex: '#00F0FF' },
  { id: 'red', name: 'Crimson Red', hex: '#FF2442' },
  { id: 'white', name: 'Grid White', hex: '#F1F5F9' },
  { id: 'pink', name: 'Hot Pink', hex: '#FF2A85' },
  { id: 'amber', name: 'Solar Amber', hex: '#FFB800' },
  { id: 'purple', name: 'Neon Violet', hex: '#A855F7' },
  { id: 'lime', name: 'Hyper Lime', hex: '#39FF14' },
];

export const DIR_VECTORS: Record<Direction, { x: number; z: number }> = {
  0: { x: 0, z: -1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: 1 },
  3: { x: -1, z: 0 },
};

export interface TrailPoint {
  x: number;
  z: number;
}

export interface PlayerAccount {
  id: string; // 12-char alphanumeric Player ID
  recoverySecret: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  preferredColorId: string;
  vehicleType: VehicleType;
  matchesPlayed: number;
  matchesWon: number;
  eliminations: number;
}

export interface PublicPlayerProfile {
  id: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  preferredColorId: string;
  vehicleType: VehicleType;
  onlineStatus: 'online' | 'lobby' | 'playing' | 'offline';
  matchesPlayed: number;
  matchesWon: number;
  eliminations: number;
}

export interface FriendRequestItem {
  id: string;
  fromPlayer: PublicPlayerProfile;
  toPlayer: PublicPlayerProfile;
  createdAt: number;
}

export interface RoomInviteItem {
  id: string;
  roomCode: string;
  hostId: string;
  hostUsername: string;
  hostAvatarId: number;
  playerCount: number;
  createdAt: number;
}

export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'victory_stunt' | 'results';

export interface LobbyPlayer {
  playerId: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  vehicleType: VehicleType;
  color: NeonColor;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  rematchVote: boolean;
}

export interface BikeSnapshot {
  playerId: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  vehicleType: VehicleType;
  color: NeonColor;
  x: number;
  z: number;
  dir: Direction;
  alive: boolean;
  trail: TrailPoint[];
  lastTurnDist: number;
  pendingTurn: 'left' | 'right' | null;
  eliminatedAt: number | null;
  eliminationReason: string | null;
  killedBy: string | null;
  placement: number | null;
}

export interface DeathAnnouncement {
  id: string;
  type: 'single' | 'boundary' | 'simultaneous';
  headline: string;
  subline?: string;
  playerNames: string[];
  colorHexes: string[];
  timestamp: number;
}

export interface MatchStanding {
  playerId: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  vehicleType: VehicleType;
  color: NeonColor;
  placement: number;
  survivedMs: number;
  eliminationReason: string;
  isWinner: boolean;
}

export interface MatchResultsPayload {
  isDraw: boolean;
  isSolo: boolean;
  winnerId: string | null;
  winnerUsername: string | null;
  winnerColor: NeonColor | null;
  standings: MatchStanding[];
  totalPlayers: number;
}

export interface RoomStateSnapshot {
  roomCode: string;
  phase: RoomPhase;
  hostId: string;
  players: LobbyPlayer[];
  countdownValue: number | null; // 3, 2, 1, 0 (GO)
  bikes: BikeSnapshot[];
  aliveCount: number;
  results: MatchResultsPayload | null;
  serverTime: number;
}

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  defaultCamera: 'third' | 'first';
}

// Client -> Server WebSocket Messages
export type ClientWsMessage =
  | { type: 'auth'; playerId: string; recoverySecret: string }
  | { type: 'room:host' }
  | { type: 'room:join'; roomCode: string }
  | { type: 'room:leave' }
  | { type: 'room:ready'; ready: boolean }
  | { type: 'room:start' }
  | { type: 'room:rematch_vote'; vote: boolean }
  | { type: 'game:turn'; turn: 'left' | 'right'; seq: number }
  | { type: 'ping'; ts: number };

// Server -> Client WebSocket Messages
export type ServerWsMessage =
  | { type: 'auth:ok'; playerId: string; activeRoomCode: string | null }
  | { type: 'error'; message: string; code?: string }
  | { type: 'room:state'; state: RoomStateSnapshot }
  | { type: 'room:closed'; reason: string }
  | { type: 'game:countdown'; value: number }
  | { type: 'game:tick'; bikes: Array<{ playerId: string; x: number; z: number; dir: Direction; alive: boolean; trail: TrailPoint[] }>; aliveCount: number; serverTime: number }
  | { type: 'game:announcement'; announcement: DeathAnnouncement }
  | { type: 'game:eliminated'; playerId: string; x: number; z: number; colorHex: string; reason: string; isBoundary: boolean }
  | { type: 'game:winner'; winnerId: string | null; isDraw: boolean; results: MatchResultsPayload }
  | { type: 'social:friend_request'; request: FriendRequestItem }
  | { type: 'social:friend_accepted'; friend: PublicPlayerProfile }
  | { type: 'social:friend_removed'; friendId: string }
  | { type: 'social:room_invite'; invite: RoomInviteItem }
  | { type: 'pong'; ts: number; serverTime: number };
