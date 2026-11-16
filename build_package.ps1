$src = $PSScriptRoot
$distDir = Join-Path $src "dist"
$zipPath = Join-Path $distDir "RemoteX-Instalador.zip"

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$tempPkg = Join-Path $env:TEMP "remotex_pkg"
if (Test-Path $tempPkg) {
    Remove-Item $tempPkg -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $tempPkg | Out-Null

$itemsToCopy = @(
    'Instalar RemoteX.exe',
    'RemoteX.vbs',
    'Instalar RemoteX.vbs',
    'setup_wizard.ps1',
    'setup.bat',
    'start-remotex.bat',
    'start-remotex.ps1',
    'package.json',
    'README.md',
    'icon.ico',
    'assets',
    'apps',
    'installer',
    'services',
    'native'
)

foreach ($item in $itemsToCopy) {
    $itemPath = Join-Path $src $item
    if (Test-Path $itemPath) {
        Copy-Item -Path $itemPath -Destination $tempPkg -Recurse -Force
    }
}

Compress-Archive -Path (Join-Path $tempPkg "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $tempPkg -Recurse -Force -ErrorAction SilentlyContinue

$fileInfo = Get-Item $zipPath
$sizeMb = [math]::Round($fileInfo.Length / 1MB, 2)
Write-Host "ZIP gerado com sucesso: $($fileInfo.FullName) ($sizeMb MB)"
