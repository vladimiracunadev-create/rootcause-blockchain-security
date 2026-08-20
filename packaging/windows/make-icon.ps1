<#
.SYNOPSIS
    Genera el icono de Windows (.ico) a partir del icono vectorial del panel.

.DESCRIPTION
    El repositorio versiona un unico icono de origen (src/web/static/icon.svg).
    Windows necesita un .ico multiresolucion para el acceso directo y para el
    instalador, y no queremos versionar un binario que nadie sabe de donde
    salio: se genera aqui, desde codigo, con GDI+ (System.Drawing).

    El dibujo es geometrico a proposito -el mismo cubo de bloques del panel- y
    no depende de ninguna fuente instalada: un glifo ausente en el runner de CI
    produciria un icono distinto al del escritorio del usuario.

.EXAMPLE
    powershell -File packaging/windows/make-icon.ps1
#>
[CmdletBinding()]
param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# $PSScriptRoot no esta disponible dentro del bloque param() en PowerShell 5.1.
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "rootcause.ico"
}

Add-Type -AssemblyName System.Drawing

# Paleta tomada del propio panel (src/web/static/styles.css).
$background = [System.Drawing.Color]::FromArgb(255, 11, 16, 32)
$violet = [System.Drawing.Color]::FromArgb(255, 124, 92, 255)
$teal = [System.Drawing.Color]::FromArgb(255, 41, 211, 194)
$core = [System.Drawing.Color]::FromArgb(255, 247, 249, 255)

function New-RoundedPath([System.Drawing.Rectangle]$Rect, [int]$Radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
    $path.AddArc(($Rect.Right - $diameter), $Rect.Y, $diameter, $diameter, 270, 90)
    $path.AddArc(($Rect.Right - $diameter), ($Rect.Bottom - $diameter), $diameter, $diameter, 0, 90)
    $path.AddArc($Rect.X, ($Rect.Bottom - $diameter), $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconFrame([int]$Size) {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.Clear([System.Drawing.Color]::Transparent)

        # Fondo redondeado.
        $radius = [Math]::Max(2, [int]($Size * 0.22))
        $rect = New-Object System.Drawing.Rectangle(0, 0, ($Size - 1), ($Size - 1))
        $path = New-RoundedPath -Rect $rect -Radius $radius
        $brush = New-Object System.Drawing.SolidBrush($background)
        $graphics.FillPath($brush, $path)
        $brush.Dispose()
        $path.Dispose()

        # El cubo isometrico: mismas coordenadas que icon.svg, escaladas.
        # Origen del SVG: viewBox 0 0 128 128.
        $scale = $Size / 128.0
        function Point([double]$X, [double]$Y) {
            return New-Object System.Drawing.PointF(($X * $scale), ($Y * $scale))
        }

        $outlineWidth = [Math]::Max(1.0, 8.0 * $scale)
        $outline = New-Object System.Drawing.Pen($violet, $outlineWidth)
        $outline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $outline.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $outline.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

        $hexagon = @(
            (Point 26 42), (Point 64 20), (Point 102 42),
            (Point 102 86), (Point 64 108), (Point 26 86)
        )
        $graphics.DrawPolygon($outline, [System.Drawing.PointF[]]$hexagon)
        $outline.Dispose()

        $inner = New-Object System.Drawing.Pen($teal, $outlineWidth)
        $inner.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $inner.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $inner.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $graphics.DrawLines($inner, [System.Drawing.PointF[]]@((Point 26 42), (Point 64 65), (Point 102 42)))
        $graphics.DrawLine($inner, (Point 64 65), (Point 64 108))
        $inner.Dispose()

        # Nucleo: la causa raiz en el centro del grafo.
        $coreRadius = 11.0 * $scale
        $coreBrush = New-Object System.Drawing.SolidBrush($core)
        $graphics.FillEllipse(
            $coreBrush,
            (64 * $scale - $coreRadius),
            (65 * $scale - $coreRadius),
            ($coreRadius * 2),
            ($coreRadius * 2)
        )
        $coreBrush.Dispose()
    }
    finally {
        $graphics.Dispose()
    }
    return $bitmap
}

# Los marcos pequenos van como DIB clasico (BITMAPINFOHEADER + BGRA + mascara
# AND) porque es lo que entiende TODO Windows y tambien el compilador de Inno
# Setup; solo 128 y 256 usan PNG, donde el ahorro de tamano compensa.
function ConvertTo-DibFrame([System.Drawing.Bitmap]$Bitmap) {
    $size = $Bitmap.Width
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $data = $Bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $pixels = New-Object byte[] ($data.Stride * $size)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
    }
    finally {
        $Bitmap.UnlockBits($data)
    }

    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($stream)
    try {
        $maskStride = [int](([Math]::Ceiling($size / 32.0)) * 4)
        $writer.Write([uint32]40)               # biSize
        $writer.Write([int32]$size)             # biWidth
        $writer.Write([int32]($size * 2))       # biHeight: imagen + mascara
        $writer.Write([uint16]1)                # biPlanes
        $writer.Write([uint16]32)               # biBitCount
        $writer.Write([uint32]0)                # biCompression: BI_RGB
        $writer.Write([uint32](($size * $size * 4) + ($maskStride * $size)))
        $writer.Write([int32]0)                 # biXPelsPerMeter
        $writer.Write([int32]0)                 # biYPelsPerMeter
        $writer.Write([uint32]0)                # biClrUsed
        $writer.Write([uint32]0)                # biClrImportant

        # El DIB se almacena de abajo hacia arriba.
        for ($y = $size - 1; $y -ge 0; $y--) {
            $writer.Write($pixels, ($y * $data.Stride), ($size * 4))
        }
        # Mascara AND a cero: la transparencia real viene del canal alfa.
        $writer.Write((New-Object byte[] ($maskStride * $size)))
        $writer.Flush()
        # La coma evita que PowerShell despliegue el array en la tuberia y lo
        # convierta en una coleccion de objetos: aqui debe salir un byte[].
        return ,$stream.ToArray()
    }
    finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

$sizes = @(16, 32, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $bitmap = New-IconFrame -Size $size
    if ($size -le 64) {
        [byte[]]$bytes = ConvertTo-DibFrame -Bitmap $bitmap
    }
    else {
        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $stream.ToArray()
        $stream.Dispose()
    }
    $frames += [pscustomobject]@{ Size = $size; Bytes = $bytes }
    $bitmap.Dispose()
}

# Contenedor ICO: cabecera (6 bytes) + una entrada de directorio por marco
# (16 bytes) + los marcos concatenados.
$output = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($output)
try {
    $writer.Write([uint16]0)              # reservado
    $writer.Write([uint16]1)              # tipo: icono
    $writer.Write([uint16]$frames.Count)

    $offset = 6 + (16 * $frames.Count)
    foreach ($frame in $frames) {
        $dimension = if ($frame.Size -ge 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$dimension)   # ancho
        $writer.Write([byte]$dimension)   # alto
        $writer.Write([byte]0)            # colores de paleta
        $writer.Write([byte]0)            # reservado
        $writer.Write([uint16]1)          # planos
        $writer.Write([uint16]32)         # bits por pixel
        $writer.Write([uint32]$frame.Bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) {
        $writer.Write([byte[]]$frame.Bytes)
    }
    $writer.Flush()
    [System.IO.File]::WriteAllBytes($OutputPath, $output.ToArray())
}
finally {
    $writer.Dispose()
    $output.Dispose()
}

$icon = New-Object System.Drawing.Icon($OutputPath)
Write-Host "Icono generado: $OutputPath ($($frames.Count) resoluciones, $((Get-Item $OutputPath).Length) bytes)"
$icon.Dispose()
