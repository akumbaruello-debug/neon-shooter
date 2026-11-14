@echo off
rem Double-clickable wrapper for the Neon Shooter launcher.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-game.ps1" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo Launcher exited with code %RC%.
    pause
)
endlocal & exit /b %RC%