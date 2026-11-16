$wsh = New-Object -ComObject WScript.Shell
$deskLnk = Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)) "RemoteX.lnk"
$root = "C:\Users\André\projetos com IA\RemoteX"
$vbs = Join-Path $root "RemoteX.vbs"
$ico = Join-Path $root "assets\icon.ico"

$sc = $wsh.CreateShortcut($deskLnk)
$sc.TargetPath = "wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = $root
$sc.Description = "RemoteX - Plataforma de Acesso Remoto"
$sc.IconLocation = "$ico, 0"
$sc.Save()

Write-Host "Atalho Desktop atualizado com sucesso!" -ForegroundColor Green

