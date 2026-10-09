@echo off
rem Starts the NForce Sync backend in THIS window, capped at a 512 MB heap.
rem Run it yourself (double-click, or from your own Command Prompt) and leave the window open
rem while you work. It listens on http://localhost:8080 ; Ctrl+C stops it.
setlocal
title NForce Sync backend (port 8080)

cd /d "%~dp0backend" || (
  echo Could not find the backend folder next to this script: "%~dp0backend"
  pause
  exit /b 1
)

echo Starting NForce Sync backend with a 512 MB heap...
echo Wait for the line "Started SyncApplication", then leave this window open.
echo.

rem ".\" is explicit on purpose: with NoDefaultCurrentDirectoryInExePath set, cmd will not find a bare "mvnw.cmd".
call .\mvnw.cmd spring-boot:run -Dspring-boot.run.jvmArguments=-Xmx512m
set EXITCODE=%ERRORLEVEL%

echo.
echo ============================================================
echo The backend has stopped (exit code %EXITCODE%).
echo Scroll up to read any error. The login page will say "Could not reach the server" until it is started again.
echo ============================================================
pause
exit /b %EXITCODE%
