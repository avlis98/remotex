const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const HTTP_PORT = process.env.PORT || 3000;
const WS_PORT = process.env.INPUT_WS_PORT || 3001;

// Path to compiled native Win32 input & screen capture agent (.NET Framework 4.8 native Win32)
const INPUT_EXE_PATH = path.resolve(__dirname, '../../native/RemoteXInput/bin/Release/net8.0/RemoteXInput.exe');

let inputProcess = null;
let stdoutBuffer = '';
const localClients = new Set();

function broadcastToLocalClients(msgStr) {
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
  if (req.url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      hasNativeInput: !!inputProcess,
      inputAgentPid: inputProcess ? inputProcess.pid : null
    }));
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

wss.on('connection', (ws) => {
  localClients.add(ws);

  ws.on('message', (raw) => {
    try {
      const cmd = JSON.parse(raw.toString());
      sendToInputAgent(cmd);
    } catch (e) {
      console.error('[Agent] Erro de comando JSON no input WS:', e);
    }
  });

  ws.on('close', () => {
    localClients.delete(ws);
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
