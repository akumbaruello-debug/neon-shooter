# Neon Dodger Launcher

One-click launcher for the Neon Dodger Next.js game. Windows PowerShell 5.1+.

## Files

- `launch-game.ps1` - builds if needed, starts the server on port 3123, opens
  an app-mode fullscreen browser window, then stops the server when the window
  closes (only if it started the server).
- `launch-game.cmd` - double-clickable wrapper (calls the ps1 with
  `-ExecutionPolicy Bypass`).
- `install-shortcut.ps1` - creates `Neon Dodger.lnk` on the Desktop and
  generates `public/ship.ico` if missing.
- `uninstall-shortcut.ps1` - removes the Desktop shortcut.

## Install

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
```

Then double-click **Neon Dodger** on the Desktop.

## Uninstall

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-shortcut.ps1
```

## Notes

- Fixed port: **3123** (`http://localhost:3123/?autostart=1`).
- First run builds the app (status window, ~1 minute). Later runs reuse `.next`
  unless sources are newer than `.next/BUILD_ID`.
- Uses a dedicated browser profile at `%LOCALAPPDATA%\NeonDodgerProfile`, so the
  game window is its own process and closing it shuts the server down.
- Idempotent: if the server is already running it is reused and left running.
- No global installs, no downloads. The icon is drawn with System.Drawing
  (falls back to an embedded PNG, then to `shell32.dll` icon 13).