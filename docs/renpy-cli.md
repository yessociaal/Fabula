# Ren'Py command lines verified on this machine

SDK: `C:\Users\youbl\Documents\Software\Ren'py\renpy-8.4.1-sdk` (8.4.1.25072401)

`renpy.exe` is a GUI program. Start it with `spawn(exe, argsArray, { cwd: sdkDir })`, never through a shell string (the SDK path contains an apostrophe).

| Task | Arguments | Result seen |
|---|---|---|
| Create project | `<sdk>\launcher generate_gui <targetDir> --start --width 1280 --height 720 --accent #7c9cff --template <sdk>\gui` | Exit 0. Creates `game/` with `gui.rpy`, `options.rpy`, `screens.rpy`, `script.rpy`, `audio/`, `gui/`, `images/`, `libs/`. |
| Lint | `<projectDir> lint <reportFile>` | Exit 0. Report written to `<reportFile>` (stdout is not used). |
| Play from a line | `<projectDir> --warp script.rpy:<line>` | Window opens, no new `errors.txt` / `traceback.txt` after 12 s. |
| Distribute | `<sdk>\launcher distribute <projectDir> --destination <dir> --package win` | Not yet run. Source: `launcher/game/distribute.rpy:1761`. Verify in Phase 9. |

Notes:
- Lint exits 0 even when it reports problems; read the report file to decide success.
- When stopping a game we started, stop only that process id.
