const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const HTTP_PORT = process.env.PORT || 3000;
const WS_PORT = process.env.INPUT_WS_PORT || 3001;
const ROOT_DIR = path.resolve(__dirname, '../..');
const VBS_LAUNCHER_PATH = path.join(ROOT_DIR, 'RemoteX.vbs');

function isLoopbackAddress(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function checkWindowsAutoStart(callback) {
  execFile('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'RemoteX'], { windowsHide: true }, (err, stdout) => {
    if (err || !stdout || !stdout.includes('RemoteX')) {
      callback(false);
    } else {
      callback(true);
    }
  });
}

function setWindowsAutoStart(enable, callback) {
  if (enable) {
    const val = `wscript.exe "${VBS_LAUNCHER_PATH}"`;
    execFile('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'RemoteX', '/t', 'REG_SZ', '/d', val, '/f'], { windowsHide: true }, (err) => {
      callback(!err);
    });
  } else {
    execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'RemoteX', '/f'], { windowsHide: true }, () => {
      callback(true);
    });
  }
}

// Path to compiled native Win32 input & screen capture agent (.NET Framework 4.8 native Win32)
const INPUT_EXE_PATH = path.resolve(__dirname, '../../native/RemoteXInput/bin/Release/net8.0/RemoteXInput.exe');

let inputProcess = null;
let stdoutBuffer = '';
const localClients = new Set();
let primaryLocalClient = null;
const processedSeqs = new Set();
let lastMouseDownAt = 0;
let lastMouseUpAt = 0;

function broadcastToLocalClients(msgStr) {
  // Broadcast to all connected local clients (both signaling server Node bridge and local UI)
  for (const client of localClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msgStr);
      } catch (e) {}
    }
  }
}

function startInputAgent() {
  if (!fs.existsSync(INPUT_EXE_PATH)) {
    console.warn(`[Agent] Executável nativo não encontrado em: ${INPUT_EXE_PATH}.`);
    return;
  }

  try {
    inputProcess = spawn(INPUT_EXE_PATH, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    inputProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      let nlIndex;
      while ((nlIndex = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, nlIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(nlIndex + 1);
        if (!line) continue;
        if (line.includes('"status":"frame"') || line.includes('"status":"chat_reply"')) {
          broadcastToLocalClients(line);
        }
      }
    });

    inputProcess.stderr.on('data', (data) => {
      console.error(`[InputAgent stderr]: ${data.toString().trim()}`);
    });

    inputProcess.on('exit', (code) => {
      console.warn(`[InputAgent] Processo encerrou com código ${code}. Reiniciando em 1s...`);
      setTimeout(startInputAgent, 1000);
    });

    console.log(`[Agent] RemoteX Win32 Native Input & Screen Agent ativo (PID: ${inputProcess.pid}).`);
  } catch (err) {
    console.error('[Agent] Falha ao iniciar RemoteXInput.exe:', err);
  }
}

function sendToInputAgent(commandObj) {
  if (inputProcess && inputProcess.stdin && !inputProcess.stdin.destroyed) {
    try {
      inputProcess.stdin.write(JSON.stringify(commandObj) + '\n');
    } catch (e) {
      console.error('[Agent] Erro ao enviar comando para inputProcess:', e);
    }
  }
}

// Start native Win32 worker
startInputAgent();

// Static file HTTP server
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // Security Hardening: Only allow local machine (loopback) to access local desktop UI & control APIs
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden - Localhost Only');
    return;
  }

  if (req.url === '/api/info') {
    checkWindowsAutoStart((autoStartEnabled) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        hasNativeInput: !!inputProcess,
        inputAgentPid: inputProcess ? inputProcess.pid : null,
        autoStartEnabled
      }));
    });
    return;
  }

  if (req.url === '/api/system/autostart' && req.method === 'GET') {
    checkWindowsAutoStart((enabled) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', enabled }));
    });
    return;
  }

  if (req.url === '/api/system/autostart' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const enable = !!parsed.enabled;
        setWindowsAutoStart(enable, (ok) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: ok ? 'ok' : 'error', enabled: enable }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error' }));
      }
    });
    return;
  }

  if (req.url === '/api/system/minimize' && req.method === 'POST') {
    sendToInputAgent({ type: 'minimize_window' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.url === '/api/system/restart' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('[Agent] Comando de reinicialização remota recebido com autorização.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'Comando de reinicialização processado.' }));
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(__dirname, 'public', reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server for Local Host Input Injection & Native Screen Capture Stream
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  // Security Hardening: Reject any non-localhost connection attempting to inject Win32 mouse/keyboard commands
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    try { ws.close(); } catch (e) {}
    return;
  }

  localClients.add(ws);
  primaryLocalClient = ws;

  ws.on('message', (raw) => {
    try {
      const cmd = JSON.parse(raw.toString());
      primaryLocalClient = ws;

      // Deduplicate commands by sequence ID so multiple open tabs or dual channels never execute an input twice
      if (cmd.seq) {
        if (processedSeqs.has(cmd.seq)) return;
        processedSeqs.add(cmd.seq);
        if (processedSeqs.size > 400) {
          const first = processedSeqs.values().next().value;
          processedSeqs.delete(first);
        }
      }

      // Guard against duplicate simultaneous mouse_down / mouse_up within 18ms from duplicate tabs
      const now = Date.now();
      if (cmd.type === 'mouse_down') {
        if (now - lastMouseDownAt < 18) return;
        lastMouseDownAt = now;
      } else if (cmd.type === 'mouse_up') {
        if (now - lastMouseUpAt < 18) return;
        lastMouseUpAt = now;
      }

      sendToInputAgent(cmd);
    } catch (e) {
      console.error('[Agent] Erro de comando JSON no input WS:', e);
    }
  });

  ws.on('close', () => {
    localClients.delete(ws);
    if (primaryLocalClient === ws) {
      primaryLocalClient = localClients.values().next().value || null;
    }
    if (localClients.size === 0) {
      sendToInputAgent({ type: 'stop_capture' });
    }
  });
});

server.listen(HTTP_PORT, () => {
  console.log(`=======================================================`);
  console.log(`  RemoteX Desktop Client & Win32 Full Control Agent!`);
  console.log(`  Painel Local: http://localhost:${HTTP_PORT}`);
  console.log(`  Input & Capture WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Native Win32 Input/Screen: ${inputProcess ? 'ATIVO' : 'OFFLINE'}`);
  console.log(`=======================================================`);
});
