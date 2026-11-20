Add-Type -AssemblyName System.Windows.Forms

$res = [System.Windows.Forms.MessageBox]::Show(
    "Deseja realmente desinstalar o RemoteX deste computador?",
    "Desinstalar RemoteX",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
)

if ($res -ne [System.Windows.Forms.DialogResult]::Yes) {
    exit
}

# Encerra processos do RemoteX nas portas 3000, 3001, 8080, 8081
@(3000, 3001, 8080, 8081) | ForEach-Object {
    Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Stop-Process -Name "RemoteXInput" -Force -ErrorAction SilentlyContinue

# Remove atalhos
$desktopPath = [Environment]::GetFolderPath('Desktop')
Remove-Item "$desktopPath\RemoteX.lnk" -Force -ErrorAction SilentlyContinue

$startMenuPath = Join-Path ([Environment]::GetFolderPath('Programs')) "RemoteX"
Remove-Item $startMenuPath -Recurse -Force -ErrorAction SilentlyContinue

Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RemoteX" -ErrorAction SilentlyContinue

[System.Windows.Forms.MessageBox]::Show(
    "RemoteX foi desinstalado e os atalhos foram removidos com sucesso.",
    "RemoteX Desinstalado",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
)
