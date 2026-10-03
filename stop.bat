@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "SYS32=%SystemRoot%\System32"
set "PS=%SYS32%\WindowsPowerShell\v1.0\powershell.exe"
set "NETSTAT=%SYS32%\netstat.exe"
set "FINDSTR=%SYS32%\findstr.exe"
set "CHCP=%SYS32%\chcp.com"
set "PING=%SYS32%\ping.exe"
set "TASKKILL=%SYS32%\taskkill.exe"
if exist "%CHCP%" "%CHCP%" 866 >nul 2>nul

set "PORT=3000"
if not "%~1"=="" set "PORT=%~1"

echo.
echo   Останавливаю BeatDesk на порту %PORT%...

if exist "%PS%" (
  "%PS%" -NoProfile -Command "$c=@(Get-NetTCPConnection -LocalPort %PORT% -State Listen -EA SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if($c.Count -eq 0){ exit 2 }; foreach($p in $c){ Stop-Process -Id $p -Force -EA SilentlyContinue }; exit 0"
  set "RC=!errorlevel!"
  if "!RC!"=="0" echo   Готово, сервер остановлен.
  if "!RC!"=="2" echo   Сервер и так не запущен.
  if not "!RC!"=="0" if not "!RC!"=="2" echo   Не получилось проверить порт. Закрой сервер вручную.
) else (
  if not exist "logs" mkdir "logs"
  "%NETSTAT%" -ano > "logs\stop-net.txt" 2>nul
  "%FINDSTR%" /R /C:":%PORT% .*LISTENING" "logs\stop-net.txt" > "logs\stop-pids.txt" 2>nul
  set "KILLED=0"
  for /f "tokens=5" %%p in ('type "logs\stop-pids.txt"') do (
    "%TASKKILL%" /PID %%p /F >nul 2>nul
    set "KILLED=1"
  )
  if "!KILLED!"=="1" (echo   Готово, сервер остановлен.) else (echo   Сервер и так не запущен.)
  del "logs\stop-net.txt" "logs\stop-pids.txt" >nul 2>nul
)

echo.
"%PING%" -n 3 127.0.0.1 >nul
exit /b 0