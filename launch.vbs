Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
' Ace Wing launcher: starts the local game server without a console window, then opens the game
sh.CurrentDirectory = fs.GetParentFolderName(WScript.ScriptFullName)
sh.Run "py serve.py", 0, False
WScript.Sleep 800
sh.Run "http://localhost:8777/", 1, False
