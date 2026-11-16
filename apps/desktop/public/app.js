// RemoteX Client & WebRTC Controller
(function() {
  'use strict';

  // Configuration
  const SIGNALING_URL = 'ws://localhost:8080';
  const LOCAL_INPUT_WS_URL = 'ws://localhost:3001';

  // State
  let signalingWs = null;
  let localInputWs = null;
  let peerConnection = null;
  let inputDataChannel = null;
  
  let myDeviceId = localStorage.getItem('remotex_device_id') || null;
  let myPassword = localStorage.getItem('remotex_temp_password') || generateRandomPassword();
  let hostMediaStream = null;
  let activeSessionId = null;
  let isInputControlEnabled = true;
  let pingInterval = null;

  // DOM Elements
  const myDeviceIdEl = document.getElementById('my-device-id');
  const myPasswordEl = document.getElementById('my-password');
  const btnCopyId = document.getElementById('btn-copy-id');
  const btnRefreshPassword = document.getElementById('btn-refresh-password');
  const btnStartHostScreen = document.getElementById('btn-start-host-screen');
  const hostStreamLabel = document.getElementById('host-stream-label');
  const hostActiveNotice = document.getElementById('host-active-notice');

  const remoteDeviceIdInput = document.getElementById('remote-device-id');
  const remotePasswordInput = document.getElementById('remote-password');
  const btnConnect = document.getElementById('btn-connect');
  const connectForm = document.getElementById('connect-form');
  const connectErrorEl = document.getElementById('connect-error');
  const recentDevicesList = document.getElementById('recent-devices-list');

  const signalingStatusEl = document.getElementById('signaling-status');
  const signalingTextEl = document.getElementById('signaling-text');

  // Session Viewer DOM Elements
  const sessionOverlay = document.getElementById('session-overlay');
  const remoteVideo = document.getElementById('remote-video');
  const videoLoader = document.getElementById('video-loader');
  const sessionTargetName = document.getElementById('session-target-name');
  const metricPing = document.getElementById('metric-ping');
  const metricResolution = document.getElementById('metric-resolution');
  const btnToggleInput = document.getElementById('btn-toggle-input');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnRestartRemote = document.getElementById('btn-restart-remote');
  const btnDisconnect = document.getElementById('btn-disconnect');

  // Initialize
  initUI();
  connectToLocalInputAgent();
  connectToSignaling();

  function initUI() {
    myPasswordEl.value = myPassword;
    loadRecentDevices();

    // ID formatting: 000 000 000
    remoteDeviceIdInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 9);
      if (v.length > 6) {
        v = `${v.substring(0, 3)} ${v.substring(3, 6)} ${v.substring(6, 9)}`;
      } else if (v.length > 3) {
        v = `${v.substring(0, 3)} ${v.substring(3, 6)}`;
      }
      e.target.value = v;
    });

    btnCopyId.addEventListener('click', () => {
      if (myDeviceId) {
        navigator.clipboard.writeText(myDeviceId);
        const originalText = btnCopyId.innerHTML;
        btnCopyId.innerHTML = '✓';
        setTimeout(() => { btnCopyId.innerHTML = originalText; }, 1500);
      }
    });

    btnRefreshPassword.addEventListener('click', () => {
      myPassword = generateRandomPassword();
      myPasswordEl.value = myPassword;
      localStorage.setItem('remotex_temp_password', myPassword);
      if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
        registerAsHost();
      }
    });

    btnStartHostScreen.addEventListener('click', async () => {
      await ensureHostScreenCapture();
    });

    connectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      startRemoteConnection();
    });

    btnDisconnect.addEventListener('click', () => {
      endSession('Conexão encerrada pelo usuário.');
    });

    btnToggleInput.addEventListener('click', () => {
      isInputControlEnabled = !isInputControlEnabled;
      btnToggleInput.classList.toggle('active', isInputControlEnabled);
      btnToggleInput.querySelector('span').textContent = isInputControlEnabled ? 'Controle Ativo' : 'Controle Pausado';
    });

    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        sessionOverlay.requestFullscreen().catch(err => console.error(err));
      } else {
        document.exitFullscreen().catch(err => console.error(err));
      }
    });

    btnRestartRemote.addEventListener('click', () => {
      if (confirm('Deseja realmente solicitar a reinicialização do computador remoto?')) {
        if (inputDataChannel && inputDataChannel.readyState === 'open') {
          inputDataChannel.send(JSON.stringify({ type: 'restart_request' }));
          alert('Solicitação de reinicialização enviada.');
        }
      }
    });

    setupRemoteInputCapture();
  }

  function generateRandomPassword() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  // Local Input Agent (Win32 SendInput Worker)
  function connectToLocalInputAgent() {
    try {
      localInputWs = new WebSocket(LOCAL_INPUT_WS_URL);
      localInputWs.onopen = () => {
        console.log('[RemoteX] Conectado ao agente nativo de entrada Win32.');
      };
      localInputWs.onerror = () => {
        // Fallback silently if running purely in browser without local agent
      };
      localInputWs.onclose = () => {
        setTimeout(connectToLocalInputAgent, 3000);
      };
    } catch (e) {
      console.warn('[RemoteX] Agente local offline:', e);
    }
  }

  // Signaling Server Connection
  function connectToSignaling() {
    updateSignalingStatus('disconnected', 'Conectando ao Servidor...');
    try {
      signalingWs = new WebSocket(SIGNALING_URL);

      signalingWs.onopen = () => {
        updateSignalingStatus('connected', 'Conectado ao Servidor Central');
        registerAsHost();
      };

      signalingWs.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          handleSignalingMessage(msg);
        } catch (e) {
          console.error('[Signaling] Erro ao parsear mensagem:', e);
        }
      };

      signalingWs.onclose = () => {
        updateSignalingStatus('disconnected', 'Desconectado (Reconectando em 3s...)');
        setTimeout(connectToSignaling, 3000);
      };

      signalingWs.onerror = (err) => {
        console.error('[Signaling] Erro WebSocket:', err);
      };
    } catch (e) {
      console.error('[Signaling] Falha ao iniciar WebSocket:', e);
    }
  }

  function updateSignalingStatus(status, text) {
    signalingStatusEl.className = `status-pill status-${status}`;
    signalingTextEl.textContent = text;
  }

  function registerAsHost() {
    if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify({
        type: 'register_host',
        deviceId: myDeviceId,
        password: myPassword,
        hostname: navigator.userAgent.includes('Windows') ? 'PC Windows' : 'Host Device',
        os: 'Windows 11'
      }));
    }
  }

  async function handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'host_registered':
        myDeviceId = msg.deviceId;
        localStorage.setItem('remotex_device_id', myDeviceId);
        myDeviceIdEl.textContent = myDeviceId;
        console.log(`[RemoteX] Registrado no servidor com ID: ${myDeviceId}`);
        break;

      case 'connect_error':
        showConnectError(msg.message || 'Erro ao conectar ao dispositivo remoto.');
        resetConnectButton();
        break;

      case 'connect_accepted':
        activeSessionId = msg.sessionId;
        saveRecentDevice(msg.targetDeviceId);
        await setupClientPeerConnection(msg.targetDeviceId, msg.iceServers);
        break;

      case 'incoming_connection':
        activeSessionId = msg.sessionId;
        await handleIncomingHostSession(msg.sessionId, msg.fromClient);
        break;

      case 'sdp_offer':
        await handleSdpOffer(msg.sessionId, msg.sdp, msg.fromDeviceId);
        break;

      case 'sdp_answer':
        await handleSdpAnswer(msg.sdp);
        break;

      case 'ice_candidate':
        if (peerConnection && msg.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(err => {
            console.error('[WebRTC] Erro ao adicionar ICE candidate:', err);
          });
        }
        break;

      case 'session_ended':
        alert(msg.reason || 'Sessão finalizada.');
        endSessionLocally();
        break;
    }
  }

  // Host Mode: Prepare Screen Media Stream
  async function ensureHostScreenCapture() {
    if (hostMediaStream) return hostMediaStream;

    try {
      hostStreamLabel.textContent = 'Solicitando Compartilhamento...';
      hostMediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 60, max: 60 }
        },
        audio: false
      });

      hostMediaStream.getVideoTracks()[0].onended = () => {
        hostMediaStream = null;
        btnStartHostScreen.classList.remove('active');
        hostStreamLabel.textContent = 'Pronto para Conexões';
      };

      btnStartHostScreen.classList.add('active');
      hostStreamLabel.textContent = 'Transmissão Ativa (Pronto)';
      return hostMediaStream;
    } catch (err) {
      console.error('[Host] Erro ao capturar tela:', err);
      hostStreamLabel.textContent = 'Iniciar Transmissão de Tela';
      alert('É necessário conceder permissão de captura de tela para receber conexões.');
      return null;
    }
  }

  // Host Mode: Handle incoming connection request
  async function handleIncomingHostSession(sessionId, fromClient) {
    const stream = await ensureHostScreenCapture();
    if (!stream) {
      signalingWs.send(JSON.stringify({
        type: 'end_session',
        sessionId,
        reason: 'O host não concedeu permissão para compartilhar a tela.'
      }));
      return;
    }

    hostActiveNotice.classList.remove('hidden');

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnection = pc;

    // Add video tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Listen for data channel created by controller
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === 'remotex-input') {
        inputDataChannel = channel;
        setupHostDataChannelListener(channel);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWs.readyState === WebSocket.OPEN) {
        signalingWs.send(JSON.stringify({
          type: 'ice_candidate',
          sessionId,
          candidate: event.candidate
        }));
      }
    };
  }

  // Host Mode: Handle input commands received from remote controller
  function setupHostDataChannelListener(channel) {
    channel.onmessage = (event) => {
      try {
        const cmd = JSON.parse(event.data);
        if (cmd.type === 'ping') {
          channel.send(JSON.stringify({ type: 'pong', sendTime: cmd.sendTime }));
          return;
        }

        if (cmd.type === 'restart_request') {
          console.warn('[Host] Comando de reinicialização remota autorizado.');
          fetch('/api/system/restart', { method: 'POST' }).catch(() => {});
          return;
        }

        // Forward mouse & keyboard directly to local Win32 SendInput agent
        if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
          localInputWs.send(JSON.stringify(cmd));
        }
      } catch (e) {
        console.error('[Host] Erro ao processar comando de entrada:', e);
      }
    };
  }

  async function handleSdpOffer(sessionId, sdp, fromDeviceId) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    signalingWs.send(JSON.stringify({
      type: 'sdp_answer',
      sessionId,
      sdp: answer,
      targetDeviceId: fromDeviceId
    }));
  }

  async function handleSdpAnswer(sdp) {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  // Client/Viewer Mode: Initiate connection to target
  function startRemoteConnection() {
    clearConnectError();
    const targetId = remoteDeviceIdInput.value.trim();
    const password = remotePasswordInput.value.trim();

    if (!targetId || targetId.length < 9) {
      showConnectError('Insira um ID de acesso válido (9 dígitos).');
      return;
    }
    if (!password) {
      showConnectError('Insira a senha de acesso.');
      return;
    }

    btnConnect.disabled = true;
    btnConnect.querySelector('span').textContent = 'Conectando...';

    signalingWs.send(JSON.stringify({
      type: 'connect_request',
      targetDeviceId: targetId,
      password: password,
      clientInfo: { hostname: 'RemoteX Controller' }
    }));
  }

  async function setupClientPeerConnection(targetDeviceId, iceServers) {
    const pc = new RTCPeerConnection({
      iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnection = pc;

    // Create reliable low-latency SCTP data channel for mouse/keyboard
    inputDataChannel = pc.createDataChannel('remotex-input', {
      ordered: true,
      maxRetransmits: 0 // Prioritize lowest latency for live input
    });

    inputDataChannel.onopen = () => {
      console.log('[Controller] Canal de dados de entrada aberto com sucesso.');
      startPingMonitoring();
    };

    inputDataChannel.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'pong') {
          const rtt = Math.round(performance.now() - data.sendTime);
          metricPing.textContent = `${rtt} ms`;
        }
      } catch (err) {}
    };

    // Receive remote video stream
    pc.ontrack = (event) => {
      console.log('[Controller] Stream de vídeo remoto recebido!');
      videoLoader.classList.add('hidden');
      remoteVideo.srcObject = event.streams[0];
      
      event.track.onloadedmetadata = () => {
        metricResolution.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWs.readyState === WebSocket.OPEN) {
        signalingWs.send(JSON.stringify({
          type: 'ice_candidate',
          sessionId: activeSessionId,
          candidate: event.candidate,
          targetDeviceId
        }));
      }
    };

    // Create SDP Offer
    const offer = await pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false
    });
    await pc.setLocalDescription(offer);

    signalingWs.send(JSON.stringify({
      type: 'sdp_offer',
      sessionId: activeSessionId,
      sdp: offer,
      targetDeviceId
    }));

    // Open session UI overlay
    sessionTargetName.textContent = `Computador Remoto: ${targetIdFormat(targetDeviceId)}`;
    sessionOverlay.classList.remove('hidden');
    videoLoader.classList.remove('hidden');
    resetConnectButton();
  }

  // Interactive Remote Mouse and Keyboard Input Capture
  function setupRemoteInputCapture() {
    let lastMoveTime = 0;

    // Mouse Move (Throttled to 60hz for smooth transmission)
    remoteVideo.addEventListener('mousemove', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;

      const now = performance.now();
      if (now - lastMoveTime < 14) return; // ~70fps cap
      lastMoveTime = now;

      const rect = remoteVideo.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      inputDataChannel.send(JSON.stringify({
        type: 'mouse_move',
        x: normX,
        y: normY
      }));
    });

    // Mouse Down
    remoteVideo.addEventListener('mousedown', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;
      e.preventDefault();
      remoteVideo.focus();

      inputDataChannel.send(JSON.stringify({
        type: 'mouse_down',
        button: e.button // 0: left, 1: middle, 2: right
      }));
    });

    // Mouse Up
    remoteVideo.addEventListener('mouseup', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;
      e.preventDefault();

      inputDataChannel.send(JSON.stringify({
        type: 'mouse_up',
        button: e.button
      }));
    });

    // Prevent default context menu on right click
    remoteVideo.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Mouse Wheel
    remoteVideo.addEventListener('wheel', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;
      e.preventDefault();

      inputDataChannel.send(JSON.stringify({
        type: 'mouse_wheel',
        deltaY: e.deltaY > 0 ? 120 : -120
      }));
    }, { passive: false });

    // Keyboard Events
    remoteVideo.addEventListener('keydown', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;
      
      // Let developer shortcuts (F12, etc.) work if needed
      if (e.key === 'F12') return;
      e.preventDefault();

      inputDataChannel.send(JSON.stringify({
        type: 'key_down',
        key: e.key,
        code: e.code,
        vkCode: e.keyCode
      }));

      // Send text character if printable
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        inputDataChannel.send(JSON.stringify({
          type: 'text',
          text: e.key
        }));
      }
    });

    remoteVideo.addEventListener('keyup', (e) => {
      if (!isInputControlEnabled || !inputDataChannel || inputDataChannel.readyState !== 'open') return;
      e.preventDefault();

      inputDataChannel.send(JSON.stringify({
        type: 'key_up',
        key: e.key,
        code: e.code,
        vkCode: e.keyCode
      }));
    });
  }

  function startPingMonitoring() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (inputDataChannel && inputDataChannel.readyState === 'open') {
        inputDataChannel.send(JSON.stringify({
          type: 'ping',
          sendTime: performance.now()
        }));
      }
    }, 1500);
  }

  function endSession(reason) {
    if (activeSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify({
        type: 'end_session',
        sessionId: activeSessionId,
        reason: reason || 'Sessão encerrada.'
      }));
    }
    endSessionLocally();
  }

  function endSessionLocally() {
    if (pingInterval) clearInterval(pingInterval);
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (inputDataChannel) {
      inputDataChannel.close();
      inputDataChannel = null;
    }
    activeSessionId = null;
    sessionOverlay.classList.add('hidden');
    hostActiveNotice.classList.add('hidden');
    remoteVideo.srcObject = null;
    resetConnectButton();
  }

  // Helpers
  function showConnectError(msg) {
    connectErrorEl.textContent = msg;
    connectErrorEl.classList.remove('hidden');
  }

  function clearConnectError() {
    connectErrorEl.textContent = '';
    connectErrorEl.classList.add('hidden');
  }

  function resetConnectButton() {
    btnConnect.disabled = false;
    btnConnect.querySelector('span').textContent = 'Conectar Agora';
  }

  function targetIdFormat(id) {
    const clean = String(id).replace(/\s/g, '');
    if (clean.length === 9) {
      return `${clean.substring(0, 3)} ${clean.substring(3, 6)} ${clean.substring(6, 9)}`;
    }
    return id;
  }

  function saveRecentDevice(deviceId) {
    let recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]');
    recents = recents.filter(d => d !== deviceId);
    recents.unshift(deviceId);
    if (recents.length > 5) recents.pop();
    localStorage.setItem('remotex_recents', JSON.stringify(recents));
    loadRecentDevices();
  }

  function loadRecentDevices() {
    const recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]');
    recentDevicesList.innerHTML = '';
    if (recents.length === 0) {
      recentDevicesList.innerHTML = '<div class="recent-empty">Nenhuma conexão recente ainda.</div>';
      return;
    }
    recents.forEach(id => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        <span class="recent-id">${targetIdFormat(id)}</span>
        <button class="btn-icon" title="Usar este ID">➔</button>
      `;
      item.addEventListener('click', () => {
        remoteDeviceIdInput.value = targetIdFormat(id);
        remotePasswordInput.focus();
      });
      recentDevicesList.appendChild(item);
    });
  }
})();

