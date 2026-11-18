# Fabula

Fabula is a Windows desktop editor for visual novels. You draw the story as a map of scenes, fill each scene with blocks (dialogue, backgrounds, sprites, music, choices), and the editor writes an ordinary Ren'Py game. The game it writes is plain Ren'Py: no editor files inside it and nothing that needs Fabula to run.

It needs a Ren'Py SDK (8.4.1 was used) to create the game folder, play it, check it and build it for sharing. Fabula makes no network calls, has no telemetry and ships no art or sound: every picture and track in your game is a file you added.

## Run it

```
npm install
npm run dev
```

`npm run dev` opens the editor with live reload. `npm run dev:web` serves the same screens in a browser with a pretend backend, which is handy for looking at the interface (Ren'Py features and the file dialogs are not available there).

The first time you start it, it looks for the SDK at `C:\Users\youbl\Documents\Software\Ren'py\renpy-8.4.1-sdk`. If yours is elsewhere, use **Change...** next to "Ren'Py SDK" on the home screen.

## Build it

```
npm run build        compile the app into out/
npm run dist:dir     unpacked app in dist/win-unpacked/ (run Fabula.exe)
npm run dist         Windows installer in dist/
```

`npm run dist` downloads the packaging tools (NSIS and others) the first time it runs, so it needs a network connection once. The installer has no auto-update and does not contact anything. The installer icon is a plain generated placeholder: replace `build/icon.png` (and run `node scripts/make-icon.mjs` only if you want the placeholder back).

## Where your files live

Two folders per story, kept apart on purpose.

- **Editor project** (`<Location>/<Title>/`): what Fabula opens. It holds `story.fabula.json` (the whole story), `assets/` (your uploaded pictures, music and fonts), `kits/` (your own kits, optional), `export-manifest.json` and `backups/`. Back this folder up; it is your story.
- **Ren'Py project** (`<Location>/<Title> (Ren'Py game)/`): the game Fabula writes. Export rewrites the story files in `game/` (`script.rpy`, one file per chapter, `interface.rpy` when you have screens, your script files, kit files) and copies the assets you used. It never overwrites `gui.rpy`, `screens.rpy` or `options.rpy`, apart from the one title line in `options.rpy` and what you apply in **Look**. Anything Fabula replaces that it did not create is copied to `backups/` first.

Export is deterministic: the same story gives byte-identical files.

## Three layers

1. **Blocks** (visual): scenes, dialogue, backgrounds, sprites, music, variables, choices, conditions, the Screen Designer and the Look form.
2. **Kits**: installable packages that add new blocks and endings, each with a generated form and the Ren'Py code behind it. A Terminal kit comes with the app (a typed-command terminal scene). Turn kits on per story in the **Kits** view.
3. **Code**: a "Ren'Py code" block, a code ending whose named exits still draw arrows on the map, and **Script files** for whole `.rpy` files that are exported as you wrote them.

Nothing in Ren'Py is out of reach: if there is no button for it, write it as code.

## Add your own kit

A kit is a folder with a `kit.json`, templates and `.rpy` files. Put it in `<editor project>/kits/` and it shows up in the Kits view. The manifest format, field types and template language are described in `docs/PLAN.md`, section 6.7. A kit with the same id as a built-in one replaces it for that story. `resources/kits/terminal/` is a complete example.

## Keyboard shortcuts

Press `?` in the editor (or use the question-mark button in the top bar) to see the full list. The main ones:

| Where | Keys |
|---|---|
| Everywhere | Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Esc close |
| Story Map | Double-click empty space: new scene. Delete: delete selected. Ctrl+C / Ctrl+V: copy / paste scenes. Ctrl+F: search. Shift+drag: box select |
| Scene Editor | Enter: new dialogue below. Shift+Enter: line break. Up / Down: select block. Alt+Up / Alt+Down: move block. Delete: remove block. Ctrl+D: duplicate block |
| Screen Designer | Arrows nudge 1 px, Shift+arrows 10 px, Delete, Ctrl+D |
| Quick play | Space or Enter continue, Esc close |

## Known limits

- **Quick play** is a quick preview inside the editor. It cannot run kits or code: a kit or code ending shows a panel listing its exits so you can pick one. Use **Play in Ren'Py** to see the real game.
- **NVL mode** (page-style text) is written correctly to the game, but Quick play shows NVL characters as ordinary dialogue.
- **Terminal kit font**: the terminal looks for a monospace font installed on the player's computer (Consolas, Courier New, DejaVu Sans Mono, Liberation Mono) and falls back to the game's text font. It does not ship a font.
- Fabula does not import existing `.rpy` scripts, and does not build Android, iOS or web versions; the exported game is a normal Ren'Py project, so use the Ren'Py launcher for those.
- Windows only.

## Tests

```
npm run typecheck        type-check the app and the tests
npm test                 unit tests
npm run test:renpy       compile a fixture story and run Ren'Py's own lint on it
npm run test:e2e         create, export and lint a game through the real exporter
npm run test:typing      the Terminal kit with real typed input in Ren'Py
npm run test:screens     designed screens with real clicks in Ren'Py
npm run test:look        Look & Feel changes applied to a real game
npm run test:electron    drive the built app's real window with real mouse and keyboard input
```

The Ren'Py checks use the SDK path above (or the `RENPY_SDK` environment variable). `test:electron` builds first, opens the app with a temporary settings folder (your own settings and recent list are not touched) and writes everything into temporary folders. `node scripts/test-electron.mjs --packaged` runs the same test against `dist/win-unpacked/Fabula.exe`.
