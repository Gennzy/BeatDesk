@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Системные утилиты по абсолютным путям: PATH в этой системе может быть пустым
set "SYS32=%SystemRoot%\System32"
set "PS=%SYS32%\WindowsPowerShell\v1.0\powershell.exe"
set "NETSTAT=%SYS32%\netstat.exe"
set "FINDSTR=%SYS32%\findstr.exe"
set "CHCP=%SYS32%\chcp.com"
set "PING=%SYS32%\ping.exe"
set "TASKKILL=%SYS32%\taskkill.exe"

if exist "%CHCP%" "%CHCP%" 866 >nul 2>nul

set "PORT=3000"
set "MODE=start"
if /i "%~1"=="dev" (
  set "MODE=dev"
) else if not "%~1"=="" (
  set "PORT=%~1"
)

echo.
echo   BEATDESK
echo   --------

rem Ищем Node.js. В PATH его тут нет, поэтому ищем руками.
set "NODEDIR="
for %%P in (
  "%~dp0node.exe"
  "%~dp0..\node.exe"
  "%~dp0..\node\node.exe"
  "%~dp0..\nodejs\node.exe"
  "%ProgramFiles%\nodejs\node.exe"
  "%ProgramFiles(x86)%\nodejs\node.exe"
  "%LOCALAPPDATA%\Programs\nodejs\node.exe"
  "%ProgramData%\nvm\node.exe"
  "%APPDATA%\nvm\node.exe"
) do (
  if not defined NODEDIR if exist %%P set "NODEDIR=%%~dpP"
)
if not defined NODEDIR for %%D in (%SystemDrive% "%~dp0..") do (
  if not defined NODEDIR if exist "%%~fD\node" set "NODEDIR=%%~fD\"
  if not defined NODEDIR if exist "%%~fD\node\node.exe" set "NODEDIR=%%~fD\node\"
  if not defined NODEDIR if exist "%%~fD\nodejs\node.exe" set "NODEDIR=%%~fD\nodejs\"
)
if not defined NODEDIR for %%i in (node.exe) do if not defined NODEDIR set "NODEDIR=%%~$PATH:i"

if defined NODEDIR set "PATH=%NODEDIR%;%PATH%"

node -v >nul 2>nul
if errorlevel 1 (
  echo   [ошибка] Node.js не найден.
  echo   Искал в папке проекта, на дисках и в Program Files.
  echo   Положи node.exe рядом с этой папкой и открой файл снова.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo   Node.js %%v, папка %NODEDIR%

call :portbusy
if "%PORTBUSY%"=="1" (
  echo   Порт %PORT% уже занят - значит сайт уже запущен.
  echo   Открываю в браузере: http://localhost:%PORT%
  start "" "http://localhost:%PORT%"
  exit /b 0
)

if not exist "node_modules\next\package.json" (
  echo   Зависимости не найдены, ставлю первый раз. Это займет пару минут.
  if not defined PNPM set "PNPM=%APPDATA%\npm\pnpm.cmd"
  call "%PNPM%" install --prefer-offline
  if errorlevel 1 (
    echo   [ошибка] Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

set "NEEDBUILD=0"
if not exist ".next\BUILD_ID" set "NEEDBUILD=1"
if "%NEEDBUILD%"=="0" call :stale

if "%NEEDBUILD%"=="1" (
  echo   Собираю актуальную версию, обычно 1-2 минуты.
  set "NODE_OPTIONS=--max-old-space-size=4096"
  call node_modules\.bin\next.cmd build
  if errorlevel 1 (
    echo   [ошибка] Сборка не прошла.
    pause
    exit /b 1
  )
)

if "%MODE%"=="dev" (
  echo.
  echo   Режим разработки с перезагрузкой: http://localhost:%PORT%
  echo   Окно нужно не закрывать. Остановить - Ctrl+C.
  echo.
  start "" "http://localhost:%PORT%"
  call node_modules\.bin\next.cmd dev -p %PORT%
  exit /b 0
)

if not exist "logs" mkdir "logs"

echo   Запускаю сервер на порту %PORT% без окна.
if exist "%PS%" (
  "%PS%" -NoProfile -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/c','node_modules\.bin\next.cmd start -p %PORT% ^> logs\server.log 2>&1' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
) else (
  start "" /min cmd /c "node_modules\.bin\next.cmd start -p %PORT% ^> logs\server.log 2>&1"
)

if exist "%PS%" (
  "%PS%" -NoProfile -Command "$u='http://localhost:%PORT%/'; for($i=0;$i -lt 90;$i++){ try { if((Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){ exit 0 } } catch { }; Start-Sleep -Milliseconds 700 }; exit 1"
  if errorlevel 1 echo   Сервер не ответил за минуту, открываю все равно. Лог: logs\server.log
) else (
  "%PING%" -n 4 127.0.0.1 >nul
)

start "" "http://localhost:%PORT%"
echo.
echo   Сайт открыт. Остановить сервер - двойной клик по stop.bat
echo.
exit /b 0

:portbusy
set "PORTBUSY=0"
"%NETSTAT%" -ano | "%FINDSTR%" /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 set "PORTBUSY=1"
exit /b 0

:stale
if not exist "%PS%" (
  set "NEEDBUILD=1"
  exit /b 0
)
"%PS%" -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID' -EA SilentlyContinue); $n=(Get-ChildItem 'src','public' -Recurse -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1); if($b -and $n -and $n.LastWriteTime -le $b.LastWriteTime){ exit 0 } else { exit 1 }"
if errorlevel 1 set "NEEDBUILD=1"
exit /b 0