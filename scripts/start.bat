@echo off
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║   OpenClaw Command Centre                        ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: Check node version
node --version >nul 2>&1 || (echo ERROR: Node.js not found & pause & exit /b 1)

set ROOT=%~dp0..
set SERVER=%ROOT%\server
set WEB=%ROOT%\apps\web

echo [1/3] Starting API server on port 4000...
start "OpenClaw API" cmd /k "cd /d %SERVER% && set NODE_OPTIONS=--experimental-sqlite && node ..\node_modules\.bin\tsx src\index.ts"

timeout /t 3 /nobreak >nul

echo [2/3] Starting WebSocket server on port 4001...
echo       (Included in API server above)

echo [3/3] Starting Next.js on port 3000...
start "OpenClaw UI" cmd /k "cd /d %WEB% && node node_modules\next\dist\bin\next dev -p 3000"

echo.
echo  Both servers starting...
echo.
echo  Frontend : http://localhost:3000
echo  API      : http://localhost:4000
echo  Health   : http://localhost:4000/api/health
echo.
pause
