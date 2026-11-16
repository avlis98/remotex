# RemoteX – Plataforma Própria de Acesso Remoto

> Plataforma profissional de conexão e controle remoto de alta performance inspirada nas funcionalidades do AnyDesk e TeamViewer, com infraestrutura, sinalização, segurança e controle Win32 próprios.

---

## 🚀 Status do Projeto

- [x] **ETAPA 1 – MVP FUNCIONAL (Concluída)**
  - [x] Servidor Central de Sinalização (`services/signaling`) com suporte a IDs numéricos de 9 dígitos.
  - [x] Agente Nativo Win32 de Entrada (`native/RemoteXInput`) compilado em .NET 8 com P/Invoke `SendInput` para mouse, teclado e atalhos de sistema.
  - [x] Cliente Desktop & Interface Web (`apps/desktop`) com identidade visual moderna, paleta dark slate, cards de conexão, geração de ID e senha temporária.
  - [x] Estabelecimento de sessão WebRTC ponto a ponto (P2P) criptografada (DTLS-SRTP).
  - [x] Transmissão de tela a 60 FPS com baixa latência.
  - [x] Encerramento seguro de conexão com feedback visual e histórico de conexões recentes.
- [ ] **ETAPA 2 – RECURSOS ADICIONAIS (Próxima Etapa)**
  - [ ] Transferência bidirecional de arquivos via SCTP DataChannel.
  - [ ] Chat integrado durante a sessão.
  - [ ] Alternância entre múltiplos monitores.
  - [ ] Acesso não supervisionado com senha permanente e serviço em segundo plano.
- [ ] **ETAPA 3 – INFRAESTRUTURA**
  - [ ] Servidor Relay/TURN dedicado com alocação dinâmica.
  - [ ] Monitoramento em tempo real de latência, jitter e controle de congestionamento.
- [ ] **ETAPA 4 – COMERCIALIZAÇÃO**
  - [ ] Painel administrativo web, banco de dados PostgreSQL/Redis e controle de assinaturas.

---

## 🛠️ Arquitetura do Repositório

```
remotex/
├── apps/
│   └── desktop/
│       ├── package.json
│       ├── agent-server.js        # Servidor local do cliente e ponte com o agente Win32
│       └── public/
│           ├── index.html         # Interface inspirada no AnyDesk com barra de controle flutuante
│           ├── styles.css         # Estilização profissional dark theme
│           └── app.js             # Controlador WebRTC, sinalização e captura de mouse/teclado
├── native/
│   └── RemoteXInput/
│       ├── RemoteXInput.csproj    # Projeto .NET 8 de alto desempenho
│       ├── Program.cs             # Injeção Win32 SendInput (Mouse, Teclado, Multi-monitor)
│       └── bin/Release/net8.0/
│           └── RemoteXInput.exe   # Binário nativo compilado
├── services/
│   └── signaling/
│       ├── package.json
│       └── server.js              # Servidor WebSocket central (Roteamento de IDs, SDP, ICE)
├── start-remotex.bat              # Inicializador em 1 clique para Windows
├── start-remotex.ps1              # Script PowerShell de inicialização
└── package.json                   # Orquestrador do monorepo
```

---

## ⚡ Como Executar o RemoteX

### Opção 1: Inicializador Automático (1 Clique)
Basta dar um duplo clique no arquivo **`start-remotex.bat`** ou executar no terminal:
```powershell
.\start-remotex.bat
```

### Opção 2: Manual via Terminal
1. **Iniciar o Servidor de Sinalização:**
   ```powershell
   cd services\signaling
   node server.js
   ```
2. **Iniciar o Cliente Desktop & Agente de Entrada:**
   ```powershell
   cd apps\desktop
   node agent-server.js
   ```
3. Abra **`http://localhost:3000`** no seu navegador para acessar a interface do RemoteX.

---

## 🔒 Segurança e Privacidade (Zero-Knowledge)
- **Criptografia DTLS-SRTP:** A mídia de vídeo e o canal de dados de entrada utilizam criptografia de ponta a ponta nativa do protocolo WebRTC.
- **Isolamento de Sinalização:** O servidor central de sinalização gerencia apenas o handshake inicial (troca de IDs e ofertas SDP) e **não possui acesso** ao conteúdo visual ou às teclas digitadas.
- **Controle Explícito:** O computador controlado exibe aviso visual permanente enquanto a sessão estiver ativa e permite o encerramento imediato pelo botão Desconectar.

