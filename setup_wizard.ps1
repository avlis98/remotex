Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Configuracoes do Form principal (Padrao DocFlow AI / RemoteX)
$form = New-Object Windows.Forms.Form
$form.Text = "Assistente de Instalacao - RemoteX"
$form.Size = New-Object Drawing.Size(560, 420)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [Drawing.Color]::FromArgb(243, 244, 246)

$scriptPath = $PSScriptRoot
if ([string]::IsNullOrEmpty($scriptPath)) {
    $scriptPath = (Get-Location).Path
}
$iconFile = Join-Path $scriptPath "icon.ico"
if (-not (Test-Path $iconFile)) {
    $iconFile = Join-Path $scriptPath "assets\icon.ico"
}
if (Test-Path $iconFile) {
    try { $form.Icon = New-Object System.Drawing.Icon($iconFile) } catch {}
}

# Cores e Fontes
$fontTitle = New-Object Drawing.Font("Segoe UI", 16, [Drawing.FontStyle]::Bold)
$fontSubtitle = New-Object Drawing.Font("Segoe UI", 9)
$fontNormal = New-Object Drawing.Font("Segoe UI", 10)
$fontBold = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$fontLog = New-Object Drawing.Font("Consolas", 8.5)
$blueColor = [Drawing.Color]::FromArgb(0, 102, 243)
$darkGreen = [Drawing.Color]::FromArgb(22, 163, 74)

# Cabecalho Superior
$headerPanel = New-Object Windows.Forms.Panel
$headerPanel.Size = New-Object Drawing.Size(560, 80)
$headerPanel.BackColor = $blueColor
$form.Controls.Add($headerPanel)

$headerTitle = New-Object Windows.Forms.Label
$headerTitle.Text = "RemoteX"
$headerTitle.Font = $fontTitle
$headerTitle.ForeColor = [Drawing.Color]::White
$headerTitle.Location = New-Object Drawing.Point(20, 15)
$headerTitle.AutoSize = $true
$headerPanel.Controls.Add($headerTitle)

$headerSub = New-Object Windows.Forms.Label
$headerSub.Text = "Assistente de Instalacao e Configuracao Oficial • Conecte. Acesse. Resolva."
$headerSub.Font = $fontSubtitle
$headerSub.ForeColor = [Drawing.Color]::White
$headerSub.Location = New-Object Drawing.Point(22, 45)
$headerSub.AutoSize = $true
$headerPanel.Controls.Add($headerSub)

# Painel de Conteudo
$contentPanel = New-Object Windows.Forms.Panel
$contentPanel.Location = New-Object Drawing.Point(0, 80)
$contentPanel.Size = New-Object Drawing.Size(560, 250)
$form.Controls.Add($contentPanel)

# Painel de Botoes (Inferior)
$buttonPanel = New-Object Windows.Forms.Panel
$buttonPanel.Location = New-Object Drawing.Point(0, 330)
$buttonPanel.Size = New-Object Drawing.Size(560, 50)
$buttonPanel.BackColor = [Drawing.Color]::FromArgb(229, 231, 235)
$form.Controls.Add($buttonPanel)

$installPath = "C:\RemoteX"
if (Test-Path (Join-Path $scriptPath "system\RemoteX.vbs")) {
    $systemFolder = Join-Path $scriptPath "system"
} else {
    $systemFolder = $scriptPath
}

# --- PASSO 1: BOAS-VINDAS ---
$p1_title = New-Object Windows.Forms.Label
$p1_title.Text = "Bem-vindo ao instalador do RemoteX!"
$p1_title.Font = $fontBold
$p1_title.Location = New-Object Drawing.Point(20, 18)
$p1_title.Size = New-Object Drawing.Size(520, 20)
$contentPanel.Controls.Add($p1_title)

$p1_desc = New-Object Windows.Forms.Label
$p1_desc.Text = "Este assistente instalara o sistema completo RemoteX neste computador, incluindo a Rede Global Mesh P2P (zero configuracao), motor nativo Win32 SendInput e inicializacao silenciosa sem telas pretas."
$p1_desc.Font = $fontNormal
$p1_desc.Location = New-Object Drawing.Point(20, 44)
$p1_desc.Size = New-Object Drawing.Size(520, 56)
$contentPanel.Controls.Add($p1_desc)

$p1_lblFolder = New-Object Windows.Forms.Label
$p1_lblFolder.Text = "Selecione a pasta de destino da instalacao:"
$p1_lblFolder.Font = $fontNormal
$p1_lblFolder.Location = New-Object Drawing.Point(20, 108)
$p1_lblFolder.Size = New-Object Drawing.Size(520, 20)
$contentPanel.Controls.Add($p1_lblFolder)

$p1_txtFolder = New-Object Windows.Forms.TextBox
$p1_txtFolder.Text = $installPath
$p1_txtFolder.Font = $fontNormal
$p1_txtFolder.Location = New-Object Drawing.Point(20, 132)
$p1_txtFolder.Size = New-Object Drawing.Size(400, 25)
$contentPanel.Controls.Add($p1_txtFolder)

$p1_btnBrowse = New-Object Windows.Forms.Button
$p1_btnBrowse.Text = "Procurar..."
$p1_btnBrowse.Font = $fontNormal
$p1_btnBrowse.Location = New-Object Drawing.Point(430, 130)
$p1_btnBrowse.Size = New-Object Drawing.Size(100, 27)
$p1_btnBrowse.FlatStyle = "System"
$contentPanel.Controls.Add($p1_btnBrowse)

$p1_btnBrowse.Add_Click({
    $folderBrowser = New-Object Windows.Forms.FolderBrowserDialog
    $folderBrowser.Description = "Selecione a pasta onde instalar o RemoteX:"
    $folderBrowser.SelectedPath = $p1_txtFolder.Text
    if ($folderBrowser.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) {
        $p1_txtFolder.Text = $folderBrowser.SelectedPath
    }
})

$p1_chkAutoRun = New-Object Windows.Forms.CheckBox
$p1_chkAutoRun.Text = "Iniciar o RemoteX automaticamente junto com o Windows"
$p1_chkAutoRun.Font = $fontNormal
$p1_chkAutoRun.Checked = $false
$p1_chkAutoRun.Location = New-Object Drawing.Point(20, 172)
$p1_chkAutoRun.Size = New-Object Drawing.Size(500, 25)
$contentPanel.Controls.Add($p1_chkAutoRun)

# --- PASSO 2: INSTALACAO E PROGRESSO ---
$p2_lblStatus = New-Object Windows.Forms.Label
$p2_lblStatus.Text = "Iniciando a copia dos arquivos..."
$p2_lblStatus.Font = $fontBold
$p2_lblStatus.Location = New-Object Drawing.Point(20, 20)
$p2_lblStatus.Size = New-Object Drawing.Size(520, 20)
$p2_lblStatus.Visible = $false
$contentPanel.Controls.Add($p2_lblStatus)

$p2_progress = New-Object Windows.Forms.ProgressBar
$p2_progress.Location = New-Object Drawing.Point(20, 50)
$p2_progress.Size = New-Object Drawing.Size(510, 25)
$p2_progress.Style = [Windows.Forms.ProgressBarStyle]::Continuous
$p2_progress.Visible = $false
$contentPanel.Controls.Add($p2_progress)

$p2_log = New-Object Windows.Forms.RichTextBox
$p2_log.Location = New-Object Drawing.Point(20, 90)
$p2_log.Size = New-Object Drawing.Size(510, 140)
$p2_log.ReadOnly = $true
$p2_log.Font = $fontLog
$p2_log.BackColor = [Drawing.Color]::White
$p2_log.Visible = $false
$contentPanel.Controls.Add($p2_log)

# --- PASSO 3: CONCLUIDO ---
$p3_title = New-Object Windows.Forms.Label
$p3_title.Text = "Instalacao concluida com sucesso!"
$p3_title.Font = $fontTitle
$p3_title.ForeColor = $darkGreen
$p3_title.Location = New-Object Drawing.Point(20, 25)
$p3_title.Size = New-Object Drawing.Size(520, 35)
$p3_title.Visible = $false
$contentPanel.Controls.Add($p3_title)

$p3_desc = New-Object Windows.Forms.Label
$p3_desc.Text = "O RemoteX foi instalado neste computador e os atalhos oficiais foram criados na Area de Trabalho e no Menu Iniciar."
$p3_desc.Font = $fontNormal
$p3_desc.Location = New-Object Drawing.Point(20, 75)
$p3_desc.Size = New-Object Drawing.Size(520, 60)
$p3_desc.Visible = $false
$contentPanel.Controls.Add($p3_desc)

$p3_chkRun = New-Object Windows.Forms.CheckBox
$p3_chkRun.Text = "Iniciar o RemoteX agora"
$p3_chkRun.Checked = $true
$p3_chkRun.Font = $fontBold
$p3_chkRun.Location = New-Object Drawing.Point(20, 150)
$p3_chkRun.Size = New-Object Drawing.Size(400, 30)
$p3_chkRun.Visible = $false
$contentPanel.Controls.Add($p3_chkRun)

# BOTOES INFERIORES
$btnNext = New-Object Windows.Forms.Button
$btnNext.Text = "Avancar >"
$btnNext.Location = New-Object Drawing.Point(430, 10)
$btnNext.Size = New-Object Drawing.Size(100, 30)
$btnNext.Font = $fontBold
$btnNext.BackColor = $blueColor
$btnNext.ForeColor = [Drawing.Color]::White
$btnNext.FlatStyle = [Windows.Forms.FlatStyle]::Flat
$btnNext.FlatAppearance.BorderSize = 0
$buttonPanel.Controls.Add($btnNext)

$btnCancel = New-Object Windows.Forms.Button
$btnCancel.Text = "Cancelar"
$btnCancel.Location = New-Object Drawing.Point(310, 10)
$btnCancel.Size = New-Object Drawing.Size(100, 30)
$btnCancel.Font = $fontNormal
$btnCancel.FlatStyle = [Windows.Forms.FlatStyle]::System
$buttonPanel.Controls.Add($btnCancel)

$script:step = 1

$btnCancel.Add_Click({
    if ($script:step -eq 2) { return }
    $form.Close()
})

$btnNext.Add_Click({
    if ($script:step -eq 1) {
        $script:step = 2
        $installPath = $p1_txtFolder.Text

        $p1_title.Visible = $false
        $p1_desc.Visible = $false
        $p1_lblFolder.Visible = $false
        $p1_txtFolder.Visible = $false
        $p1_btnBrowse.Visible = $false
        $p1_chkAutoRun.Visible = $false

        $p2_lblStatus.Visible = $true
        $p2_progress.Visible = $true
        $p2_log.Visible = $true

        $btnNext.Enabled = $false
        $btnCancel.Enabled = $false

        $form.Refresh()
        Run-Installation
    }
    elseif ($script:step -eq 3) {
        if ($p3_chkRun.Checked) {
            $destSys = Join-Path $installPath "system"
            if (-not (Test-Path (Join-Path $destSys "RemoteX.vbs"))) {
                $destSys = $installPath
            }
            $vbsFile = Join-Path $destSys "RemoteX.vbs"
            Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsFile`"" -WorkingDirectory $destSys
        }
        $form.Close()
    }
})

function Log-Msg($msg) {
    $p2_log.AppendText("$msg`r`n")
    $p2_log.ScrollToCaret()
    $form.Refresh()
    Start-Sleep -Milliseconds 120
}

function Run-Installation {
    $p2_progress.Value = 5
    Log-Msg "=== Iniciando Instalacao do RemoteX ==="

    $destSystem = Join-Path $installPath "system"
    $sameFolder = ([System.IO.Path]::GetFullPath($systemFolder).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($destSystem).TrimEnd('\'))

    # 1. Caso seja instalacao em nova pasta, encerrar instancias antigas
    $p2_progress.Value = 15
    $p2_lblStatus.Text = "Verificando servicos ativos..."
    Log-Msg "Verificando portas 3000, 3001, 8080 e 8081..."
    if (-not $sameFolder) {
        try {
            @(3000, 3001, 8080, 8081) | ForEach-Object {
                Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object {
                    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
            Stop-Process -Name "RemoteXInput" -Force -ErrorAction SilentlyContinue
        } catch {}
    }

    # 2. Criar pasta de destino e copiar arquivos
    $p2_progress.Value = 35
    $p2_lblStatus.Text = "Instalando arquivos do sistema..."
    if (-not $sameFolder) {
        Log-Msg "Criando diretorio $destSystem..."
        if (!(Test-Path $destSystem)) {
            New-Item -ItemType Directory -Path $destSystem -Force | Out-Null
        }
        Log-Msg "Copiando arquivos do sistema e motor nativo..."
        Get-ChildItem -Path $systemFolder -Exclude @('.git', 'dist') | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $destSystem -Recurse -Force -ErrorAction SilentlyContinue
        }
        Log-Msg "Arquivos instalados com sucesso em $destSystem."
    } else {
        Log-Msg "Diretorio do sistema ja configurado em $destSystem."
    }

    # 3. Configurar Firewall do Windows
    $p2_progress.Value = 70
    $p2_lblStatus.Text = "Configurando Rede e Firewall..."
    try {
        New-NetFirewallRule -DisplayName "RemoteX P2P & WebRTC" -Direction Inbound -LocalPort 3000,3001,8080,8081 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue | Out-Null
        Log-Msg "Regras liberadas no Firewall do Windows (Portas 3000, 8080, 8081)."
    } catch {
        Log-Msg "[INFO] Permissao padrao de rede mantida."
    }

    # 4. Criar atalhos oficiais
    $p2_progress.Value = 90
    $p2_lblStatus.Text = "Criando atalhos na Area de Trabalho e Menu Iniciar..."
    Log-Msg "Gerando atalhos com icone oficial..."
    try {
        $wshShell = New-Object -ComObject WScript.Shell
        $ico = Join-Path $destSystem "icon.ico"
        if (!(Test-Path $ico)) { $ico = Join-Path $destSystem "assets\icon.ico" }

        $desktopPath = [Environment]::GetFolderPath('Desktop')
        $shortcut = $wshShell.CreateShortcut("$desktopPath\RemoteX.lnk")
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = "`"$destSystem\RemoteX.vbs`""
        $shortcut.WorkingDirectory = $destSystem
        $shortcut.Description = "RemoteX - Conecte. Acesse. Resolva."
        $shortcut.IconLocation = "$ico, 0"
        $shortcut.Save()

        $startMenuPath = [Environment]::GetFolderPath('Programs')
        $appStartMenuFolder = Join-Path $startMenuPath "RemoteX"
        if (!(Test-Path $appStartMenuFolder)) {
            New-Item -ItemType Directory -Path $appStartMenuFolder -Force | Out-Null
        }

        $shortcutStart = $wshShell.CreateShortcut("$appStartMenuFolder\RemoteX.lnk")
        $shortcutStart.TargetPath = "wscript.exe"
        $shortcutStart.Arguments = "`"$destSystem\RemoteX.vbs`""
        $shortcutStart.WorkingDirectory = $destSystem
        $shortcutStart.Description = "RemoteX - Conecte. Acesse. Resolva."
        $shortcutStart.IconLocation = "$ico, 0"
        $shortcutStart.Save()

        $shortcutUninstall = $wshShell.CreateShortcut("$appStartMenuFolder\Desinstalar RemoteX.lnk")
        $shortcutUninstall.TargetPath = "wscript.exe"
        $shortcutUninstall.Arguments = "`"$destSystem\Desinstalar RemoteX.vbs`""
        $shortcutUninstall.WorkingDirectory = $destSystem
        $shortcutUninstall.IconLocation = "shell32.dll,219"
        $shortcutUninstall.Save()

        if ($p1_chkAutoRun.Checked) {
            Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RemoteX" -Value "wscript.exe `"$destSystem\RemoteX.vbs`""
            Log-Msg "Inicializacao automatica com o Windows configurada."
        }

        Log-Msg "Atalhos criados com sucesso na Area de Trabalho e Menu Iniciar."
    } catch {
        Log-Msg "[ERRO] Falha ao criar atalhos: $_"
    }

    $p2_progress.Value = 100
    $p2_lblStatus.Text = "Instalacao concluida!"
    Log-Msg "Instalacao concluida com sucesso as $(Get-Date)."

    Start-Sleep -Milliseconds 700

    $p2_lblStatus.Visible = $false
    $p2_progress.Visible = $false
    $p2_log.Visible = $false

    $p3_title.Visible = $true
    $p3_desc.Visible = $true
    $p3_chkRun.Visible = $true

    $btnNext.Text = "Concluir"
    $btnNext.Enabled = $true
    $btnCancel.Visible = $false

    $script:step = 3
    $form.Refresh()
}

$form.ShowDialog() | Out-Null
