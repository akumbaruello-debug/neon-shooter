#requires -version 5.1
# Neon Shooter one-click launcher.
# Builds the game if needed, starts the Next.js server on a fixed port,
# opens the game in an app-mode browser window, then shuts the server down
# when the window closes (only if this script started the server).

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Port    = 3123
$BaseUrl = "http://localhost:$Port"
$Url     = "$BaseUrl/?autostart=1"

function Write-Step([string]$msg) {
    Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg)
}

function Test-Port([int]$p) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $p)
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-HttpOk {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $BaseUrl -TimeoutSec 3
        return ($r.StatusCode -eq 200)
    } catch {
        return $false
    }
}

# Resolve how to run next: prefer npm.cmd, fall back to the local next binary.
$npmCmd  = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$nextBin = Join-Path $ProjectRoot 'node_modules\next\dist\bin\next'

function Start-BuildProcess([string]$outFile, [string]$errFile) {
    if ($npmCmd) {
        return Start-Process -FilePath $npmCmd -ArgumentList 'run','build' `
            -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru `
            -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    }
    return Start-Process -FilePath 'node' -ArgumentList "`"$nextBin`"",'build' `
        -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile
}

function Start-ServerProcess {
    if ($npmCmd) {
        return Start-Process -FilePath $npmCmd -ArgumentList 'run','start' `
            -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
    }
    return Start-Process -FilePath 'node' -ArgumentList "`"$nextBin`"",'start','-p',"$Port" `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
}

# True when a fresh build is required.
function Test-NeedBuild {
    $buildId = Join-Path $ProjectRoot '.next\BUILD_ID'
    if (-not (Test-Path $buildId)) { return $true }
    $built = (Get-Item $buildId).LastWriteTimeUtc

    foreach ($rel in @('src', 'app', 'public', 'package.json')) {
        $full = Join-Path $ProjectRoot $rel
        if (-not (Test-Path $full)) { continue }
        if ((Get-Item $full).PSIsContainer) {
            $newer = Get-ChildItem -Path $full -Recurse -File -ErrorAction SilentlyContinue |
                     Where-Object { $_.LastWriteTimeUtc -gt $built } |
                     Select-Object -First 1
        } else {
            $newer = if ((Get-Item $full).LastWriteTimeUtc -gt $built) { Get-Item $full } else { $null }
        }
        if ($newer) { return $true }
    }
    return $false
}

# ------------------------------- main -------------------------------

$serverAlreadyRunning = Test-Port $Port
$startedServer        = $false
$serverPid            = $null

if ($serverAlreadyRunning) {
    Write-Step "Server already running on port $Port - reusing it."
    # Never build or start; we did not create this server.
} else {
    if (Test-NeedBuild) {
        Write-Step "Building the game (first run or sources changed)..."

        # Optional always-on-top status window while the build runs.
        $form = $null
        try {
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $form = New-Object System.Windows.Forms.Form
            $form.Text            = 'Preparing game...'
            $form.Width           = 440
            $form.Height          = 150
            $form.StartPosition   = 'CenterScreen'
            $form.TopMost         = $true
            $form.FormBorderStyle = 'FixedDialog'
            $form.MaximizeBox     = $false
            $form.MinimizeBox     = $false
            $form.ControlBox      = $false

            $lbl = New-Object System.Windows.Forms.Label
            $lbl.AutoSize = $true
            $lbl.Location = New-Object System.Drawing.Point(20, 30)
            $lbl.Text     = 'First run: building the game. This can take a minute.'

            $pb = New-Object System.Windows.Forms.ProgressBar
            $pb.Location                = New-Object System.Drawing.Point(20, 80)
            $pb.Width                   = 390
            $pb.Height                  = 20
            $pb.Style                   = 'Marquee'
            $pb.MarqueeAnimationSpeed   = 30

            $form.Controls.Add($lbl)
            $form.Controls.Add($pb)
            $form.Show()
            [System.Windows.Forms.Application]::DoEvents()
        } catch {
            Write-Step "Status window unavailable - continuing with console output only."
            $form = $null
        }

        $outFile = Join-Path $env:TEMP "neon-build-out-$PID.txt"
        $errFile = Join-Path $env:TEMP "neon-build-err-$PID.txt"
        Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

        $buildProc = Start-BuildProcess $outFile $errFile
        while (-not $buildProc.HasExited) {
            if ($form) { [System.Windows.Forms.Application]::DoEvents() }
            Start-Sleep -Milliseconds 120
        }
        $buildProc.WaitForExit()

        if ($form) { $form.Close(); $form.Dispose(); $form = $null }

        if ($buildProc.ExitCode -ne 0) {
            $lines = @()
            if (Test-Path $outFile) { $lines += Get-Content $outFile }
            if (Test-Path $errFile) { $lines += Get-Content $errFile }
            $tail = ($lines | Select-Object -Last 20) -join "`r`n"
            Write-Host $tail
            try {
                Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
                [System.Windows.Forms.MessageBox]::Show(
                    "Build failed. See the last 20 lines below.`r`n`r`n$tail",
                    'Neon Shooter', 'OK', 'Error') | Out-Null
            } catch { }
            Write-Step "Build failed (exit code $($buildProc.ExitCode))."
            exit 1
        }
        Write-Step "Build complete."
    } else {
        Write-Step "Build is up to date (.next/BUILD_ID newer than sources)."
    }

    Write-Step "Starting server on port $Port..."
    $serverProc = Start-ServerProcess
    $serverPid  = $serverProc.Id
    $startedServer = $true

    # Poll until the app answers HTTP 200 (about 60 seconds max).
    Write-Step "Waiting for server to respond at $BaseUrl ..."
    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpOk) { $ready = $true; break }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) {
        Write-Step "Server did not become ready within 60 seconds."
        taskkill /PID $serverPid /T /F | Out-Null
        exit 1
    }
}

try {
    # Poll once more if reusing an existing server (cheap, harmless).
    if ($serverAlreadyRunning) {
        $deadline = (Get-Date).AddSeconds(60)
        while (-not (Test-HttpOk) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 300
        }
    }
    Write-Step "Server ready at $BaseUrl"

    # Locate a Chromium browser for app-mode fullscreen.
    $chromePaths = @(
        'C:\Program Files\Google\Chrome\Application\chrome.exe',
        'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
    )
    $edgePaths = @(
        'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
    )
    $browser = $null
    foreach ($c in $chromePaths) { if (Test-Path $c) { $browser = $c; break } }
    if (-not $browser) { foreach ($e in $edgePaths) { if (Test-Path $e) { $browser = $e; break } } }

    $profileDir = Join-Path $env:LOCALAPPDATA 'NeonShooterProfile'

    if ($browser) {
        $browserArgs = @(
            "--app=$Url",
            '--start-fullscreen',
            "--user-data-dir=`"$profileDir`"",
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-features=Translate'
        )
        Write-Step "Opening game window with $browser"
        $browserProc = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru
        Write-Step "Game window is open. Close it to shut everything down."
        $browserProc.WaitForExit()
        Write-Step "Game window closed."
    } else {
        Write-Step "Chrome/Edge not found - opening in the default browser."
        Start-Process $Url
        Write-Step "Cannot track the default browser process; leaving server running."
        Write-Step "Re-run the launcher to reuse it, or close it manually."
    }
}
finally {
    if ($startedServer -and $serverPid) {
        Write-Step "Shutting down game server (PID $serverPid)..."
        taskkill /PID $serverPid /T /F | Out-Null
    } elseif (-not $startedServer) {
        Write-Step "Server was already running before launch - leaving it up."
    }
}