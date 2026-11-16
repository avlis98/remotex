# RemoteX – Plataforma Própria de Acesso Remoto

> Plataforma profissional de conexão e controle remoto de alta performance inspirada nas funcionalidades do AnyDesk e TeamViewer, com infraestrutura, sinalização, segurança e controle Win32 próprios.

**Repositório Oficial:** [https://github.com/avlis98/remotex](https://github.com/avlis98/remotex)

---

## 🚀 Status do Projeto

- [x] **ETAPA 1 – MVP FUNCIONAL (Concluída)**
  - [x] Servidor Central de Sinalização (`services/signaling`) com suporte a IDs numéricos de 9 dígitos.
  - [x] Agente Nativo Win32 de Entrada (`native/RemoteXInput`) compilado em .NET 8 com P/Invoke `SendInput` para mouse, teclado e atalhos de sistema.
  - [x] Cliente Desktop & Interface Web (`apps/desktop`) com identidade visual moderna, paleta dark slate, cards de conexão, geração de ID e senha temporária.
  - [x] Estabelecimento de sessão WebRTC ponto a ponto (P2P) criptografada (DTLS-SRTP).
  - [x] Transmissão de tela a 60 FPS com baixa latência.
  - [x] Encerramento seguro de conexão com feedback visual e histórico de conexões recentes.

- [x] **ETAPA 2 – RECURSOS ADICIONAIS (Concluída)**
  - [x] **Gerenciador de Transferência de Arquivos Remoto**:
    - Canal de dados binário dedicado (`remotex-files`) via SCTP DataChannel em chunks de 64KB.
    - Suporte a envio e download nos dois sentidos (Viewer ⇄ Host).
    - Barra de progresso em tempo real com porcentagem e velocidade (KB/s, MB/s).
    - Suporte a arrastar e soltar (drag & drop) e cancelamento.
  - [x] **Chat Integrado na Sessão Remota**:
    - Canal de mensagens instantâneas com carimbo de hora (`remotex-chat`).
    - Badge de mensagens não lidas na barra de ferramentas.
  - [x] **Sincronização de Área de Transferência (Clipboard Sync)**:
    - Botão na barra flutuante para transmitir textos copiados entre os computadores conectados.
  - [x] **Alternância de Múltiplos Monitores**:
    - Menu seletor na barra superior para alternar entre Monitor 1, Monitor 2 e Tela Inteira combinada.
  - [x] **Acesso Não Supervisionado (Unattended Access)**:
    - Ativação manual no painel do Host com definição de senha permanente segura.
    - Autenticação dual no servidor de sinalização (permite conexão via senha temporária ou permanente).
  - [x] **Reconexão Automática**:
    - Detecção de oscilação de rede ICE e banner flutuante de reconexão automática sem perda de contexto.

- [ ] **ETAPA 3 – INFRAESTRUTURA (Próxima Etapa)**
  - [ ] Servidores STUN/TURN dedicados (Pion TURN) para transposição garantida em redes corporativas/CGNAT.
  - [ ] Monitoramento avançado de métricas e otimização dinâmica de taxa de quadros (*congestion control*).

- [ ] **ETAPA 4 – COMERCIALIZAÇÃO**
  - [ ] Painel administrativo web, banco de dados PostgreSQL/Redis e controle de planos e assinaturas.

---

## 🛠️ Arquitetura do Repositório

```
remotex/
├── apps/
│   └── desktop/
│       ├── package.json
│       ├── agent-server.js        # Servidor local do cliente e ponte com o agente Win32
│       └── public/
│           ├── index.html         # Interface com barra superior flutuante, chat, arquivos e monitores
│           ├── styles.css         # Estilização profissional dark theme
│           └── app.js             # Controlador WebRTC (Input, Chat, File Transfer, Clipboard)
├── native/
│   └── RemoteXInput/
│       ├── RemoteXInput.csproj    # Projeto .NET 8 de alto desempenho
│       ├── Program.cs             # Injeção Win32 SendInput (Mouse, Teclado, Multi-monitor)
│       └── bin/Release/net8.0/
│           └── RemoteXInput.exe   # Binário nativo compilado
├── services/
│   └── signaling/
│       ├── package.json
│       └── server.js              # Servidor WebSocket central (Roteamento de IDs, Unattended Access)
├── start-remotex.bat              # Inicializador em 1 clique para Windows
├── start-remotex.ps1              # Script PowerShell de inicialização
└── package.json                   # Orquestrador do monorepo
```

---

## ⚡ Como Baixar e Executar em Outros Computadores

Em qualquer outro computador (Windows 10 ou 11):

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/avlis98/remotex.git
   cd remotex
   ```
2. **Execute o inicializador:**
   - Dê dois cliques em `start-remotex.bat`, ou
   - Execute no PowerShell:
     ```powershell
     .\start-remotex.ps1
     ```
3. O sistema compilará o módulo nativo automaticamente na primeira execução e abrirá a interface em **`http://localhost:3000`**.

---

## 🔒 Segurança e Privacidade (Zero-Knowledge)
- **Criptografia DTLS-SRTP:** A mídia de vídeo e os canais de dados (controle, arquivos e chat) utilizam criptografia de ponta a ponta nativa do protocolo WebRTC.
- **Isolamento de Sinalização:** O servidor central de sinalização gerencia apenas o handshake inicial e nunca tem acesso aos pixels da tela, arquivos transferidos ou teclas digitadas.
- **Acesso Não Supervisionado Seguro:** Somente ativado quando explicitamente habilitado pelo proprietário do computador.
