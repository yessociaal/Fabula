# Ren'Py command lines verified on this machine

SDK: `C:\Users\youbl\Documents\Software\Ren'py\renpy-8.4.1-sdk` (8.4.1.25072401)

`renpy.exe` is a GUI program. Start it with `spawn(exe, argsArray, { cwd: sdkDir })`, never through a shell string (the SDK path contains an apostrophe).

| Task | Arguments | Result seen |
|---|---|---|
| Create project | `<sdk>\launcher generate_gui <targetDir> --start --width 1280 --height 720 --accent #7c9cff --template <sdk>\gui` | Exit 0. Creates `game/` with `gui.rpy`, `options.rpy`, `screens.rpy`, `script.rpy`, `audio/`, `gui/`, `images/`, `libs/`. |
| Draw the menu button pictures (after Create project; what the launcher does) | `<projectDir> gui_images`, run twice: once with the environment variable `RENPY_VARIANT=small phone`, once without | Exit 0. Writes `gui/button/*.png`, `gui/bar/*.png` and the phone variants. Without it the game crashes at its main menu ("DynamicImage … could not find image"). Verified in Phase 16. |
| Lint | `<projectDir> lint <reportFile>` | Exit 0. Report written to `<reportFile>` (stdout is not used). |
| Play from a line | `<projectDir> --warp script.rpy:<line>` | Window opens, no new `errors.txt` / `traceback.txt` after 12 s. |
| Distribute | `<sdk>\launcher distribute <projectDir> --destination <dir> --package win` | Verified in Phase 9, exactly as written: exit 0 after about 14-18 s, writes `<dir>/<name>-1.0-win.zip` (about 30 MB for an empty game; the name comes from the project folder). The destination folder is created if missing. |

Notes:
- Lint exits 0 even when it reports problems; read the report file to decide success.
- Stopping a game we started: `taskkill /PID <pid> /T /F` (by the pid we got from spawn, never by image name).
- When stopping a game we started, stop only that process id.
