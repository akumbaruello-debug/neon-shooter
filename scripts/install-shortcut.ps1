#requires -version 5.1
# Creates a Desktop shortcut that launches Neon Dodger in one click.
# Also generates public/ship.ico if it is missing.

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PublicDir   = Join-Path $ProjectRoot 'public'
$IcoPath     = Join-Path $PublicDir 'ship.ico'
$Launcher    = Join-Path $PSScriptRoot 'launch-game.ps1'

# 64x64 PNG of a cyan ship/arrow, authored as text. Used only if
# System.Drawing is unavailable on this machine.
$FallbackPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAMtSURBVHhe7ZsxiBNBFIantLS0tLS0tLS0vNLS0tLywMKAoFjZKRZyikI6xUJEEIONwsERDg4CWgQvOxdBMCDIXXG8J2+Cl8172d1kM+/N3rk/fNXtJP9MdudN3p9zbogX3AivujFedP+l9uGa84gnZDB0HnrOw5bz2HEZ3jjbC0R3QH4BqjiTC+RhIiZal1O5QMHwgslowBeIHsHkOoCHwqgZMHZDPMct2SqDm9KYIRlc55ZsNYIrwpQp8IVbshXdgsKUMRle5rZslcFAmDIFtrglW2XwWpqyBA7DmSSZqCQJU8aM4Ba3ZSePG8KQOTDmtuzk8ZI0lIQNbs1O9BxKQ8bAO27LTlSPhaEEJCuJHh4LMymgo3kS0S7MzSQhlMQE3w/oa6swk4gkJXGI54WRVNDJNImoFnMzWuz+RLft0e38kH8jkvQKqAxxI7GhCT/oott8NOPuM3Sfv89fR8dzcx3AfWE4JjT5/MQ5Hwbz15u30qg5wU3HYv8Y3b0XctJ57jxF9/XPbIx5SaRDCDcei6pP/x+9b7lx1i2z0BxROhK/35OTXcSr7flx1LIzlYe+MB8D2uT4ZBdBCzU3Fvrcoq48dIX5GAyP0N1+IifM2fslx1Lf0kwj3BQGYlH1GLz8JMcQpiWR54WxebOz+E54/nFaKfj1AcuW2ap5YR0Gv9G93Z1ueLQgdCrk10g63KqeYuaF0bAsiZZ54SqYpUhJ88IyrFKk1HlhGSYts+R5YRkWKVIT8sJCrEpi8rywBJOWWfK8sAyLFKkJeWE5yilSI/LCMrRTpObkhcWol0St5kgs1FtmTckLC9FOkdTzwggLrFoS1fJC6J08v7TXrFNyVVOk6Hkh9AsTn/BeNe+IotdcW9HyQhiH3w0vIyq/4Se1/DVKUG2ZrZUXwiT0GOtsVOHxW+G91VKkWnkhHIYSRXfQOpregZ2lyrFaSVw5L4Ru9E8j9CmrKpJWy2zpvDC3s2upqmKopEiVeWHJzq6lwoqhkSIV5oUr7OxaWlQxVFKkubxwjZ1dS/mKoVISQ14YaWfX0qxiTOK3zBr/j0850eS1N+NWrVq1atXq9OsvyIJLf40MJSEAAAAASUVORK5CYII='

# Writes a PNG payload as a single-image .ico (PNG-compressed ICO).
function Write-Ico([byte[]]$png, [string]$path) {
    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Create)
    try {
        $bw = New-Object System.IO.BinaryWriter($fs)
        # ICONDIR
        $bw.Write([UInt16]0)          # reserved
        $bw.Write([UInt16]1)          # type: 1 = icon
        $bw.Write([UInt16]1)          # image count
        # ICONDIRENTRY
        $bw.Write([byte]64)           # width
        $bw.Write([byte]64)           # height
        $bw.Write([byte]0)            # palette colors
        $bw.Write([byte]0)            # reserved
        $bw.Write([UInt16]1)          # color planes
        $bw.Write([UInt16]32)         # bits per pixel
        $bw.Write([UInt32]$png.Length)# bytes in resource
        $bw.Write([UInt32]22)         # image offset (6 + 16)
        $bw.Write($png)
        $bw.Flush()
    } finally {
        $fs.Close()
    }
}

# Returns 'drawing', 'embedded', or $null.
function New-ShipIcon([string]$path) {
    # 1) Draw the ship with System.Drawing (present on Windows PowerShell 5.1).
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $bmp = New-Object System.Drawing.Bitmap 64, 64
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.Clear([System.Drawing.Color]::Transparent)

        $cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 229, 255))
        $dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 120, 150))

        $hull = @(
            (New-Object System.Drawing.Point 32, 4),
            (New-Object System.Drawing.Point 54, 56),
            (New-Object System.Drawing.Point 32, 44),
            (New-Object System.Drawing.Point 10, 56)
        )
        $g.FillPolygon($cyan, $hull)
        $g.FillEllipse($dark, 27, 20, 10, 10)

        $cyan.Dispose(); $dark.Dispose(); $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()

        Write-Ico $ms.ToArray() $path
        return 'drawing'
    } catch {
        Write-Host "System.Drawing icon path failed: $($_.Exception.Message)"
    }

    # 2) Fall back to the embedded base64 PNG.
    try {
        $png = [Convert]::FromBase64String($FallbackPngBase64)
        Write-Ico $png $path
        return 'embedded'
    } catch {
        Write-Host "Embedded PNG icon path failed: $($_.Exception.Message)"
    }

    return $null
}

# ------------------------------- main -------------------------------

if (-not (Test-Path $PublicDir)) {
    New-Item -ItemType Directory -Path $PublicDir -Force | Out-Null
}

$iconMode = 'existing'
if (-not (Test-Path $IcoPath)) {
    $iconMode = New-ShipIcon $IcoPath
}

if (Test-Path $IcoPath) {
    $iconLocation = "$IcoPath,0"
    switch ($iconMode) {
        'drawing'  { Write-Host "Generated ship icon (System.Drawing): $IcoPath" }
        'embedded' { Write-Host "Generated ship icon (embedded PNG): $IcoPath" }
        default    { Write-Host "Reusing existing icon: $IcoPath" }
    }
} else {
    $iconLocation = "$env:SystemRoot\System32\shell32.dll,13"
    Write-Host "Could not generate ship.ico - using fallback icon shell32.dll index 13."
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Neon Dodger.lnk'

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = 'powershell.exe'
$shortcut.Arguments        = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.IconLocation     = $iconLocation
$shortcut.Description      = 'Neon Dodger - one-click launch'
$shortcut.Save()

if (Test-Path $lnkPath) {
    Write-Host "Created shortcut: $lnkPath"
    Write-Host "Target:            powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
    Write-Host "WorkingDirectory:  $ProjectRoot"
    Write-Host "Icon:              $iconLocation"
} else {
    throw "Shortcut was not created at $lnkPath"
}