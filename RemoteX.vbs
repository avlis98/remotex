Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

If fso.FileExists(strPath & "\node.exe") Then
    nodeBin = """" & strPath & "\node.exe"" --no-warnings"
Else
    nodeBin = "node --no-warnings"
End If

Function IsPortListening(portNum)
    checkCmd = "powershell -NoProfile -WindowStyle Hidden -Command ""$t = New-Object System.Net.Sockets.TcpClient; try { $ar = $t.BeginConnect('127.0.0.1', " & portNum & ", $null, $null); if ($ar.AsyncWaitHandle.WaitOne(220, $false)) { $t.EndConnect($ar); exit 0 } else { exit 1 } } catch { exit 1 } finally { $t.Close() }"""
    IsPortListening = (WshShell.Run(checkCmd, 0, True) = 0)
End Function

' 1. Inicia o Servidor de Sinalizacao & Global Mesh (Porta 8080) se ainda nao estiver ativo
If Not IsPortListening(8080) Then
    WshShell.Run nodeBin & " """ & strPath & "\services\signaling\server.js""", 0, False
End If

' 2. Inicia o Servidor Relay (Porta 8081) se ainda nao estiver ativo
If Not IsPortListening(8081) Then
    WshShell.Run nodeBin & " """ & strPath & "\services\relay\relay-server.js""", 0, False
End If

' 3. Inicia o Agente Desktop e Injetor Win32 (Porta 3000) se ainda nao estiver ativo
If Not IsPortListening(3000) Then
    WshShell.Run nodeBin & " """ & strPath & "\apps\desktop\agent-server.js""", 0, False
    waitCmd = "powershell -NoProfile -WindowStyle Hidden -Command ""for ($i=0; $i -lt 40; $i++) { $t = New-Object System.Net.Sockets.TcpClient; try { $ar = $t.BeginConnect('127.0.0.1', 3000, $null, $null); if ($ar.AsyncWaitHandle.WaitOne(200, $false)) { $t.EndConnect($ar); $t.Close(); break } } catch {} finally { $t.Close() }; Start-Sleep -Milliseconds 200 }"""
    WshShell.Run waitCmd, 0, True
End If

' 4. Abre em Modo Aplicativo Nativo (Proporcao AnyDesk v8 1040x680, sem barra de endereco)
chromePath1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
chromePath2 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
edgePath = "msedge.exe"

appUrl = "http://localhost:3000"
winParams = " --app=""" & appUrl & """ --window-size=1040,680"

If fso.FileExists(chromePath1) Then
    WshShell.Run """" & chromePath1 & """" & winParams, 1, False
ElseIf fso.FileExists(chromePath2) Then
    WshShell.Run """" & chromePath2 & """" & winParams, 1, False
Else
    WshShell.Run edgePath & winParams, 1, False
End If
