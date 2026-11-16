Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "          REMOTEX - PLATAFORMA DE ACESSO REMOTO        " -ForegroundColor Cyan
Write-Host "             Conecte. Acesse. Resolva.                 " -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

$nativeExe = Join-Path $root "native\RemoteXInput\bin\Release\net8.0\RemoteXInput.exe"
if (-not (Test-Path $nativeExe)) {
    Write-Host "[1/4] Compilando RemoteXInput nativo em .NET 8..." -ForegroundColor Yellow
    dotnet build (Join-Path $root "native\RemoteXInput") -c Release
} else {
    Write-Host "[1/4] Modulo nativo Win32 RemoteXInput verificado." -ForegroundColor Green
}

Write-Host "[2/4] Iniciando Servidor Central de Sinalizacao (Porta 8080)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList (Join-Path $root "services\signaling\server.js") -WorkingDirectory (Join-Path $root "services\signaling")

Write-Host "[3/4] Iniciando Servidor Relay & Midia Dedicado (Porta 8081)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList (Join-Path $root "services\relay\relay-server.js") -WorkingDirectory (Join-Path $root "services\relay")

Start-Sleep -Seconds 1

Write-Host "[4/4] Iniciando Cliente Desktop & Agente de Entrada (Porta 3000)..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList (Join-Path $root "apps\desktop\agent-server.js") -WorkingDirectory (Join-Path $root "apps\desktop")

Start-Sleep -Seconds 1

Write-Host "RemoteX iniciado com sucesso!" -ForegroundColor Green
Write-Host "Interface do Cliente: http://localhost:3000" -ForegroundColor White
Start-Process "http://localhost:3000"
