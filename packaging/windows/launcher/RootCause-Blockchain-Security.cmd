@echo off
rem ---------------------------------------------------------------------------
rem  RootCause Blockchain Security - lanzador de escritorio
rem
rem  Arranca el servidor local y abre el panel en el navegador por defecto.
rem  Cierra esta ventana para detener la aplicacion.
rem
rem  La configuracion del usuario vive fuera de la carpeta del programa:
rem      %LOCALAPPDATA%\RootCause\blockchain-security\config.cmd
rem  Ese archivo puede definir DEMO_MODE, ROOTCAUSE_DATA_KEY, EVM_RPC_URL, etc.
rem ---------------------------------------------------------------------------
setlocal
title RootCause Blockchain Security

set "APP_DIR=%~dp0"
set "ROOTCAUSE_HOME=%LOCALAPPDATA%\RootCause\blockchain-security"
if not exist "%ROOTCAUSE_HOME%" mkdir "%ROOTCAUSE_HOME%" >nul 2>&1
if not exist "%ROOTCAUSE_HOME%\data" mkdir "%ROOTCAUSE_HOME%\data" >nul 2>&1
if exist "%ROOTCAUSE_HOME%\config.cmd" call "%ROOTCAUSE_HOME%\config.cmd"

if not defined HOST set "HOST=127.0.0.1"
if not defined PORT set "PORT=8790"
if not defined DEMO_MODE set "DEMO_MODE=true"
if not defined DATA_DIR set "DATA_DIR=%ROOTCAUSE_HOME%\data"
rem El panel se abre solo, salvo que quien lanza la aplicacion (por ejemplo la
rem verificacion automatica en CI) haya fijado ya esta variable.
if not defined ROOTCAUSE_OPEN_BROWSER set "ROOTCAUSE_OPEN_BROWSER=1"

if /i "%DEMO_MODE%"=="false" if not defined ROOTCAUSE_DATA_KEY (
  echo.
  echo  DEMO_MODE=false requiere una clave de datos.
  echo  Ejecuta "Generar clave de datos.cmd" y guardala en:
  echo      %ROOTCAUSE_HOME%\config.cmd
  echo  con la linea:  set "ROOTCAUSE_DATA_KEY=valor-generado"
  echo.
  pause
  exit /b 1
)

echo.
echo  RootCause Blockchain Security
echo  Panel local: http://%HOST%:%PORT%
echo  Modo demostracion: %DEMO_MODE%
echo  Carpeta de datos: %DATA_DIR%
echo  Cierra esta ventana para detener la aplicacion.
echo.

"%APP_DIR%runtime\node.exe" "%APP_DIR%src\server.js"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo  La aplicacion termino con codigo %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
