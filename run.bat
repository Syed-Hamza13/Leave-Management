@echo off
setlocal EnableExtensions

rem Run the Leave Management dev servers.
rem Usage: run.bat            starts backend + frontend
rem        run.bat server     backend only
rem        run.bat client     frontend only

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
set "CLIENT_DIR=%ROOT%client"

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=all"

if /i "%TARGET%"=="all"    goto :all
if /i "%TARGET%"=="server" goto :server
if /i "%TARGET%"=="client" goto :client

echo Usage: run.bat [all ^| server ^| client]
exit /b 1

:all
echo.
echo ==================================================
echo   Leave Management - starting backend and frontend
echo ==================================================
echo   Backend  : http://localhost:4000
echo   Frontend : http://localhost:5173
echo   Needs    : MySQL and Redis running locally
echo.
start "LeaveMgmt - Backend" cmd /k ""%~f0" server"
timeout /t 3 /nobreak >nul
start "LeaveMgmt - Frontend" cmd /k ""%~f0" client"
echo Two windows were opened. Close them to stop the servers.
exit /b 0

:server
title LeaveMgmt - Backend
cd /d "%SERVER_DIR%" || (echo [backend] Folder not found: %SERVER_DIR% & exit /b 1)

call :require_file "%SERVER_DIR%\package.json"  || exit /b 1
call :require_file "%SERVER_DIR%\src\server.js" || exit /b 1
call :require_file "%SERVER_DIR%\.env"          || exit /b 1

if not exist "%SERVER_DIR%\node_modules\" (
    echo [backend] node_modules missing, running npm install...
    call npm install || (echo [backend] npm install failed & exit /b 1)
)

echo [backend] Starting nodemon on http://localhost:4000
call npm run dev
exit /b %ERRORLEVEL%

:client
title LeaveMgmt - Frontend
cd /d "%CLIENT_DIR%" || (echo [frontend] Folder not found: %CLIENT_DIR% & exit /b 1)

call :require_file "%CLIENT_DIR%\package.json" || exit /b 1
call :require_file "%CLIENT_DIR%\index.html"   || exit /b 1

if not exist "%CLIENT_DIR%\node_modules\" (
    echo [frontend] node_modules missing, running npm install...
    call npm install || (echo [frontend] npm install failed & exit /b 1)
)

echo [frontend] Starting Vite on http://localhost:5173
call npm run dev
exit /b %ERRORLEVEL%

rem Fails if the given file is missing or has zero bytes.
:require_file
if not exist %1 (
    echo [run] Missing required file: %~1
    exit /b 1
)
if %~z1 equ 0 (
    echo [run] Required file is EMPTY: %~1
    echo [run] This file was truncated and must be restored before starting.
    exit /b 1
)
exit /b 0
