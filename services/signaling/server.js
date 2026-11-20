const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');
const tls = require('tls');
const os = require('os');

const PORT = process.env.PORT || 8080;
const NODE_ID = crypto.randomUUID();
const GLOBAL_SECRET = 'RemoteX-Global-Mesh-Key-2026-v1';

// In-memory state
// devices: Map<deviceId, { ws, password, unattendedPassword, hostname, os, connectedAt }>
const devices = new Map();
// sessions: Map<sessionId, { sessionId, hostId, clientId, clientWs, hostWs, remoteNodeId, role, startedAt }>
const sessions = new Map();

const PUBLIC_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

function normalizeId(id) {
  return String(id || '').replace(/\D/g, '');
}

function formatDeviceId(id) {
  const clean = normalizeId(id);
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)}`;
  }
  return String(id || '').trim();
}

// ============================================================================
// Zero-Config Global Mesh Signaling Bridge (MQTT v3.1.1 over TLS 8883)
// Encrypts all payloads with AES-256-GCM so public brokers only see ciphertext
// ============================================================================
const GLOBAL_BROKERS = [
  { host: 'broker.emqx.io', port: 8883 },
  { host: 'broker.hivemq.com', port: 8883 },
  { host: 'test.mosquitto.org', port: 8883 }
];

function encryptPayload(obj) {
  const key = crypto.createHash('sha256').update(GLOBAL_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptPayload(b64) {
  try {
    const raw = Buffer.from(b64, 'base64');
    if (raw.length < 28) return null;
    const key = crypto.createHash('sha256').update(GLOBAL_SECRET).digest();
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch (e) {
    return null;
  }
}

function encodeMqttLength(len) {
  const bytes = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    bytes.push(digit);
  } while (len > 0);
  return Buffer.from(bytes);
}

function encodeMqttString(str) {
  const buf = Buffer.from(str, 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

class GlobalMeshClient {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.brokerIndex = 0;
    this.socket = null;
    this.connected = false;
    this.activeBroker = null;
    this.packetId = 1;
    this.pingTimer = null;
    this.subscriptions = new Set([`remotex/v1/node/${NODE_ID}`]);
    this.rxBuffer = Buffer.alloc(0);
    this.connect();
  }

  connect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch (e) {}
      this.socket = null;
    }
    this.connected = false;
    const broker = GLOBAL_BROKERS[this.brokerIndex % GLOBAL_BROKERS.length];

    const sock = tls.connect({
      host: broker.host,
      port: broker.port,
      servername: broker.host,
      rejectUnauthorized: false
    }, () => {
      // Send MQTT CONNECT packet (v3.1.1)
      const clientId = `rx-${NODE_ID.slice(0, 12)}`;
      const varHeader = Buffer.from([
        0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
        0x04, // Protocol level 4 (3.1.1)
        0x02, // Clean session
        0x00, 0x3c // Keepalive 60s
      ]);
      const payload = encodeMqttString(clientId);
      const body = Buffer.concat([varHeader, payload]);
      const pkt = Buffer.concat([Buffer.from([0x10]), encodeMqttLength(body.length), body]);
      sock.write(pkt);
    });

    this.socket = sock;

    sock.on('data', (chunk) => {
      this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
      this.parsePackets();
    });

    sock.on('error', () => {});

    sock.on('close', () => {
      this.connected = false;
      this.activeBroker = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.brokerIndex = (this.brokerIndex + 1) % GLOBAL_BROKERS.length;
      setTimeout(() => this.connect(), 2000);
    });
  }

  parsePackets() {
    while (this.rxBuffer.length >= 2) {
      const type = this.rxBuffer[0];
      let multiplier = 1;
      let remLen = 0;
      let offset = 1;
      let byte;
      do {
        if (offset >= this.rxBuffer.length) return; // wait for more bytes
        byte = this.rxBuffer[offset++];
        remLen += (byte & 0x7f) * multiplier;
        multiplier *= 128;
      } while ((byte & 0x80) !== 0);

      if (this.rxBuffer.length < offset + remLen) return; // wait for full packet
      const body = this.rxBuffer.subarray(offset, offset + remLen);
      this.rxBuffer = this.rxBuffer.subarray(offset + remLen);

      const pktType = type >> 4;
      if (pktType === 2) {
        // CONNACK
        this.connected = true;
        const broker = GLOBAL_BROKERS[this.brokerIndex % GLOBAL_BROKERS.length];
        this.activeBroker = `${broker.host}:${broker.port}`;
        console.log(`[GlobalMesh] Conectado ao barramento global (${this.activeBroker})`);
        for (const topic of this.subscriptions) {
          this.sendSubscribe(topic);
        }
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.connected && this.socket) {
            try { this.socket.write(Buffer.from([0xc0, 0x00])); } catch (e) {}
          }
        }, 25000);
      } else if (pktType === 3) {
        // PUBLISH
        const topicLen = body.readUInt16BE(0);
        const topic = body.subarray(2, 2 + topicLen).toString('utf8');
        let payloadOffset = 2 + topicLen;
        const qos = (type & 0x06) >> 1;
        if (qos > 0) payloadOffset += 2;
        const rawPayload = body.subarray(payloadOffset).toString('utf8');
        const msg = decryptPayload(rawPayload);
        if (msg && msg.senderNodeId !== NODE_ID) {
          this.onMessage(topic, msg);
        }
      }
    }
  }

  sendSubscribe(topic) {
    if (!this.connected || !this.socket) return;
    const pid = Buffer.alloc(2);
    pid.writeUInt16BE((this.packetId++ % 65535) || 1, 0);
    const topicBuf = encodeMqttString(topic);
    const qos = Buffer.from([0x00]);
    const body = Buffer.concat([pid, topicBuf, qos]);
    const pkt = Buffer.concat([Buffer.from([0x82]), encodeMqttLength(body.length), body]);
    try { this.socket.write(pkt); } catch (e) {}
  }

  subscribe(topic) {
    this.subscriptions.add(topic);
    this.sendSubscribe(topic);
  }

  publish(topic, dataObj) {
    if (!this.connected || !this.socket) return false;
    const encrypted = encryptPayload({ ...dataObj, senderNodeId: NODE_ID });
    const topicBuf = encodeMqttString(topic);
    const payloadBuf = Buffer.from(encrypted, 'utf8');
    const body = Buffer.concat([topicBuf, payloadBuf]);
    const pkt = Buffer.concat([Buffer.from([0x30]), encodeMqttLength(body.length), body]);
    try {
      this.socket.write(pkt);
      return true;
    } catch (e) {
      return false;
    }
  }
}

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

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
    const lanIp = getLanIp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'RemoteX Signaling Server',
      version: '1.0.0',
      uptime: process.uptime(),
      activeDevices: devices.size,
      activeSessions: sessions.size,
      globalMeshConnected: globalMesh.connected,
      globalMeshBroker: globalMesh.activeBroker,
      localSignalingUrl: `ws://localhost:${PORT}`,
      lanSignalingUrl: `ws://${lanIp}:${PORT}`,
      cloudSignalingUrl: globalMesh.connected ? `global-mesh://${globalMesh.activeBroker}` : null,
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

// Handle incoming encrypted messages from the Global Mesh (other PCs anywhere in the world)
function handleGlobalMeshMessage(topic, msg) {
  try {
    switch (msg.meshType) {
      case 'mesh_connect_request': {
        const targetId = formatDeviceId(msg.targetDeviceId);
        const targetHost = devices.get(targetId);
        if (!targetHost || targetHost.ws.readyState !== WebSocket.OPEN) {
          globalMesh.publish(`remotex/v1/node/${msg.clientNodeId}`, {
            meshType: 'mesh_connect_error',
            sessionId: msg.sessionId,
            code: 'HOST_OFFLINE',
            message: 'O computador remoto está offline ou o ID é inválido.'
          });
          return;
        }

        const providedPassword = String(msg.password || '').trim();
        const isTempPasswordValid = targetHost.password && targetHost.password === providedPassword;
        const isUnattendedValid = targetHost.unattendedPassword && targetHost.unattendedPassword === providedPassword;

        if (!isTempPasswordValid && !isUnattendedValid) {
          globalMesh.publish(`remotex/v1/node/${msg.clientNodeId}`, {
            meshType: 'mesh_connect_error',
            sessionId: msg.sessionId,
            code: 'INVALID_PASSWORD',
            message: 'A senha informada para este computador remoto está incorreta.'
          });
          return;
        }

        sessions.set(msg.sessionId, {
          sessionId: msg.sessionId,
          hostId: targetId,
          clientId: msg.clientId || 'remote-client',
          clientWs: null,
          hostWs: targetHost.ws,
          remoteNodeId: msg.clientNodeId,
          role: 'host',
          startedAt: new Date()
        });

        send(targetHost.ws, {
          type: 'incoming_connection',
          sessionId: msg.sessionId,
          fromClient: msg.clientInfo || { hostname: 'RemoteX Controller' }
        });

        globalMesh.publish(`remotex/v1/node/${msg.clientNodeId}`, {
          meshType: 'mesh_connect_accepted',
          sessionId: msg.sessionId,
          targetDeviceId: targetId,
          hostNodeId: NODE_ID,
          iceServers: PUBLIC_ICE_SERVERS
        });
        console.log(`[GlobalMesh] Sessão remota autorizada no Host: ${msg.sessionId} (Target: ${targetId})`);
        break;
      }

      case 'mesh_connect_accepted': {
        const sess = sessions.get(msg.sessionId);
        if (!sess || !sess.clientWs) return;
        if (sess.pendingTimeout) {
          clearTimeout(sess.pendingTimeout);
          sess.pendingTimeout = null;
        }
        sess.remoteNodeId = msg.hostNodeId;
        send(sess.clientWs, {
          type: 'connect_accepted',
          sessionId: msg.sessionId,
          targetDeviceId: msg.targetDeviceId,
          iceServers: msg.iceServers || PUBLIC_ICE_SERVERS
        });
        console.log(`[GlobalMesh] Conexão aceita pelo Host remoto: ${msg.targetDeviceId}`);
        break;
      }

      case 'mesh_connect_error': {
        const sess = sessions.get(msg.sessionId);
        if (!sess || !sess.clientWs) return;
        if (sess.pendingTimeout) clearTimeout(sess.pendingTimeout);
        sessions.delete(msg.sessionId);
        send(sess.clientWs, {
          type: 'connect_error',
          code: msg.code || 'HOST_OFFLINE',
          message: msg.message || 'Erro ao conectar ao computador remoto.'
        });
        break;
      }

      case 'mesh_signal': {
        const sess = sessions.get(msg.sessionId);
        if (!sess) return;
        const localWs = sess.hostWs || sess.clientWs;
        if (localWs) {
          send(localWs, msg.payload);
        }
        if (msg.payload && msg.payload.type === 'session_ended') {
          sessions.delete(msg.sessionId);
        }
        break;
      }
    }
  } catch (e) {
    console.error('[GlobalMesh] Erro ao processar mensagem global:', e);
  }
}

const globalMesh = new GlobalMeshClient(handleGlobalMeshMessage);

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
          let reqId = data.deviceId ? formatDeviceId(data.deviceId) : null;
          if (!reqId || normalizeId(reqId).length !== 9) {
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

          // Subscribe to global mesh topic for this 9-digit Host ID
          globalMesh.subscribe(`remotex/v1/host/${normalizeId(boundDeviceId)}`);

          send(ws, {
            type: 'host_registered',
            deviceId: boundDeviceId,
            assignedPassword: data.password,
            iceServers: PUBLIC_ICE_SERVERS
          });
          console.log(`[Signaling] Host registrado (Local + Global Mesh): ${boundDeviceId} (${clientIp})`);
          break;
        }

        // Client initiates connection to target host (Local OR Any Remote PC via Global Mesh)
        case 'connect_request': {
          const targetId = formatDeviceId(data.targetDeviceId || '');
          const providedPassword = String(data.password || '').trim();

          const targetHost = devices.get(targetId);
          // 1. If target host is on this same signaling server, connect directly
          if (targetHost && targetHost.ws.readyState === WebSocket.OPEN) {
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
              remoteNodeId: null,
              role: 'local',
              startedAt: new Date()
            });

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
            console.log(`[Signaling] Sessão local autorizada: ${sessionId} (Target: ${targetId})`);
            return;
          }

          // 2. Otherwise, discover and connect across the Global Mesh automatically!
          if (!globalMesh.connected) {
            send(ws, {
              type: 'connect_error',
              code: 'HOST_OFFLINE',
              message: 'O computador remoto está offline ou sem conexão com a rede global.'
            });
            return;
          }

          const sessionId = crypto.randomUUID();
          const pendingTimeout = setTimeout(() => {
            if (sessions.has(sessionId)) {
              sessions.delete(sessionId);
              send(ws, {
                type: 'connect_error',
                code: 'HOST_OFFLINE',
                message: 'O computador remoto está offline ou o ID é inválido.'
              });
            }
          }, 6000);

          sessions.set(sessionId, {
            sessionId,
            hostId: targetId,
            clientId: boundDeviceId || 'client-' + sessionId.slice(0, 8),
            clientWs: ws,
            hostWs: null,
            remoteNodeId: null,
            role: 'client',
            pendingTimeout,
            startedAt: new Date()
          });

          globalMesh.publish(`remotex/v1/host/${normalizeId(targetId)}`, {
            meshType: 'mesh_connect_request',
            sessionId,
            targetDeviceId: targetId,
            password: providedPassword,
            clientId: boundDeviceId || 'client-' + sessionId.slice(0, 8),
            clientNodeId: NODE_ID,
            clientInfo: data.clientInfo || { hostname: 'RemoteX Controller' }
          });
          console.log(`[GlobalMesh] Buscando computador remoto ${targetId} na rede global...`);
          break;
        }

        // SDP Offer forwarding
        case 'sdp_offer': {
          const { sessionId, sdp, targetDeviceId } = data;
          const sess = sessions.get(sessionId);
          const payload = {
            type: 'sdp_offer',
            sessionId,
            sdp,
            fromDeviceId: boundDeviceId
          };
          if (sess && sess.hostWs) {
            send(sess.hostWs, payload);
          } else if (sess && sess.remoteNodeId) {
            globalMesh.publish(`remotex/v1/node/${sess.remoteNodeId}`, {
              meshType: 'mesh_signal',
              sessionId,
              payload
            });
          } else {
            const target = devices.get(formatDeviceId(targetDeviceId));
            if (target) send(target.ws, payload);
          }
          break;
        }

        // SDP Answer forwarding
        case 'sdp_answer': {
          const { sessionId, sdp } = data;
          const sess = sessions.get(sessionId);
          const payload = {
            type: 'sdp_answer',
            sessionId,
            sdp,
            fromDeviceId: boundDeviceId
          };
          if (sess && sess.clientWs) {
            send(sess.clientWs, payload);
          } else if (sess && sess.remoteNodeId) {
            globalMesh.publish(`remotex/v1/node/${sess.remoteNodeId}`, {
              meshType: 'mesh_signal',
              sessionId,
              payload
            });
          }
          break;
        }

        // ICE Candidate forwarding
        case 'ice_candidate': {
          const { sessionId, candidate } = data;
          const sess = sessions.get(sessionId);
          if (!sess) break;
          const payload = {
            type: 'ice_candidate',
            sessionId,
            candidate
          };
          if (sess.clientWs && sess.hostWs) {
            const recipient = (ws === sess.clientWs) ? sess.hostWs : sess.clientWs;
            send(recipient, payload);
          } else if (sess.remoteNodeId) {
            globalMesh.publish(`remotex/v1/node/${sess.remoteNodeId}`, {
              meshType: 'mesh_signal',
              sessionId,
              payload
            });
          }
          break;
        }

        // End session
        case 'end_session': {
          const { sessionId } = data;
          const sess = sessions.get(sessionId);
          if (sess) {
            const payload = {
              type: 'session_ended',
              sessionId,
              reason: data.reason || 'Sessão encerrada pelo usuário.'
            };
            if (sess.clientWs) send(sess.clientWs, payload);
            if (sess.hostWs) send(sess.hostWs, payload);
            if (sess.remoteNodeId) {
              globalMesh.publish(`remotex/v1/node/${sess.remoteNodeId}`, {
                meshType: 'mesh_signal',
                sessionId,
                payload
              });
            }
            if (sess.pendingTimeout) clearTimeout(sess.pendingTimeout);
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
        const payload = { type: 'session_ended', sessionId: sId, reason: 'A outra ponta desconectou.' };
        const otherWs = (sess.clientWs === ws) ? sess.hostWs : sess.clientWs;
        if (otherWs) send(otherWs, payload);
        if (sess.remoteNodeId) {
          globalMesh.publish(`remotex/v1/node/${sess.remoteNodeId}`, {
            meshType: 'mesh_signal',
            sessionId: sId,
            payload
          });
        }
        if (sess.pendingTimeout) clearTimeout(sess.pendingTimeout);
        sessions.delete(sId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  RemoteX Central Signaling & Global Mesh Server (${PORT})`);
  console.log(`  HTTP status: http://localhost:${PORT}/api/status`);
  console.log(`  WebSocket URL: ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});

