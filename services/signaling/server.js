const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;

// In-memory state
// devices: Map<deviceId, { ws, password, hostname, os, connectedAt, activeSessionWith }>
const devices = new Map();
// sessions: Map<sessionId, { hostId, clientId, startedAt }>
const sessions = new Map();

const PUBLIC_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'RemoteX Signaling Server',
      version: '1.0.0',
      uptime: process.uptime(),
      activeDevices: devices.size,
      activeSessions: sessions.size,
      iceServers: PUBLIC_ICE_SERVERS,
      relayServers: [
        { url: 'ws://localhost:8081', type: 'remotex-relay' }
      ]
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const wss = new WebSocketServer({ server });

function generateDeviceId() {
  // Generates 9-digit format: XXX XXX XXX (from 100 000 000 to 999 999 999)
  let id;
  do {
    const num = Math.floor(100000000 + Math.random() * 900000000);
    id = `${String(num).slice(0, 3)} ${String(num).slice(3, 6)} ${String(num).slice(6, 9)}`;
  } while (devices.has(id));
  return id;
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws, req) => {
  let boundDeviceId = null;
  const clientIp = req.socket.remoteAddress;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type } = data;

      switch (type) {
        // Register or reconnect host device
        case 'register_host': {
          let reqId = data.deviceId ? String(data.deviceId).trim() : null;
          if (!reqId || reqId.length < 9) {
            reqId = generateDeviceId();
          }

          boundDeviceId = reqId;
          devices.set(boundDeviceId, {
            ws,
            password: data.password || '123456',
            unattendedPassword: data.unattendedPassword || null,
            hostname: data.hostname || 'Host PC',
            os: data.os || 'Windows 11',
            ip: clientIp,
            connectedAt: new Date(),
            activeSessionWith: null
          });

          send(ws, {
            type: 'host_registered',
            deviceId: boundDeviceId,
            assignedPassword: data.password,
            iceServers: PUBLIC_ICE_SERVERS
          });
          console.log(`[Signaling] Host registrado: ${boundDeviceId} (${clientIp})`);
          break;
        }

        // Client initiates connection to target host
        case 'connect_request': {
          const targetId = String(data.targetDeviceId || '').trim();
          const providedPassword = String(data.password || '').trim();

          const targetHost = devices.get(targetId);
          if (!targetHost || targetHost.ws.readyState !== WebSocket.OPEN) {
            send(ws, {
              type: 'connect_error',
              code: 'HOST_OFFLINE',
              message: 'O computador remoto está offline ou o ID é inválido.'
            });
            return;
          }

          const isTempPasswordValid = targetHost.password && targetHost.password === providedPassword;
          const isUnattendedValid = targetHost.unattendedPassword && targetHost.unattendedPassword === providedPassword;

          if (!isTempPasswordValid && !isUnattendedValid) {
            send(ws, {
              type: 'connect_error',
              code: 'INVALID_PASSWORD',
              message: 'A senha informada para este computador remoto está incorreta.'
            });
            return;
          }

          const sessionId = crypto.randomUUID();
          sessions.set(sessionId, {
            sessionId,
            hostId: targetId,
            clientId: boundDeviceId || 'client-' + sessionId.slice(0, 8),
            clientWs: ws,
            hostWs: targetHost.ws,
            startedAt: new Date()
          });

          // Notify host that an incoming session is requesting SDP offer
          send(targetHost.ws, {
            type: 'incoming_connection',
            sessionId,
            fromClient: data.clientInfo || { hostname: 'Remote Controller' }
          });

          send(ws, {
            type: 'connect_accepted',
            sessionId,
            targetDeviceId: targetId,
            iceServers: PUBLIC_ICE_SERVERS
          });
          console.log(`[Signaling] Sessão autorizada: ${sessionId} (Target: ${targetId})`);
          break;
        }

        // SDP Offer forwarding
        case 'sdp_offer': {
          const { sessionId, sdp, targetDeviceId } = data;
          const target = devices.get(targetDeviceId);
          if (target) {
            send(target.ws, {
              type: 'sdp_offer',
              sessionId,
              sdp,
              fromDeviceId: boundDeviceId
            });
          }
          break;
        }

        // SDP Answer forwarding
        case 'sdp_answer': {
          const { sessionId, sdp, targetDeviceId } = data;
          const sess = sessions.get(sessionId);
          if (sess && sess.clientWs) {
            send(sess.clientWs, {
              type: 'sdp_answer',
              sessionId,
              sdp,
              fromDeviceId: boundDeviceId
            });
          }
          break;
        }

        // ICE Candidate forwarding
        case 'ice_candidate': {
          const { sessionId, candidate, targetDeviceId } = data;
          const sess = sessions.get(sessionId);
          if (sess) {
            const recipient = (ws === sess.clientWs) ? sess.hostWs : sess.clientWs;
            send(recipient, {
              type: 'ice_candidate',
              sessionId,
              candidate
            });
          }
          break;
        }

        // End session
        case 'end_session': {
          const { sessionId } = data;
          const sess = sessions.get(sessionId);
          if (sess) {
            send(sess.clientWs, { type: 'session_ended', sessionId, reason: data.reason || 'Sessão encerrada pelo usuário.' });
            send(sess.hostWs, { type: 'session_ended', sessionId, reason: data.reason || 'Sessão encerrada pelo usuário.' });
            sessions.delete(sessionId);
            console.log(`[Signaling] Sessão finalizada: ${sessionId}`);
          }
          break;
        }

        // Ping / Heartbeat
        case 'ping': {
          send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        }

        default:
          console.warn(`[Signaling] Tipo de mensagem desconhecido: ${type}`);
          break;
      }
    } catch (err) {
      console.error('[Signaling] Erro ao processar mensagem WebSocket:', err);
    }
  });

  ws.on('close', () => {
    if (boundDeviceId) {
      devices.delete(boundDeviceId);
      console.log(`[Signaling] Dispositivo desconectado: ${boundDeviceId}`);
    }
    // Clean up associated sessions
    for (const [sId, sess] of sessions.entries()) {
      if (sess.clientWs === ws || sess.hostWs === ws) {
        const otherWs = (sess.clientWs === ws) ? sess.hostWs : sess.clientWs;
        send(otherWs, { type: 'session_ended', sessionId: sId, reason: 'A outra ponta desconectou.' });
        sessions.delete(sId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  RemoteX Central Signaling Server rodando na porta ${PORT}`);
  console.log(`  HTTP status: http://localhost:${PORT}/api/status`);
  console.log(`  WebSocket URL: ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});

