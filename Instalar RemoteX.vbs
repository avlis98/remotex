Set objShell = CreateObject("Shell.Application")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtem o diretorio atual do script
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Define o caminho do script PowerShell do instalador grafico
psScript = currentDir & "\setup_wizard.ps1"

' Executa o assistente de instalacao sem tela preta (WindowStyle Hidden)
objShell.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """", "", "runas", 0

