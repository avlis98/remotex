Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "          REMOTEX - PLATAFORMA DE ACESSO REMOTO        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

$nativeExe = Join-Path $root "native\RemoteXInput\bin\Release\net8.0\RemoteXInput.exe"
if (-not (Test-Path $nativeExe)) {
    Write-Host "[1/3] Compilando RemoteXInput nativo em .NET 8..." -ForegroundColor Yellow
    dotnet build (Join-Path $root "native\RemoteXInput") -c Release
} else {
    Write-Host "[1/3] Modulo nativo Win32 RemoteXInput verificado." -ForegroundColor Green
}

Write-Host "[2/3] Iniciando Servidor Central de Sinalizacao (Porta 8080)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList (Join-Path $root "services\signaling\server.js") -WorkingDirectory (Join-Path $root "services\signaling")

Start-Sleep -Seconds 1

Write-Host "[3/3] Iniciando Cliente Desktop & Agente de Entrada (Porta 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList (Join-Path $root "apps\desktop\agent-server.js") -WorkingDirectory (Join-Path $root "apps\desktop")

Start-Sleep -Seconds 1

Write-Host "RemoteX iniciado com sucesso!" -ForegroundColor Green
Write-Host "Interface do Cliente: http://localhost:3000" -ForegroundColor White
Start-Process "http://localhost:3000"

