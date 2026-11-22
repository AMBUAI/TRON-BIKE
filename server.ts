import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientWsMessage, PlayerAccount } from './shared/types.ts';
import {
  authenticatePlayer,
  createFriendRequest,
  createRoomInvite,
  getPublicPlayer,
  getSocialOverview,
  initOrRestoreAccount,
  recoverAccountByCredentials,
  removeFriend,
  respondToFriendRequest,
  respondToRoomInvite,
  updateProfile,
} from './server/db.ts';
import { MultiplayerManager } from './server/gameEngine.ts';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });
  const manager = new MultiplayerManager();

  const getAuthAccount = (req: express.Request): PlayerAccount | null => {
    const pid = String(req.header('x-player-id') || '');
    const sec = String(req.header('x-recovery-secret') || '');
    return authenticatePlayer(pid, sec);
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  // Account initialization / session restore
  app.post('/api/account/init', (req, res) => {
    try {
      const { playerId, recoverySecret } = req.body ?? {};
      const account = initOrRestoreAccount(playerId, recoverySecret);
      res.json({ account });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Account initialization failed',
      });
    }
  });

  // Account recovery via Player ID + Recovery Key
  app.post('/api/account/recover', (req, res) => {
    try {
      const { playerId, recoverySecret } = req.body ?? {};
      if (!playerId || !recoverySecret) {
        res.status(400).json({ error: 'Player ID and Recovery Key are required' });
        return;
      }
      const account = recoverAccountByCredentials(playerId, recoverySecret);
      if (!account) {
        res.status(404).json({ error: 'Invalid Player ID or Recovery Key' });
        return;
      }
      res.json({ account });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Recovery failed',
      });
    }
  });

  app.get('/api/account/me', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ account });
  });

  app.patch('/api/account/profile', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { username, avatarId, characterId, preferredColorId, vehicleType } =
        req.body ?? {};
      const updated = updateProfile(
        account.id,
        typeof username === 'string' ? username : account.username,
        typeof avatarId === 'number' ? avatarId : account.avatarId,
        characterId ?? account.characterId,
        preferredColorId ?? account.preferredColorId,
        vehicleType ?? account.vehicleType
      );
      manager.syncPlayerProfileInLobby(updated);
      res.json({ account: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Profile update failed',
      });
    }
  });

  // Friends & Invitations
  app.get('/api/friends', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const overview = getSocialOverview(
      account.id,
      (id) => manager.getPresence(id),
      (code) => manager.getActiveRoomInfo(code)
    );
    res.json(overview);
  });

  app.post('/api/friends/search', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const queryId = String(req.body?.playerId || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{12}$/.test(queryId)) {
      res.status(400).json({ error: 'Enter an exact 12-character alphanumeric Player ID' });
      return;
    }
    const player = getPublicPlayer(queryId, (id) => manager.getPresence(id));
    if (!player) {
      res.status(404).json({ error: 'No player found with that Player ID' });
      return;
    }
    res.json({ player });
  });

  app.post('/api/friends/request', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const targetId = String(req.body?.targetPlayerId || '');
      const request = createFriendRequest(account.id, targetId, (id) =>
        manager.getPresence(id)
      );
      manager.sendToPlayer(request.toPlayer.id, {
        type: 'social:friend_request',
        request,
      });
      res.json({ request });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to send friend request',
      });
    }
  });

  app.post('/api/friends/respond', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { requestId, accept } = req.body ?? {};
      const result = respondToFriendRequest(
        account.id,
        String(requestId || ''),
        Boolean(accept),
        (id) => manager.getPresence(id)
      );
      if (result.accepted && result.toProfile) {
        manager.sendToPlayer(result.fromPlayerId, {
          type: 'social:friend_accepted',
          friend: result.toProfile,
        });
      }
      res.json({ ok: true, accepted: result.accepted });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to respond to request',
      });
    }
  });

  app.delete('/api/friends/:friendId', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const friendId = String(req.params.friendId || '').toUpperCase();
    removeFriend(account.id, friendId);
    manager.sendToPlayer(friendId, {
      type: 'social:friend_removed',
      friendId: account.id,
    });
    res.json({ ok: true });
  });

  app.post('/api/rooms/invite', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { roomCode, targetPlayerId } = req.body ?? {};
      const cleanCode = String(roomCode || '').trim().toUpperCase();
      const targetId = String(targetPlayerId || '').trim().toUpperCase();
      const room = manager.getRoomForInviteValidation(cleanCode, account.id);
      const { id, createdAt } = createRoomInvite(cleanCode, account.id, targetId);

      const invitePayload = {
        id,
        roomCode: cleanCode,
        hostId: account.id,
        hostUsername: account.username,
        hostAvatarId: account.avatarId,
        playerCount: room.players.size,
        createdAt,
      };
      manager.sendToPlayer(targetId, {
        type: 'social:room_invite',
        invite: invitePayload,
      });
      res.json({ invite: invitePayload });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to invite friend',
      });
    }
  });

  app.post('/api/rooms/invite/respond', (req, res) => {
    const account = getAuthAccount(req);
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { inviteId, accept } = req.body ?? {};
      const resData = respondToRoomInvite(
        account.id,
        String(inviteId || ''),
        Boolean(accept)
      );
      if (resData.accepted) {
        manager.canJoinRoom(resData.roomCode, account.id);
      }
      res.json(resData);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to handle invitation',
      });
    }
  });

  // WebSocket Multiplayer Handling
  wss.on('connection', (ws: WebSocket) => {
    let authedAccount: PlayerAccount | null = null;

    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: msg.ts, serverTime: Date.now() }));
        return;
      }

      if (msg.type === 'auth') {
        const account = authenticatePlayer(msg.playerId, msg.recoverySecret);
        if (!account) {
          ws.send(
            JSON.stringify({
              type: 'error',
              code: 'AUTH_FAILED',
              message: 'Invalid player credentials',
            })
          );
          return;
        }
        authedAccount = account;
        manager.registerSocket(account.id, ws);
        const activeRoomCode = manager.getPlayerActiveRoomCode(account.id);
        ws.send(
          JSON.stringify({
            type: 'auth:ok',
            playerId: account.id,
            activeRoomCode,
          })
        );
        return;
      }

      if (!authedAccount) {
        ws.send(
          JSON.stringify({
            type: 'error',
            code: 'UNAUTHENTICATED',
            message: 'Authenticate first',
          })
        );
        return;
      }

      // Refresh account username/avatar from DB on room actions
      const freshAccount =
        authenticatePlayer(authedAccount.id, authedAccount.recoverySecret) ??
        authedAccount;
      authedAccount = freshAccount;

      try {
        switch (msg.type) {
          case 'room:host': {
            manager.hostRoom(freshAccount);
            break;
          }
          case 'room:join': {
            manager.joinRoom(freshAccount, msg.roomCode);
            break;
          }
          case 'room:leave': {
            manager.leaveRoom(freshAccount.id);
            break;
          }
          case 'room:ready': {
            manager.setReady(freshAccount.id, msg.ready);
            break;
          }
          case 'room:start': {
            manager.startMatch(freshAccount.id);
            break;
          }
          case 'room:rematch_vote': {
            manager.setRematchVote(freshAccount.id, msg.vote);
            break;
          }
          case 'game:turn': {
            manager.handleTurn(freshAccount.id, msg.turn, msg.seq);
            break;
          }
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Action failed',
          })
        );
      }
    });

    ws.on('close', () => {
      if (authedAccount) {
        manager.handleDisconnect(authedAccount.id, ws);
      }
    });
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: { server, path: '/vite-ws' },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TRON BIKE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
