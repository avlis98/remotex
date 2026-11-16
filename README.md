# RemoteX – Plataforma Própria de Acesso Remoto

> Plataforma profissional de conexão e controle remoto de alta performance inspirada nas funcionalidades do AnyDesk e TeamViewer, com infraestrutura, sinalização, segurança, relay dedicado e controle Win32 próprios.

**Repositório Oficial:** [https://github.com/avlis98/remotex](https://github.com/avlis98/remotex)

---

## 🚀 Status do Projeto

- [x] **ETAPA 1 – MVP FUNCIONAL (Concluída)**
  - [x] Servidor Central de Sinalização (`services/signaling`) com suporte a IDs numéricos de 9 dígitos.
  - [x] Agente Nativo Win32 de Entrada (`native/RemoteXInput`) compilado em .NET 8 com P/Invoke `SendInput`.
  - [x] Interface Web Desktop de alta fidelidade visual (paleta navy dark, sidebar, cards Meu ID e Conectar).
  - [x] Estabelecimento de sessão WebRTC ponto a ponto (P2P) criptografada (DTLS-SRTP).
  - [x] Transmissão de tela fluida a 60 FPS com baixa latência.

- [x] **ETAPA 2 – RECURSOS ADICIONAIS (Concluída)**
  - [x] **Gerenciador de Transferência de Arquivos** via SCTP DataChannel dedicado (`remotex-files`) em chunks de 64KB com velocidade e progresso.
  - [x] **Chat Integrado** em tempo real (`remotex-chat`) com badge de não lidas.
  - [x] **Sincronização de Área de Transferência** (Clipboard Sync).
  - [x] **Alternância de Múltiplos Monitores** (Monitor 1, 2 e Tela Inteira combinada).
  - [x] **Acesso Não Supervisionado** com senha permanente protegida e ativação manual.
  - [x] **Reconexão Automática Inteligente** em caso de oscilações de rede.

- [x] **ETAPA 3 – INFRAESTRUTURA DEDICADA & INSTALADOR (Concluída)**
  - [x] **Instalador Oficial Windows 10 e 11**:
    - Script de instalação automática (`setup.bat` e `installer/install.ps1`).
    - Ícone oficial do RemoteX aplicado no executável e nos atalhos.
    - Criação de atalho na Área de Trabalho (`RemoteX.lnk`) e no Menu Iniciar.
    - Opção de inicialização automática com o Windows (Autorun no Registro).
    - Desinstalador limpo (`uninstall.bat`).
  - [x] **Servidor STUN / TURN / Relay Próprio (`services/relay`)**:
    - Servidor STUN próprio em UDP 3478 para NAT Discovery.
    - Túneis Relay de alta velocidade (porta 8081) para transposição garantida em redes com firewall restritivo ou CGNAT simétrico.
    - Arquitetura *Zero-Knowledge*: o Relay apenas encaminha os pacotes criptografados e não possui as chaves de sessão.
  - [x] **Telemetria de Desempenho e Qualidade de Conexão em Tempo Real**:
    - Monitoramento de latência RTT (Ping), FPS real, consumo de banda (Mbps) e taxa de perda de pacotes (*Packet Loss %*).
    - Indicador de qualidade dinâmico (Verde / Amarelo / Vermelho) com controle adaptativo de bitrate.

- [ ] **ETAPA 4 – COMERCIALIZAÇÃO (Próxima Etapa)**
  - [ ] Painel administrativo web, banco de dados PostgreSQL/Redis e controle de assinaturas.

---

## 💻 Como Instalar e Rodar em Qualquer Computador

### 1. Baixar o projeto:
```bash
git clone https://github.com/avlis98/remotex.git
cd remotex
```

### 2. Executar o Instalador Oficial:
Dê um duplo clique em **`setup.bat`** (ou execute no PowerShell):
```powershell
.\setup.bat
```

O instalador irá:
1. Copiar o RemoteX para o diretório de programas do usuário (`%LOCALAPPDATA%\Programs\RemoteX`).
2. Compilar o motor nativo Win32 com o ícone oficial embutido no `.exe`.
3. Criar o atalho com o **ícone oficial do RemoteX** na sua **Área de Trabalho** e no **Menu Iniciar**.
4. Perguntar se deseja ativar a inicialização automática junto com o Windows.
5. Iniciar o RemoteX imediatamente.

---

## 🔒 Segurança e Privacidade (Zero-Knowledge)
- **Criptografia DTLS-SRTP:** A mídia de vídeo e os canais de dados (controle, arquivos e chat) utilizam criptografia de ponta a ponta nativa do protocolo WebRTC.
- **Isolamento de Sinalização e Relay:** Nem o servidor de sinalização nem os servidores Relay possuem chaves para descriptografar os dados transmitidos.
- **Acesso Não Supervisionado Seguro:** Somente ativado quando explicitamente configurado pelo usuário.
