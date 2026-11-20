// RemoteX Client & WebRTC Controller - Etapa 2
(function() {
  'use strict';

  // Configuration
  const DEFAULT_LOCAL_SIGNALING_URL = 'ws://localhost:8080';
  let discoveredCloudUrl = null;
  let discoveredLanUrl = null;

  // Força uso automático do motor local + Global Mesh (descarta túneis antigos trycloudflare salvos)
  const savedSignalingUrl = localStorage.getItem('remotex_signaling_url');
  if (savedSignalingUrl && savedSignalingUrl.includes('.trycloudflare.com')) {
    localStorage.removeItem('remotex_signaling_url');
  }

  let SIGNALING_URL = localStorage.getItem('remotex_signaling_url') || DEFAULT_LOCAL_SIGNALING_URL;
  const LOCAL_INPUT_WS_URL = 'ws://localhost:3001';
  const CHUNK_SIZE = 64 * 1024; // 64KB chunks for optimal WebRTC SCTP throughput

  // State
  let signalingWs = null;
  let localInputWs = null;
  let peerConnection = null;
  
  // Dedicated WebRTC Data Channels
  let inputDataChannel = null;   // mouse/keyboard/control (low latency)
  let videoDataChannel = null;   // dedicated high-definition screen frames
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
  let pendingAutoOpenFiles = false;
  let currentFilterMode = 'all';

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
  const remoteCanvas = document.getElementById('remote-canvas');
  const videoWrapper = document.getElementById('video-wrapper');
  const videoLoader = document.getElementById('video-loader');
  const sessionTargetName = document.getElementById('session-target-name');
  const sessionStatusDot = document.getElementById('session-status-dot');
  const metricPing = document.getElementById('metric-ping');
  const metricResolution = document.getElementById('metric-resolution');
  const reconnectingOverlay = document.getElementById('reconnecting-overlay');
  let pendingApprovalSessionId = null;
  let lastRelayFrameSentAt = 0;

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
    const btnUseCloudTunnel = document.getElementById('btn-use-cloud-tunnel');
    const btnResetSignalingLocal = document.getElementById('btn-reset-signaling-local');
    const cloudTunnelHint = document.getElementById('cloud-tunnel-hint');

    if (settingSignalingInput) settingSignalingInput.value = SIGNALING_URL;

    // Verifica status da Rede Global Mesh P2P e IP da rede local
    async function pollLocalSignalingStatus() {
      try {
        const res = await fetch('http://localhost:8080/api/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.lanSignalingUrl) discoveredLanUrl = data.lanSignalingUrl;
        if (data.globalMeshConnected) {
          discoveredCloudUrl = DEFAULT_LOCAL_SIGNALING_URL;
          if (cloudTunnelHint) {
            cloudTunnelHint.textContent = `✓ Rede Global Automática Ativa (${data.globalMeshBroker}) • Pronto para qualquer PC via Internet ou Rede Local`;
            cloudTunnelHint.style.color = '#10B981';
          }
        } else if (cloudTunnelHint) {
          cloudTunnelHint.textContent = `Conectando à Rede Global... (Rede Local ativa: ${discoveredLanUrl || 'ws://localhost:8080'})`;
          cloudTunnelHint.style.color = '#F59E0B';
        }
      } catch (e) {
        if (cloudTunnelHint) {
          cloudTunnelHint.textContent = 'Conectado via endereço configurado.';
        }
      }
    }
    pollLocalSignalingStatus();
    setInterval(pollLocalSignalingStatus, 5000);

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

    if (btnUseCloudTunnel) {
      btnUseCloudTunnel.addEventListener('click', async () => {
        await pollLocalSignalingStatus();
        const targetUrl = discoveredCloudUrl || discoveredLanUrl || DEFAULT_LOCAL_SIGNALING_URL;
        SIGNALING_URL = targetUrl;
        localStorage.setItem('remotex_signaling_url', SIGNALING_URL);
        if (settingSignalingInput) settingSignalingInput.value = SIGNALING_URL;
        if (signalingWs) signalingWs.close();
        connectToSignaling();
        if (discoveredCloudUrl) {
          navigator.clipboard.writeText(discoveredCloudUrl).catch(() => {});
          alert('Conectado ao Túnel de Internet ativo e link copiado para a área de transferência:\n' + discoveredCloudUrl);
        } else {
          alert('Túnel Cloudflare ainda iniciando. Usando endereço de rede local: ' + targetUrl);
        }
      });
    }

    if (btnResetSignalingLocal) {
      btnResetSignalingLocal.addEventListener('click', () => {
        SIGNALING_URL = DEFAULT_LOCAL_SIGNALING_URL;
        localStorage.setItem('remotex_signaling_url', SIGNALING_URL);
        if (settingSignalingInput) settingSignalingInput.value = SIGNALING_URL;
        if (signalingWs) signalingWs.close();
        connectToSignaling();
        alert('Restaurado para servidor local (ws://localhost:8080)');
      });
    }

    // AnyDesk v8 Layout Navigation & Actions
    const tabBtnHome = document.getElementById('tab-btn-home');
    const tabBtnActiveSession = document.getElementById('tab-btn-active-session');
    const btnNewSessionTab = document.getElementById('btn-new-session-tab');
    const btnMinimizeSession = document.getElementById('btn-minimize-session');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnBackToDashboard = document.getElementById('btn-back-to-dashboard');
    const btnInvite = document.getElementById('btn-invite');
    const btnTogglePwdBadge = document.getElementById('btn-toggle-pwd-badge');
    const btnQuickFiles = document.getElementById('btn-quick-files');
    const sectionNews = document.getElementById('section-news');
    const sectionRecents = document.getElementById('section-recents');
    const sectionSettings = document.getElementById('section-settings');
    const recentsSectionHeading = document.getElementById('recents-section-heading');
    const subnavItems = document.querySelectorAll('.ad-subnav-item');

    // View mode toggles (Grid vs List)
    const btnViewGrid = document.getElementById('btn-view-grid');
    const btnViewList = document.getElementById('btn-view-list');
    if (btnViewGrid && btnViewList) {
      btnViewGrid.addEventListener('click', () => {
        btnViewGrid.classList.add('active');
        btnViewList.classList.remove('active');
        recentDevicesList.classList.remove('list-view');
      });
      btnViewList.addEventListener('click', () => {
        btnViewList.classList.add('active');
        btnViewGrid.classList.remove('active');
        recentDevicesList.classList.add('list-view');
      });
    }

    function switchMainFilter(filter) {
      subnavItems.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === filter));
      if (filter === 'settings') {
        if (sectionNews) sectionNews.classList.add('hidden');
        if (sectionRecents) sectionRecents.classList.add('hidden');
        if (sectionSettings) sectionSettings.classList.remove('hidden');
      } else {
        if (sectionSettings) sectionSettings.classList.add('hidden');
        if (sectionNews) sectionNews.classList.toggle('hidden', filter !== 'all');
        if (sectionRecents) sectionRecents.classList.remove('hidden');
        if (recentsSectionHeading) {
          recentsSectionHeading.textContent =
            filter === 'favorites' ? 'Dispositivos Favoritos' :
            filter === 'discovered' ? 'Dispositivos Encontrados na Rede' :
            'Sessões Recentes';
        }
        loadRecentDevices(filter);
      }
    }

    subnavItems.forEach(btn => {
      btn.addEventListener('click', () => {
        switchMainFilter(btn.getAttribute('data-filter'));
      });
    });

    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => switchMainFilter('settings'));
    }
    if (btnBackToDashboard) {
      btnBackToDashboard.addEventListener('click', (e) => {
        e.preventDefault();
        switchMainFilter('all');
      });
    }

    // Top session tabs switching (AnyDesk style: switch between Nova Sessão and Active Session)
    if (tabBtnHome) {
      tabBtnHome.addEventListener('click', () => {
        tabBtnHome.classList.add('active');
        if (tabBtnActiveSession) tabBtnActiveSession.classList.remove('active');
        sessionOverlay.classList.add('hidden');
      });
    }
    if (btnNewSessionTab) {
      btnNewSessionTab.addEventListener('click', () => {
        if (tabBtnHome) tabBtnHome.click();
        remoteDeviceIdInput.focus();
      });
    }
    if (tabBtnActiveSession) {
      tabBtnActiveSession.addEventListener('click', () => {
        if (activeSessionId) {
          tabBtnActiveSession.classList.add('active');
          if (tabBtnHome) tabBtnHome.classList.remove('active');
          sessionOverlay.classList.remove('hidden');
        }
      });
    }
    if (btnMinimizeSession) {
      btnMinimizeSession.addEventListener('click', () => {
        if (tabBtnHome) tabBtnHome.click();
      });
    }

    // Banner and Quick Action Cards links
    const bannerLinkUnattended = document.getElementById('banner-link-unattended');
    const bannerLinkShare = document.getElementById('banner-link-share');
    const linkCardUnattended = document.getElementById('link-card-unattended');
    const linkCardDiscover = document.getElementById('link-card-discover');
    const linkCardPreauth = document.getElementById('link-card-preauth');
    const btnCardAbout = document.getElementById('btn-card-about');
    const btnClosePromoCard = document.getElementById('btn-close-promo-card');
    const cardNewsMesh = document.getElementById('card-news-mesh');
    const cardNewsUnattended = document.getElementById('card-news-unattended');
    const cardNewsDiscover = document.getElementById('card-news-discover');
    const cardNewsQuality = document.getElementById('card-news-quality');
    const linkViewAll = document.getElementById('link-view-all');

    if (bannerLinkUnattended) bannerLinkUnattended.addEventListener('click', (e) => { e.preventDefault(); switchMainFilter('settings'); });
    if (linkCardUnattended) linkCardUnattended.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); switchMainFilter('settings'); });
    if (cardNewsUnattended) cardNewsUnattended.addEventListener('click', () => switchMainFilter('settings'));
    if (btnTogglePwdBadge) btnTogglePwdBadge.addEventListener('click', () => switchMainFilter('settings'));
    if (bannerLinkShare) bannerLinkShare.addEventListener('click', async (e) => { e.preventDefault(); await ensureHostScreenCapture(); });
    if (linkCardPreauth) linkCardPreauth.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); await ensureHostScreenCapture(); });
    if (cardNewsQuality) cardNewsQuality.addEventListener('click', async () => { await ensureHostScreenCapture(); });
    if (linkCardDiscover) linkCardDiscover.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); switchMainFilter('discovered'); });
    if (cardNewsDiscover) cardNewsDiscover.addEventListener('click', () => switchMainFilter('discovered'));
    if (btnCardAbout) btnCardAbout.addEventListener('click', (e) => { e.stopPropagation(); switchMainFilter('settings'); });
    if (cardNewsMesh) cardNewsMesh.addEventListener('click', () => switchMainFilter('settings'));
    if (linkViewAll) linkViewAll.addEventListener('click', (e) => { e.preventDefault(); switchMainFilter('recents'); });
    if (btnClosePromoCard) {
      btnClosePromoCard.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = document.getElementById('card-news-quality');
        if (card) card.style.display = 'none';
      });
    }

    // Invite button (Copies ID + Temporary Password ready to paste)
    if (btnInvite) {
      btnInvite.addEventListener('click', () => {
        const inviteText = `Conecte-se ao meu computador via RemoteX:\nID: ${myDeviceId}\nSenha: ${myPassword}`;
        navigator.clipboard.writeText(inviteText).catch(() => {});
        const span = btnInvite.querySelector('span');
        const orig = span.textContent;
        span.textContent = 'Copiado!';
        setTimeout(() => { span.textContent = orig; }, 1800);
      });
    }

    // Clicking myDeviceId copies it too
    if (myDeviceIdEl) {
      myDeviceIdEl.addEventListener('click', () => {
        if (btnCopyId) btnCopyId.click();
      });
    }

    if (btnQuickFiles) {
      btnQuickFiles.addEventListener('click', () => {
        startRemoteConnection(true);
      });
    }

    // Auth Modal Controls
    const authModal = document.getElementById('auth-modal');
    const authModalForm = document.getElementById('auth-modal-form');
    const authModalDeviceId = document.getElementById('auth-modal-device-id');
    const authModalAlias = document.getElementById('auth-modal-alias');
    const authModalPassword = document.getElementById('auth-modal-password');
    const authModalRemember = document.getElementById('auth-modal-remember');
    const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
    const btnCancelAuthModal = document.getElementById('btn-cancel-auth-modal');
    const btnDeleteAuthModal = document.getElementById('btn-delete-auth-modal');
    const btnSaveOnlyAuthModal = document.getElementById('btn-save-only-auth-modal');
    const btnRequestApprovalModal = document.getElementById('btn-request-approval-modal');
    const btnAddFavoriteDevice = document.getElementById('btn-add-favorite-device');
    const incomingApprovalModal = document.getElementById('incoming-approval-modal');
    const btnAcceptIncoming = document.getElementById('btn-accept-incoming');
    const btnRejectIncoming = document.getElementById('btn-reject-incoming');

    function closeAuthModal() {
      if (authModal) authModal.classList.add('hidden');
    }
    if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', closeAuthModal);
    if (btnCancelAuthModal) btnCancelAuthModal.addEventListener('click', closeAuthModal);

    if (btnDeleteAuthModal) {
      btnDeleteAuthModal.addEventListener('click', () => {
        const tId = targetIdFormat(authModalDeviceId.value.trim());
        if (tId) {
          removeSavedDevice(tId);
          closeAuthModal();
        }
      });
    }

    // Connect without password -> sends approval request to the remote PC ("Aceitar Conexão -> Controle Total")
    if (btnRequestApprovalModal) {
      btnRequestApprovalModal.addEventListener('click', () => {
        const tId = targetIdFormat(authModalDeviceId.value.trim());
        const alias = authModalAlias.value.trim();
        if (!tId || tId.replace(/\D/g, '').length < 9) {
          alert('Digite um ID válido de 9 dígitos.');
          return;
        }
        if (alias) upsertSavedDevice(tId, { alias });
        remoteDeviceIdInput.value = tId;
        remotePasswordInput.value = '';
        closeAuthModal();
        startRemoteConnection(false, true);
      });
    }

    // Remote Host PC clicks "Aceitar (Controle Total)"
    if (btnAcceptIncoming) {
      btnAcceptIncoming.addEventListener('click', () => {
        if (incomingApprovalModal) incomingApprovalModal.classList.add('hidden');
        if (pendingApprovalSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
          signalingWs.send(JSON.stringify({
            type: 'host_approval_response',
            sessionId: pendingApprovalSessionId,
            accepted: true
          }));
        }
      });
    }

    if (btnRejectIncoming) {
      btnRejectIncoming.addEventListener('click', () => {
        if (incomingApprovalModal) incomingApprovalModal.classList.add('hidden');
        if (pendingApprovalSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
          signalingWs.send(JSON.stringify({
            type: 'host_approval_response',
            sessionId: pendingApprovalSessionId,
            accepted: false
          }));
        }
        pendingApprovalSessionId = null;
      });
    }

    if (btnSaveOnlyAuthModal) {
      btnSaveOnlyAuthModal.addEventListener('click', () => {
        const tId = targetIdFormat(authModalDeviceId.value.trim());
        const alias = authModalAlias.value.trim();
        const pwd = authModalPassword.value.trim();
        if (!tId || tId.replace(/\D/g, '').length < 9) {
          alert('Digite um ID válido de 9 dígitos.');
          return;
        }
        upsertSavedDevice(tId, {
          alias: alias || 'Computador Remoto',
          favorite: true,
          savedPassword: authModalRemember.checked ? pwd : ''
        });
        closeAuthModal();
      });
    }

    if (authModalDeviceId) {
      authModalDeviceId.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').substring(0, 9);
        if (v.length > 6) v = `${v.substring(0, 3)} ${v.substring(3, 6)} ${v.substring(6, 9)}`;
        else if (v.length > 3) v = `${v.substring(0, 3)} ${v.substring(3, 6)}`;
        e.target.value = v;
      });
    }

    if (btnAddFavoriteDevice) {
      btnAddFavoriteDevice.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal('', '', true);
      });
    }

    if (authModalForm) {
      authModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tId = targetIdFormat(authModalDeviceId.value.trim());
        const alias = authModalAlias.value.trim();
        const pwd = authModalPassword.value.trim();
        if (!tId || tId.replace(/\D/g, '').length < 9 || !pwd) return;

        upsertSavedDevice(tId, {
          alias: alias || undefined,
          savedPassword: authModalRemember.checked ? pwd : ''
        });
        remoteDeviceIdInput.value = tId;
        remotePasswordInput.value = pwd;
        closeAuthModal();
        startRemoteConnection();
      });
    }

    // Window controls (Real native Win32 minimize — NO alert() or confirm() that freezes remote control!)
    if (winClose) {
      winClose.addEventListener('click', () => {
        // Minimize instead of closing if a remote session is active as host, or close cleanly without blocking dialog
        if (activeSessionId) {
          fetch('/api/system/minimize', { method: 'POST' }).catch(() => {});
        } else {
          window.close();
        }
      });
    }
    if (winMinimize) {
      winMinimize.addEventListener('click', () => {
        fetch('/api/system/minimize', { method: 'POST' }).catch(() => {});
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

    // Windows Auto-Start Toggle (Syncs directly with Windows Registry HKCU\...\Run via /api/system/autostart)
    const autostartToggle = document.getElementById('autostart-toggle');
    const autostartSavedPill = document.getElementById('autostart-saved-pill');
    if (autostartToggle) {
      fetch('/api/system/autostart')
        .then(r => r.json())
        .then(data => {
          if (data && typeof data.enabled === 'boolean') {
            autostartToggle.checked = data.enabled;
            if (autostartSavedPill) autostartSavedPill.classList.toggle('hidden', !data.enabled);
          }
        })
        .catch(() => {});

      autostartToggle.addEventListener('change', async () => {
        const enable = autostartToggle.checked;
        try {
          const res = await fetch('/api/system/autostart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: enable })
          });
          const data = await res.json();
          if (data && data.status === 'ok') {
            if (autostartSavedPill) autostartSavedPill.classList.toggle('hidden', !enable);
          }
        } catch (e) {
          alert('Erro ao atualizar inicialização com o Windows.');
        }
      });
    }

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
        if (text) {
          sendRemoteControlCommand({
            type: 'clipboard_sync',
            text
          });
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
        sendRemoteControlCommand({ type: 'restart_request' });
        alert('Solicitação de reinicialização enviada.');
      }
    });

    const selectStreamQuality = document.getElementById('select-stream-quality');
    if (selectStreamQuality) {
      selectStreamQuality.addEventListener('change', () => {
        const mode = selectStreamQuality.value;
        const preset =
          mode === 'ultra' ? { maxWidth: 1920, quality: 84, fps: 16 } :
          mode === 'high'  ? { maxWidth: 1600, quality: 70, fps: 22 } :
                             { maxWidth: 1366, quality: 58, fps: 25 };
        sendRemoteControlCommand({
          type: 'set_quality',
          maxWidth: preset.maxWidth,
          quality: preset.quality,
          fps: preset.fps
        });
      });
    }

    setupRemoteInputCapture();
  }

  let inputSeqCounter = 0;
  function sendRemoteControlCommand(cmd) {
    const payload = {
      ...cmd,
      seq: `${myDeviceId || 'ctrl'}-${++inputSeqCounter}-${Date.now()}`
    };
    if (inputDataChannel && inputDataChannel.readyState === 'open') {
      try {
        inputDataChannel.send(JSON.stringify(payload));
        return;
      } catch (e) {}
    }
    if (activeSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify({
        type: 'relay_input',
        sessionId: activeSessionId,
        cmd: payload
      }));
    }
  }

  let hasCapturedCanvasThumb = false;
  const incomingFrameChunks = new Map();
  let lastRenderedFrameSeq = -1;
  let isDecodingFrame = false;
  let pendingNextFrame = null;
  const reusableFrameImage = new Image();

  reusableFrameImage.onload = () => {
    if (remoteCanvas) {
      if (remoteCanvas.width !== reusableFrameImage.width || remoteCanvas.height !== reusableFrameImage.height) {
        remoteCanvas.width = reusableFrameImage.width;
        remoteCanvas.height = reusableFrameImage.height;
      }
      const ctx = remoteCanvas.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(reusableFrameImage, 0, 0);
      if (remoteVideo && !remoteVideo.classList.contains('hidden')) {
        remoteVideo.classList.add('hidden');
      }
      if (remoteCanvas.classList.contains('hidden')) {
        remoteCanvas.classList.remove('hidden');
      }
      if (videoLoader && !videoLoader.classList.contains('hidden')) {
        videoLoader.classList.add('hidden');
      }
      if (metricResolution) {
        metricResolution.textContent = `${reusableFrameImage.width}x${reusableFrameImage.height} HD | Controle Total Ativo`;
      }
    }
    isDecodingFrame = false;
    if (pendingNextFrame) {
      const next = pendingNextFrame;
      pendingNextFrame = null;
      renderIncomingDesktopFrame(next.width, next.height, next.jpeg, next.seq);
    }
  };

  reusableFrameImage.onerror = () => {
    isDecodingFrame = false;
    pendingNextFrame = null;
  };

  function renderIncomingDesktopFrame(width, height, jpegB64, seq = 0) {
    if (!remoteCanvas || !jpegB64) return;
    // Strict monotonic sequence check: NEVER allow a delayed frame to overwrite a newer frame (eliminates all flickering!)
    if (seq > 0 && seq <= lastRenderedFrameSeq) {
      return;
    }
    if (seq > 0) {
      lastRenderedFrameSeq = seq;
    }

    if (!hasCapturedCanvasThumb && remoteDeviceIdInput.value) {
      hasCapturedCanvasThumb = true;
      try {
        upsertSavedDevice(remoteDeviceIdInput.value, { thumbnail: `data:image/jpeg;base64,${jpegB64}` });
      } catch (e) {}
    }

    if (isDecodingFrame) {
      // Queue only the latest frame (drop intermediate stale frames) so there is zero lag or flicker
      pendingNextFrame = { width, height, jpeg: jpegB64, seq };
      return;
    }

    isDecodingFrame = true;
    reusableFrameImage.src = `data:image/jpeg;base64,${jpegB64}`;
  }

  function generateRandomPassword() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${p1}-${p2}`;
  }

  // Local Input & Native Desktop Capture Agent (Win32 SendInput + CopyFromScreen Worker)
  function connectToLocalInputAgent() {
    try {
      localInputWs = new WebSocket(LOCAL_INPUT_WS_URL);
      localInputWs.onopen = () => {
        console.log('[RemoteX] Conectado ao agente nativo Win32 (SendInput + Screen Capture).');
      };
      localInputWs.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          // If the remote user typed a reply inside the native Windows TopMost Chat Popup, send it to the other peer!
          if (data.status === 'chat_reply' && data.text) {
            const timeStr = data.timestamp || new Date().toTimeString().slice(0, 5);
            if (chatDataChannel && chatDataChannel.readyState === 'open') {
              chatDataChannel.send(JSON.stringify({
                type: 'chat_message',
                text: data.text,
                timestamp: timeStr
              }));
            } else if (activeSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
              signalingWs.send(JSON.stringify({
                type: 'relay_chat',
                sessionId: activeSessionId,
                text: data.text,
                timestamp: timeStr
              }));
            }
            appendChatMessage(data.text, 'outgoing', timeStr);
            return;
          }
          if (data.status === 'frame' && activeSessionId) {
            const b64 = data.jpeg || '';
            const frameSeq = data.seq || Date.now();
            const activeVideoChannel = (videoDataChannel && videoDataChannel.readyState === 'open')
              ? videoDataChannel
              : ((inputDataChannel && inputDataChannel.readyState === 'open') ? inputDataChannel : null);

            // Prefer dedicated WebRTC DataChannel if open (max 256KB buffer, 60KB chunks for instant 22 FPS!)
            if (activeVideoChannel) {
              if (activeVideoChannel.bufferedAmount < 256 * 1024) {
                const MAX_CHUNK = 60000;
                if (b64.length <= MAX_CHUNK) {
                  activeVideoChannel.send(JSON.stringify({
                    type: 'native_frame',
                    seq: frameSeq,
                    width: data.width,
                    height: data.height,
                    jpeg: b64
                  }));
                } else {
                  const frameId = frameSeq + '-' + Math.random().toString(36).slice(2, 5);
                  const total = Math.ceil(b64.length / MAX_CHUNK);
                  for (let i = 0; i < total; i++) {
                    activeVideoChannel.send(JSON.stringify({
                      type: 'native_frame_chunk',
                      frameId,
                      seq: frameSeq,
                      idx: i,
                      total,
                      width: data.width,
                      height: data.height,
                      chunk: b64.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK)
                    }));
                  }
                }
              }
            } else if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
              const now = performance.now();
              if (now - lastRelayFrameSentAt >= 110) {
                lastRelayFrameSentAt = now;
                signalingWs.send(JSON.stringify({
                  type: 'relay_frame',
                  sessionId: activeSessionId,
                  seq: frameSeq,
                  width: data.width,
                  height: data.height,
                  jpeg: b64
                }));
              }
            }
          }
        } catch (e) {}
      };
      localInputWs.onclose = () => {
        setTimeout(connectToLocalInputAgent, 2000);
      };
    } catch (e) {
      console.warn('[RemoteX] Agente local offline:', e);
    }
  }

  // Signaling Server Connection
  let signalingFailCount = 0;

  function connectToSignaling() {
    updateSignalingStatus('disconnected', 'Conectando ao Servidor...');
    let opened = false;
    try {
      signalingWs = new WebSocket(SIGNALING_URL);

      signalingWs.onopen = () => {
        opened = true;
        signalingFailCount = 0;
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
        if (!opened) {
          signalingFailCount++;
          // Se o túnel antigo falhar ao conectar, faz fallback automático para o novo túnel ou servidor local
          if (signalingFailCount >= 1 && SIGNALING_URL !== DEFAULT_LOCAL_SIGNALING_URL) {
            const fallbackUrl = (discoveredCloudUrl && SIGNALING_URL !== discoveredCloudUrl)
              ? discoveredCloudUrl
              : DEFAULT_LOCAL_SIGNALING_URL;
            console.warn(`[Signaling] Falha ao conectar em ${SIGNALING_URL}. Alternando automaticamente para ${fallbackUrl}`);
            SIGNALING_URL = fallbackUrl;
            localStorage.setItem('remotex_signaling_url', SIGNALING_URL);
            const settingInput = document.getElementById('setting-signaling-url');
            if (settingInput) settingInput.value = SIGNALING_URL;
            setTimeout(connectToSignaling, 500);
            return;
          }
        }
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
    if (signalingStatusEl) {
      signalingStatusEl.style.background = status === 'connected' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.15)';
      signalingStatusEl.style.borderColor = status === 'connected' ? 'rgba(16, 185, 129, 0.28)' : 'rgba(245, 158, 11, 0.35)';
      signalingStatusEl.style.color = status === 'connected' ? '#34D399' : '#FCD34D';
    }
    const topDot = document.getElementById('top-status-dot');
    if (topDot) {
      topDot.style.backgroundColor = status === 'connected' ? '#10B981' : '#F59E0B';
      topDot.style.boxShadow = status === 'connected' ? '0 0 8px #10B981' : '0 0 8px #F59E0B';
    }
    if (signalingTextEl) signalingTextEl.textContent = text;
    const sidebarStatus = document.getElementById('sidebar-status-text');
    if (sidebarStatus) sidebarStatus.textContent = status === 'connected' ? 'Online' : 'Conectando...';
    const hostBadge = document.getElementById('host-status-badge');
    if (hostBadge) {
      hostBadge.textContent = status === 'connected'
        ? 'RemoteX Global Mesh P2P Ativo — Pronto para conectar a qualquer computador sem configuração.'
        : 'Conectando à Rede Global RemoteX...';
    }
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

      case 'waiting_host_approval':
        showConnectError('Solicitação enviada! Aguardando o outro computador clicar em "Aceitar (Controle Total)"...');
        break;

      case 'incoming_approval_request': {
        pendingApprovalSessionId = msg.sessionId;
        const incomingModal = document.getElementById('incoming-approval-modal');
        const incomingDesc = document.getElementById('incoming-approval-desc');
        if (incomingDesc && msg.fromClient) {
          const fromLabel = msg.fromClient.deviceId
            ? `${msg.fromClient.hostname || 'Controlador'} (${msg.fromClient.deviceId})`
            : (msg.fromClient.hostname || 'Controlador RemoteX');
          incomingDesc.innerHTML = `<strong>${escapeHtml(fromLabel)}</strong> está solicitando acesso a este computador. Ao aceitar, o controlador terá <strong>Controle Total</strong>:`;
        }
        if (incomingModal) incomingModal.classList.remove('hidden');
        try { window.focus(); } catch (e) {}
        break;
      }

      case 'connect_accepted':
        clearConnectError();
        hasCapturedCanvasThumb = false;
        lastRenderedFrameSeq = -1;
        isDecodingFrame = false;
        pendingNextFrame = null;
        incomingFrameChunks.clear();
        activeSessionId = msg.sessionId;
        saveRecentDevice(msg.targetDeviceId);
        await setupClientPeerConnection(msg.targetDeviceId, msg.iceServers);
        break;

      case 'incoming_connection':
        activeSessionId = msg.sessionId;
        await handleIncomingHostSession(msg.sessionId, msg.fromClient);
        break;

      case 'relay_frame':
        // Ignore slow Global Mesh relay_frame whenever direct WebRTC DataChannel is already open!
        if ((videoDataChannel && videoDataChannel.readyState === 'open') ||
            (inputDataChannel && inputDataChannel.readyState === 'open')) {
          break;
        }
        if (msg.jpeg) {
          renderIncomingDesktopFrame(msg.width, msg.height, msg.jpeg, msg.seq || 0);
        }
        break;

      case 'relay_input':
        if (msg.cmd) {
          handleHostControlCommand(msg.cmd);
        }
        break;

      case 'relay_chat':
        if (msg.text) {
          handleIncomingChatMessage(msg.text, msg.timestamp);
        }
        break;

      case 'sdp_offer':
        if (!peerConnection) {
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
        endSessionLocally();
        showConnectError(msg.reason || 'Sessão finalizada.');
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

  // Host Mode: Handle incoming connection request -> Instant Full Control via Native Win32 Agent
  async function handleIncomingHostSession(sessionId, fromClient) {
    activeSessionId = sessionId;
    pendingIceCandidates = [];
    hostActiveNotice.classList.remove('hidden');
    btnStartHostScreen.classList.add('active');
    hostStreamLabel.textContent = 'Controle Total Ativo';

    // 1. Iniciar imediatamente captura de tela nativa Win32 em Alta Velocidade HD (1600p @ 70% @ 22 FPS) e minimizar janela local
    if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
      localInputWs.send(JSON.stringify({
        type: 'start_capture',
        fps: 22,
        quality: 70,
        maxWidth: 1600
      }));
      localInputWs.send(JSON.stringify({
        type: 'minimize_window'
      }));
    }

    // 2. Criar PeerConnection imediatamente para preparar canais e receber candidatos
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
      } else if (channel.label === 'remotex-video') {
        videoDataChannel = channel;
        channel.onopen = () => {
          if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
            localInputWs.send(JSON.stringify({ type: 'webrtc_p2p_status', active: true }));
          }
        };
        channel.onclose = () => {
          if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
            localInputWs.send(JSON.stringify({ type: 'webrtc_p2p_status', active: false }));
          }
        };
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

    // 3. Se o host já tiver stream de vídeo WebRTC pré-autorizado, anexa; caso contrário usa o stream nativo Win32 sem bloquear!
    if (hostMediaStream && hostMediaStream.active) {
      hostMediaStream.getTracks().forEach(track => {
        if ('contentHint' in track) track.contentHint = 'motion';
        pc.addTrack(track, hostMediaStream);
      });
    }

    // 4. Processar oferta SDP imediatamente
    if (pendingOffer) {
      const offerToProcess = pendingOffer;
      pendingOffer = null;
      await processSdpOffer(offerToProcess.sessionId, offerToProcess.sdp, offerToProcess.fromDeviceId);
    }
  }

  function handleHostControlCommand(cmd) {
    if (!cmd) return;
    if (cmd.type === 'clipboard_sync') {
      navigator.clipboard.writeText(cmd.text).catch(() => {});
    }
    if (cmd.type === 'switch_monitor') {
      if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
        localInputWs.send(JSON.stringify({ type: 'capture_frame' }));
      }
      return;
    }
    if (cmd.type === 'restart_request') {
      fetch('/api/system/restart', { method: 'POST' }).catch(() => {});
      return;
    }
    // Forward mouse, keyboard & clipboard directly to local Win32 SendInput agent
    if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
      localInputWs.send(JSON.stringify(cmd));
    }
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
        handleHostControlCommand(cmd);
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

  function getSavedDevicesMap() {
    try {
      return JSON.parse(localStorage.getItem('remotex_devices_meta') || '{}');
    } catch (e) {
      return {};
    }
  }

  function upsertSavedDevice(deviceId, updates) {
    const cleanId = targetIdFormat(deviceId);
    const map = getSavedDevicesMap();
    const existing = map[cleanId] || {
      id: cleanId,
      alias: '',
      favorite: false,
      savedPassword: '',
      thumbnail: null,
      wallpaperIdx: Math.abs(cleanId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 4
    };
    map[cleanId] = { ...existing, ...updates, id: cleanId };
    localStorage.setItem('remotex_devices_meta', JSON.stringify(map));

    let recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]');
    if (!recents.includes(cleanId)) {
      recents.unshift(cleanId);
      localStorage.setItem('remotex_recents', JSON.stringify(recents));
    }
    localStorage.setItem('remotex_recents_initialized', 'true');
    loadRecentDevices(currentFilterMode);
  }

  function removeSavedDevice(deviceId) {
    const cleanId = targetIdFormat(deviceId);
    let recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]').map(targetIdFormat);
    recents = recents.filter(d => d !== cleanId);
    localStorage.setItem('remotex_recents', JSON.stringify(recents));
    localStorage.setItem('remotex_recents_initialized', 'true');

    const map = getSavedDevicesMap();
    if (map[cleanId]) {
      delete map[cleanId];
      localStorage.setItem('remotex_devices_meta', JSON.stringify(map));
    }
    loadRecentDevices(currentFilterMode);
  }

  function openAuthModal(deviceId, alias = '', isAddMode = false) {
    const authModal = document.getElementById('auth-modal');
    const authModalTitle = document.getElementById('auth-modal-title');
    const authModalDeviceId = document.getElementById('auth-modal-device-id');
    const authModalAlias = document.getElementById('auth-modal-alias');
    const authModalPassword = document.getElementById('auth-modal-password');
    const btnDeleteAuthModal = document.getElementById('btn-delete-auth-modal');
    if (!authModal) return;

    const cleanId = deviceId ? targetIdFormat(deviceId) : '';
    const map = getSavedDevicesMap();
    const meta = map[cleanId] || {};

    if (authModalTitle) {
      authModalTitle.textContent = isAddMode
        ? 'Adicionar / Conectar Computador'
        : `Conectar a ${meta.alias ? meta.alias + ' (' + cleanId + ')' : cleanId}`;
    }
    if (authModalDeviceId) authModalDeviceId.value = cleanId;
    if (authModalAlias) authModalAlias.value = alias || meta.alias || '';
    if (authModalPassword) authModalPassword.value = meta.savedPassword || '';
    if (btnDeleteAuthModal) btnDeleteAuthModal.classList.toggle('hidden', isAddMode || !cleanId);

    authModal.classList.remove('hidden');
    setTimeout(() => {
      if (!cleanId && authModalDeviceId) authModalDeviceId.focus();
      else if (authModalPassword) authModalPassword.focus();
    }, 60);
  }

  // Auto Reconnection Handler
  function setupPeerConnectionAutoReconnect(pc) {
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE Connection State: ${state}`);
      if (state === 'Connected' || state === 'connected' || state === 'completed') {
        reconnectingOverlay.classList.add('hidden');
        sessionStatusDot.classList.remove('warning');
      }
    };
  }

  // Client/Viewer Mode: Initiate connection to target
  function startRemoteConnection(openFilesAfterConnect = false, forceApprovalRequest = false) {
    clearConnectError();
    const targetId = targetIdFormat(remoteDeviceIdInput.value.trim());
    let password = forceApprovalRequest ? '' : remotePasswordInput.value.trim();

    if (!targetId || targetId.replace(/\D/g, '').length < 9) {
      showConnectError('Insira um endereço remoto válido (9 dígitos).');
      remoteDeviceIdInput.focus();
      return;
    }

    // Check if we have a saved password for this device (unless user explicitly requested interactive approval)
    if (!password && !forceApprovalRequest) {
      const map = getSavedDevicesMap();
      if (map[targetId] && map[targetId].savedPassword) {
        password = map[targetId].savedPassword;
        remotePasswordInput.value = password;
      }
      // Note: If no password is entered, we connect directly in AnyDesk Approval Mode (prompts "Aceitar (Controle Total)" on the other PC!)
    }

    pendingAutoOpenFiles = !!openFilesAfterConnect;
    btnConnect.disabled = true;

    signalingWs.send(JSON.stringify({
      type: 'connect_request',
      targetDeviceId: targetId,
      password: password,
      clientInfo: { hostname: 'Controlador RemoteX', deviceId: myDeviceId }
    }));
  }

  function captureVideoThumbnail(targetDeviceId) {
    try {
      if (!remoteVideo || !remoteVideo.videoWidth || !remoteVideo.videoHeight) return;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      upsertSavedDevice(targetDeviceId, { thumbnail: dataUrl });
    } catch (e) {}
  }

  async function setupClientPeerConnection(targetDeviceId, iceServers) {
    pendingIceCandidates = [];
    pendingOffer = null;

    const pc = new RTCPeerConnection({
      iceServers: (iceServers && iceServers.length) ? iceServers : DEFAULT_ICE_SERVERS
    });
    peerConnection = pc;

    setupPeerConnectionAutoReconnect(pc);

    // 1. Data Channel: Input (Dedicated exclusively to low-latency Mouse/Keyboard/Ping)
    inputDataChannel = pc.createDataChannel('remotex-input', {
      ordered: true
    });
    inputDataChannel.onopen = () => {
      console.log('[Controller] Canal de dados de entrada ativo.');
      startPingMonitoring();
    };

    function handleIncomingVideoDataMessage(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'pong') {
          const rtt = Math.round(performance.now() - data.sendTime);
          metricPing.textContent = `${rtt} ms`;
        } else if (data.type === 'native_frame' && data.jpeg) {
          renderIncomingDesktopFrame(data.width, data.height, data.jpeg, data.seq || 0);
        } else if (data.type === 'native_frame_chunk') {
          let entry = incomingFrameChunks.get(data.frameId);
          if (!entry) {
            entry = { parts: new Array(data.total), count: 0, width: data.width, height: data.height, seq: data.seq || 0 };
            incomingFrameChunks.set(data.frameId, entry);
            if (incomingFrameChunks.size > 4) {
              const oldest = incomingFrameChunks.keys().next().value;
              incomingFrameChunks.delete(oldest);
            }
          }
          entry.parts[data.idx] = data.chunk;
          entry.count++;
          if (entry.count === data.total) {
            incomingFrameChunks.delete(data.frameId);
            renderIncomingDesktopFrame(entry.width, entry.height, entry.parts.join(''), entry.seq);
          }
        }
      } catch (err) {}
    }

    inputDataChannel.onmessage = handleIncomingVideoDataMessage;

    // 1B. Dedicated Data Channel for HD Video Frames (prevents mouse movement & video frames from interfering!)
    videoDataChannel = pc.createDataChannel('remotex-video', {
      ordered: true
    });
    videoDataChannel.onmessage = handleIncomingVideoDataMessage;

    // 2. Data Channel: Chat
    chatDataChannel = pc.createDataChannel('remotex-chat', { ordered: true });
    setupChatChannelListener(chatDataChannel);

    // 3. Data Channel: File Transfer
    fileDataChannel = pc.createDataChannel('remotex-files', { ordered: true });
    setupFileChannelListener(fileDataChannel);
    fileDataChannel.onopen = () => {
      if (pendingAutoOpenFiles) {
        pendingAutoOpenFiles = false;
        isFilesOpen = true;
        fileModal.classList.remove('hidden');
      }
    };

    // Receive remote video stream
    pc.ontrack = (event) => {
      console.log('[Controller] Stream de vídeo remoto recebido com sucesso!', event.streams[0]);
      videoLoader.classList.add('hidden');
      if (remoteCanvas) remoteCanvas.classList.add('hidden');
      remoteVideo.classList.remove('hidden');
      if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
      remoteVideo.play().catch(e => console.warn('[Video] Play caught:', e));
      
      event.track.onloadedmetadata = () => {
        metricResolution.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
        setTimeout(() => captureVideoThumbnail(targetDeviceId), 1200);
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

    // Activate AnyDesk-style Top Session Tab
    const formattedTarget = targetIdFormat(targetDeviceId);
    const tabBtnHome = document.getElementById('tab-btn-home');
    const tabBtnActiveSession = document.getElementById('tab-btn-active-session');
    const tabActiveSessionLabel = document.getElementById('tab-active-session-label');
    if (tabBtnActiveSession) {
      tabBtnActiveSession.classList.remove('hidden');
      tabBtnActiveSession.classList.add('active');
    }
    if (tabBtnHome) tabBtnHome.classList.remove('active');
    if (tabActiveSessionLabel) tabActiveSessionLabel.textContent = formattedTarget;

    // Open session UI overlay
    sessionTargetName.textContent = `Computador Remoto: ${formattedTarget}`;
    sessionOverlay.classList.remove('hidden');
    videoLoader.classList.remove('hidden');
    resetConnectButton();
  }

  // Chat Subsystem (Auto-opens on screen whenever a message is sent or received + triggers native TopMost Windows chat box on Host)
  function openChatBoxOnScreen() {
    isChatOpen = true;
    if (chatDrawer) chatDrawer.classList.remove('hidden');
    unreadChatCount = 0;
    if (chatBadge) {
      chatBadge.classList.add('hidden');
      chatBadge.textContent = '0';
    }
  }

  function handleIncomingChatMessage(text, timeStr) {
    openChatBoxOnScreen();
    appendChatMessage(text, 'incoming', timeStr);
    // Also trigger the native Windows TopMost Chat Popup via RemoteXInput.exe so it appears over any open app (PDF, Chrome, Word, etc.)
    if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
      localInputWs.send(JSON.stringify({
        type: 'chat_popup',
        sender: 'Remoto',
        text,
        timestamp: timeStr || ''
      }));
    }
  }

  function setupChatChannelListener(channel) {
    channel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'chat_message') {
          handleIncomingChatMessage(msg.text, msg.timestamp);
        }
      } catch (err) {}
    };
  }

  function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    openChatBoxOnScreen();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (chatDataChannel && chatDataChannel.readyState === 'open') {
      chatDataChannel.send(JSON.stringify({
        type: 'chat_message',
        text,
        timestamp: timeStr
      }));
    } else if (activeSessionId && signalingWs && signalingWs.readyState === WebSocket.OPEN) {
      signalingWs.send(JSON.stringify({
        type: 'relay_chat',
        sessionId: activeSessionId,
        text,
        timestamp: timeStr
      }));
    }
    appendChatMessage(text, 'outgoing', timeStr);
    chatInput.value = '';
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

  // Interactive Remote Mouse and Keyboard Input Capture (Works on both Native Canvas & WebRTC Video, over P2P or Global Mesh)
  function setupRemoteInputCapture() {
    let lastMoveTime = 0;

    function getActiveSurface() {
      if (remoteCanvas && !remoteCanvas.classList.contains('hidden')) return remoteCanvas;
      return remoteVideo;
    }

    function computeNormalizedCoords(e) {
      const surface = getActiveSurface();
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0.5, y: 0.5 };
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x: normX, y: normY };
    }

    const targetSurface = videoWrapper || remoteVideo;

    // Mouse Move (Throttled to ~45Hz for smooth transmission across both P2P and Global Mesh)
    targetSurface.addEventListener('mousemove', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;

      const now = performance.now();
      const minInterval = (inputDataChannel && inputDataChannel.readyState === 'open') ? 16 : 35;
      if (now - lastMoveTime < minInterval) return;
      lastMoveTime = now;

      const coords = computeNormalizedCoords(e);
      sendRemoteControlCommand({
        type: 'mouse_move',
        x: coords.x,
        y: coords.y
      });
    });

    // Mouse Down (includes exact click coordinates so clicks & drags always land at the exact spot)
    targetSurface.addEventListener('mousedown', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;
      e.preventDefault();
      targetSurface.focus();

      const coords = computeNormalizedCoords(e);
      sendRemoteControlCommand({
        type: 'mouse_down',
        button: e.button,
        x: coords.x,
        y: coords.y
      });
    });

    // Mouse Up
    targetSurface.addEventListener('mouseup', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;
      e.preventDefault();

      const coords = computeNormalizedCoords(e);
      sendRemoteControlCommand({
        type: 'mouse_up',
        button: e.button,
        x: coords.x,
        y: coords.y
      });
    });

    targetSurface.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Mouse Wheel
    targetSurface.addEventListener('wheel', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;
      e.preventDefault();

      sendRemoteControlCommand({
        type: 'mouse_wheel',
        deltaY: e.deltaY > 0 ? 120 : -120
      });
    }, { passive: false });

    // Keyboard Events (captured when sessionOverlay is visible — ZERO duplication!)
    window.addEventListener('keydown', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;
      if (sessionOverlay.classList.contains('hidden')) return;
      if (document.activeElement === chatInput) return;
      if (e.key === 'F12') return;
      e.preventDefault();

      // Printable single characters (letters, numbers, punctuation, symbols) -> send ONLY Unicode 'text'
      // Do NOT send 'key_down' for printable chars, otherwise Windows types every character twice!
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        sendRemoteControlCommand({
          type: 'text',
          text: e.key
        });
        return;
      }

      // Control keys (Backspace, Enter, Tab, Escape, Delete, Arrows) & Keyboard Shortcuts (Ctrl+C, Ctrl+V, Alt+Tab)
      sendRemoteControlCommand({
        type: 'key_down',
        key: e.key,
        code: e.code,
        vkCode: e.keyCode
      });
    });

    window.addEventListener('keyup', (e) => {
      if (!isInputControlEnabled || !activeSessionId) return;
      if (sessionOverlay.classList.contains('hidden')) return;
      if (document.activeElement === chatInput) return;
      // Ignore keyup for printable characters that were handled via 'text'
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;
      e.preventDefault();

      sendRemoteControlCommand({
        type: 'key_up',
        key: e.key,
        code: e.code,
        vkCode: e.keyCode
      });
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
    if (videoDataChannel) {
      videoDataChannel.close();
      videoDataChannel = null;
    }
    if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
      localInputWs.send(JSON.stringify({ type: 'webrtc_p2p_status', active: false }));
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
    if (localInputWs && localInputWs.readyState === WebSocket.OPEN) {
      localInputWs.send(JSON.stringify({ type: 'stop_capture' }));
    }
    sessionOverlay.classList.add('hidden');
    if (remoteCanvas) remoteCanvas.classList.add('hidden');
    hostActiveNotice.classList.add('hidden');
    btnStartHostScreen.classList.remove('active');
    hostStreamLabel.textContent = 'Compartilhar Tela';
    fileModal.classList.add('hidden');
    chatDrawer.classList.add('hidden');
    remoteVideo.srcObject = null;
    const tabBtnHome = document.getElementById('tab-btn-home');
    const tabBtnActiveSession = document.getElementById('tab-btn-active-session');
    if (tabBtnActiveSession) {
      tabBtnActiveSession.classList.add('hidden');
      tabBtnActiveSession.classList.remove('active');
    }
    if (tabBtnHome) tabBtnHome.classList.add('active');
    resetConnectButton();
  }

  // Helpers
  function showConnectError(msg) {
    connectErrorEl.textContent = msg;
    connectErrorEl.classList.remove('hidden');
    setTimeout(() => {
      connectErrorEl.classList.add('hidden');
    }, 6000);
  }

  function clearConnectError() {
    connectErrorEl.textContent = '';
    connectErrorEl.classList.add('hidden');
  }

  function resetConnectButton() {
    btnConnect.disabled = false;
  }

  function targetIdFormat(id) {
    const clean = String(id).replace(/\D/g, '');
    if (clean.length === 9) {
      return `${clean.substring(0, 3)} ${clean.substring(3, 6)} ${clean.substring(6, 9)}`;
    }
    return String(id).trim();
  }

  function saveRecentDevice(deviceId) {
    const clean = targetIdFormat(deviceId);
    let recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]');
    recents = recents.filter(d => targetIdFormat(d) !== clean);
    recents.unshift(clean);
    if (recents.length > 12) recents.pop();
    localStorage.setItem('remotex_recents', JSON.stringify(recents));
    const enteredPwd = remotePasswordInput.value.trim();
    if (enteredPwd) {
      upsertSavedDevice(clean, { savedPassword: enteredPwd });
    } else {
      loadRecentDevices(currentFilterMode);
    }
  }

  function loadRecentDevices(filter = 'all') {
    currentFilterMode = filter;
    let recents = JSON.parse(localStorage.getItem('remotex_recents') || '[]').map(targetIdFormat);
    let metaMap = getSavedDevicesMap();

    // Se a lista estiver vazia APENAS na primeira execução (nunca se o usuário excluiu os cards)
    if (recents.length === 0 && localStorage.getItem('remotex_recents_initialized') !== 'true') {
      const defaultCards = [
        { id: myDeviceId || '167 009 289', alias: 'Este Dispositivo (Local)', favorite: true, wallpaperIdx: 0 }
      ];
      recents = defaultCards.map(d => d.id);
      defaultCards.forEach(d => {
        metaMap[d.id] = { ...(metaMap[d.id] || {}), ...d };
      });
      localStorage.setItem('remotex_recents', JSON.stringify(recents));
      localStorage.setItem('remotex_devices_meta', JSON.stringify(metaMap));
      localStorage.setItem('remotex_recents_initialized', 'true');
    }

    if (filter === 'discovered' && myDeviceId && !recents.includes(myDeviceId)) {
      recents = [myDeviceId, ...recents];
    }

    let list = recents.map((id, idx) => {
      const m = metaMap[id] || {};
      return {
        id,
        alias: m.alias || (id === myDeviceId ? 'Este Dispositivo (Local)' : ''),
        favorite: !!m.favorite,
        savedPassword: m.savedPassword || '',
        thumbnail: m.thumbnail || null,
        wallpaperIdx: m.wallpaperIdx !== undefined ? m.wallpaperIdx : (idx % 4)
      };
    });

    if (filter === 'favorites') {
      list = list.filter(d => d.favorite);
    }

    recentDevicesList.innerHTML = '';
    if (list.length === 0) {
      recentDevicesList.innerHTML = `
        <div class="recent-empty">
          ${filter === 'favorites'
            ? 'Nenhum computador marcado como favorito (clique na estrela ☆ em uma sessão recente ou em "+ Adicionar Computador").'
            : 'Nenhuma sessão recente registrada ainda. Digite um ID remoto na barra superior ou clique em "+ Adicionar Computador".'}
        </div>
      `;
      return;
    }

    list.forEach((item) => {
      const card = document.createElement('div');
      card.className = `ad-session-card ad-wallpaper-${item.wallpaperIdx}`;
      if (item.thumbnail) {
        card.style.backgroundImage = `url("${item.thumbnail}")`;
      }

      card.innerHTML = `
        <div class="ad-session-card-top">
          <span class="ad-online-badge" title="Pronto na Rede Global Mesh"></span>
          <div class="ad-card-top-actions">
            <button class="ad-star-btn ${item.favorite ? 'favorited' : ''}" title="${item.favorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}">
              ${item.favorite ? '★' : '☆'}
            </button>
            <button class="ad-delete-card-btn" title="Excluir este ID da lista">✕</button>
          </div>
        </div>
        <div class="ad-session-card-bottom">
          <div class="ad-session-info">
            ${item.alias ? `<span class="ad-session-alias">${escapeHtml(item.alias)}</span>` : ''}
            <div class="ad-session-id-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00C2FF" stroke-width="2.2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span>${escapeHtml(item.id)}</span>
            </div>
          </div>
          <button class="ad-card-menu-btn" title="Configurar apelido/senha ou excluir">⋮</button>
        </div>
      `;

      // Toggle Favorite star
      const starBtn = card.querySelector('.ad-star-btn');
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        upsertSavedDevice(item.id, { favorite: !item.favorite });
      });

      // Delete ID button (✕)
      const deleteBtn = card.querySelector('.ad-delete-card-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeSavedDevice(item.id);
        });
      }

      // Context menu button (⋮) -> opens modal to edit alias/saved password
      const menuBtn = card.querySelector('.ad-card-menu-btn');
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAuthModal(item.id, item.alias, false);
      });

      // Clicking card connects (1-click if saved password exists, otherwise opens AnyDesk password modal)
      card.addEventListener('click', () => {
        remoteDeviceIdInput.value = item.id;
        if (item.savedPassword) {
          remotePasswordInput.value = item.savedPassword;
          startRemoteConnection();
        } else {
          openAuthModal(item.id, item.alias, false);
        }
      });

      recentDevicesList.appendChild(card);
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
