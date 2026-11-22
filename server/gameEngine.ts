import crypto from 'crypto';
import type { WebSocket } from 'ws';
import {
  ARENA_HALF,
  BIKE_SPEED,
  DIR_VECTORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_TURN_DISTANCE,
  NEON_PALETTE,
  RECONNECT_GRACE_MS,
  SIMULTANEOUS_WINDOW_MS,
  type BikeSnapshot,
  type CharacterModelId,
  type DeathAnnouncement,
  type Direction,
  type LobbyPlayer,
  type MatchResultsPayload,
  type MatchStanding,
  type NeonColor,
  type PlayerAccount,
  type RoomPhase,
  type RoomStateSnapshot,
  type ServerWsMessage,
  type TrailPoint,
  type VehicleType,
} from '../shared/types.ts';
import { expireRoomInvites, recordMatchStats } from './db.ts';

interface PendingDeath {
  playerId: string;
  username: string;
  colorHex: string;
  reason: 'trail' | 'self' | 'boundary' | 'headon';
  killerId: string | null;
  killerName: string | null;
  at: number;
  x: number;
  z: number;
}

interface InternalPlayer {
  playerId: string;
  username: string;
  avatarId: number;
  characterId: CharacterModelId;
  preferredColorId: string;
  vehicleType: VehicleType;
  color: NeonColor;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  rematchVote: boolean;
  lastSeq: number;
}

interface InternalBike {
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
  justTurned: boolean;
  pendingTurn: 'left' | 'right' | null;
  eliminatedAt: number | null;
  eliminationReason: string | null;
  killedBy: string | null;
  kills: number;
  placement: number | null;
  dying: boolean;
}

interface GameRoom {
  roomCode: string;
  phase: RoomPhase;
  hostId: string;
  players: Map<string, InternalPlayer>;
  bikes: Map<string, InternalBike>;
  countdownValue: number | null;
  countdownTimer: NodeJS.Timeout | null;
  tickTimer: NodeJS.Timeout | null;
  lastTickAt: number;
  matchStartedAt: number;
  pendingDeaths: PendingDeath[];
  simultaneousTimer: NodeJS.Timeout | null;
  eliminationCounter: number;
  results: MatchResultsPayload | null;
  victoryTimer: NodeJS.Timeout | null;
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateRoomCode(existing: Map<string, GameRoom>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not generate unique room code');
}

function segmentsIntersect(
  ax1: number,
  az1: number,
  ax2: number,
  az2: number,
  bx1: number,
  bz1: number,
  bx2: number,
  bz2: number,
  pad = 0.65
): boolean {
  const minAx = Math.min(ax1, ax2) - pad;
  const maxAx = Math.max(ax1, ax2) + pad;
  const minAz = Math.min(az1, az2) - pad;
  const maxAz = Math.max(az1, az2) + pad;

  const minBx = Math.min(bx1, bx2) - pad;
  const maxBx = Math.max(bx1, bx2) + pad;
  const minBz = Math.min(bz1, bz2) - pad;
  const maxBz = Math.max(bz1, bz2) + pad;

  return maxAx >= minBx && maxBx >= minAx && maxAz >= minBz && maxBz >= minAz;
}

export class MultiplayerManager {
  private rooms = new Map<string, GameRoom>();
  private playerSockets = new Map<string, WebSocket>();
  private playerRooms = new Map<string, string>();
  private graceTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    // Periodic cleanup of empty stale rooms
    setInterval(() => {
      for (const [code, room] of this.rooms.entries()) {
        const anyConnected = Array.from(room.players.values()).some((p) => p.connected);
        if (!anyConnected && room.players.size === 0) {
          this.destroyRoom(code);
        }
      }
    }, 15_000);
  }

  public registerSocket(playerId: string, ws: WebSocket) {
    const prev = this.playerSockets.get(playerId);
    if (prev && prev !== ws && prev.readyState === 1) {
      prev.close(4000, 'Replaced by new connection');
    }
    this.playerSockets.set(playerId, ws);

    const existingTimer = this.graceTimers.get(playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.graceTimers.delete(playerId);
    }

    const activeCode = this.playerRooms.get(playerId) ?? null;
    if (activeCode) {
      const room = this.rooms.get(activeCode);
      if (room) {
        const p = room.players.get(playerId);
        if (p) {
          p.connected = true;
          p.disconnectedAt = null;
          this.broadcastRoomState(room);
        }
      } else {
        this.playerRooms.delete(playerId);
      }
    }
  }

  public handleDisconnect(playerId: string, ws: WebSocket) {
    if (this.playerSockets.get(playerId) !== ws) return;
    this.playerSockets.delete(playerId);

    const code = this.playerRooms.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    this.broadcastRoomState(room);

    // Grace period before removing from room
    const timer = setTimeout(() => {
      this.graceTimers.delete(playerId);
      const currentRoom = this.rooms.get(code);
      if (!currentRoom) return;
      const p = currentRoom.players.get(playerId);
      if (p && !p.connected) {
        this.removePlayerFromRoom(playerId, code);
      }
    }, RECONNECT_GRACE_MS);

    this.graceTimers.set(playerId, timer);
  }

  public getPresence(playerId: string): 'online' | 'lobby' | 'playing' | 'offline' {
    const code = this.playerRooms.get(playerId);
    if (code) {
      const room = this.rooms.get(code);
      if (room) {
        const p = room.players.get(playerId);
        if (p?.connected) {
          return room.phase === 'lobby' ? 'lobby' : 'playing';
        }
      }
    }
    const ws = this.playerSockets.get(playerId);
    if (ws && ws.readyState === 1) return 'online';
    return 'offline';
  }

  public getActiveRoomInfo(roomCode: string): { playerCount: number; valid: boolean } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { playerCount: 0, valid: false };
    if (room.phase !== 'lobby' || room.players.size >= MAX_PLAYERS) {
      return { playerCount: room.players.size, valid: false };
    }
    return { playerCount: room.players.size, valid: true };
  }

  public getRoomForInviteValidation(roomCode: string, hostId: string) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error('Room does not exist');
    if (room.hostId !== hostId) throw new Error('Only the room host can send invitations');
    if (room.phase !== 'lobby') throw new Error('Match has already started');
    if (room.players.size >= MAX_PLAYERS) throw new Error(`Room is full (${MAX_PLAYERS}/${MAX_PLAYERS} players)`);
    return room;
  }

  public canJoinRoom(roomCode: string, playerId: string) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) throw new Error('Room not found or expired');
    if (room.players.has(playerId)) return room;
    if (room.phase !== 'lobby') throw new Error('Match is already in progress');
    if (room.players.size >= MAX_PLAYERS) throw new Error(`Room is full (${MAX_PLAYERS}/${MAX_PLAYERS} players)`);
    return room;
  }

  public getPlayerActiveRoomCode(playerId: string): string | null {
    const code = this.playerRooms.get(playerId);
    if (!code || !this.rooms.has(code)) return null;
    return code;
  }

  public sendToPlayer(playerId: string, msg: ServerWsMessage) {
    const ws = this.playerSockets.get(playerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcastToRoom(room: GameRoom, msg: ServerWsMessage) {
    const payload = JSON.stringify(msg);
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      const ws = this.playerSockets.get(p.playerId);
      if (ws && ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  private buildSnapshot(room: GameRoom): RoomStateSnapshot {
    const players: LobbyPlayer[] = Array.from(room.players.values()).map((p) => ({
      playerId: p.playerId,
      username: p.username,
      avatarId: p.avatarId,
      characterId: p.characterId,
      vehicleType: p.vehicleType,
      color: p.color,
      ready: p.ready,
      isHost: p.isHost,
      connected: p.connected,
      rematchVote: p.rematchVote,
    }));

    const bikes: BikeSnapshot[] = Array.from(room.bikes.values()).map((b) => ({
      playerId: b.playerId,
      username: b.username,
      avatarId: b.avatarId,
      characterId: b.characterId,
      vehicleType: b.vehicleType,
      color: b.color,
      x: b.x,
      z: b.z,
      dir: b.dir,
      alive: b.alive,
      trail: b.alive ? b.trail : [],
      lastTurnDist: b.lastTurnDist,
      pendingTurn: b.pendingTurn,
      eliminatedAt: b.eliminatedAt,
      eliminationReason: b.eliminationReason,
      killedBy: b.killedBy,
      placement: b.placement,
    }));

    return {
      roomCode: room.roomCode,
      phase: room.phase,
      hostId: room.hostId,
      players,
      countdownValue: room.countdownValue,
      bikes,
      aliveCount: bikes.filter((b) => b.alive).length,
      results: room.results,
      serverTime: Date.now(),
    };
  }

  private broadcastRoomState(room: GameRoom) {
    this.broadcastToRoom(room, { type: 'room:state', state: this.buildSnapshot(room) });
  }

  private pickAvailableColor(preferredColorId: string, usedColorIds: Set<string>): NeonColor {
    const preferred = NEON_PALETTE.find(
      (c) => c.id === preferredColorId && !usedColorIds.has(c.id)
    );
    if (preferred) return preferred;
    const available = shuffleArray(NEON_PALETTE).filter((c) => !usedColorIds.has(c.id));
    return available[0] ?? NEON_PALETTE[usedColorIds.size % NEON_PALETTE.length];
  }

  public syncPlayerProfileInLobby(account: PlayerAccount) {
    const code = this.playerRooms.get(account.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'lobby') return;
    const p = room.players.get(account.id);
    if (!p) return;
    p.username = account.username;
    p.avatarId = account.avatarId;
    p.characterId = account.characterId;
    p.preferredColorId = account.preferredColorId;
    p.vehicleType = account.vehicleType;

    const otherUsed = new Set(
      Array.from(room.players.values())
        .filter((other) => other.playerId !== account.id)
        .map((other) => other.color.id)
    );
    const preferred = NEON_PALETTE.find(
      (c) => c.id === account.preferredColorId && !otherUsed.has(c.id)
    );
    if (preferred) {
      p.color = preferred;
    }
    this.broadcastRoomState(room);
  }

  public hostRoom(account: PlayerAccount): GameRoom {
    const existingCode = this.playerRooms.get(account.id);
    if (existingCode) {
      this.removePlayerFromRoom(account.id, existingCode);
    }

    const roomCode = generateRoomCode(this.rooms);
    const assignedColor = this.pickAvailableColor(account.preferredColorId, new Set());
    const player: InternalPlayer = {
      playerId: account.id,
      username: account.username,
      avatarId: account.avatarId,
      characterId: account.characterId,
      preferredColorId: account.preferredColorId,
      vehicleType: account.vehicleType,
      color: assignedColor,
      ready: true, // Host can toggle or stays ready
      isHost: true,
      connected: true,
      disconnectedAt: null,
      rematchVote: false,
      lastSeq: 0,
    };

    const room: GameRoom = {
      roomCode,
      phase: 'lobby',
      hostId: account.id,
      players: new Map([[account.id, player]]),
      bikes: new Map(),
      countdownValue: null,
      countdownTimer: null,
      tickTimer: null,
      lastTickAt: 0,
      matchStartedAt: 0,
      pendingDeaths: [],
      simultaneousTimer: null,
      eliminationCounter: 0,
      results: null,
      victoryTimer: null,
    };

    this.rooms.set(roomCode, room);
    this.playerRooms.set(account.id, roomCode);
    this.broadcastRoomState(room);
    return room;
  }

  public joinRoom(account: PlayerAccount, rawCode: string): GameRoom {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw new Error('Room code must be 6 alphanumeric characters');
    }
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('Room not found or expired');
    }

    // Rejoining same room
    if (room.players.has(account.id)) {
      const existing = room.players.get(account.id)!;
      existing.connected = true;
      existing.username = account.username;
      existing.avatarId = account.avatarId;
      existing.characterId = account.characterId;
      existing.preferredColorId = account.preferredColorId;
      existing.vehicleType = account.vehicleType;
      this.playerRooms.set(account.id, code);
      this.broadcastRoomState(room);
      return room;
    }

    if (room.phase !== 'lobby') {
      throw new Error('Cannot join — match has already started');
    }
    if (room.players.size >= MAX_PLAYERS) {
      throw new Error(`Room is full (maximum ${MAX_PLAYERS} players)`);
    }

    const prevCode = this.playerRooms.get(account.id);
    if (prevCode && prevCode !== code) {
      this.removePlayerFromRoom(account.id, prevCode);
    }

    const usedColorIds = new Set(Array.from(room.players.values()).map((p) => p.color.id));
    const assignedColor = this.pickAvailableColor(account.preferredColorId, usedColorIds);

    room.players.set(account.id, {
      playerId: account.id,
      username: account.username,
      avatarId: account.avatarId,
      characterId: account.characterId,
      preferredColorId: account.preferredColorId,
      vehicleType: account.vehicleType,
      color: assignedColor,
      ready: false,
      isHost: false,
      connected: true,
      disconnectedAt: null,
      rematchVote: false,
      lastSeq: 0,
    });

    this.playerRooms.set(account.id, code);
    this.broadcastRoomState(room);
    return room;
  }

  public leaveRoom(playerId: string) {
    const code = this.playerRooms.get(playerId);
    if (!code) return;
    this.removePlayerFromRoom(playerId, code);
  }

  private removePlayerFromRoom(playerId: string, code: string) {
    const room = this.rooms.get(code);
    this.playerRooms.delete(playerId);
    if (!room) return;

    const leaving = room.players.get(playerId);
    if (!leaving) return;
    room.players.delete(playerId);

    // If match is active and bike is alive, eliminate cleanly
    const bike = room.bikes.get(playerId);
    if (bike && bike.alive && room.phase === 'playing') {
      bike.alive = false;
      bike.trail = [];
      bike.eliminatedAt = Date.now();
      bike.eliminationReason = `${bike.username} disconnected from the grid`;
      room.eliminationCounter += 1;
      bike.placement = room.bikes.size - room.eliminationCounter + 1;
      this.broadcastToRoom(room, {
        type: 'game:eliminated',
        playerId: bike.playerId,
        x: bike.x,
        z: bike.z,
        colorHex: bike.color.hex,
        reason: bike.eliminationReason,
        isBoundary: false,
      });
      this.broadcastToRoom(room, {
        type: 'game:announcement',
        announcement: {
          id: crypto.randomUUID(),
          type: 'single',
          headline: `${bike.username} disconnected`,
          playerNames: [bike.username],
          colorHexes: [bike.color.hex],
          timestamp: Date.now(),
        },
      });
      this.checkWinCondition(room);
    }

    if (room.players.size === 0) {
      this.destroyRoom(code);
      return;
    }

    // Reassign host if needed
    if (room.hostId === playerId) {
      const candidates = Array.from(room.players.values());
      const nextHost = candidates.find((p) => p.connected) ?? candidates[0];
      if (nextHost) {
        room.hostId = nextHost.playerId;
        nextHost.isHost = true;
        nextHost.ready = true;
      }
    }

    // If in results phase and remaining players already voted rematch, re-check
    if (room.phase === 'results') {
      this.checkRematchCondition(room);
    }

    this.broadcastRoomState(room);
  }

  private destroyRoom(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.tickTimer) clearInterval(room.tickTimer);
    if (room.simultaneousTimer) clearTimeout(room.simultaneousTimer);
    if (room.victoryTimer) clearTimeout(room.victoryTimer);
    expireRoomInvites(code);
    this.rooms.delete(code);
  }

  public setReady(playerId: string, ready: boolean) {
    const code = this.playerRooms.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'lobby') return;
    const player = room.players.get(playerId);
    if (!player) return;
    player.ready = player.isHost ? true : Boolean(ready);
    this.broadcastRoomState(room);
  }

  public startMatch(playerId: string) {
    const code = this.playerRooms.get(playerId);
    if (!code) throw new Error('Not in a room');
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== playerId) throw new Error('Only the host can start the match');
    if (room.phase !== 'lobby') throw new Error('Match already started');
    if (room.players.size < MIN_PLAYERS) {
      throw new Error('At least 1 player is required to start');
    }
    const allReady = Array.from(room.players.values()).every((p) => p.ready || p.isHost);
    if (!allReady) {
      throw new Error('All joined players must be ready before starting');
    }

    expireRoomInvites(room.roomCode);
    this.initializeMatch(room);
  }

  private generateRandomSpawns(count: number): Array<{ x: number; z: number; dir: Direction }> {
    const margin = 115;
    const minDist = 155;
    const spawns: Array<{ x: number; z: number; dir: Direction }> = [];

    for (let i = 0; i < count; i++) {
      let chosen: { x: number; z: number; dir: Direction } | null = null;
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = Math.round((Math.random() * 2 - 1) * (ARENA_HALF - margin));
        const z = Math.round((Math.random() * 2 - 1) * (ARENA_HALF - margin));

        const farEnough = spawns.every(
          (s) => Math.hypot(s.x - x, s.z - z) >= minDist
        );
        if (!farEnough) continue;

        // Pick a cardinal direction that has at least 220 units to the boundary
        const dirs = shuffleArray<Direction>([0, 1, 2, 3]);
        const validDir = dirs.find((d) => {
          const vec = DIR_VECTORS[d];
          const distToWall =
            vec.x > 0
              ? ARENA_HALF - x
              : vec.x < 0
                ? ARENA_HALF + x
                : vec.z > 0
                  ? ARENA_HALF - z
                  : ARENA_HALF + z;
          if (distToWall < 220) return false;
          // Also ensure not aiming directly at another spawn within 160 units
          return spawns.every((other) => {
            const dx = other.x - x;
            const dz = other.z - z;
            const proj = dx * vec.x + dz * vec.z;
            const perp = Math.abs(dx * -vec.z + dz * vec.x);
            return !(proj > 0 && proj < 160 && perp < 35);
          });
        });

        if (validDir !== undefined) {
          chosen = { x, z, dir: validDir };
          break;
        }
      }

      if (!chosen) {
        // Fallback distributed ring inside safe zone
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const radius = 210;
        const x = Math.round(Math.cos(angle) * radius);
        const z = Math.round(Math.sin(angle) * radius);
        // Point generally inward
        const dir: Direction =
          Math.abs(x) > Math.abs(z) ? (x > 0 ? 3 : 1) : z > 0 ? 0 : 2;
        chosen = { x, z, dir };
      }
      spawns.push(chosen);
    }

    return spawns;
  }

  private initializeMatch(room: GameRoom) {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.tickTimer) clearInterval(room.tickTimer);
    if (room.simultaneousTimer) clearTimeout(room.simultaneousTimer);
    if (room.victoryTimer) clearTimeout(room.victoryTimer);

    room.bikes.clear();
    room.pendingDeaths = [];
    room.simultaneousTimer = null;
    room.eliminationCounter = 0;
    room.results = null;

    const playerList = Array.from(room.players.values());
    const usedColorIds = new Set<string>();
    const spawns = this.generateRandomSpawns(playerList.length);

    playerList.forEach((p, idx) => {
      const assignedColor = this.pickAvailableColor(p.preferredColorId, usedColorIds);
      usedColorIds.add(assignedColor.id);
      p.color = assignedColor;
      p.rematchVote = false;
      p.lastSeq = 0;

      const spawn = spawns[idx];
      room.bikes.set(p.playerId, {
        playerId: p.playerId,
        username: p.username,
        avatarId: p.avatarId,
        characterId: p.characterId,
        vehicleType: p.vehicleType,
        color: p.color,
        x: spawn.x,
        z: spawn.z,
        dir: spawn.dir,
        alive: true,
        trail: [
          { x: spawn.x, z: spawn.z },
          { x: spawn.x, z: spawn.z },
        ],
        lastTurnDist: MIN_TURN_DISTANCE,
        justTurned: false,
        pendingTurn: null,
        eliminatedAt: null,
        eliminationReason: null,
        killedBy: null,
        kills: 0,
        placement: null,
        dying: false,
      });
    });

    room.phase = 'countdown';
    room.countdownValue = 3;
    this.broadcastRoomState(room);
    this.broadcastToRoom(room, { type: 'game:countdown', value: 3 });

    room.countdownTimer = setInterval(() => {
      if (!this.rooms.has(room.roomCode)) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        return;
      }
      if (room.countdownValue === null) return;
      room.countdownValue -= 1;

      if (room.countdownValue > 0) {
        this.broadcastToRoom(room, {
          type: 'game:countdown',
          value: room.countdownValue,
        });
        this.broadcastRoomState(room);
      } else if (room.countdownValue === 0) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        room.phase = 'playing';
        room.matchStartedAt = Date.now();
        room.lastTickAt = Date.now();
        this.broadcastToRoom(room, { type: 'game:countdown', value: 0 });
        this.broadcastRoomState(room);

        room.tickTimer = setInterval(() => {
          this.stepPhysics(room);
        }, 33);
      }
    }, 1000);
  }

  public handleTurn(playerId: string, turn: 'left' | 'right', seq: number) {
    const code = this.playerRooms.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'playing') return;
    const player = room.players.get(playerId);
    if (!player || !player.connected) return;
    if (seq <= player.lastSeq) return;
    player.lastSeq = seq;

    const bike = room.bikes.get(playerId);
    if (!bike || !bike.alive || bike.dying) return;

    if (bike.lastTurnDist >= MIN_TURN_DISTANCE) {
      this.applyTurn(bike, turn);
    } else {
      // Buffer at most 1 turn so rapid swipe right before cooldown triggers cleanly without 180 reversal
      bike.pendingTurn = turn;
    }
  }

  private applyTurn(bike: InternalBike, turn: 'left' | 'right') {
    const delta = turn === 'right' ? 1 : 3;
    bike.dir = ((bike.dir + delta) % 4) as Direction;
    bike.trail[bike.trail.length - 1] = { x: bike.x, z: bike.z };
    bike.trail.push({ x: bike.x, z: bike.z });
    bike.lastTurnDist = 0;
    bike.justTurned = true;
    bike.pendingTurn = null;
  }

  private stepPhysics(room: GameRoom) {
    if (room.phase !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.08, Math.max(0.005, (now - room.lastTickAt) / 1000));
    room.lastTickAt = now;

    const stepDist = BIKE_SPEED * dt;
    const livingBikes = Array.from(room.bikes.values()).filter(
      (b) => b.alive && !b.dying
    );

    // Record previous positions for exact swept segment collision checks
    const moves = new Map<
      string,
      { prevX: number; prevZ: number; nextX: number; nextZ: number; wasJustTurned: boolean }
    >();

    for (const bike of livingBikes) {
      const prevX = bike.x;
      const prevZ = bike.z;

      if (bike.pendingTurn && bike.lastTurnDist >= MIN_TURN_DISTANCE) {
        this.applyTurn(bike, bike.pendingTurn);
      }

      const vec = DIR_VECTORS[bike.dir];
      bike.x += vec.x * stepDist;
      bike.z += vec.z * stepDist;
      bike.lastTurnDist += stepDist;

      // Update live head vertex of trail
      bike.trail[bike.trail.length - 1] = { x: bike.x, z: bike.z };

      moves.set(bike.playerId, {
        prevX,
        prevZ,
        nextX: bike.x,
        nextZ: bike.z,
        wasJustTurned: bike.justTurned,
      });
      bike.justTurned = false;
    }

    // Evaluate swept collisions against boundaries, trails (including dying trails within the 95ms simultaneous window!), and head-ons
    const allBikesWithTrails = Array.from(room.bikes.values()).filter(
      (b) => b.alive
    );
    const newlyDetectedDeaths: PendingDeath[] = [];

    for (const bike of livingBikes) {
      const mv = moves.get(bike.playerId)!;

      // 1. Outer Energy Boundary
      if (
        Math.abs(mv.nextX) >= ARENA_HALF - 0.5 ||
        Math.abs(mv.nextZ) >= ARENA_HALF - 0.5
      ) {
        bike.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, mv.nextX));
        bike.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, mv.nextZ));
        newlyDetectedDeaths.push({
          playerId: bike.playerId,
          username: bike.username,
          colorHex: bike.color.hex,
          reason: 'boundary',
          killerId: null,
          killerName: null,
          at: now,
          x: bike.x,
          z: bike.z,
        });
        continue;
      }

      // 2. Trail collisions (self and other living players)
      let hitDeath: PendingDeath | null = null;
      for (const other of allBikesWithTrails) {
        const pts = other.trail;
        if (pts.length < 2) continue;
        const isSelf = other.playerId === bike.playerId;
        // Skip the active tail segment connected to our own rear wheel, and skip immediate corner segment on turn tick
        const maxSegIdx = isSelf
          ? mv.wasJustTurned
            ? pts.length - 4
            : pts.length - 3
          : pts.length - 2;

        for (let i = 0; i <= maxSegIdx; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          if (!p1 || !p2) continue;
          if (
            segmentsIntersect(
              mv.prevX,
              mv.prevZ,
              mv.nextX,
              mv.nextZ,
              p1.x,
              p1.z,
              p2.x,
              p2.z,
              0.72
            )
          ) {
            hitDeath = {
              playerId: bike.playerId,
              username: bike.username,
              colorHex: bike.color.hex,
              reason: isSelf ? 'self' : 'trail',
              killerId: isSelf ? null : other.playerId,
              killerName: isSelf ? null : other.username,
              at: now,
              x: mv.nextX,
              z: mv.nextZ,
            };
            break;
          }
        }
        if (hitDeath) break;
      }

      if (hitDeath) {
        newlyDetectedDeaths.push(hitDeath);
        continue;
      }

      // 3. Head-on / direct bike-to-bike chassis collision
      for (const other of livingBikes) {
        if (other.playerId === bike.playerId) continue;
        const otherMv = moves.get(other.playerId)!;
        if (
          segmentsIntersect(
            mv.prevX,
            mv.prevZ,
            mv.nextX,
            mv.nextZ,
            otherMv.prevX,
            otherMv.prevZ,
            otherMv.nextX,
            otherMv.nextZ,
            1.4
          )
        ) {
          newlyDetectedDeaths.push({
            playerId: bike.playerId,
            username: bike.username,
            colorHex: bike.color.hex,
            reason: 'headon',
            killerId: other.playerId,
            killerName: other.username,
            at: now,
            x: mv.nextX,
            z: mv.nextZ,
          });
          break;
        }
      }
    }

    if (newlyDetectedDeaths.length > 0) {
      for (const death of newlyDetectedDeaths) {
        const b = room.bikes.get(death.playerId);
        if (b && !b.dying) {
          b.dying = true;
          room.pendingDeaths.push(death);
        }
      }

      const remainingMoving = Array.from(room.bikes.values()).filter(
        (b) => b.alive && !b.dying
      ).length;

      if (remainingMoving === 0) {
        // Everyone left just collided — resolve immediately!
        if (room.simultaneousTimer) {
          clearTimeout(room.simultaneousTimer);
          room.simultaneousTimer = null;
        }
        this.resolvePendingDeaths(room);
      } else if (!room.simultaneousTimer) {
        // Hold brief simultaneous-collision window so nearly simultaneous trail collisions resolve together
        room.simultaneousTimer = setTimeout(() => {
          room.simultaneousTimer = null;
          this.resolvePendingDeaths(room);
        }, SIMULTANEOUS_WINDOW_MS);
      }
    }

    // Broadcast authoritative tick snapshot
    if (room.phase === 'playing') {
      this.broadcastToRoom(room, {
        type: 'game:tick',
        bikes: Array.from(room.bikes.values()).map((b) => ({
          playerId: b.playerId,
          x: Number(b.x.toFixed(2)),
          z: Number(b.z.toFixed(2)),
          dir: b.dir,
          alive: b.alive,
          trail: b.alive
            ? b.trail.map((p) => ({
                x: Number(p.x.toFixed(2)),
                z: Number(p.z.toFixed(2)),
              }))
            : [],
        })),
        aliveCount: Array.from(room.bikes.values()).filter((b) => b.alive).length,
        serverTime: now,
      });
    }
  }

  private resolvePendingDeaths(room: GameRoom) {
    if (room.phase !== 'playing' || room.pendingDeaths.length === 0) return;

    const batch = [...room.pendingDeaths];
    room.pendingDeaths = [];
    const now = Date.now();
    const totalBikes = room.bikes.size;

    // Assign placements & immediately clear trails and collision state
    for (const death of batch) {
      const bike = room.bikes.get(death.playerId);
      if (!bike || !bike.alive) continue;

      bike.alive = false;
      bike.dying = false;
      bike.trail = []; // Complete trail disappearance!
      bike.eliminatedAt = now;
      bike.killedBy = death.killerName;
      room.eliminationCounter += 1;
      bike.placement = Math.max(1, totalBikes - room.eliminationCounter + 1);

      if (death.reason === 'boundary') {
        bike.eliminationReason = `${bike.username} crashed into the energy boundary`;
      } else if (death.reason === 'self') {
        bike.eliminationReason = `${bike.username} crashed into their own light trail`;
      } else if (death.reason === 'headon') {
        bike.eliminationReason = `Simultaneous collision with ${death.killerName}`;
      } else {
        bike.eliminationReason = `${bike.username} was eliminated by ${death.killerName}`;
      }

      if (death.killerId && death.killerId !== bike.playerId) {
        const killer = room.bikes.get(death.killerId);
        if (killer) killer.kills += 1;
      }

      this.broadcastToRoom(room, {
        type: 'game:eliminated',
        playerId: bike.playerId,
        x: death.x,
        z: death.z,
        colorHex: bike.color.hex,
        reason: bike.eliminationReason,
        isBoundary: death.reason === 'boundary',
      });
    }

    // Announcements
    const nonBoundarySimultaneous = batch.filter(
      (d) => d.reason === 'trail' || d.reason === 'headon' || d.reason === 'self'
    );

    if (batch.length >= 2 && nonBoundarySimultaneous.length >= 2) {
      // Exact required message for simultaneous deaths!
      const pair = batch.slice(0, 2);
      const extraNames = batch.slice(2).map((d) => d.username);
      const allNames = [...pair.map((d) => d.username), ...extraNames];
      const announcement: DeathAnnouncement = {
        id: crypto.randomUUID(),
        type: 'simultaneous',
        headline: 'THEY KISSED THEIR DEATH',
        subline: allNames.join('  ×  '),
        playerNames: allNames,
        colorHexes: batch.map((d) => d.colorHex),
        timestamp: now,
      };
      this.broadcastToRoom(room, { type: 'game:announcement', announcement });
    } else {
      for (const death of batch) {
        let headline = '';
        let type: DeathAnnouncement['type'] = 'single';
        if (death.reason === 'boundary') {
          type = 'boundary';
          headline = `${death.username} crashed into the energy boundary`;
        } else if (death.reason === 'self') {
          headline = `${death.username} crashed into their own light trail`;
        } else {
          headline = `${death.username} was eliminated by ${death.killerName}`;
        }
        this.broadcastToRoom(room, {
          type: 'game:announcement',
          announcement: {
            id: crypto.randomUUID(),
            type,
            headline,
            playerNames: [death.username],
            colorHexes: [death.colorHex],
            timestamp: now,
          },
        });
      }
    }

    this.broadcastRoomState(room);
    this.checkWinCondition(room);
  }

  private checkWinCondition(room: GameRoom) {
    if (room.phase !== 'playing') return;
    const aliveBikes = Array.from(room.bikes.values()).filter((b) => b.alive);
    const isSolo = room.bikes.size === 1;

    if (isSolo) {
      if (aliveBikes.length >= 1) return; // Solo host keeps riding until crash
    } else {
      if (aliveBikes.length > 1) return;
    }

    // Match concluded!
    if (room.tickTimer) {
      clearInterval(room.tickTimer);
      room.tickTimer = null;
    }
    if (room.simultaneousTimer) {
      clearTimeout(room.simultaneousTimer);
      room.simultaneousTimer = null;
    }

    const now = Date.now();
    const isDraw = !isSolo && aliveBikes.length === 0;
    const winner = !isSolo ? (aliveBikes[0] ?? null) : null;

    if (winner) {
      winner.placement = 1;
    }

    const standings: MatchStanding[] = Array.from(room.bikes.values())
      .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
      .map((b, idx) => ({
        playerId: b.playerId,
        username: b.username,
        avatarId: b.avatarId,
        characterId: b.characterId,
        vehicleType: b.vehicleType,
        color: b.color,
        placement: b.placement ?? idx + 1,
        survivedMs: (b.eliminatedAt ?? now) - room.matchStartedAt,
        eliminationReason:
          winner && b.playerId === winner.playerId
            ? 'Last Survivor'
            : b.eliminationReason ?? 'Eliminated',
        isWinner: Boolean(winner && b.playerId === winner.playerId),
      }));

    const results: MatchResultsPayload = {
      isDraw,
      isSolo,
      winnerId: winner?.playerId ?? null,
      winnerUsername: winner?.username ?? null,
      winnerColor: winner?.color ?? null,
      standings,
      totalPlayers: room.bikes.size,
    };

    room.results = results;
    room.phase = winner ? 'victory_stunt' : 'results';

    // Persist stats to SQLite
    recordMatchStats(
      Array.from(room.bikes.values()).map((b) => ({
        playerId: b.playerId,
        isWinner: Boolean(winner && b.playerId === winner.playerId),
        kills: b.kills,
      }))
    );

    this.broadcastToRoom(room, {
      type: 'game:winner',
      winnerId: results.winnerId,
      isDraw,
      results,
    });
    this.broadcastRoomState(room);

    if (winner) {
      // Transition to Results screen after the 4.5s cinematic wheelie stunt
      room.victoryTimer = setTimeout(() => {
        if (!this.rooms.has(room.roomCode)) return;
        room.phase = 'results';
        this.broadcastRoomState(room);
      }, 4600);
    }
  }

  public setRematchVote(playerId: string, vote: boolean) {
    const code = this.playerRooms.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || (room.phase !== 'results' && room.phase !== 'victory_stunt')) return;
    const player = room.players.get(playerId);
    if (!player) return;
    player.rematchVote = vote;
    this.broadcastRoomState(room);
    this.checkRematchCondition(room);
  }

  private checkRematchCondition(room: GameRoom) {
    if (room.phase !== 'results') return;
    const connectedPlayers = Array.from(room.players.values()).filter(
      (p) => p.connected
    );
    if (connectedPlayers.length < MIN_PLAYERS) return;
    const allAgreed = connectedPlayers.every((p) => p.rematchVote);
    if (allAgreed) {
      this.initializeMatch(room);
    }
  }
}
