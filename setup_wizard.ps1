Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Janela Principal do Instalador Grafico
$form = New-Object Windows.Forms.Form
$form.Text = "Assistente de Instalacao - RemoteX"
$form.Size = New-Object Drawing.Size(560, 420)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [Drawing.Color]::FromArgb(243, 244, 246)

# Fontes e Cores
$fontTitle = New-Object Drawing.Font("Segoe UI", 16, [Drawing.FontStyle]::Bold)
$fontSubtitle = New-Object Drawing.Font("Segoe UI", 9)
$fontNormal = New-Object Drawing.Font("Segoe UI", 10)
$fontBold = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$blueColor = [Drawing.Color]::FromArgb(0, 112, 243)

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
$headerSub.Text = "Plataforma de Acesso Remoto - Conecte. Acesse. Resolva."
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

$infoLabel = New-Object Windows.Forms.Label
$infoLabel.Text = "O RemoteX sera configurado no seu computador com inicializacao rapida sem telas pretas e modo desktop nativo."
$infoLabel.Font = $fontNormal
$infoLabel.Location = New-Object Drawing.Point(25, 20)
$infoLabel.Size = New-Object Drawing.Size(500, 40)
$contentPanel.Controls.Add($infoLabel)

# Checkbox Atalho Desktop
$chkDesktop = New-Object Windows.Forms.CheckBox
$chkDesktop.Text = "Criar atalho na Area de Trabalho (com icone oficial)"
$chkDesktop.Font = $fontNormal
$chkDesktop.Checked = $true
$chkDesktop.Location = New-Object Drawing.Point(25, 75)
$chkDesktop.Size = New-Object Drawing.Size(480, 25)
$contentPanel.Controls.Add($chkDesktop)

# Checkbox Menu Iniciar
$chkStartMenu = New-Object Windows.Forms.CheckBox
$chkStartMenu.Text = "Adicionar ao Menu Iniciar"
$chkStartMenu.Font = $fontNormal
$chkStartMenu.Checked = $true
$chkStartMenu.Location = New-Object Drawing.Point(25, 105)
$chkStartMenu.Size = New-Object Drawing.Size(480, 25)
$contentPanel.Controls.Add($chkStartMenu)

# Checkbox Inicializar com Windows
$chkAutoRun = New-Object Windows.Forms.CheckBox
$chkAutoRun.Text = "Inicializar o RemoteX automaticamente com o Windows"
$chkAutoRun.Font = $fontNormal
$chkAutoRun.Checked = $false
$chkAutoRun.Location = New-Object Drawing.Point(25, 135)
$chkAutoRun.Size = New-Object Drawing.Size(480, 25)
$contentPanel.Controls.Add($chkAutoRun)

# Barra de Progresso
$progressBar = New-Object Windows.Forms.ProgressBar
$progressBar.Location = New-Object Drawing.Point(25, 185)
$progressBar.Size = New-Object Drawing.Size(500, 20)
$progressBar.Visible = $false
$contentPanel.Controls.Add($progressBar)

$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = ""
$statusLabel.Font = $fontNormal
$statusLabel.Location = New-Object Drawing.Point(25, 212)
$statusLabel.Size = New-Object Drawing.Size(500, 20)
$statusLabel.ForeColor = [Drawing.Color]::FromArgb(22, 163, 74)
$contentPanel.Controls.Add($statusLabel)

# Painel de Botoes (Inferior)
$buttonPanel = New-Object Windows.Forms.Panel
$buttonPanel.Location = New-Object Drawing.Point(0, 330)
$buttonPanel.Size = New-Object Drawing.Size(560, 50)
$buttonPanel.BackColor = [Drawing.Color]::FromArgb(229, 231, 235)
$form.Controls.Add($buttonPanel)

$btnCancel = New-Object Windows.Forms.Button
$btnCancel.Text = "Cancelar"
$btnCancel.Size = New-Object Drawing.Size(100, 32)
$btnCancel.Location = New-Object Drawing.Point(325, 9)
$btnCancel.Add_Click({ $form.Close() })
$buttonPanel.Controls.Add($btnCancel)

$btnInstall = New-Object Windows.Forms.Button
$btnInstall.Text = "Instalar Agora"
$btnInstall.Size = New-Object Drawing.Size(115, 32)
$btnInstall.Location = New-Object Drawing.Point(430, 9)
$btnInstall.BackColor = $blueColor
$btnInstall.ForeColor = [Drawing.Color]::White
$btnInstall.FlatStyle = [Windows.Forms.FlatStyle]::Flat

$btnInstall.Add_Click({
    $btnInstall.Enabled = $false
    $btnCancel.Enabled = $false
    $progressBar.Visible = $true
    $progressBar.Value = 20

    $scriptRoot = $PSScriptRoot
    $desktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
    $startMenuDir = Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)) "RemoteX"
    $iconPath = Join-Path $scriptRoot "assets\icon.ico"
    $vbsLauncher = Join-Path $scriptRoot "RemoteX.vbs"

    $statusLabel.Text = "Verificando dependencias e compilando motor nativo..."
    $progressBar.Value = 50

    # Ensure native agent compiled
    $nativeExe = Join-Path $scriptRoot "native\RemoteXInput\bin\Release\net8.0\RemoteXInput.exe"
    if (-not (Test-Path $nativeExe)) {
        dotnet build (Join-Path $scriptRoot "native\RemoteXInput") -c Release | Out-Null
    }

    $progressBar.Value = 75
    $statusLabel.Text = "Criando atalhos oficiais com o icone..."
    $wsh = New-Object -ComObject WScript.Shell

    if ($chkDesktop.Checked) {
        $deskLnk = Join-Path $desktopDir "RemoteX.lnk"
        $sc = $wsh.CreateShortcut($deskLnk)
        $sc.TargetPath = "wscript.exe"
        $sc.Arguments = "`"$vbsLauncher`""
        $sc.WorkingDirectory = $scriptRoot
        $sc.Description = "RemoteX - Plataforma de Acesso Remoto"
        $sc.IconLocation = "$iconPath, 0"
        $sc.Save()
    }

    if ($chkStartMenu.Checked) {
        if (-not (Test-Path $startMenuDir)) { New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null }
        $smLnk = Join-Path $startMenuDir "RemoteX.lnk"
        $sc2 = $wsh.CreateShortcut($smLnk)
        $sc2.TargetPath = "wscript.exe"
        $sc2.Arguments = "`"$vbsLauncher`""
        $sc2.WorkingDirectory = $scriptRoot
        $sc2.Description = "RemoteX - Plataforma de Acesso Remoto"
        $sc2.IconLocation = "$iconPath, 0"
        $sc2.Save()
    }

    if ($chkAutoRun.Checked) {
        Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RemoteX" -Value "wscript.exe `"$vbsLauncher`""
    }

    $progressBar.Value = 100
    $statusLabel.Text = "Instalacao concluida com sucesso!"

    $btnInstall.Text = "Abrir RemoteX"
    $btnInstall.Enabled = $true
    $btnInstall.Add_Click({
        Start-Process "wscript.exe" -ArgumentList "`"$vbsLauncher`""
        $form.Close()
    })
})

$buttonPanel.Controls.Add($btnInstall)

$form.ShowDialog() | Out-Null

