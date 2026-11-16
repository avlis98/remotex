@echo off
title RemoteX - Instalador
cd /d "%~dp0"
echo ========================================================
echo          REMOTEX - INSTALADOR WINDOWS
echo             Conecte. Acesse. Resolva.
echo ========================================================
echo.
echo Deseja que o RemoteX inicialize automaticamente com o Windows?
set /p AUTOSTART="[S] Sim / [N] Nao (Padrao: N): "

if /i "%AUTOSTART%"=="S" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\install.ps1" -AutoStart
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\install.ps1"
)

echo.
pause
