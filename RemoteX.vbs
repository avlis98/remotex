Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Descobre a pasta onde este script esta localizado
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' 1. Inicia o Servidor de Sinalizacao de forma 100% oculta (sem tela preta)
WshShell.Run "cmd /c cd /d """ & strPath & """ && node services\signaling\server.js", 0, False

' 2. Inicia o Servidor Relay de forma oculta
WshShell.Run "cmd /c cd /d """ & strPath & """ && node services\relay\relay-server.js", 0, False

' 3. Inicia o Agente Desktop e Injetor Win32 de forma oculta
WshShell.Run "cmd /c cd /d """ & strPath & """ && node apps\desktop\agent-server.js", 0, False

' Aguarda 2 segundos para os servidores subirem
WScript.Sleep 2000

' 4. Abre em Modo Aplicativo Nativo (SEM barra de endereco, SEM abas, tamanho TeamViewer 920x620)
chromePath1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
chromePath2 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
edgePath = "msedge.exe"

appUrl = "http://localhost:3000"
winParams = " --app=""" & appUrl & """ --window-size=920,620"

If fso.FileExists(chromePath1) Then
    WshShell.Run """" & chromePath1 & """" & winParams, 1, False
ElseIf fso.FileExists(chromePath2) Then
    WshShell.Run """" & chromePath2 & """" & winParams, 1, False
Else
    WshShell.Run edgePath & winParams, 1, False
End If

