; ---------------------------------------------------------------------------
;  Instalador de escritorio - RootCause Blockchain Security
;
;  Instala POR USUARIO (sin permisos de administrador) la carpeta portable ya
;  ensamblada por packaging/windows/build-portable.ps1, junto con su motor
;  Node.js verificado por SHA-256.
;
;  Compilar:
;      powershell -File packaging/windows/build-portable.ps1
;      powershell -File packaging/windows/make-icon.ps1
;      iscc packaging/windows/RootCause-Blockchain-Security.iss
;
;  Los datos del usuario NUNCA viven junto al programa: se guardan cifrados en
;  %LOCALAPPDATA%\RootCause\blockchain-security y sobreviven a la desinstalacion.
; ---------------------------------------------------------------------------

#define AppName "RootCause Blockchain Security"
#define AppPublisher "Vladimir Acuna"
#define AppUrl "https://github.com/vladimiracunadev-create/rootcause-blockchain-security"
#define AppExeName "RootCause Blockchain Security.cmd"
#define SourceRoot "..\..\build\portable\RootCause-Blockchain-Security"

#ifndef AppVersion
  #define AppVersion "0.2.0"
#endif

[Setup]
AppId={{3F7B21C6-58D4-4A19-9E62-0C4D8B5F1A73}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/blob/main/SECURITY.md
AppUpdatesURL={#AppUrl}/releases
VersionInfoVersion={#AppVersion}
VersionInfoDescription=Seguridad watch-only y analisis causal para aplicaciones blockchain

; Instalacion por usuario: no pide UAC y no toca Archivos de programa.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
AllowNoIcons=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\rootcause.ico

OutputDir=..\..\build\installer
OutputBaseFilename=RootCause-Blockchain-Security-{#AppVersion}-win-x64-setup
SetupIconFile=rootcause.ico
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

LicenseFile=..\..\LICENSE
InfoBeforeFile=informacion-antes.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "rootcause.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\rootcause.ico"; WorkingDir: "{app}"; Comment: "Panel local watch-only de seguridad blockchain"
Name: "{group}\Generar clave de datos"; Filename: "{app}\Generar clave de datos.cmd"; IconFilename: "{app}\rootcause.ico"; WorkingDir: "{app}"
Name: "{group}\Leeme"; Filename: "{app}\LEEME.txt"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\rootcause.ico"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Abrir el panel ahora"; Flags: postinstall nowait skipifsilent shellexec

[UninstallDelete]
; Solo el programa. La carpeta de datos del usuario se conserva a proposito:
; borrar estado cifrado sin preguntar seria una perdida irreversible.
Type: filesandordirs; Name: "{app}\runtime"

[Messages]
spanish.WelcomeLabel2=Esto instalara [name/ver] en tu equipo.%n%nLa aplicacion es watch-only: nunca pide claves privadas, mnemonicos ni credenciales de proveedor, y no firma ni envia transacciones. Todo se ejecuta en tu maquina.
