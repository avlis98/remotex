@echo off
title RemoteX - Inicializador
echo ========================================================
echo           REMOTEX - PLATAFORMA DE ACESSO REMOTO
echo             Conecte. Acesse. Resolva.
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/4] Verificando modulo nativo Win32 (RemoteXInput)...
if not exist "native\RemoteXInput\bin\Release\net8.0\RemoteXInput.exe" (
    echo Compilando RemoteXInput nativo em .NET 8...
    dotnet build native\RemoteXInput -c Release
)

echo [2/4] Iniciando Servidor Central de Sinalizacao (Porta 8080)...
start "RemoteX Signaling Server" cmd /k "node services\signaling\server.js"

echo [3/4] Iniciando Servidor de Relay e Midia Dedicado (Porta 8081)...
start "RemoteX Relay Server" cmd /k "node services\relay\relay-server.js"

timeout /t 2 /nobreak >nul

echo [4/4] Iniciando Cliente Desktop e Agente de Entrada (Porta 3000)...
start "RemoteX Desktop Client" cmd /k "node apps\desktop\agent-server.js"

timeout /t 2 /nobreak >nul

echo.
echo Abrindo o painel do RemoteX no navegador...
start http://localhost:3000

echo.
echo ========================================================
echo   RemoteX iniciado com sucesso!
echo   Interface: http://localhost:3000
echo   Sinalizacao: ws://localhost:8080
echo   Relay/TURN: http://localhost:8081
echo ========================================================
