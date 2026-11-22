import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CHARACTER_OPTIONS,
  NEON_PALETTE,
  type CharacterModelId,
  type PlayerAccount,
  type PublicPlayerProfile,
  type VehicleType,
} from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tronbike.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    recovery_secret TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    avatar_id INTEGER NOT NULL DEFAULT 0,
    character_id TEXT NOT NULL DEFAULT 'tron1',
    preferred_color_id TEXT NOT NULL DEFAULT 'cyan',
    vehicle_type TEXT NOT NULL DEFAULT 'bike',
    matches_played INTEGER NOT NULL DEFAULT 0,
    matches_won INTEGER NOT NULL DEFAULT 0,
    eliminations INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_player_id TEXT NOT NULL,
    to_player_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(from_player_id, to_player_id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    player_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, friend_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES players(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS room_invites (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    host_id TEXT NOT NULL,
    target_player_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (host_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (target_player_id) REFERENCES players(id) ON DELETE CASCADE
  );
`);

// Safe schema migration for existing SQLite databases
const existingCols = new Set(
  (db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>).map(
    (c) => c.name
  )
);
if (!existingCols.has('character_id')) {
  db.exec("ALTER TABLE players ADD COLUMN character_id TEXT NOT NULL DEFAULT 'tron1'");
}
if (!existingCols.has('preferred_color_id')) {
  db.exec("ALTER TABLE players ADD COLUMN preferred_color_id TEXT NOT NULL DEFAULT 'cyan'");
}
if (!existingCols.has('vehicle_type')) {
  db.exec("ALTER TABLE players ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'bike'");
}

const VALID_CHAR_IDS = new Set<string>(CHARACTER_OPTIONS.map((c) => c.id));
const VALID_COLOR_IDS = new Set<string>(NEON_PALETTE.map((c) => c.id));

export function normalizeCharacterId(raw?: unknown): CharacterModelId {
  if (typeof raw === 'string' && VALID_CHAR_IDS.has(raw)) {
    return raw as CharacterModelId;
  }
  return 'tron1';
}

export function normalizeColorId(raw?: unknown): string {
  if (typeof raw === 'string' && VALID_COLOR_IDS.has(raw)) {
    return raw;
  }
  return 'cyan';
}

export function normalizeVehicleType(raw?: unknown): VehicleType {
  return raw === 'car' ? 'car' : 'bike';
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateUniquePlayerId(): string {
  const checkStmt = db.prepare('SELECT 1 FROM players WHERE id = ?');
  for (let attempt = 0; attempt < 30; attempt++) {
    const bytes = crypto.randomBytes(12);
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    }
    if (!checkStmt.get(id)) {
      return id;
    }
  }
  throw new Error('Failed to generate unique Player ID');
}

function generateSecret(): string {
  return crypto.randomBytes(18).toString('base64url');
}

interface PlayerRow {
  id: string;
  recovery_secret: string;
  username: string;
  avatar_id: number;
  character_id: string;
  preferred_color_id: string;
  vehicle_type: string;
  matches_played: number;
  matches_won: number;
  eliminations: number;
  created_at: number;
  last_seen: number;
}

function mapAccount(row: PlayerRow): PlayerAccount {
  return {
    id: row.id,
    recoverySecret: row.recovery_secret,
    username: row.username,
    avatarId: row.avatar_id,
    characterId: normalizeCharacterId(row.character_id),
    preferredColorId: normalizeColorId(row.preferred_color_id),
    vehicleType: normalizeVehicleType(row.vehicle_type),
    matchesPlayed: row.matches_played,
    matchesWon: row.matches_won,
    eliminations: row.eliminations,
  };
}

export function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
  return cleaned;
}

export function initOrRestoreAccount(
  playerId?: string,
  recoverySecret?: string
): PlayerAccount {
  const now = Date.now();
  if (playerId && recoverySecret) {
    const cleanId = playerId.trim().toUpperCase();
    const row = db
      .prepare('SELECT * FROM players WHERE id = ? AND recovery_secret = ?')
      .get(cleanId, recoverySecret.trim()) as PlayerRow | undefined;
    if (row) {
      db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now, row.id);
      return mapAccount(row);
    }
  }

  const id = generateUniquePlayerId();
  const secret = generateSecret();
  const defaultUsername = `RIDER_${id.slice(0, 4)}`;
  const avatarId = crypto.randomInt(0, 8);

  db.prepare(
    `INSERT INTO players (id, recovery_secret, username, avatar_id, character_id, preferred_color_id, vehicle_type, matches_played, matches_won, eliminations, created_at, last_seen)
     VALUES (?, ?, ?, ?, 'tron1', 'cyan', 'bike', 0, 0, 0, ?, ?)`
  ).run(id, secret, defaultUsername, avatarId, now, now);

  const created = db
    .prepare('SELECT * FROM players WHERE id = ?')
    .get(id) as PlayerRow;
  return mapAccount(created);
}

export function recoverAccountByCredentials(
  playerId: string,
  recoverySecret: string
): PlayerAccount | null {
  const cleanId = playerId.trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM players WHERE id = ? AND recovery_secret = ?')
    .get(cleanId, recoverySecret.trim()) as PlayerRow | undefined;
  if (!row) return null;
  db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(Date.now(), row.id);
  return mapAccount(row);
}

export function authenticatePlayer(
  playerId: string,
  recoverySecret: string
): PlayerAccount | null {
  if (!playerId || !recoverySecret) return null;
  const row = db
    .prepare('SELECT * FROM players WHERE id = ? AND recovery_secret = ?')
    .get(playerId.trim().toUpperCase(), recoverySecret.trim()) as PlayerRow | undefined;
  return row ? mapAccount(row) : null;
}

export function updateProfile(
  playerId: string,
  username: string,
  avatarId: number,
  characterId?: unknown,
  preferredColorId?: unknown,
  vehicleType?: unknown
): PlayerAccount {
  const safeName = sanitizeUsername(username);
  if (safeName.length < 2) {
    throw new Error('Username must be 2 to 16 characters');
  }
  const safeAvatar = Math.max(0, Math.min(7, Math.floor(avatarId)));
  const safeCharacter = normalizeCharacterId(characterId);
  const safeColor = normalizeColorId(preferredColorId);
  const safeVehicle = normalizeVehicleType(vehicleType);
  db.prepare(
    'UPDATE players SET username = ?, avatar_id = ?, character_id = ?, preferred_color_id = ?, vehicle_type = ?, last_seen = ? WHERE id = ?'
  ).run(safeName, safeAvatar, safeCharacter, safeColor, safeVehicle, Date.now(), playerId);
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as PlayerRow;
  return mapAccount(row);
}

export function getPublicPlayer(
  playerId: string,
  getPresence: (id: string) => 'online' | 'lobby' | 'playing' | 'offline'
): PublicPlayerProfile | null {
  const row = db
    .prepare('SELECT * FROM players WHERE id = ?')
    .get(playerId.trim().toUpperCase()) as PlayerRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    avatarId: row.avatar_id,
    characterId: normalizeCharacterId(row.character_id),
    preferredColorId: normalizeColorId(row.preferred_color_id),
    vehicleType: normalizeVehicleType(row.vehicle_type),
    onlineStatus: getPresence(row.id),
    matchesPlayed: row.matches_played,
    matchesWon: row.matches_won,
    eliminations: row.eliminations,
  };
}

export function areFriends(a: string, b: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM friends WHERE player_id = ? AND friend_id = ?')
    .get(a, b);
  return Boolean(row);
}

export function createFriendRequest(
  fromId: string,
  toId: string,
  getPresence: (id: string) => 'online' | 'lobby' | 'playing' | 'offline'
) {
  const targetId = toId.trim().toUpperCase();
  if (fromId === targetId) {
    throw new Error('You cannot add yourself as a friend');
  }
  const target = db.prepare('SELECT * FROM players WHERE id = ?').get(targetId) as
    | PlayerRow
    | undefined;
  if (!target) {
    throw new Error('No player found with that 12-character ID');
  }
  if (areFriends(fromId, targetId)) {
    throw new Error('You are already friends with this player');
  }

  const existing = db
    .prepare(
      `SELECT * FROM friend_requests
       WHERE ((from_player_id = ? AND to_player_id = ?) OR (from_player_id = ? AND to_player_id = ?))
       AND status = 'pending'`
    )
    .get(fromId, targetId, targetId, fromId) as
    | { id: string; from_player_id: string; to_player_id: string }
    | undefined;

  if (existing) {
    if (existing.from_player_id === targetId) {
      throw new Error('This player already sent you a friend request — check incoming requests');
    }
    throw new Error('Friend request already sent');
  }

  // Clean up old declined/accepted entries between pair so re-adding works after removal
  db.prepare(
    `DELETE FROM friend_requests
     WHERE (from_player_id = ? AND to_player_id = ?) OR (from_player_id = ? AND to_player_id = ?)`
  ).run(fromId, targetId, targetId, fromId);

  const reqId = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO friend_requests (id, from_player_id, to_player_id, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(reqId, fromId, targetId, now);

  const fromProfile = getPublicPlayer(fromId, getPresence)!;
  const toProfile = getPublicPlayer(targetId, getPresence)!;
  return {
    id: reqId,
    fromPlayer: fromProfile,
    toPlayer: toProfile,
    createdAt: now,
  };
}

export function respondToFriendRequest(
  playerId: string,
  requestId: string,
  accept: boolean,
  getPresence: (id: string) => 'online' | 'lobby' | 'playing' | 'offline'
) {
  const req = db
    .prepare('SELECT * FROM friend_requests WHERE id = ? AND to_player_id = ? AND status = ?')
    .get(requestId, playerId, 'pending') as
    | { id: string; from_player_id: string; to_player_id: string }
    | undefined;

  if (!req) {
    throw new Error('Friend request not found or already handled');
  }

  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run(
      accept ? 'accepted' : 'declined',
      requestId
    );
    if (accept) {
      db.prepare(
        'INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)'
      ).run(req.from_player_id, req.to_player_id, now);
      db.prepare(
        'INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)'
      ).run(req.to_player_id, req.from_player_id, now);
    }
  });
  tx();

  return {
    fromPlayerId: req.from_player_id,
    fromProfile: getPublicPlayer(req.from_player_id, getPresence),
    toProfile: getPublicPlayer(req.to_player_id, getPresence),
    accepted: accept,
  };
}

export function removeFriend(playerId: string, friendId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?').run(
      playerId,
      friendId
    );
    db.prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?').run(
      friendId,
      playerId
    );
    db.prepare(
      `DELETE FROM friend_requests
       WHERE (from_player_id = ? AND to_player_id = ?) OR (from_player_id = ? AND to_player_id = ?)`
    ).run(playerId, friendId, friendId, playerId);
  });
  tx();
}

export function getSocialOverview(
  playerId: string,
  getPresence: (id: string) => 'online' | 'lobby' | 'playing' | 'offline',
  getActiveRoomInfo: (roomCode: string) => { playerCount: number; valid: boolean }
) {
  const friendRows = db
    .prepare('SELECT friend_id FROM friends WHERE player_id = ? ORDER BY created_at DESC')
    .all(playerId) as Array<{ friend_id: string }>;

  const friends: PublicPlayerProfile[] = [];
  for (const row of friendRows) {
    const p = getPublicPlayer(row.friend_id, getPresence);
    if (p) friends.push(p);
  }

  const incomingRows = db
    .prepare(
      `SELECT id, from_player_id, to_player_id, created_at FROM friend_requests
       WHERE to_player_id = ? AND status = 'pending' ORDER BY created_at DESC`
    )
    .all(playerId) as Array<{
    id: string;
    from_player_id: string;
    to_player_id: string;
    created_at: number;
  }>;

  const incomingRequests = incomingRows
    .map((r) => {
      const fromPlayer = getPublicPlayer(r.from_player_id, getPresence);
      const toPlayer = getPublicPlayer(r.to_player_id, getPresence);
      if (!fromPlayer || !toPlayer) return null;
      return { id: r.id, fromPlayer, toPlayer, createdAt: r.created_at };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const outgoingRows = db
    .prepare(
      `SELECT id, from_player_id, to_player_id, created_at FROM friend_requests
       WHERE from_player_id = ? AND status = 'pending' ORDER BY created_at DESC`
    )
    .all(playerId) as Array<{
    id: string;
    from_player_id: string;
    to_player_id: string;
    created_at: number;
  }>;

  const outgoingRequests = outgoingRows
    .map((r) => {
      const fromPlayer = getPublicPlayer(r.from_player_id, getPresence);
      const toPlayer = getPublicPlayer(r.to_player_id, getPresence);
      if (!fromPlayer || !toPlayer) return null;
      return { id: r.id, fromPlayer, toPlayer, createdAt: r.created_at };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const inviteRows = db
    .prepare(
      `SELECT id, room_code, host_id, created_at FROM room_invites
       WHERE target_player_id = ? AND status = 'pending' ORDER BY created_at DESC`
    )
    .all(playerId) as Array<{
    id: string;
    room_code: string;
    host_id: string;
    created_at: number;
  }>;

  const roomInvites = [];
  for (const inv of inviteRows) {
    const roomInfo = getActiveRoomInfo(inv.room_code);
    if (!roomInfo.valid) {
      db.prepare("UPDATE room_invites SET status = 'expired' WHERE id = ?").run(inv.id);
      continue;
    }
    const host = getPublicPlayer(inv.host_id, getPresence);
    if (!host) continue;
    roomInvites.push({
      id: inv.id,
      roomCode: inv.room_code,
      hostId: inv.host_id,
      hostUsername: host.username,
      hostAvatarId: host.avatarId,
      playerCount: roomInfo.playerCount,
      createdAt: inv.created_at,
    });
  }

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    roomInvites,
  };
}

export function createRoomInvite(
  roomCode: string,
  hostId: string,
  targetPlayerId: string
) {
  if (!areFriends(hostId, targetPlayerId)) {
    throw new Error('You can only invite players from your friends list');
  }
  const existing = db
    .prepare(
      `SELECT id FROM room_invites WHERE room_code = ? AND target_player_id = ? AND status = 'pending'`
    )
    .get(roomCode, targetPlayerId);
  if (existing) {
    throw new Error('Invitation already sent to this friend');
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO room_invites (id, room_code, host_id, target_player_id, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).run(id, roomCode, hostId, targetPlayerId, now);
  return { id, createdAt: now };
}

export function respondToRoomInvite(
  playerId: string,
  inviteId: string,
  accept: boolean
): { roomCode: string; accepted: boolean } {
  const inv = db
    .prepare(
      `SELECT id, room_code FROM room_invites WHERE id = ? AND target_player_id = ? AND status = 'pending'`
    )
    .get(inviteId, playerId) as { id: string; room_code: string } | undefined;
  if (!inv) {
    throw new Error('Invitation no longer valid or already handled');
  }
  db.prepare('UPDATE room_invites SET status = ? WHERE id = ?').run(
    accept ? 'accepted' : 'declined',
    inviteId
  );
  return { roomCode: inv.room_code, accepted: accept };
}

export function expireRoomInvites(roomCode: string) {
  db.prepare(
    `UPDATE room_invites SET status = 'expired' WHERE room_code = ? AND status = 'pending'`
  ).run(roomCode);
}

export function recordMatchStats(
  participants: Array<{ playerId: string; isWinner: boolean; kills: number }>
) {
  const stmt = db.prepare(
    `UPDATE players
     SET matches_played = matches_played + 1,
         matches_won = matches_won + ?,
         eliminations = eliminations + ?
     WHERE id = ?`
  );
  const tx = db.transaction(() => {
    for (const p of participants) {
      stmt.run(p.isWinner ? 1 : 0, p.kills, p.playerId);
    }
  });
  tx();
}
