// RemoteX Client & WebRTC Controller - Etapa 2
(function() {
  'use strict';

  // Configuration
  const CLOUD_SIGNALING_URL = 'wss://pointing-mayor-send-wishes.trycloudflare.com';
  let SIGNALING_URL = localStorage.getItem('remotex_signaling_url') || CLOUD_SIGNALING_URL;
  const LOCAL_INPUT_WS_URL = 'ws://localhost:3001';
  const CHUNK_SIZE = 64 * 1024; // 64KB chunks for optimal WebRTC SCTP throughput

  // State
  let signalingWs = null;
  let localInputWs = null;
  let peerConnection = null;
  
  // Dedicated WebRTC Data Channels
  let inputDataChannel = null;   // mouse/keyboard
  let chatDataChannel = null;    // chat messages
  let fileDataChannel = null;    // file transfers

  const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  let pendingOffer = null;
  let pendingIceCandidates = [];

  let myDeviceId = localStorage.getItem('remotex_device_id') || null;
  let myPassword = localStorage.getItem('remotex_temp_password') || generateRandomPassword();
  let unattendedEnabled = localStorage.getItem('remotex_unattended_enabled') === 'true';
  let unattendedPassword = localStorage.getItem('remotex_unattended_pwd') || '';
  
  let hostMediaStream = null;
  let activeSessionId = null;
  let isInputControlEnabled = true;
  let pingInterval = null;
  let statsInterval = null;
  let unreadChatCount = 0;
  let isChatOpen = false;
  let isFilesOpen = false;

  // File Transfer State
  let activeTransfers = new Map(); // transferId -> { name, size, receivedBytes, chunks, startTime, isIncoming, canceled }

  // DOM Elements
  const myDeviceIdEl = document.getElementById('my-device-id');
  const myPasswordDisplay = document.getElementById('my-password-display');
  const btnCopyId = document.getElementById('btn-copy-id');
  const btnRefreshPassword = document.getElementById('btn-refresh-password');
  const btnStartHostScreen = document.getElementById('btn-start-host-screen');
  const hostStreamLabel = document.getElementById('host-stream-label');
  const hostActiveNotice = document.getElementById('host-active-notice');

  // Sidebar Tabs
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  // Window Controls
  const winClose = document.querySelector('.win-close');
  const winMinimize = document.querySelector('.win-minimize');
  const winMaximize = document.querySelector('.win-maximize');

  // Unattended Access Elements
  const unattendedToggle = document.getElementById('unattended-toggle');
  const unattendedSettings = document.getElementById('unattended-settings');
  const unattendedPasswordInput = document.getElementById('unattended-password');
  const btnSaveUnattended = document.getElementById('btn-save-unattended');
  const unattendedSavedPill = document.getElementById('unattended-saved-pill');

  // Connection Elements
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
  const sessionStatusDot = document.getElementById('session-status-dot');
  const metricPing = document.getElementById('metric-ping');
  const metricResolution = document.getElementById('metric-resolution');
  const reconnectingOverlay = document.getElementById('reconnecting-overlay');

  // Toolbar Actions
  const btnMonitors = document.getElementById('btn-monitors');
  const monitorsMenu = document.getElementById('monitors-menu');
  const btnFiles = document.getElementById('btn-files');
  const btnChat = document.getElementById('btn-chat');
  const chatBadge = document.getElementById('chat-badge');
  const btnSyncClipboard = document.getElementById('btn-sync-clipboard');
  const btnToggleInput = document.getElementById('btn-toggle-input');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnRestartRemote = document.getElementById('btn-restart-remote');
  const btnDisconnect = document.getElementById('btn-disconnect');

  // File Manager Elements
  const fileModal = document.getElementById('file-modal');
  const btnCloseFiles = document.getElementById('btn-close-files');
  const fileDropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-input');
  const btnSelectFile = document.getElementById('btn-select-file');
  const transferList = document.getElementById('transfer-list');

  // Chat Elements
  const chatDrawer = document.getElementById('chat-drawer');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');

  // Initialize
  initUI();
  connectToLocalInputAgent();
  connectToSignaling();

  function initUI() {
    // Ensure instant Device ID display so it never stays on "Carregando..."
    if (!myDeviceId) {
      const num = Math.floor(100000000 + Math.random() * 900000000);
      myDeviceId = `${String(num).slice(0, 3)} ${String(num).slice(3, 6)} ${String(num).slice(6, 9)}`;
      localStorage.setItem('remotex_device_id', myDeviceId);
    }
    if (myDeviceIdEl) myDeviceIdEl.textContent = myDeviceId;
    if (myPasswordDisplay) myPasswordDisplay.textContent = myPassword;
    loadRecentDevices();

    // Settings elements
    const settingSignalingInput = document.getElementById('setting-signaling-url');
    const btnSaveSignaling = document.getElementById('btn-save-signaling');
    const btnResetSignalingLocal = document.getElementById('btn-reset-signaling-local');

    if (settingSignalingInput) settingSignalingInput.value = SIGNALING_URL;

    if (btnSaveSignaling) {
      btnSaveSignaling.addEventListener('click', () => {
        const newUrl = settingSignalingInput.value.trim();
        if (newUrl) {
          SIGNALING_URL = newUrl;
          localStorage.setItem('remotex_signaling_url', SIGNALING_URL);
          if (signalingWs) signalingWs.close();
          connectToSignaling();
          alert('Servidor atualizado! Reconectando ao endereço: ' + SIGNALING_URL);
        }
      });
    }

    if (btnResetSignalingLocal) {
      btnResetSignalingLocal.addEventListener('click', () => {
        SIGNALING_URL = 'ws://localhost:8080';
        localStorage.setItem('remotex_signaling_url', SIGNALING_URL);
        if (settingSignalingInput) settingSignalingInput.value = SIGNALING_URL;
        if (signalingWs) signalingWs.close();
        connectToSignaling();
        alert('Restaurado para servidor local (ws://localhost:8080)');
      });
    }

    // Tab Navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const tabTarget = item.getAttribute('data-tab');
        tabContents.forEach(tab => {
          tab.classList.toggle('active', tab.id === `tab-${tabTarget}`);
        });
      });
    });

    // Window controls
    if (winClose) {
      winClose.addEventListener('click', () => {
        if (confirm('Deseja minimizar ou fechar o RemoteX?')) window.close();
      });
    }
    if (winMinimize) {
      winMinimize.addEventListener('click', () => {
        alert('RemoteX minimizado para a bandeja do sistema.');
      });
    }
    if (winMaximize) {
      winMaximize.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Recent items click
    document.querySelectorAll('.recent-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        if (id) {
          remoteDeviceIdInput.value = id;
          remotePasswordInput.focus();
        }
      });
    });

    // Unattended access restore
    unattendedToggle.checked = unattendedEnabled;
    if (unattendedEnabled) {
      unattendedSettings.classList.remove('hidden');
      if (unattendedPassword) {
        unattendedPasswordInput.value = unattendedPassword;
        unattendedSavedPill.classList.remove('hidden');
      }
    }

    unattendedToggle.addEventListener('change', () => {
      unattendedEnabled = unattendedToggle.checked;
      localStorage.setItem('remotex_unattended_enabled', unattendedEnabled ? 'true' : 'false');
      unattendedSettings.classList.toggle('hidden', !unattendedEnabled);
      registerAsHost();
    });

    btnSaveUnattended.addEventListener('click', () => {
      const pwd = unattendedPasswordInput.value.trim();
      if (!pwd) {
        alert('Defina uma senha válida para o acesso não supervisionado.');
        return;
      }
      unattendedPassword = pwd;
      localStorage.setItem('remotex_unattended_pwd', unattendedPassword);
      unattendedSavedPill.classList.remove('hidden');
      registerAsHost();
      alert('Senha permanente salva com sucesso!');
    });

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
      if (myPasswordDisplay) myPasswordDisplay.textContent = myPassword;
      localStorage.setItem('remotex_temp_password', myPassword);
      registerAsHost();
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

    // Monitors Menu
    btnMonitors.addEventListener('click', (e) => {
      e.stopPropagation();
      monitorsMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        monitorsMenu.classList.add('hidden');
        if (inputDataChannel && inputDataChannel.readyState === 'open') {
          inputDataChannel.send(JSON.stringify({
            type: 'switch_monitor',
            target: item.getAttribute('data-screen')
          }));
        }
      });
    });

    document.addEventListener('click', () => {
      monitorsMenu.classList.add('hidden');
    });

    // File Manager
    btnFiles.addEventListener('click', () => {
      isFilesOpen = !isFilesOpen;
      fileModal.classList.toggle('hidden', !isFilesOpen);
    });

    btnCloseFiles.addEventListener('click', () => {
      isFilesOpen = false;
      fileModal.classList.add('hidden');
    });

    btnSelectFile.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        sendFile(e.target.files[0]);
      }
    });

    // File Drag and drop
    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });

    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('dragover');
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        sendFile(e.dataTransfer.files[0]);
      }
    });

    // Chat Drawer
    btnChat.addEventListener('click', () => {
      isChatOpen = !isChatOpen;
      chatDrawer.classList.toggle('hidden', !isChatOpen);
      if (isChatOpen) {
        unreadChatCount = 0;
        chatBadge.classList.add('hidden');
        chatBadge.textContent = '0';
        chatInput.focus();
      }
    });

    btnCloseChat.addEventListener('click', () => {
      isChatOpen = false;
      chatDrawer.classList.add('hidden');
    });

    btnSendChat.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });

    // Clipboard Sync
    btnSyncClipboard.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && inputDataChannel && inputDataChannel.readyState === 'open') {
          inputDataChannel.send(JSON.stringify({
            type: 'clipboard_sync',
            text
          }));
          alert('Área de transferência sincronizada com o computador remoto.');
        } else {
          alert('Área de transferência local vazia.');
        }
      } catch (err) {
        alert('Não foi possível ler a área de transferência local.');
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
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${p1}-${p2}`;
  }

  // Local Input Agent (Win32 SendInput Worker)
  function connectToLocalInputAgent() {
    try {
      localInputWs = new WebSocket(LOCAL_INPUT_WS_URL);
      localInputWs.onopen = () => {
        console.log('[RemoteX] Conectado ao agente nativo de entrada Win32.');
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
    if (signalingStatusEl) signalingStatusEl.className = `status-pill status-${status}`;
    if (signalingTextEl) signalingTextEl.textContent = text;
    const sidebarStatus = document.getElementById('sidebar-status-text');
    if (sidebarStatus) sidebarStatus.textContent = status === 'connected' ? 'Online' : 'Conectando...';
    const hostBadge = document.getElementById('host-status-badge');
    if (hostBadge) hostBadge.textContent = status === 'connected' ? 'Online – Pronto para conectar' : 'Conectando ao servidor...';
  }

  function registerAsHost() {
    if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify({
        type: 'register_host',
        deviceId: myDeviceId,
        password: myPassword,
        unattendedPassword: (unattendedEnabled && unattendedPassword) ? unattendedPassword : null,
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
        console.log(`[RemoteX] Registrado com ID: ${myDeviceId}`);
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
        if (!peerConnection || !hostMediaStream) {
          console.log('[Host] Oferta SDP recebida antes da inicialização completa. Enfileirando...');
          pendingOffer = {
            sessionId: msg.sessionId,
            sdp: msg.sdp,
            fromDeviceId: msg.fromDeviceId
          };
        } else {
          await processSdpOffer(msg.sessionId, msg.sdp, msg.fromDeviceId);
        }
        break;

      case 'sdp_answer':
        await handleSdpAnswer(msg.sdp);
        break;

      case 'ice_candidate':
        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.warn('[WebRTC] Erro ao adicionar ICE candidate:', err);
          }
        } else {
          pendingIceCandidates.push(msg.candidate);
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
    if (hostMediaStream && hostMediaStream.active && hostMediaStream.getVideoTracks().length > 0) {
      return hostMediaStream;
    }

    try {
      hostStreamLabel.textContent = 'Solicitando Compartilhamento...';
      hostMediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 }
        },
        audio: false
      });

      const videoTrack = hostMediaStream.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = 'motion';
        }
        videoTrack.onended = () => {
          hostMediaStream = null;
          btnStartHostScreen.classList.remove('active');
          hostStreamLabel.textContent = 'Pronto para Conexões';
        };
      }

      btnStartHostScreen.classList.add('active');
      hostStreamLabel.textContent = 'Transmissão Ativa (Pronto)';
      return hostMediaStream;
    } catch (err) {
      console.error('[Host] Erro ao capturar tela:', err);
      hostStreamLabel.textContent = 'Iniciar Transmissão de Tela';
      return null;
    }
  }

  // Host Mode: Handle incoming connection request
  async function handleIncomingHostSession(sessionId, fromClient) {
    activeSessionId = sessionId;
    pendingIceCandidates = [];
    pendingOffer = null;
    hostActiveNotice.classList.remove('hidden');

    // 1. Criar PeerConnection imediatamente para preparar canais e receber candidatos
    const pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS
    });
    peerConnection = pc;

    setupPeerConnectionAutoReconnect(pc);

    // Escutar data channels enviados pelo cliente
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === 'remotex-input') {
        inputDataChannel = channel;
        setupHostDataChannelListener(channel);
      } else if (channel.label === 'remotex-chat') {
        chatDataChannel = channel;
        setupChatChannelListener(channel);
      } else if (channel.label === 'remotex-files') {
        fileDataChannel = channel;
        setupFileChannelListener(channel);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
        signalingWs.send(JSON.stringify({
          type: 'ice_candidate',
          sessionId,
          candidate: event.candidate
        }));
      }
    };

    // 2. Garantir captura de tela do host
    const stream = await ensureHostScreenCapture();
    if (!stream) {
      signalingWs.send(JSON.stringify({
        type: 'end_session',
        sessionId,
        reason: 'O host não concedeu permissão para compartilhar a tela.'
      }));
      endSessionLocally();
      return;
    }

    // 3. Adicionar tracks de vídeo à conexão
    stream.getTracks().forEach(track => {
      if ('contentHint' in track) track.contentHint = 'motion';
      pc.addTrack(track, stream);
    });

    // 4. Se a oferta SDP já chegou enquanto o usuário selecionava a tela, processar imediatamente
    if (pendingOffer) {
      console.log('[Host] Processando oferta SDP que estava na fila...');
      const offerToProcess = pendingOffer;
      pendingOffer = null;
      await processSdpOffer(offerToProcess.sessionId, offerToProcess.sdp, offerToProcess.fromDeviceId);
    }
  }

  // Auto Reconnection Handler
  function setupPeerConnectionAutoReconnect(pc) {
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE Connection State: ${state}`);
      if (state === 'disconnected') {
        reconnectingOverlay.classList.remove('hidden');
        sessionStatusDot.classList.add('warning');
      } else if (state === 'connected' || state === 'completed') {
        reconnectingOverlay.classList.add('hidden');
        sessionStatusDot.classList.remove('warning');
      } else if (state === 'failed') {
        reconnectingOverlay.querySelector('span').textContent = 'Tentando reiniciar ICE...';
        pc.restartIce();
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

        if (cmd.type === 'clipboard_sync') {
          console.log('[Host] Clipboard sync recebido:', cmd.text);
          navigator.clipboard.writeText(cmd.text).catch(() => {});
          return;
        }

        if (cmd.type === 'switch_monitor') {
          console.log('[Host] Solicitação de alternância de tela para:', cmd.target);
          ensureHostScreenCapture();
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

  async function processSdpOffer(sessionId, sdp, fromDeviceId) {
    if (!peerConnection) return;
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[Host] Oferta SDP aplicada como remote description.');

      // Despejar ICE candidates que chegaram antes da descrição remota
      while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Erro ao aplicar ICE candidate pendente:', e);
        }
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      signalingWs.send(JSON.stringify({
        type: 'sdp_answer',
        sessionId,
        sdp: answer,
        targetDeviceId: fromDeviceId
      }));
      console.log('[Host] SDP Answer enviado com sucesso para o controlador.');
    } catch (e) {
      console.error('[Host] Erro ao processar oferta SDP:', e);
    }
  }

  async function handleSdpAnswer(sdp) {
    if (!peerConnection) return;
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[Controller] SDP Answer aplicado como remote description.');

      // Despejar ICE candidates no controlador
      while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Erro ao aplicar ICE candidate pendente no client:', e);
        }
      }
    } catch (e) {
      console.error('[Controller] Erro ao aplicar SDP Answer:', e);
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
    pendingIceCandidates = [];
    pendingOffer = null;

    const pc = new RTCPeerConnection({
      iceServers: (iceServers && iceServers.length) ? iceServers : DEFAULT_ICE_SERVERS
    });
    peerConnection = pc;

    setupPeerConnectionAutoReconnect(pc);

    // 1. Data Channel: Input
    inputDataChannel = pc.createDataChannel('remotex-input', {
      ordered: true,
      maxRetransmits: 0
    });
    inputDataChannel.onopen = () => {
      console.log('[Controller] Canal de dados de entrada ativo.');
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

    // 2. Data Channel: Chat
    chatDataChannel = pc.createDataChannel('remotex-chat', { ordered: true });
    setupChatChannelListener(chatDataChannel);

    // 3. Data Channel: File Transfer
    fileDataChannel = pc.createDataChannel('remotex-files', { ordered: true });
    setupFileChannelListener(fileDataChannel);

    // Receive remote video stream
    pc.ontrack = (event) => {
      console.log('[Controller] Stream de vídeo remoto recebido com sucesso!', event.streams[0]);
      videoLoader.classList.add('hidden');
      if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
      remoteVideo.play().catch(e => console.warn('[Video] Play caught:', e));
      
      event.track.onloadedmetadata = () => {
        metricResolution.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
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

  // Chat Subsystem
  function setupChatChannelListener(channel) {
    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'chat_message') {
          appendChatMessage(msg.text, 'incoming', msg.timestamp);
          if (!isChatOpen) {
            unreadChatCount++;
            chatBadge.textContent = unreadChatCount;
            chatBadge.classList.remove('hidden');
          }
        }
      } catch (err) {}
    };
  }

  function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (chatDataChannel && chatDataChannel.readyState === 'open') {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      chatDataChannel.send(JSON.stringify({
        type: 'chat_message',
        text,
        timestamp: timeStr
      }));
      appendChatMessage(text, 'outgoing', timeStr);
      chatInput.value = '';
    }
  }

  function appendChatMessage(text, direction, timeStr) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${direction}`;
    bubble.innerHTML = `
      <div>${escapeHtml(text)}</div>
      <div class="chat-time">${timeStr || ''}</div>
    `;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // File Transfer Subsystem
  function setupFileChannelListener(channel) {
    channel.binaryType = 'arraybuffer';
    let currentIncoming = null;

    channel.onmessage = (e) => {
      // If metadata header received
      if (typeof e.data === 'string') {
        try {
          const meta = JSON.parse(e.data);
          if (meta.type === 'file_header') {
            currentIncoming = {
              id: meta.id,
              name: meta.name,
              size: meta.size,
              receivedBytes: 0,
              chunks: [],
              startTime: performance.now()
            };
            activeTransfers.set(meta.id, currentIncoming);
            renderTransferItem(currentIncoming, true);
          } else if (meta.type === 'file_cancel') {
            const item = activeTransfers.get(meta.id);
            if (item) {
              item.canceled = true;
              updateTransferUI(item, 'Cancelado');
            }
          }
        } catch (err) {}
      } 
      // If binary chunk received
      else if (e.data instanceof ArrayBuffer) {
        if (!currentIncoming || currentIncoming.canceled) return;
        currentIncoming.chunks.push(e.data);
        currentIncoming.receivedBytes += e.data.byteLength;

        updateTransferProgress(currentIncoming);

        // Complete check
        if (currentIncoming.receivedBytes >= currentIncoming.size) {
          const blob = new Blob(currentIncoming.chunks);
          saveReceivedFile(blob, currentIncoming.name);
          updateTransferUI(currentIncoming, 'Concluído');
          currentIncoming = null;
        }
      }
    };
  }

  async function sendFile(file) {
    if (!fileDataChannel || fileDataChannel.readyState !== 'open') {
      alert('Canal de transferência de arquivos indisponível no momento.');
      return;
    }

    const transferId = 'transfer-' + Math.random().toString(36).substr(2, 9);
    const transfer = {
      id: transferId,
      name: file.name,
      size: file.size,
      receivedBytes: 0,
      startTime: performance.now()
    };
    activeTransfers.set(transferId, transfer);
    renderTransferItem(transfer, false);

    // Send metadata header
    fileDataChannel.send(JSON.stringify({
      type: 'file_header',
      id: transferId,
      name: file.name,
      size: file.size
    }));

    // Read and stream in 64KB chunks
    const reader = file.stream().getReader();
    let sent = 0;

    while (true) {
      if (transfer.canceled) {
        fileDataChannel.send(JSON.stringify({ type: 'file_cancel', id: transferId }));
        updateTransferUI(transfer, 'Cancelado');
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Handle SCTP backpressure buffer
      while (fileDataChannel.bufferedAmount > 8 * 1024 * 1024) {
        await new Promise(r => setTimeout(r, 20));
      }

      fileDataChannel.send(value.buffer);
      sent += value.byteLength;
      transfer.receivedBytes = sent;
      updateTransferProgress(transfer);
    }

    if (!transfer.canceled) {
      updateTransferUI(transfer, 'Concluído');
    }
  }

  function renderTransferItem(transfer, isIncoming) {
    const emptyNotice = transferList.querySelector('.recent-empty');
    if (emptyNotice) emptyNotice.remove();

    const card = document.createElement('div');
    card.id = `item-${transfer.id}`;
    card.className = 'transfer-item-card';
    card.innerHTML = `
      <div class="transfer-meta">
        <span class="transfer-name">${isIncoming ? '⬇️ ' : '⬆️ '}${escapeHtml(transfer.name)}</span>
        <span class="transfer-status" id="status-${transfer.id}">0%</span>
      </div>
      <div class="transfer-progress-bg">
        <div class="transfer-progress-fill" id="fill-${transfer.id}"></div>
      </div>
      <div class="transfer-stats">
        <span id="speed-${transfer.id}">Calculando...</span>
        <span id="size-${transfer.id}">${formatBytes(transfer.size)}</span>
      </div>
    `;
    transferList.prepend(card);
  }

  function updateTransferProgress(transfer) {
    const fill = document.getElementById(`fill-${transfer.id}`);
    const status = document.getElementById(`status-${transfer.id}`);
    const speed = document.getElementById(`speed-${transfer.id}`);
    if (!fill || !status) return;

    const percent = Math.min(100, Math.round((transfer.receivedBytes / transfer.size) * 100));
    fill.style.width = `${percent}%`;
    status.textContent = `${percent}%`;

    const elapsed = (performance.now() - transfer.startTime) / 1000;
    if (elapsed > 0.5) {
      const bytesPerSec = transfer.receivedBytes / elapsed;
      speed.textContent = `${formatBytes(bytesPerSec)}/s`;
    }
  }

  function updateTransferUI(transfer, finalStatus) {
    const status = document.getElementById(`status-${transfer.id}`);
    const speed = document.getElementById(`speed-${transfer.id}`);
    if (status) status.textContent = finalStatus;
    if (speed && finalStatus === 'Concluído') speed.textContent = '100% Finalizado';
  }

  function saveReceivedFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
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
        button: e.button
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
      if (e.key === 'F12') return;
      e.preventDefault();

      inputDataChannel.send(JSON.stringify({
        type: 'key_down',
        key: e.key,
        code: e.code,
        vkCode: e.keyCode
      }));

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

    startPerformanceTelemetry();
  }

  function startPerformanceTelemetry() {
    if (statsInterval) clearInterval(statsInterval);
    let prevBytes = 0;
    let prevTimestamp = 0;

    statsInterval = setInterval(async () => {
      if (!peerConnection) return;
      try {
        const stats = await peerConnection.getStats();
        let fps = 60;
        let bitrateMbps = 0;
        let packetsLost = 0;
        let totalPackets = 0;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (report.framesPerSecond) fps = Math.round(report.framesPerSecond);
            if (report.packetsLost) packetsLost = report.packetsLost;
            if (report.packetsReceived) totalPackets = report.packetsReceived + packetsLost;

            if (prevTimestamp && report.bytesReceived) {
              const deltaBytes = report.bytesReceived - prevBytes;
              const deltaTime = (report.timestamp - prevTimestamp) / 1000;
              if (deltaTime > 0) {
                bitrateMbps = ((deltaBytes * 8) / (deltaTime * 1000000)).toFixed(1);
              }
            }
            prevBytes = report.bytesReceived || 0;
            prevTimestamp = report.timestamp;
          }
        });

        // Compute loss rate
        const lossRate = totalPackets > 0 ? ((packetsLost / totalPackets) * 100).toFixed(1) : 0;
        metricResolution.textContent = `${remoteVideo.videoWidth || 1920}x${remoteVideo.videoHeight || 1080} | ${fps} FPS | ${bitrateMbps} Mbps | ${lossRate}% Perda`;

        // Congestion Control: Color code status indicator
        if (lossRate > 5 || (metricPing && parseInt(metricPing.textContent) > 150)) {
          sessionStatusDot.className = 'status-dot-green';
          sessionStatusDot.style.backgroundColor = '#EF4444';
          sessionStatusDot.style.boxShadow = '0 0 8px #EF4444';
        } else if (lossRate > 2 || (metricPing && parseInt(metricPing.textContent) > 80)) {
          sessionStatusDot.className = 'status-dot-green';
          sessionStatusDot.style.backgroundColor = '#F59E0B';
          sessionStatusDot.style.boxShadow = '0 0 8px #F59E0B';
        } else {
          sessionStatusDot.className = 'status-dot-green';
          sessionStatusDot.style.backgroundColor = '#10B981';
          sessionStatusDot.style.boxShadow = '0 0 8px #10B981';
        }
      } catch (err) {}
    }, 2000);
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
    pendingOffer = null;
    pendingIceCandidates = [];
    if (pingInterval) clearInterval(pingInterval);
    if (statsInterval) clearInterval(statsInterval);
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (inputDataChannel) {
      inputDataChannel.close();
      inputDataChannel = null;
    }
    if (chatDataChannel) {
      chatDataChannel.close();
      chatDataChannel = null;
    }
    if (fileDataChannel) {
      fileDataChannel.close();
      fileDataChannel = null;
    }
    activeSessionId = null;
    sessionOverlay.classList.add('hidden');
    hostActiveNotice.classList.add('hidden');
    fileModal.classList.add('hidden');
    chatDrawer.classList.add('hidden');
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

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
