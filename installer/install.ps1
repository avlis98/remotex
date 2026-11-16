# RemoteX - Instalador Profissional para Windows 10 e 11
param(
    [switch]$AutoStart = $false,
    [switch]$Silent = $false
)

$ErrorActionPreference = 'Stop'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "          REMOTEX - INSTALADOR WINDOWS                  " -ForegroundColor Cyan
Write-Host "             Conecte. Acesse. Resolva.                  " -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$sourceDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$installDir = Join-Path $env:LOCALAPPDATA "Programs\RemoteX"
$desktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$startMenuDir = Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)) "RemoteX"

Write-Host "[1/5] Preparando diretorio de instalacao..." -ForegroundColor Yellow
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}
if (-not (Test-Path $startMenuDir)) {
    New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
}

Write-Host "[2/5] Copiando arquivos do RemoteX para: $installDir" -ForegroundColor Yellow
$excludeList = @('.git', 'node_modules', 'bin', 'obj')
Get-ChildItem -Path $sourceDir -Exclude $excludeList | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $installDir -Recurse -Force
}

# Ensure native Win32 input agent is built
$nativeExe = Join-Path $installDir "native\RemoteXInput\bin\Release\net8.0\RemoteXInput.exe"
if (-not (Test-Path $nativeExe)) {
    Write-Host "Compilando motor nativo Win32..." -ForegroundColor Yellow
    dotnet build (Join-Path $installDir "native\RemoteXInput") -c Release
}

$iconPath = Join-Path $installDir "assets\icon.ico"
$launcherBat = Join-Path $installDir "RemoteX.bat"

# Create clean runner BAT
$batContent = @"
@echo off
title RemoteX
cd /d "%~dp0"
start "RemoteX Signaling" /b node services\signaling\server.js
timeout /t 1 /nobreak >nul
start "RemoteX Agent" /b node apps\desktop\agent-server.js
timeout /t 1 /nobreak >nul
start http://localhost:3000
exit
"@
Set-Content -Path $launcherBat -Value $batContent -Encoding ASCII

Write-Host "[3/5] Criando atalhos na Area de Trabalho e Menu Iniciar..." -ForegroundColor Yellow
$wsh = New-Object -ComObject WScript.Shell

# Desktop Shortcut
$desktopShortcutPath = Join-Path $desktopDir "RemoteX.lnk"
$desktopShortcut = $wsh.CreateShortcut($desktopShortcutPath)
$desktopShortcut.TargetPath = $launcherBat
$desktopShortcut.WorkingDirectory = $installDir
$desktopShortcut.Description = "RemoteX - Plataforma de Acesso Remoto"
$desktopShortcut.IconLocation = "$iconPath, 0"
$desktopShortcut.Save()

# Start Menu Shortcut
$startMenuShortcutPath = Join-Path $startMenuDir "RemoteX.lnk"
$startMenuShortcut = $wsh.CreateShortcut($startMenuShortcutPath)
$startMenuShortcut.TargetPath = $launcherBat
$startMenuShortcut.WorkingDirectory = $installDir
$startMenuShortcut.Description = "RemoteX - Plataforma de Acesso Remoto"
$startMenuShortcut.IconLocation = "$iconPath, 0"
$startMenuShortcut.Save()

Write-Host "[4/5] Configurando Inicializacao Automatica (Autorun)..." -ForegroundColor Yellow
if ($AutoStart) {
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RemoteX" -Value "`"$launcherBat`""
    Write-Host "Inicializacao automatica com o Windows ativada!" -ForegroundColor Green
}

# Create Uninstaller
$uninstallBat = Join-Path $installDir "Uninstall.bat"
$uninstallContent = @"
@echo off
title RemoteX - Desinstalador
echo Removendo RemoteX...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "RemoteX" /f >nul 2>&1
del "%USERPROFILE%\Desktop\RemoteX.lnk" >nul 2>&1
rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\RemoteX" >nul 2>&1
echo RemoteX desinstalado com sucesso.
pause
"@
Set-Content -Path $uninstallBat -Value $uninstallContent -Encoding ASCII

Write-Host "[5/5] Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Atalho criado na Area de Trabalho: RemoteX            " -ForegroundColor White
Write-Host "  Atalho criado no Menu Iniciar:     RemoteX            " -ForegroundColor White
Write-Host "  Icone oficial aplicado:           assets\icon.ico     " -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan

if (-not $Silent) {
    Start-Process -FilePath $launcherBat
}
