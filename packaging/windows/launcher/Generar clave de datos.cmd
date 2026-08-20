@echo off
rem ---------------------------------------------------------------------------
rem  Genera una clave AES-256 para la persistencia cifrada y explica donde
rem  guardarla. La clave NUNCA se escribe dentro de la carpeta del programa.
rem ---------------------------------------------------------------------------
setlocal
title RootCause Blockchain Security - clave de datos
set "APP_DIR=%~dp0"
set "ROOTCAUSE_HOME=%LOCALAPPDATA%\RootCause\blockchain-security"

echo.
echo  Clave de datos (AES-256-GCM):
echo.
"%APP_DIR%runtime\node.exe" "%APP_DIR%scripts\generate-key.js"
echo.
echo  Guardala en un gestor de contrasenas y, para activarla, crea el archivo:
echo      %ROOTCAUSE_HOME%\config.cmd
echo  con estas dos lineas:
echo      set "DEMO_MODE=false"
echo      set "ROOTCAUSE_DATA_KEY=valor-generado"
echo.
echo  Si pierdes la clave, los datos cifrados no se pueden recuperar.
echo.
pause
