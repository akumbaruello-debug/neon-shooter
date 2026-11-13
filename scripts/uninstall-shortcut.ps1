#requires -version 5.1
# Removes the Neon Dodger Desktop shortcut. Leaves the game files untouched.

$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Neon Dodger.lnk'

if (Test-Path $lnkPath) {
    Remove-Item $lnkPath -Force
    Write-Host "Removed shortcut: $lnkPath"
} else {
    Write-Host "No shortcut found at $lnkPath (nothing to do)."
}