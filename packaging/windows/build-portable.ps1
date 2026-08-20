<#
.SYNOPSIS
    Construye la edicion portable de RootCause Blockchain Security para Windows.

.DESCRIPTION
    Ensambla una carpeta autocontenida con:
      - el motor Node.js oficial (node.exe), descargado y VERIFICADO por SHA-256
        contra el SHASUMS256.txt que publica nodejs.org;
      - el codigo de la aplicacion, sin dependencias de terceros;
      - los lanzadores de escritorio.

    El resultado es un ZIP que se descomprime y se ejecuta: no requiere Node
    instalado, ni permisos de administrador, ni conexion a Internet en tiempo
    de ejecucion.

.PARAMETER NodeMajor
    Rama LTS de Node a incluir. Se resuelve a la ultima version de esa rama.

.PARAMETER NodeVersion
    Version exacta (por ejemplo 22.21.1). Tiene prioridad sobre -NodeMajor y
    hace la compilacion reproducible.

.EXAMPLE
    powershell -File packaging/windows/build-portable.ps1 -NodeVersion 22.21.1
#>
[CmdletBinding()]
param(
    [string]$NodeMajor = "22",
    [string]$NodeVersion = "",
    [string]$Architecture = "x64",
    [string]$OutputDir = "build"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$ProgressPreference = "SilentlyContinue"

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$outputRoot = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $repoRoot $OutputDir }
$manifest = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$appVersion = $manifest.version
$productName = "RootCause-Blockchain-Security"

Write-Step "RootCause Blockchain Security $appVersion - edicion portable $Architecture"

# -- 1. Resolver la version de Node -------------------------------------------
if ([string]::IsNullOrWhiteSpace($NodeVersion)) {
    Write-Step "Resolviendo la ultima LTS de la rama Node $NodeMajor"
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
    $candidate = $index |
        Where-Object { $_.lts -ne $false -and $_.version -like "v$NodeMajor.*" } |
        Select-Object -First 1
    if (-not $candidate) {
        throw "No se encontro una version LTS para la rama Node $NodeMajor."
    }
    $NodeVersion = $candidate.version.TrimStart("v")
}
Write-Host "    Node v$NodeVersion"

# -- 2. Descargar y verificar el runtime oficial ------------------------------
$workDir = Join-Path ([System.IO.Path]::GetTempPath()) "rcbs-build-$([System.Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
try {
    $archiveName = "node-v$NodeVersion-win-$Architecture.zip"
    $baseUrl = "https://nodejs.org/dist/v$NodeVersion"
    $archivePath = Join-Path $workDir $archiveName
    $sumsPath = Join-Path $workDir "SHASUMS256.txt"

    Write-Step "Descargando $archiveName"
    Invoke-WebRequest -Uri "$baseUrl/$archiveName" -OutFile $archivePath -UseBasicParsing
    Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -OutFile $sumsPath -UseBasicParsing

    Write-Step "Verificando SHA-256 del runtime"
    $expectedLine = Select-String -Path $sumsPath -Pattern ([regex]::Escape($archiveName)) |
        Select-Object -First 1
    if (-not $expectedLine) {
        throw "SHASUMS256.txt no contiene una entrada para $archiveName."
    }
    $expected = ($expectedLine.Line -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        throw "El runtime descargado NO coincide con su hash oficial. Esperado $expected, obtenido $actual."
    }
    Write-Host "    SHA-256 OK  $actual"

    Write-Step "Extrayendo node.exe"
    $extractDir = Join-Path $workDir "extract"
    Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force
    $nodeExe = Join-Path $extractDir "node-v$NodeVersion-win-$Architecture\node.exe"
    if (-not (Test-Path $nodeExe)) {
        throw "No se encontro node.exe dentro de $archiveName."
    }

    # -- 3. Ensamblar la carpeta de la aplicacion -----------------------------
    Write-Step "Ensamblando la aplicacion"
    $stageRoot = Join-Path $workDir "stage"
    $appDir = Join-Path $stageRoot $productName
    New-Item -ItemType Directory -Path $appDir -Force | Out-Null

    foreach ($directory in @("src", "config", "scripts", "docs", "examples")) {
        Copy-Item -Path (Join-Path $repoRoot $directory) -Destination $appDir -Recurse -Force
    }
    foreach ($file in @("package.json", "LICENSE", "README.md", "SECURITY.md", "CHANGELOG.md", ".env.example")) {
        Copy-Item -Path (Join-Path $repoRoot $file) -Destination $appDir -Force
    }

    New-Item -ItemType Directory -Path (Join-Path $appDir "runtime") -Force | Out-Null
    Copy-Item -Path $nodeExe -Destination (Join-Path $appDir "runtime\node.exe") -Force

    $launcherDir = Join-Path $PSScriptRoot "launcher"
    Copy-Item -Path (Join-Path $launcherDir "RootCause-Blockchain-Security.cmd") -Destination (Join-Path $appDir "RootCause Blockchain Security.cmd") -Force
    Copy-Item -Path (Join-Path $launcherDir "Generar clave de datos.cmd") -Destination $appDir -Force
    Copy-Item -Path (Join-Path $launcherDir "LEEME.txt") -Destination $appDir -Force

    $buildInfo = [ordered]@{
        product       = "RootCause Blockchain Security"
        version       = $appVersion
        architecture  = $Architecture
        nodeVersion   = "v$NodeVersion"
        nodeArchive   = $archiveName
        nodeSha256    = $actual
        builtOnUtc    = (Get-Date).ToUniversalTime().ToString("s") + "Z"
        runtimeSource = "$baseUrl/$archiveName"
        dependencies  = "ninguna: la aplicacion no instala paquetes de terceros"
    }
    $buildInfo | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $appDir "BUILD-INFO.json") -Encoding utf8

    # -- 4. Verificar que el paquete es utilizable ----------------------------
    #
    # Un ZIP que pesa lo esperado no prueba nada. Aqui se arranca la aplicacion
    # CON EL node.exe EMPAQUETADO y se comprueba que sirve el panel, que arranca
    # con inventario y que sigue rechazando material secreto. Si el paquete
    # quedara incompleto, este paso es el que lo descubre, no el usuario.
    Write-Step "Verificando el paquete ensamblado (arranque real)"
    $packagedNode = Join-Path $appDir "runtime\node.exe"
    & $packagedNode (Join-Path $appDir "scripts\check-security-claims.js")
    if ($LASTEXITCODE -ne 0) {
        throw "El paquete no supero los invariantes de seguridad al arrancar."
    }

    $requiredInPackage = @(
        "runtime\node.exe",
        "src\server.js",
        "src\web\static\index.html",
        "config\control-catalog.json",
        "config\policies.json",
        "examples\project.sample.json",
        "RootCause Blockchain Security.cmd",
        "LEEME.txt",
        "BUILD-INFO.json"
    )
    foreach ($relative in $requiredInPackage) {
        if (-not (Test-Path (Join-Path $appDir $relative))) {
            throw "Artefacto faltante en el paquete: $relative"
        }
    }

    # El paquete no puede llevar datos del desarrollador ni secretos.
    foreach ($forbidden in @("data", "node_modules", ".env", ".git")) {
        if (Test-Path (Join-Path $appDir $forbidden)) {
            throw "El paquete incluye algo que no debe distribuirse: $forbidden"
        }
    }

    # -- 5. Comprimir y sellar por hash ---------------------------------------
    if (-not (Test-Path $outputRoot)) {
        New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    }
    $zipName = "$productName-$appVersion-win-$Architecture-portable.zip"
    $zipPath = Join-Path $outputRoot $zipName
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

    Write-Step "Comprimiendo $zipName"
    # Tras el arranque de verificacion, Windows (y el antivirus) pueden mantener
    # node.exe bloqueado unos instantes. Reintentar es mas honesto que fallar el
    # release por una condicion de carrera del sistema de archivos.
    $compressed = $false
    foreach ($attempt in 1..5) {
        try {
            Compress-Archive -Path $appDir -DestinationPath $zipPath -CompressionLevel Optimal -Force
            $compressed = $true
            break
        }
        catch {
            if ($attempt -eq 5) { throw }
            Write-Host "    node.exe todavia bloqueado; reintento $attempt de 5"
            Start-Sleep -Seconds 3
        }
    }
    if (-not $compressed) {
        throw "No se pudo comprimir el paquete portable."
    }

    $zipHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    "$zipHash  $zipName" | Set-Content -Path (Join-Path $outputRoot "$zipName.sha256") -Encoding ascii

    # La carpeta ensamblada se conserva: el instalador Inno Setup la reutiliza.
    $stageOut = Join-Path $outputRoot "portable"
    if (Test-Path $stageOut) { Remove-Item $stageOut -Recurse -Force }
    New-Item -ItemType Directory -Path $stageOut -Force | Out-Null
    Copy-Item -Path $appDir -Destination $stageOut -Recurse -Force

    Write-Host ""
    Write-Host "  Portable listo" -ForegroundColor Green
    Write-Host "    $zipPath  ($sizeMb MB)"
    Write-Host "    sha256 $zipHash"
    Write-Host "    carpeta ensamblada: $(Join-Path $stageOut $productName)"
}
finally {
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
}
