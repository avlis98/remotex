const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const dgram = require('dgram');

const RELAY_HTTP_PORT = process.env.RELAY_HTTP_PORT || 8081;
const STUN_UDP_PORT = process.env.STUN_UDP_PORT || 3478;

// Tunnels map: sessionId -> { clientWs, hostWs, bytesRelayed, createdAt }
const tunnels = new Map();

// 1. STUN UDP Binding Server (RFC 5389 minimal responder)
const stunServer = dgram.createSocket('udp4');

stunServer.on('message', (msg, rinfo) => {
  if (msg.length >= 20) {
    const msgType = msg.readUInt16BE(0);
    // STUN Binding Request = 0x0001
    if (msgType === 0x0001) {
      // Magic cookie 0x2112A442
      const magicCookie = msg.readUInt32BE(4);
      const transactionId = msg.subarray(8, 20);

      // Build STUN Binding Success Response = 0x0101
      const response = Buffer.alloc(32);
      response.writeUInt16BE(0x0101, 0); // Type: Binding Success
      response.writeUInt16BE(12, 2);     // Message Length: 12 bytes attributes
      response.writeUInt32BE(0x2112A442, 4); // Magic Cookie
      transactionId.copy(response, 8);  // Transaction ID

      // Attribute: XOR-MAPPED-ADDRESS (0x0020)
      response.writeUInt16BE(0x0020, 20); // Type
      response.writeUInt16BE(8, 22);      // Length: 8 bytes
      response.writeUInt8(0, 24);         // Reserved
      response.writeUInt8(1, 25);         // Family: IPv4

      // XOR port with top 16 bits of magic cookie (0x2112)
      const xorPort = rinfo.port ^ 0x2112;
      response.writeUInt16BE(xorPort, 26);

      // XOR IP with magic cookie (0x2112A442)
      const ipParts = rinfo.address.split('.').map(Number);
      const ipBuf = Buffer.from(ipParts);
      const cookieBuf = Buffer.from([0x21, 0x12, 0xA4, 0x42]);
      for (let i = 0; i < 4; i++) {
        response.writeUInt8(ipBuf[i] ^ cookieBuf[i], 28 + i);
      }

      stunServer.send(response, rinfo.port, rinfo.address, (err) => {
        if (!err) {
          // console.log(`[STUN] Resposta enviada para ${rinfo.address}:${rinfo.port}`);
        }
      });
    }
  }
});

stunServer.on('listening', () => {
  const addr = stunServer.address();
  console.log(`[STUN] Servidor STUN próprio ativo em UDP ${addr.address}:${addr.port}`);
});

stunServer.on('error', (err) => {
  console.warn(`[STUN] Porta UDP ${STUN_UDP_PORT} indisponível (usando fallback de STUN público):`, err.message);
});

try {
  stunServer.bind(STUN_UDP_PORT);
} catch (e) {
  console.warn('[STUN] Bind falhou:', e.message);
}

// 2. HTTP Status & Relay API
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/relay/metrics') {
    let totalBytes = 0;
    for (const t of tunnels.values()) {
      totalBytes += t.bytesRelayed || 0;
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'active',
      node: 'RemoteX-Relay-Primary',
      activeTunnels: tunnels.size,
      totalBytesRelayed: totalBytes,
      stunPort: STUN_UDP_PORT,
      uptimeSeconds: Math.floor(process.uptime())
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// 3. WebSocket Data Relay for Symmetric NAT Traversal
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  let boundSessionId = null;
  let boundRole = null;

  ws.on('message', (raw, isBinary) => {
    // If binary data, relay directly to the other end of the tunnel
    if (isBinary) {
      if (boundSessionId) {
        const tunnel = tunnels.get(boundSessionId);
        if (tunnel) {
          tunnel.bytesRelayed += raw.length;
          const targetWs = (boundRole === 'client') ? tunnel.hostWs : tunnel.clientWs;
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(raw, { binary: true });
          }
        }
      }
      return;
    }

    // JSON Control messages
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'join_relay') {
        boundSessionId = msg.sessionId;
        boundRole = msg.role; // 'client' or 'host'

        let tunnel = tunnels.get(boundSessionId);
        if (!tunnel) {
          tunnel = { clientWs: null, hostWs: null, bytesRelayed: 0, createdAt: new Date() };
          tunnels.set(boundSessionId, tunnel);
        }

        if (boundRole === 'client') tunnel.clientWs = ws;
        else tunnel.hostWs = ws;

        ws.send(JSON.stringify({ type: 'relay_joined', sessionId: boundSessionId, role: boundRole }));
        console.log(`[Relay] Dispositivo ingressou no túnel ${boundSessionId} como ${boundRole}`);
      }
    } catch (e) {
      console.error('[Relay] Erro no parsing:', e);
    }
  });

  ws.on('close', () => {
    if (boundSessionId && tunnels.has(boundSessionId)) {
      const tunnel = tunnels.get(boundSessionId);
      const otherWs = (boundRole === 'client') ? tunnel.hostWs : tunnel.clientWs;
      if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(JSON.stringify({ type: 'relay_peer_disconnected' }));
      }
      tunnels.delete(boundSessionId);
      console.log(`[Relay] Túnel ${boundSessionId} encerrado.`);
    }
  });
});

httpServer.listen(RELAY_HTTP_PORT, () => {
  console.log(`=======================================================`);
  console.log(`  RemoteX Dedicated Relay & Media Server Ativo!`);
  console.log(`  Relay WebSocket/HTTP: http://localhost:${RELAY_HTTP_PORT}`);
  console.log(`  Métricas de Infraestrutura: http://localhost:${RELAY_HTTP_PORT}/api/relay/metrics`);
  console.log(`=======================================================`);
});

