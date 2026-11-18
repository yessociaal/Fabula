# Fabula — a visual editor for Ren'Py visual novels (build plan)

"Fabula" is a working name; it appears only inside the editor, never in an exported game.

## 1. Context

You want to make a visual novel without writing code: a Twine-style map of the branching story, a drag-and-drop editor for each scene, uploads for art and audio, dropdowns instead of syntax. The result must be a normal Ren'Py game.

**What gets built:** a standalone Windows desktop app. You design visually; the app deterministically converts your actions into plain `.rpy` files inside a standard Ren'Py project, and drives your installed Ren'Py SDK to create the project, play it, lint it and build distributions.

**Why standalone and not a Ren'Py mod:** Ren'Py's own UI toolkit (screen language) has no node-graph canvas, no OS file drag-and-drop, and poor text editing. A standalone app gets a proper canvas and still uses the real engine for playback, so nothing is emulated in the final game.

**Hard rules for the whole project**

1. **No AI anywhere in the product.** No AI features, no network calls, no telemetry. The app ships with zero art and zero audio; every asset in a game is one you uploaded. Missing art is shown as an outlined, labelled box.
2. **Exported code is ordinary hand-style Ren'Py.** No comments, no generator name, no editor metadata, no extra files inside the Ren'Py project. The editor's own project file lives in a separate folder.
3. **Export is deterministic.** Same project in → byte-identical files out.

### 1a. Can Fabula do everything Ren'Py can? — Yes, through three layers

Ren'Py is a scripting language with Python inside it, so no editor can give every feature its own button. Fabula instead guarantees **nothing is out of reach**, and puts as much as is practical behind visual controls:

| Layer | What it is | Who it is for |
|---|---|---|
| **1. Visual blocks** | Built-in blocks, endings, managers, the Screen Designer and the Look & Feel form | Everyday story work, no code |
| **2. Kits** | Installable packages that add new blocks and endings (each with its own form) plus the Ren'Py code that powers them. This is how the editor bends to the kind of game: a **Terminal kit** ships with the app; others (phone messages, inventory, point-and-click, stats…) are added the same way without changing the editor | New mechanics, still used visually |
| **3. Code escape hatches** | A "Ren'Py code" block, a "Code ending" with named exits that still draw arrows on the map, a Script Files view for extra `.rpy` files, lockable scene labels, and the fact that the exporter never overwrites `gui.rpy` / `screens.rpy` / your own files | Anything else Ren'Py or Python can do |

Coverage against the Ren'Py 8.4.1 documentation (`<sdk>\doc\index.html`, every chapter accounted for):

| Ren'Py area | Layer | How |
|---|---|---|
| Labels & control flow, conditionals | 1 | Scenes, endings, sub-scene call, inline If block |
| Dialogue & narration, in-game menus | 1 | Dialogue blocks, choice ending, inline choice block |
| Displaying images, transitions | 1 | Background / Show / Hide, preset + custom placement, z-order, transition dropdowns |
| Transforms / ATL | 1 basic, 3 full | Custom placement (position, zoom, rotation, opacity); anything animated via code block or kit |
| Audio, voice, movie | 1 | Music, ambient, sound, voice per line, movie cutscene |
| Text (styles, waits, speed, colour) | 1 | Text toolbar inserts tags |
| Python statements, store variables | 1 simple, 3 full | Variable block and conditions; code block for arbitrary Python |
| Text input | 1 | "Ask the player" block |
| Persistent data | 1 | Variable option "Remember across playthroughs" |
| NVL mode, side images | 1 | Character settings; "Clear page" block |
| Screens & screen language, screen actions, drag & drop | 1 basic, 3 full | Screen Designer (images, text, buttons, hotspots, bars); hand-written screens in Script Files |
| GUI customisation, styles, config & preference variables | 1 common, 3 full | Look & Feel form edits the common `gui.` / `config.` lines; the files stay yours to edit |
| Splashscreen, lifecycle labels | 1 | Scene "role" dropdown (normal / splashscreen / other special label via locked label) |
| Building distributions (Windows, Mac, Linux), launcher, CLI | 1 | Export menu |
| Android, iOS, Web builds, translation, updater, in-app purchases | via Ren'Py | The export is a normal project; use the Ren'Py launcher on it |
| Speech bubbles, layered images, image gallery / music room / replay, achievements, multiple-character dialogue, history, keymap, mouse cursors, self-voicing | 2 or 3 | Kit when wanted; otherwise Script Files |
| Live2D, 3D stage, shaders, model rendering, creator-defined displayables / statements, custom text tags, character callbacks, file access, HTTP fetch | 3 | Script Files + code blocks |

**Fitting the editor to your kind of VN**

- *A plain VN with choices*: layers 1 only.
- *A heavily stylised VN* (custom text box, fonts, colours, page-style text, unusual menus): Look & Feel + character NVL mode + Screen Designer; go further by editing `gui.rpy` / `screens.rpy` directly, which Fabula never overwrites.
- *A scene with a terminal the player types commands into*: Terminal kit. Add a "Terminal session" ending to a scene, list the commands in a form (what the player types → what the terminal prints → stay, or leave to which scene). Each leaving command is an arrow on the map.
- *Point-and-click / hub screens*: design a screen with hotspots in the Screen Designer, use it as a scene's ending; each hotspot is an arrow.
- *Something nobody thought of*: a new kit (a folder with a small manifest, templates and `.rpy` files — section 6.7), or code.

**Verified on this machine (already checked, do not re-verify by guessing)**

| Thing | Value |
|---|---|
| Ren'Py SDK | `C:\Users\youbl\Documents\Software\Ren'py\renpy-8.4.1-sdk\` (note the apostrophe in `Ren'py`) |
| Node / npm / git | v24.15.0 / 11.12.1 / 2.47.0 |
| Create project from CLI | `renpy.exe <sdk>\launcher generate_gui <targetDir> --start --width W --height H --accent #hex --template <sdk>\gui` (source: `launcher/game/gui7/__init__.py:113`). Target must not exist, or must already contain `game/`. |
| Jump to a line when playing | `renpy.exe <projectDir> --warp script.rpy:LINE` (source: `renpy/arguments.py:162`) |
| Build distributions | `renpy.exe <sdk>\launcher distribute <projectDir> --destination <dir> --package win` (source: `launcher/game/distribute.rpy:1761`) |
| Template project files | `<sdk>\gui\game\`: `gui.rpy`, `screens.rpy`, `options.rpy`, `script.rpy` |

**Where the code goes:** `C:\Users\youbl\Documents\Claude projects\Fabula` (new folder, new git repo, one commit per phase).

---

## 2. Vocabulary (use these words everywhere: code, UI, briefs)

| Word | Meaning | Ren'Py equivalent |
|---|---|---|
| **Scene** | One box on the map; a stretch of story | a `label` |
| **Block** | One step inside a scene (a line of dialogue, a background change…) | one statement |
| **Ending** | How a scene finishes: go to another scene, offer choices, branch on a condition, or end the game | `jump` / `menu` / `if` / `return` |
| **Exit** | One outgoing arrow of an ending | a `jump` target |
| **Chapter** | A coloured group of scenes on the map | one `.rpy` file |
| **Character** | A speaker with a colour and expressions (sprites) | `define x = Character(...)` |
| **Expression** | One sprite image of a character ("happy") | image `tag attr` |
| **Variable** | A named true/false, number, or text value | `default x = ...` |
| **Asset** | An uploaded file: background, sprite, music, sound | file in `game/images` or `game/audio` |
| **Editor project** | Folder holding `story.fabula.json` + `assets/` | — |
| **Ren'Py project** | The exported game folder | a Ren'Py project |

| **Sub-scene** | A scene visited with a "Visit scene" block; when it ends, the story returns | `call` / `return` |
| **Screen** | A custom interface made in the Screen Designer | a `screen` |
| **Kit** | Installable package adding blocks/endings + their Ren'Py code | `.rpy` files + statements |
| **Script file** | An extra `.rpy` file you write by hand, exported as-is | a `.rpy` file |

Design decision that keeps everything simple: **leaving a scene only happens in its Ending.** Blocks never jump away (inline If / inline Choice blocks only contain more blocks; "Visit scene" always comes back). Therefore every solid arrow on the map corresponds to exactly one exit of exactly one ending, and map ↔ data can never disagree. This holds for kits and code too: they declare their exits.

---

## 3. Tech stack

Install with `npm install <name>` (no hand-typed versions; the lockfile pins them).

| Purpose | Package |
|---|---|
| Desktop shell | `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react` |
| UI | `react`, `react-dom`, `typescript` |
| Story map canvas | `@xyflow/react` |
| Drag-to-reorder lists | `@dnd-kit/core`, `@dnd-kit/sortable` |
| State + undo | `zustand`, `immer`, `zundo` |
| File validation | `zod` |
| Ids / icons | `nanoid`, `lucide-react` |
| Tests | `vitest` |
| Installer (last phase) | `electron-builder` |

Styling: plain CSS files with CSS variables. No Tailwind, no component library, no CSS-in-JS.

---

## 4. Repository layout

```
Fabula/
  package.json  electron.vite.config.ts  tsconfig.json  tsconfig.node.json  tsconfig.web.json
  src/
    shared/                 PURE TypeScript. No React, no Electron, no Node imports. Unit-tested.
      model.ts              all types (section 5)
      schema.ts             zod schema mirroring model.ts + parseProject()
      factory.ts            createProject(), createScene(), createBlock(type), createCharacter()…
      naming.ts             slugify(), buildNameTable()
      conditions.ts         evaluateCondition() (for playtest), conditionToPython()
      edges.ts              deriveEdges(), setExitTarget(), listExits()
      stage.ts              computeStage(project, sceneId, blockIndex)
      validate.ts           validateProject() -> Problem[]
      compiler/
        index.ts            compileProject() -> CompileResult
        text.ts             escapeSayText(), pythonString(), pythonValue()
        blocks.ts           one emit function per block type
        ending.ts           emit for each ending type
        assets.ts           export file name for each asset
      ipc.ts                the Api interface (section 7), shared by main, preload, renderer
    main/                   Electron main process (Node)
      index.ts              window creation, app lifecycle
      protocol.ts           vnasset:// handler
      ipc.ts                registers every Api method with ipcMain.handle
      projectFiles.ts       read/write story file, import asset, recent list
      settings.ts           app settings in userData/settings.json
      renpy.ts              spawn wrappers: createProject, run, lint, distribute
      exporter.ts           writes CompileResult + copies assets + manifest
    preload/index.ts        contextBridge.exposeInMainWorld('api', …)
    renderer/
      index.html  main.tsx  App.tsx
      api/index.ts          exports `api`: window.api if present, else browserMock
      api/browserMock.ts    in-memory Api so the UI runs in a plain browser (dev + testing)
      store/projectStore.ts project data + actions (undoable)
      store/uiStore.ts      current view, selection, panels (not undoable)
      styles/tokens.css  styles/base.css
      components/           Button, IconButton, Select, TextField, NumberField, ColorField,
                            Modal, Tabs, Toast, EmptyState, AssetPicker, ConditionBuilder, DropZone
      views/
        Home/  Shell/  StoryMap/  SceneEditor/  Characters/  Assets/  Variables/
        Settings/  Playtest/  Problems/
  tests/
    naming.test.ts  text.test.ts  compiler.test.ts  validate.test.ts  edges.test.ts  stage.test.ts
    fixtures/demo.fabula.json      a project using every feature
    golden/                        expected .rpy output for the fixture
  scripts/lint-fixture.mjs         compiles the fixture into a real Ren'Py project and runs Ren'Py lint
```

Import rule: `shared` imports nothing from `main` or `renderer`. `renderer` never imports `main`; it talks only through `api`.

---

## 5. Data model (`src/shared/model.ts`) — write exactly this

```ts
export type Id = string;                       // nanoid(10)

export interface Project {
  formatVersion: 1;
  meta: { title: string; width: number; height: number; accentColor: string };
  renpyProjectDir: string | null;              // absolute path of the linked Ren'Py project
  startSceneId: Id | null;
  scenes: Record<Id, Scene>;
  chapters: Record<Id, Chapter>;
  chapterOrder: Id[];
  characters: Record<Id, Character>;
  characterOrder: Id[];
  variables: Record<Id, Variable>;
  variableOrder: Id[];
  assets: Record<Id, Asset>;
}

export interface Scene {
  id: Id; name: string; notes: string;         // notes are never exported
  position: { x: number; y: number };
  chapterId: Id | null;
  blocks: Block[];
  ending: Ending;
}
export interface Chapter { id: Id; name: string; color: string }

export type Transition = 'none'|'dissolve'|'fade'|'pixellate'|'hpunch'|'vpunch'|'wipeleft'|'wiperight'
  |'slideleft'|'slideright'|'moveinleft'|'moveinright'|'moveoutleft'|'moveoutright'|'zoomin'|'zoomout';
export type StagePosition = 'left'|'center'|'right';

export type Block =
  | { id: Id; type: 'say';        characterId: Id | null; text: string }     // null = narrator
  | { id: Id; type: 'background'; assetId: Id | null; transition: Transition } // null = black
  | { id: Id; type: 'show';       characterId: Id | null; expressionId: Id | null;
                                  position: StagePosition; transition: Transition }
  | { id: Id; type: 'hide';       characterId: Id | null; transition: Transition }
  | { id: Id; type: 'playMusic';  assetId: Id | null; fadeIn: number; loop: boolean }
  | { id: Id; type: 'stopMusic';  fadeOut: number }
  | { id: Id; type: 'playSound';  assetId: Id | null }
  | { id: Id; type: 'setVariable'; effect: Effect }
  | { id: Id; type: 'pause';      seconds: number | null }                   // null = wait for click
  | { id: Id; type: 'transition'; transition: Transition };

export interface Effect { variableId: Id | null; op: 'set'|'add'|'subtract'|'toggle';
                          value: boolean | number | string }

export type Ending =
  | { type: 'jump';   target: Id | null }
  | { type: 'choice'; prompt: { characterId: Id | null; text: string } | null; options: ChoiceOption[] }
  | { type: 'branch'; cases: BranchCase[]; elseTarget: Id | null }
  | { type: 'end' };
export interface ChoiceOption { id: Id; text: string; condition: Condition | null;
                                effects: Effect[]; target: Id | null }
export interface BranchCase   { id: Id; condition: Condition; target: Id | null }

export interface Condition { join: 'and'|'or'; clauses: Clause[] }
export interface Clause { id: Id; variableId: Id | null;
                          op: 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'; value: boolean | number | string }

export interface Variable { id: Id; name: string; type: 'boolean'|'number'|'text';
                            defaultValue: boolean | number | string; description: string }
export interface Character { id: Id; name: string; color: string; expressions: Expression[] }
export interface Expression { id: Id; name: string; assetId: Id | null }
export interface Asset { id: Id; kind: 'background'|'sprite'|'music'|'sound'; name: string;
                         file: string;        // relative to <editorProject>/assets, forward slashes
                         width: number | null; height: number | null; bytes: number }
```

Exit handle ids (used by the map and by `edges.ts`): `jump`, `opt:<optionId>`, `case:<caseId>`, `else`, `x:<exitId>` (code, screen and kit endings).

### 5a. Extended model (part of `model.ts` from day one, so saved files never need migrating)

The types above are the core. These additions are defined in Phase 2 together with them; their UI and compiler support arrive in Phases 10–15. Until then the factory never creates them and the compiler skips them.

```ts
// Project gains:
//   screens: Record<Id, ScreenDef>; screenOrder: Id[];
//   scriptFiles: ScriptFile[];            kits: string[];   // ids of kits enabled for this story
//   look: Record<string, string>;         // Look & Feel values, keyed by the Ren'Py define name
// Scene gains:     labelLock: string | null;   role: 'normal' | 'splashscreen';
// Variable gains:  persistent: boolean;
// Character gains: mode: 'adv' | 'nvl';  sideAssetId: Id | null;
// Asset.kind gains: 'ambient' | 'voice' | 'movie' | 'ui' | 'font'
//   (.webm .ogv .mkv .mp4 for movie; .ttf .otf for font)
// 'say' block gains:  voiceAssetId: Id | null
// 'show' block gains: placement: { mode: 'preset' }
//                               | { mode: 'custom'; xalign: number; yalign: number; zoom: number;
//                                   rotate: number; alpha: number };
//                     zorder: number
// 'playMusic' / 'stopMusic' gain: channel: 'music' | 'ambient'

export type ExtraBlock =
  | { id: Id; type: 'visit';   sceneId: Id | null }                       // call sub-scene
  | { id: Id; type: 'if';      condition: Condition; then: Block[]; otherwise: Block[] }
  | { id: Id; type: 'inlineChoice'; prompt: { characterId: Id | null; text: string } | null;
                               options: { id: Id; text: string; condition: Condition | null; blocks: Block[] }[] }
  | { id: Id; type: 'ask';     variableId: Id | null; prompt: string; defaultText: string; maxLength: number }
  | { id: Id; type: 'movie';   assetId: Id | null }
  | { id: Id; type: 'window';  action: 'show' | 'hide' }
  | { id: Id; type: 'clearPage' }                                         // nvl clear
  | { id: Id; type: 'screen';  action: 'show' | 'hide'; screenId: Id | null }
  | { id: Id; type: 'code';    code: string }
  | { id: Id; type: 'kit';     kitId: string; blockType: string; params: Record<string, unknown> };
// Block = (core union) | ExtraBlock

export interface NamedExit { id: Id; name: string; target: Id | null }
export type ExtraEnding =
  | { type: 'code';   code: string; exits: NamedExit[] }                  // code uses @exit(name)
  | { type: 'screen'; screenId: Id | null; targets: Record<Id, Id | null> } // key = element id
  | { type: 'kit';    kitId: string; endingType: string; params: Record<string, unknown>;
                      exits: NamedExit[] };
// Ending = (core union) | ExtraEnding

export interface ScriptFile { id: Id; name: string; content: string }     // exported to game/<name>.rpy

export interface ScreenDef { id: Id; name: string; modal: boolean; elements: ScreenElement[] }
export type ScreenAction =
  | { type: 'leave' }                        // becomes an exit when the screen is used as an ending
  | { type: 'setVariable'; effect: Effect }
  | { type: 'showScreen'; screenId: Id | null } | { type: 'hideThis' };
interface Box { id: Id; name: string; x: number; y: number; w: number; h: number }
export type ScreenElement =
  | (Box & { type: 'image';   assetId: Id | null })
  | (Box & { type: 'text';    text: string; size: number; color: string; fontAssetId: Id | null })
  | (Box & { type: 'button';  text: string; action: ScreenAction })
  | (Box & { type: 'imageButton'; idleAssetId: Id | null; hoverAssetId: Id | null; action: ScreenAction })
  | (Box & { type: 'hotspot'; action: ScreenAction })                     // invisible clickable area
  | (Box & { type: 'bar';     variableId: Id | null; max: number });
```

### On-disk editor project

```
<EditorProject>/
  story.fabula.json        the Project, JSON, 2-space indent
  assets/backgrounds/<assetId>.<ext>   assets/sprites/…   assets/music/…   assets/sounds/…
  export-manifest.json     list of files the last export wrote into the Ren'Py project
  backups/                 files the exporter replaced that it did not create
```

Accepted uploads — images: `.png .jpg .jpeg .webp`; audio: `.ogg .mp3 .wav .opus .flac`. Anything else is rejected with a toast naming the allowed types.

App settings (`app.getPath('userData')/settings.json`): `{ sdkDir: string|null, recent: {path,title,openedAt}[] }`. On first run, default `sdkDir` to the verified path above if `renpy.exe` exists there.

---

## 6. The compiler (`src/shared/compiler`) — the heart of the product

`compileProject(project): CompileResult`

```ts
interface CompileResult {
  files: { path: string; content: string }[];                 // paths relative to <RenpyProject>/game
  assetCopies: { assetId: Id; from: string; to: string }[];   // from: relative to assets/, to: relative to game/
  sceneLocations: Record<Id, { file: string; line: number }>; // 1-based line of each `label`, for --warp
}
```

### 6.1 Names (`naming.ts`)

`slugify(s, fallback)`: lowercase → Unicode NFKD and drop combining marks → every run of characters outside `a-z0-9` becomes one `_` → trim `_` from both ends → if empty use `fallback` → if first char is a digit, prefix `fallback + '_'`.

`buildNameTable(project)` returns the final name of everything. Process in a fixed order (scenes sorted by chapterOrder then by `position.y`, then `position.x`, then id; others by their `…Order` array) so output is deterministic. Duplicates get `_2`, `_3`…

| Thing | Name | Fallback | Namespace |
|---|---|---|---|
| Start scene label | always `start` | — | labels |
| Other scene labels | `slugify(scene.name)` | `scene` | labels |
| Character variable + image tag | `slugify(character.name)` | `character` | store (shared with variables) |
| Variable | `slugify(variable.name)` | `value` | store |
| Expression attribute | `slugify(expression.name)` | `default` | per character |
| Background image | `bg ` + `slugify(asset.name)` | `scene` | images |
| Music / sound file stem | `slugify(asset.name)` | `track` / `sound` | per folder |
| Chapter file | `slugify(chapter.name)` + `.rpy` | `chapter` | files (`script`, `gui`, `screens`, `options` are taken) |

Reserved words: if a label, character or variable slug is in this set, append `_scene`, `_char`, `_value` respectively:
Python keywords (`and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield none true false`), plus `start quit main_menu splashscreen after_load before_main_menu after_warp left right center truecenter top bottom topleft topright default reset fade dissolve pixellate move ease hpunch vpunch blinds squares wipeleft wiperight slideleft slideright zoomin zoomout config gui persistent renpy store style layout define narrator centered extend adv nvl menu bg black white say show hide scene play stop pause call jump label init python image transform screen`.

### 6.2 Files written

- `script.rpy`: character definitions, variable defaults, then every scene with `chapterId === null` (start scene first).
- `<chapter_slug>.rpy`: scenes of that chapter. If the start scene is in a chapter, it is the first label in that chapter's file.
- Images: `images/bg/bg <slug>.<ext>` and `images/characters/<tag> <attr>.<ext>`. Ren'Py auto-defines an image from every file under `game/images` using the lowercase file name without extension, so **no `image` statements are emitted**.
- Audio: `audio/music/<slug>.<ext>`, `audio/sfx/<slug>.<ext>`.
- Only assets that are referenced by at least one block or expression are copied.

### 6.3 Statement mapping

4 spaces per indent level. Unix newlines. One blank line between statements inside a label. Two blank lines before each `label`. File ends with exactly one newline. **Never emit a `#` comment.**

| Model | Output |
|---|---|
| Character | `define anna = Character("Anna", color="#e86a92")` |
| Variable | `default courage = 0` / `default has_key = False` / `default nickname = "Stranger"` |
| say, narrator | `"Text."` |
| say, character | `anna "Text."` |
| background (asset) | `scene bg forest` + ` with fade` unless transition is `none` |
| background (null) | `scene black` (+ ` with …`) |
| show | `show anna happy at left` (+ ` with dissolve`). Always emit `at <position>`. |
| hide | `hide anna` (+ ` with …`) |
| playMusic | `play music "audio/music/morning.ogg"` + ` fadein 1.0` if fadeIn > 0 + ` noloop` if loop is false |
| stopMusic | `stop music` + ` fadeout 1.0` if fadeOut > 0 |
| playSound | `play sound "audio/sfx/door.ogg"` |
| setVariable set / add / subtract / toggle | `$ x = V` / `$ x += N` / `$ x -= N` / `$ x = not x` |
| pause | `pause` or `pause 1.5` |
| transition | `with fade` (skip the block entirely if `none`) |
| ending jump | `jump forest` |
| ending end | `return` |
| ending choice | see below |
| ending branch | `if COND:` / `elif COND:` / `else:` each containing one `jump label` |

Numbers: integers print without decimals; others via `String(n)`; durations always with one decimal minimum (`1.0`). Booleans: `True` / `False`.

Choice ending:

```renpy
    menu:

        anna "Which way?"

        "Take the left path":
            $ courage += 1
            jump left_path

        "Use the key" if has_key:
            jump gate
```

The prompt line is omitted when `prompt` is null. If **every** option has a condition, emit `return` (same indent as `menu:`) after the menu so the game cannot fall through into the next label.

Condition → Python (`conditionToPython`): clause is `name OP value` with `== != > >= < <=`. Shortcuts for booleans: `eq true` → `name`, `eq false` → `not name`. Clauses joined with ` and ` / ` or `. Empty clause list → `True`.

Defensive rule: any block or exit that points at something missing (null or deleted id) is **skipped** by the compiler (a null exit emits `return`). The validator (section 8) blocks export before that can matter.

### 6.4 Text escaping (`text.ts`) — implement exactly

`escapeSayText(text, knownVariableNames)`, applied to dialogue, choice text and prompts, in this order:
1. `\` → `\\`
2. `"` → `\"`
3. newline → `\n` (the two characters)
4. `[`: if the text at this point matches `[name]` where `name` is in `knownVariableNames`, keep it (this is how "Insert variable" works). Otherwise emit `[[`.
5. `{`: if it starts one of the allowed text tags, keep it. Otherwise emit `{{`. The allowed tags are exactly `{b} {/b} {i} {/i} {u} {/u} {color=#rrggbb} {/color} {size=N} {/size} {w} {p} {cps=N} {/cps}`, where `#rrggbb` is a `#` and six hex digits and `N` is one to three digits (whole numbers only). A tag with any other argument (`{color=red}`, `{size=big}`, `{w=1}`) is not allowed and is doubled. Closing tags are kept on their own; Ren'Py lint reports a closing tag whose opening tag was doubled, so the toolbar always inserts the pair.
6. `%` → `%%` (Ren'Py 8.4.1 lint rejects a lone `%` in dialogue; verified in Phase 3). Character names in `Character("…")` are not covered by this; check them with lint if a name contains `%`.

`pythonString(s)`: steps 1–3 only, wrapped in double quotes. Used for `Character("…")` and text variable values.

### 6.5 Golden test

`tests/fixtures/demo.fabula.json` uses every block type, every ending type, every operator, two chapters, a duplicate scene name, a character named `Left`, text containing `"`, `\`, `[`, `{`, `100%` and a line break. `tests/golden/*.rpy` is the expected output, written by hand from this section, then reviewed. `scripts/lint-fixture.mjs` creates a real Ren'Py project in a temp folder with `generate_gui`, writes the compiled files into it, runs `renpy.exe <proj> lint <tempfile>` and fails if the report contains errors about our files. (Sprites and audio in the fixture are tiny files produced by the script: a 1×1 PNG and a short silent WAV written byte-by-byte.)

### 6.6 Extended mapping (Phases 10–15)

| Model | Output |
|---|---|
| say with voice | `voice "audio/voice/anna_01.ogg"` on the line before the dialogue line |
| Character, NVL mode | `define anna = Character("Anna", kind=nvl, color="#e86a92")`. When at least one character is NVL, the compiler also writes `define narrator = nvl_narrator` right after the character definitions, so narration lands on the same NVL page (verified in Ren'Py 8.4.1 docs, "NVL-Mode Tutorial", and by running a game). Menus stay in the normal full-screen style. |
| Character with side image | file `images/characters/side <tag>.<ext>` and `Character(…, image="<tag>")` as the last argument (Ren'Py defines the image `side <tag>` from the file name and shows it beside the text box whatever expression is on stage) |
| Persistent variable | `default persistent.seen_ending = False`; every reference becomes `persistent.seen_ending` (conditions, effects, ask, and text interpolation `[persistent.seen_ending]`; the plain `[seen_ending]` is not a known name, so it is escaped as `[[seen_ending]`) |
| playMusic on ambient | `play ambient "audio/ambient/rain.ogg" fadein 1.0`; and once, at the top of `script.rpy`: `init python:` / `    renpy.music.register_channel("ambient", "sfx", loop=True)` (only when the story uses ambient) |
| show, custom placement | `show anna happy:` followed by an indented ATL block with `xalign`, `yalign` (always printed as floats such as `1.0`, because ATL reads a bare `1` as one pixel), and only the non-default ones of `zoom`, `rotate`, `alpha`; a transition becomes a separate `with dissolve` line at the same indentation as `show`. A layer order goes before the colon: `show anna happy zorder 2:` |
| show, zorder ≠ 0 | ` zorder 2` appended |
| visit | `call cellar`. A missing or deleted target is skipped. |
| if | `if COND:` + indented blocks; `else:` + indented blocks when `otherwise` compiles to at least one statement. An empty `then` emits `pass`. A condition with no usable clause is `True`. |
| inlineChoice | `menu:`, then the prompt line (same form as in a choice ending, omitted when `prompt` is null), then each option as `"text":` or `"text" if COND:` with its blocks indented under it (`pass` if it compiles to nothing). Blank line between the items. No jumps, no `return` after it. A Choice block with no options emits nothing. |

Nesting rules for the three rows above (Phase 11): blocks of a branch are separated by one blank line like blocks of a label and indented one level per nesting level; the ending of the scene is emitted after them as usual, so a scene continues normally after an If or Choice block; `call` returns to the next statement. **`End of story` (`return`) doubles as the sub-scene return:** in a scene that was reached with `call` it returns to the caller, and with an empty call stack it ends the game, so one scene can be both a story ending and a sub-scene. A visited scene whose ending is not End keeps going through its own exits and returns when the scene it reaches ends (the validator warns). Nesting is capped at 4 levels: a top-level block is level 1; a block of any kind may sit at level 4; a container (If, Choice) needs its areas to fit, so it may sit at level 3 at the deepest. Block paths (`BlockPath`, `src/shared/blockTree.ts`) address nested blocks: `[{ i: 3, in: 'then' }, { i: 1 }]` is `scene.blocks[3].then[1]`; branch keys are `then`, `otherwise` and `opt:<optionId>`.
| ask | `$ player_name = renpy.input("What is your name?", default="Alex", length=20).strip()` (text variables only). The prompt is escaped like dialogue, the default like a plain string; `length=` is left out when the maximum is 0 or less. |
| movie | `$ renpy.movie_cutscene("movies/intro.webm")`; file copied to `movies/` |
| window | `window show` / `window hide` |
| clearPage | `nvl clear` |
| screen block | `show screen office_desk` / `hide screen office_desk` |
| code block | the lines verbatim, each prefixed with the current indentation. `@scene(Scene name)` is replaced by that scene's label. |
| code ending | the lines verbatim; `@exit(name)` is replaced by the target scene's label |
| screen ending | `call screen office_desk`, then `if _return == "drawer":` / `elif …:` each with one `jump`. One exit per element whose action is `leave`; the return value is `slugify(element.name)`. |
| Scene with `labelLock` | that exact label is used. Legal means a letter followed by letters, digits and underscores; reserved words are refused, except the labels Ren'Py itself calls (`quit`, `main_menu`, `after_load`, `before_main_menu`, `after_warp`), which are exactly why the lock exists. It must be unique among locks. The name table reserves it before any other label is chosen, so other scenes get `_2`, `_3`. The start scene is always `start` and ignores a lock (a warning). |
| Scene role `splashscreen` | label `splashscreen`; its ending must be End (`return`). Only one scene may have this role and it cannot be the start scene (errors). A splash screen scene is not reported as unreachable. |
| ScriptFile | written unchanged to `<name>.rpy` |
| ScreenDef | all screens go in `interface.rpy`, one `screen <slug>():` each, see below |

Screen output (absolute positions in game pixels):

```renpy
screen office_desk():

    modal True

    add "images/ui/desk.png" xpos 0 ypos 0

    text "Where to look?" xpos 100 ypos 40 size 36 color "#ffffff"

    textbutton "Open the drawer" xpos 200 ypos 500 action Return("drawer")

    imagebutton idle "images/ui/door.png" hover "images/ui/door_hover.png" xpos 900 ypos 200 action Return("door")

    button xpos 400 ypos 300 xsize 180 ysize 120 background None action Return("window")

    bar value VariableValue("trust", 10) xpos 40 ypos 40 xsize 300
```

**As built (Phase 14), proven in Ren'Py 8.4.1 with `npm run test:screens`:** the example above is the shape, with these exact differences.

- A game made with `generate_gui` has no `gui/button` or `gui/bar` images, and the default styles of a button and a bar fail to load them. So a designed screen never depends on them. A `textbutton` is written `textbutton "Go" xpos 200 ypos 500 xsize 220 ysize 60 background Solid("#3a3f4b") hover_background Solid("#4a5266") text_xalign 0.5 text_yalign 0.5 action …`; a `bar` is `bar value VariableValue("trust", 10) xpos 40 ypos 120 xsize 300 ysize 24 left_bar Solid("#7c9cff") right_bar Solid("#262a33")`. A hotspot is `button xpos … ypos … xsize … ysize … background None action …`.
- `add` gets `xsize W ysize H` unless the picture's own size is known and equal; an image button is drawn at its picture's own size (the designer fills W and H from the picture); `text` gets `font "fonts/x.ttf"` last when a font is picked.
- Pictures: a UI image goes to `images/ui/<name>.<ext>`, a background keeps `images/bg/bg <name>.<ext>`, a font goes to `fonts/<name>.<ext>`. Only files the screens use are copied.
- Screen names: `slugify(name, "screen")`, with `_screen` added when the name is a reserved word or one of the standard screens of Ren'Py's template (`main_menu`, `say`, `preferences`…), then `_2`, `_3` for duplicates. Return values of Leave elements are `slugify(element name, "element")`, unique inside the screen. A chapter called "Interface" is written to `interface_2.rpy`.
- Screens are written in `screenOrder`, two blank lines apart, to `interface.rpy`, which comes after the chapter files and before script files. The file is only written when there is a screen, and the exporter removes it (and its `.rpyc`) when the last screen is deleted. A screen with nothing to draw is `null`.
- Text goes through `escapeSayText` (quotes, brackets, `%`).
- **Leave screen**: always `Return("<name>")`. It only does something when the screen is the ending of a scene (`call screen` returns it). With a Show screen block it is ignored by Ren'Py, so the validator warns: "Leave screen only works when this screen is the ending of a scene; with Show screen it will be ignored", unless the screen is also used as an ending. "Close this screen" (`Hide()`) on an ending screen does nothing in the game, so that is a warning too.
- A screen ending with one leaving element is `call screen x` then a bare `jump`; with more it is an `if _return == "name":` / `elif` chain with one `jump` each. A screen with no leaving element is a validation error.
- Quick play draws screens for real over the stage, scaled with it. A screen with "Blocks clicks behind" (`modal True`) stops the click that would advance the dialogue. Leave in a block context does nothing; "Close this screen" on the ending screen does nothing.
- The Screen Designer's backdrop (a background to line things up with) is editor-only: it is kept in the browser's local storage per screen, never in the story file, and never exported.
- The real-engine check is `npm run test:screens`: Ren'Py's test framework posts real mouse clicks at game coordinates (the framework's `click "text"` form cannot find a hotspot, and fails while the say screen is up). Its test file defines an empty `label main_menu`, because a generate_gui game cannot draw its main menu.

Actions: `leave` → `Return("<slug>")`; `setVariable` → `SetVariable("x", V)` (add/subtract → `SetVariable("x", x + N)`, toggle → `ToggleVariable("x")`); `showScreen` → `Show("name")`; `hideThis` → `Hide()`.

### 6.7 Kits (Phase 13) — how the editor is extended without changing it

A kit is a folder. Built-in kits live in the app's `resources/kits/`; your own go in `<EditorProject>/kits/`.

```
terminal/
  kit.json
  files/terminal.rpy            copied to game/ on export (plain Ren'Py, no comments naming any tool)
  templates/print.txt  templates/session.txt
```

`kit.json`:

```json
{
  "id": "terminal", "name": "Terminal", "formatVersion": 1,
  "files": [{ "from": "files/terminal.rpy", "to": "terminal.rpy" }],
  "blocks": [{
    "type": "print", "name": "Terminal: print", "icon": "terminal",
    "summary": "Terminal prints \"{{text}}\"",
    "fields": [{ "key": "text", "label": "Text", "type": "multiline" }],
    "template": "templates/print.txt"
  }],
  "endings": [{
    "type": "session", "name": "Terminal session", "icon": "terminal",
    "fields": [
      { "key": "title", "label": "Window title", "type": "text", "default": "TERMINAL" },
      { "key": "intro", "label": "Opening lines", "type": "multiline" },
      { "key": "unknown", "label": "Reply to unknown commands", "type": "text", "default": "Unknown command." },
      { "key": "commands", "label": "Commands", "type": "list", "itemLabel": "{{word}}", "fields": [
        { "key": "word", "label": "Player types", "type": "text" },
        { "key": "reply", "label": "Terminal prints", "type": "multiline" },
        { "key": "effects", "label": "Changes", "type": "effects" },
        { "key": "leaves", "label": "Then leave the terminal", "type": "boolean" }
      ]}
    ],
    "exits": { "list": "commands", "when": "leaves", "name": "{{word}}" },
    "template": "templates/session.txt"
  }]
}
```

Field types: `text`, `multiline`, `number`, `boolean`, `select` (with `options`), `color`, `variable`, `character`, `asset` (with `kind`), `effects`, `condition`, `list` (with nested `fields`). The inspector form is generated from `fields`; nothing kit-specific is coded in the editor. `exits` tells the editor which list items become arrows: the editor keeps `ending.exits` in sync with the list (one `NamedExit` per item where `when` is true, id stable per item).

Template language (`shared/kits/template.ts`, ~150 lines, no dependency, no `eval`):
`{{key}}` raw · `{{key|text}}` quoted + escaped like dialogue · `{{key|py}}` Python literal · `{{key|name}}` exported name of the referenced variable/character · `{{key|path}}` exported path of the asset · `{{key|effects}}` one `$ …` line per effect · `{{key|condition}}` Python expression · `{{@label}}` this scene's label · `{{#each key}}…{{/each}}` (inside: the item's keys, `{{@index}}`, and `{{@exit}}` = label of that item's exit target) · `{{#if key}}…{{else}}…{{/if}}`. Output is re-indented to where the block sits. Unknown keys are a validation error shown on the block, not a crash.

**As built (Phase 13): extensions to the kit system.** The Terminal kit needed three small additions, all generic and documented here:

- Filters: `{{key|lines}}` (a multi-line text as comma-separated quoted strings, one per line, each escaped like dialogue; empty text gives nothing), and the transforms `lower` and `trim`, which may precede the last filter: `{{word|trim|lower|py}}`.
- Inside `{{#each}}`: `{{@first}}` and `{{@last}}` (usable in `{{#if @last}}`), `{{@index}}` counts from 0; `{{@exit}}` is empty for an item that has no exit.
- Layout rules: a block tag (`{{#each}}`, `{{#if}}`, `{{else}}`, `{{/each}}`, `{{/if}}`) alone on its line removes the whole line. An output tag alone on its line keeps that line's indentation for every line it prints and removes the line when it prints nothing. The result starts at column 0 and is indented one level by the compiler (a nested `label` inside the scene label is valid Ren'Py, and Ren'Py lint accepts it; verified in Phase 13), so a session template needs no special label handling.
- Other manifest keys: `onlyWhenUsed` (kit files are exported only when a block or ending of the kit is in the story; otherwise an enabled kit always exports its files), `description`, `summary` on endings, `help` on fields, `varType` on `variable` fields, `min`/`max`/`step` on `number`. List items always carry an `id`; an exit has the id of its list item, so the link survives renames, reordering and scene duplication (`cloneWithNewIds` maps the same old id to the same new id).
- Rules: `files[].from` and `template` stay inside the kit folder and `files[].to` inside `game/` (no `..`, no absolute paths, no backslashes, no drive letters); `to` may not be `script`, `gui`, `screens`, `options`, `interface` (with `.rpy` or `.rpyc`) or anything under `gui/`, and may not collide with a chapter file, a script file or another kit's file (validation errors). A kit whose templates have mistakes (unknown keys, unbalanced tags, bad filters) fails to load and its card in the Kits view shows the exact error.
- API: `pure functions take the kits as a last argument: validateProject(project, { kits }), compileProject(project, { kits }), compileSceneScript(project, id, { kits }), findUsage(project, { kits })`; leaving it out means no kit is installed. `Api.listKits(editorDir)` returns the loaded kits (built-in from `resources/kits`, or `<resources>/kits` when packaged, plus `<EditorProject>/kits/*`; a story kit with a built-in id replaces it).
- Generic proof: a test copies the Terminal kit folder, renames its id, ending type, file and labels, loads both kits and compiles a story that uses the copy; another test checks that no file under `src/` mentions the Terminal kit by name.

**Terminal kit behaviour** (the proof that kits work): `files/terminal.rpy` defines a full-screen `terminal` screen (dark panel, monospace text, scrolling history, a blinking prompt with a Ren'Py `input`) and four functions: `terminal_open(title, lines)`, `terminal_print(text)`, `terminal_read()` (waits for Enter, returns the typed text lower-cased and trimmed, echoes it into the history), `terminal_close()`. The session template produces:

```renpy
    $ terminal_open("NODE-7", ["Connection established."])

label server_room_terminal:

    $ command = terminal_read()

    if command == "help":
        $ terminal_print("Commands: help, unlock, exit")
        jump server_room_terminal

    elif command == "unlock":
        $ terminal_print("Access granted.")
        $ terminal_close()
        jump vault

    else:
        $ terminal_print("Unknown command.")
        jump server_room_terminal
```

Quick play shows kit blocks/endings as a plain panel ("Terminal session — pick what happens") listing the exits as buttons, because kit code only runs in real Ren'Py. The banner says so.

---

## 7. Main ↔ renderer API (`src/shared/ipc.ts`)

One interface, implemented three times: `main/ipc.ts` (real), `preload` (forwarding), `renderer/api/browserMock.ts` (in memory, `localStorage` for persistence, `URL.createObjectURL` for assets).

```ts
export interface Api {
  getSettings(): Promise<Settings>;
  setSdkDir(dir: string): Promise<{ ok: boolean; version?: string; error?: string }>;
  pickFolder(title: string): Promise<string | null>;
  pickFiles(kind: Asset['kind']): Promise<string[]>;

  createEditorProject(parentDir: string, title: string): Promise<{ dir: string; project: Project }>;
  openEditorProject(dir: string): Promise<{ dir: string; project: Project }>;   // validates with zod
  saveProject(dir: string, project: Project): Promise<void>;                    // write temp file, then rename
  importAsset(dir: string, kind: Asset['kind'], sourcePath: string): Promise<Asset>;
  importAssetData(dir: string, kind: Asset['kind'], fileName: string, data: ArrayBuffer): Promise<Asset>;
  deleteAssetFile(dir: string, file: string): Promise<void>;
  assetUrl(dir: string, file: string): string;                                  // vnasset://… (sync)

  renpyCreateProject(targetDir: string, opts: { width: number; height: number; accent: string }): Promise<RunResult>;
  exportToRenpy(dir: string, project: Project): Promise<ExportResult>;
  renpyRun(projectDir: string, warp?: { file: string; line: number }): Promise<RunResult>;
  renpyLint(projectDir: string): Promise<{ ok: boolean; report: string }>;
  renpyDistribute(projectDir: string, destDir: string): Promise<RunResult>;
  revealInExplorer(path: string): Promise<void>;
}
```

Main-process rules (each is a known trap):
- **Always `child_process.spawn(exe, argsArray, { cwd: sdkDir })`. Never build a command string, never `shell: true`.** The SDK path contains an apostrophe and spaces.
- `renpy.exe` is a GUI program: do not rely on stdout. For lint, pass an output file path as the last argument and read it. After a run, if `<projectDir>/errors.txt` or `traceback.txt` is newer than the launch time, return its text as the error.
- `vnasset://`: register with `protocol.registerSchemesAsPrivileged` (standard, secure, supportFetchAPI, stream) **before** `app.whenReady`. Handler resolves `vnasset://p/<encoded dir>/<file>` to a path, rejects anything that resolves outside `<dir>/assets`, returns `net.fetch(pathToFileURL(p).toString())`.
- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`. No remote content is ever loaded.
- Drag-and-drop from Explorer: the renderer reads the dropped `File` as an `ArrayBuffer` and calls `importAssetData` (do not depend on `File.path`).

**Exporter (`main/exporter.ts`)**: (1) run `validateProject`; abort on any error. (2) `compileProject`. (3) read `export-manifest.json`; delete every listed file that the new result does not contain. (4) for each file to write that already exists and is **not** in the manifest (e.g. the template `script.rpy`), copy it to `backups/<timestamp>/` first. (5) write files, copy assets (skip when size and mtime match). (6) delete stale `.rpyc` next to deleted `.rpy`. (7) write the new manifest. (8) update the `define config.name = _("…")` line in `options.rpy` to the project title with one regex replace; if the line is not found, leave the file alone. Nothing else in the Ren'Py project is ever touched: `gui.rpy`, `screens.rpy`, `gui/` stay yours to customise.

---

## 8. Validation (`validate.ts`)

`validateProject(project): Problem[]` where `Problem = { severity: 'error'|'warning'; message: string; sceneId?: Id; blockId?: Id; exitId?: string }`. Errors block export; warnings do not.

Errors: no start scene · exit with no target (jump, option, case, else) · choice ending with zero options · option with empty text · branch with zero cases · block missing a required pick (show without character/expression, playMusic/playSound without asset, setVariable without variable, condition clause without variable) · expression without an image that is used by a show block · value type not matching the variable type · empty character or variable name.

Warnings: scene unreachable from start · empty dialogue text · every option of a choice is conditional · `show` of a character already on stage in the same position and expression · unused asset / character / variable · scene with no blocks.

Messages are plain English with the scene name, e.g. `"Forest gate": the choice "Use the key" doesn't lead anywhere. Drag its dot to a scene.`

---

## 9. State (`renderer/store`)

`projectStore` (zustand + immer, wrapped in zundo `temporal`, limit 100): `{ dir, project, dirty }` and actions. Every mutation is a named action — components never mutate the project directly. Minimum set:

`loadProject, updateMeta, addScene(position, name?) , renameScene, moveScenes(positions), deleteScenes(ids)` (also clears every exit that pointed at them, and `startSceneId`), `duplicateScene, setStartScene, setSceneChapter, addBlock(sceneId, type, index), updateBlock(sceneId, blockId, patch), moveBlock(sceneId, from, to), deleteBlock, duplicateBlock, setEnding(sceneId, ending), setEndingType(sceneId, type)` (keeps the first existing target when converting), `addOption, updateOption, moveOption, deleteOption, addCase, updateCase, deleteCase, setExitTarget(sceneId, exitId, targetId|null), addCharacter/updateCharacter/deleteCharacter, addExpression/updateExpression/deleteExpression, addVariable/updateVariable/deleteVariable, addAsset/renameAsset/deleteAsset, addChapter/updateChapter/deleteChapter`.

Node dragging: positions update live but only **one** undo step is recorded on drag end (pause/resume zundo around the drag).

Autosave: subscribe to the store; 800 ms after the last change call `api.saveProject`. Top bar shows `Saving…` / `Saved`.

`uiStore` (not undoable): `view: 'map'|'scene'|'characters'|'assets'|'variables'|'settings'`, `sceneId`, `selectedBlockId`, `selectedNodeIds`, `problemsOpen`, `playtest: null | { fromSceneId }`.

---

## 10. UI specification

Look: dark, calm, dense enough to work in. Tokens in `styles/tokens.css`: `--bg:#16171b; --panel:#1f2127; --panel-2:#272a31; --line:#353945; --text:#e8e9ed; --muted:#9aa0ad; --accent:#7c9cff; --danger:#ff6b6b; --warn:#f2b84b; --ok:#5fd08a; --radius:8px;` font `system-ui`, base 14px. Every interactive element has a visible focus ring and a tooltip.

### 10.1 Home (no project open)

```
+--------------------------------------------------------------+
|  Fabula                                                      |
|  [ + New story ]   [ Open story… ]                           |
|                                                              |
|  Recent                                                      |
|  ┌ My First Novel      C:\…\My First Novel      2 days ago ┐ |
|  └ Demo                C:\…\Demo                last week  ┘ |
|                                                              |
|  Ren'Py SDK: C:\…\renpy-8.4.1-sdk   ✓ 8.4.1   [ Change… ]    |
+--------------------------------------------------------------+
```

**New story** opens a modal: Title (text) · Location (folder picker) · Screen size (dropdown: 1920×1080, 1280×720) · Accent colour (colour field) · checkbox "Also create the Ren'Py game now" (on by default; target = `<Location>/<Title> (Ren'Py game)`). Create → makes the editor project with one scene named "Start" set as start, runs `renpyCreateProject` if ticked, opens the Story Map.

### 10.2 Shell (project open)

```
+--------------------------------------------------------------------------------------+
| ⌂  My First Novel   Saved      ↶ ↷        ⚠ 3 problems   ▶ Quick play  ▶ Play in     |
|                                                              Ren'Py   ⭳ Export ▾     |
+----+---------------------------------------------------------------------------------+
| 🗺 |                                                                                 |
| 👤 |                              current view                                       |
| 🖼 |                                                                                 |
| 🔢 |                                                                                 |
| ⚙  |                                                                                 |
+----+---------------------------------------------------------------------------------+
```

Left rail (icons + tooltip + label under icon): Story Map, Characters, Assets, Variables, Settings. Top bar: Home, title (click to rename), save state, Undo/Redo, Problems button (opens a right-side drawer listing problems; clicking one navigates to the scene and selects the block), **Quick play** (in-app playtest from start), **Play in Ren'Py** (export, then run), **Export ▾** (Export to Ren'Py · Check with Ren'Py lint · Build game for sharing… · Open game folder).

### 10.3 Story Map

```
+--------------------------------------------------------------------------------+
| [+ Scene] [+ Chapter] [Tidy up]  Search: [________]         zoom − 100% +  ⛶   |
|                                                                                |
|   ┌─────────────────────┐            ┌─────────────────────┐                   |
|   │▶ Start        ⚠     │            │ Left path           │                   |
|   │ [bg thumbnail]      │       ┌───▶│ [bg thumbnail]      │                   |
|   │ Anna: You made it!  │       │    │ The trees close in… │                   |
|   │ 6 blocks            │       │    │ ───────────────────  │                  |
|   │ ─────────────────── │       │    │ Then              ●─┼──▶ …             |
|   │ Take the left path ●┼───────┘    └─────────────────────┘                   |
|   │ Use the key  (if)  ●┼──────────▶ ┌─────────────────────┐                   |
|   └─────────────────────┘            │ Gate          ■ END │                   |
|                                      └─────────────────────┘      [minimap]    |
+--------------------------------------------------------------------------------+
```

Scene card (custom React Flow node, 240px wide): header with name (double-click name to rename inline), a ▶ badge on the start scene, a ⚠/⛔ badge if it has problems; background thumbnail (the first background block's image; plain panel if none); first dialogue line, one line, ellipsised; block count; then **one row per exit** with its own source handle on the right edge: `Then` (jump), each choice text (with a small `if` tag when conditional), each branch case as its condition in words plus `Otherwise`. End scenes show `■ END` and no handle. One target handle on the left edge (`in`). Chapter colour is a 4px strip on the left of the card.

Interactions (each one is a requirement):
- Double-click empty canvas, or `+ Scene` → new scene there. Double-click a card body → open Scene Editor.
- Drag from an exit dot to a card → `setExitTarget`. Drag from an exit dot to empty canvas → create a new scene at the drop point and connect to it.
- Drag from the dot of a `Then` exit that is already connected → reconnect. Select an arrow + `Delete` → target becomes null (exit dot turns red).
- Select cards (click, shift-click, box select) → `Delete` removes them after a confirm modal that says how many arrows will be disconnected.
- Right-click card → Open · Rename · Set as start · Duplicate · Move to chapter ▸ · Play from here (Quick play) · Play from here in Ren'Py · Delete.
- Right-click canvas → New scene here · Paste.
- `Ctrl+Z / Ctrl+Y`, `Ctrl+C / Ctrl+V` (scenes, with their internal arrows), `Ctrl+F` focuses search; search dims non-matching cards (matches name and dialogue text) and Enter cycles through matches, centring each.
- Arrows: smooth-step, arrowhead, label = choice text (truncated to 24 chars); arrows from conditional exits are dashed.
- `Tidy up` lays scenes out left-to-right by distance from start (simple layered layout: column = shortest path length from start, rows stacked 40px apart; unreachable scenes go in a last column).
- Minimap bottom-right, zoom controls, fit-view button. Unreachable scenes are drawn at 60% opacity.

Edges are **never stored**; `deriveEdges(project)` computes them each render (memoised).

### 10.4 Scene Editor

```
+--------------------------------------------------------------------------------------+
| ← Story Map  ›  [ Start ____________ ]                    ▶ Play from here   ⋯       |
+------------+------------------------------------------+------------------------------+
| ADD BLOCK  |  ⋮⋮ 🖼 Background  Forest · fade          |  ┌────────────────────────┐  |
| 💬 Dialogue|  ⋮⋮ 🎵 Play music  Morning                |  │   STAGE PREVIEW 16:9   │  |
| 📝 Narration| ⋮⋮ 👤 Show  Anna · happy · left          |  │  [bg] [sprites]        │  |
| 🖼 Backgrnd|  ⋮⋮ 💬 Anna   "You made it!"   ◀ selected |  │  ┌ Anna ─────────────┐ │  |
| 👤 Show    |  ⋮⋮ 📝 "The path splits ahead."           |  │  │ You made it!      │ │  |
| 🚫 Hide    |  ───────── + add block ─────────          |  └──┴───────────────────┴─┘  |
| 🎵 Music   |                                          |  INSPECTOR — Dialogue         |
| 🔇 Stop    |  ENDING   (•) Choices ( ) Go to ( ) If   |  Speaker  [ Anna        ▾ ]   |
| 🔔 Sound   |           ( ) End of story               |  Text                         |
| 🔢 Variable|  Prompt: [Anna ▾] [Which way?_______]    |  [ You made it!           ]   |
| ⏸ Pause    |  1 [Take the left path] → [Left path ▾]  |  [ B ] [ I ] [ Insert variable ▾ ]
| ✨ Transition| 2 [Use the key] if has_key → [Gate ▾]   |                               |
|            |  [+ Add choice]                          |  [Duplicate]  [Delete]        |
+------------+------------------------------------------+------------------------------+
```

- **Palette (left, 180px):** click an entry to append after the selected block (or at the end); or drag it into the list at a specific position. "Narration" is a `say` block with `characterId: null`.
- **Block list (centre):** each block is a row: drag handle, icon, a one-line plain-English summary, and inline quick fields for the most common edit (dialogue text is editable directly in the row; `Enter` creates a new dialogue block below with the same speaker; `Shift+Enter` inserts a line break). Rows with a problem have a red or amber left border and a tooltip with the message. Drag to reorder. `Delete` removes the selected block; `Ctrl+D` duplicates; `↑/↓` moves the selection; `Alt+↑/↓` moves the block.
- **Stage preview (top right):** letterboxed 16:9 box showing the result of `computeStage(project, sceneId, indexOfSelectedBlock)`: background image (or checkerboard with the note "Background carries over from the previous scene" when the scene has not set one yet), sprites at left/centre/right anchored to the bottom and scaled to 90% of stage height, and a dialogue box with the speaker's name in their colour when the selected block is dialogue. Missing art → dashed outline with the name. A small 🎵 chip shows the currently playing track name.
- **Inspector (bottom right):** fields for the selected block:

| Block | Fields |
|---|---|
| Dialogue / Narration | Speaker (dropdown: Narrator + characters, with colour dots; last entry "+ New character…") · Text (multi-line) · B / I buttons (wrap selection in `{b}`/`{i}`) · Insert variable (dropdown → inserts `[name]`) |
| Background | AssetPicker (grid of background thumbnails + "None (black)" + "Upload…") · Transition dropdown |
| Show | Character dropdown · Expression (thumbnail grid of that character's expressions + "Upload new…") · Position (three-way toggle Left/Centre/Right) · Transition |
| Hide | Character dropdown (characters on stage at that point listed first) · Transition |
| Play music | AssetPicker (list with ▶ preview buttons) · Fade in seconds · Loop checkbox |
| Stop music | Fade out seconds |
| Play sound | AssetPicker (list with ▶ preview) |
| Variable | Variable dropdown ("+ New variable…") · Operation (Set to / Add / Subtract / Flip — only the ones valid for the type) · Value (checkbox, number or text field by type) |
| Pause | Radio: Until click / For [n] seconds |
| Transition | Transition dropdown |

- **Ending panel (below the block list, always visible):** four-way radio.
  - *Go to*: scene dropdown (with "+ New scene…").
  - *Choices*: optional prompt (speaker dropdown + text); list of options, each: text field, `if` button (opens ConditionBuilder popover; shows the condition in words when set), "Effects" button (popover with a list of variable changes), target scene dropdown, drag handle, delete.
  - *If*: list of cases, each ConditionBuilder + target dropdown; final fixed row `Otherwise → [scene ▾]`.
  - *End of story*: no fields.
- **ConditionBuilder** (shared component): rows of `[variable ▾] [is / is not / > / ≥ / < / ≤ ▾] [value]`, operators limited by variable type (boolean and text: is / is not only); a `All of these / Any of these` toggle when there are 2+ rows; `+ Add condition`.
- Every dropdown that lists scenes, characters, variables or assets ends with a "+ New…" entry that creates the item inline and selects it, so you never have to leave the scene to keep writing.

### 10.5 Characters

Left: list of characters (colour dot, name, expression count), `+ Character`. Right: Name · Colour · Expressions grid — each tile is the sprite on a checkerboard with an editable name under it; a `DropZone` tile "Drop sprites here or click to upload" (multi-file: each file becomes an expression named after the file name without extension). Delete character is blocked with a list of the scenes using it, each a link, plus "Remove from all scenes and delete".

### 10.6 Assets

Tabs: Backgrounds · Sprites · Music · Sounds. Whole view is a `DropZone` (drop files → imported into the current tab's kind). Images: thumbnail grid with name (rename inline), dimensions, "used in N places". Audio: rows with ▶/⏸, name, duration, usage. Each item: Rename · Replace file… · Delete (same in-use guard as characters). Filter box at the top.

### 10.7 Variables

Table: Name · Type (True/False, Number, Text) · Starting value · Notes · used N times · delete. `+ Variable`. Changing a type that is in use shows a confirm listing what will be reset.

### 10.8 Settings

Story title · Screen size (read-only once the Ren'Py project exists, with an explanation) · Ren'Py game folder (path, `Change…`, `Create new…`, `Open folder`) · Ren'Py SDK folder (path, version check, `Change…`).

### 10.9 Quick play (in-app playtest)

Full-window overlay: the stage component at full size driven by a small interpreter over the model (no code generation, no `eval`): click / Space advances; choices render as centred buttons, with options whose condition is false hidden; music and sounds play through `<audio>`; a collapsible right panel shows live variable values and the current scene name; buttons: Restart · Back to editor · "Open this scene in editor". Transitions are approximated with a 300 ms cross-fade. A banner states: "Quick preview. Use Play in Ren'Py to see the real game."

### 10.11 Additions to the Scene Editor (Phases 10–13)

- Palette gains a second group "More": Visit scene · If · Choice (stay in scene) · Ask the player · Movie · Text box show/hide · Clear page · Show/Hide screen · Ren'Py code; and a third group per enabled kit with that kit's blocks.
- **If** and **Choice (stay in scene)** render as a block row with indented drop areas beneath ("Then", "Otherwise" / one per option; each option has its text, an `if` condition button and a remove button above its area). Blocks can be dragged in and out of these areas, and palette entries dropped into any of them; nesting depth is capped at 4 and a refused move or add shows the toast "Blocks can only be nested 4 levels deep" (a drop that would be refused draws a red insertion line). They compile inline and never leave the scene.
- **Stage preview with nesting:** the stage after a block is made of every block before it at each level above it, plus, inside a branch, only that branch's blocks before it. A container that has been passed over (or is itself selected) counts as its Then branch (If) or its first option (Choice); a Visit block changes nothing.
- **Selection and keys with nesting:** Up/Down walk the rows in the order they appear on screen; Alt+Up/Down swap a block with its neighbour inside the same area only; Delete and Ctrl+D act on the selected block at any depth (deleting a container deletes what is inside it).
- **Ren'Py code** block: monospace text area in the inspector, a note "Exported exactly as written", and a helper dropdown "Insert scene label" that inserts `@scene(name)`. The row summary shows the first line.
- Dialogue inspector gains: Voice line (AssetPicker, voice) and a text toolbar: B · I · U · Colour · Size · "Wait for click" `{w}` · "Pause" `{p}` · Speed `{cps=…}` · Insert variable. The escaping whitelist in 6.4 is extended to exactly these tags.
- Show inspector gains: Placement toggle Preset / Custom. Custom shows X, Y sliders (0–1), Zoom, Rotation, Opacity, **and the sprite becomes draggable on the stage preview** (dragging updates xalign/yalign). Layer order number.
- Music inspector gains: Channel (Music / Ambient).
- Ending panel gains three more radios, shown under a "More" fold: **Screen** (screen dropdown; one target dropdown per leaving element), **Ren'Py code** (text area; list of named exits with target dropdowns; button "Insert exit" writes `jump @exit(name)`), and one entry per enabled kit ending (form generated from the kit manifest; one target dropdown per exit).
- Scene header `⋯` menu gains: Role (Normal / Splash screen) · Lock label… (text field with live validity check) · **View script** (read-only panel showing exactly what this scene compiles to, with a Copy button).
- Map: "Visit scene" blocks are drawn as thin dotted grey arrows from the visiting card to the sub-scene (not draggable; they are derived from blocks). Kit, code and screen endings list their exits as rows like any other ending.

### 10.12 Script Files view (rail icon `</>`, Phase 12)

Left: list of script files (`+ File`, rename, delete) and, below a divider, a read-only list of the generated files (`script.rpy`, chapter files, `interface.rpy`) for reference. Right: monospace editor (a plain `<textarea>` with a line-number gutter, Tab inserts 4 spaces, no syntax colouring) for the selected file. Header note: "Files here are copied into your game unchanged. Use them for custom screens, Python, styles, or anything Fabula has no button for." A file name that collides with a generated file or `gui` / `screens` / `options` is refused.

### 10.13 Kits view (rail icon 🧩, Phase 13)

Cards for every available kit (built-in + the story's `kits/` folder): name, description, the blocks and endings it adds, an on/off switch for this story, "Open folder". Turning a kit off while it is in use is blocked with a list of the scenes using it. A kit whose `kit.json` fails validation shows the exact error on its card and cannot be enabled.

### 10.14 Screen Designer (rail icon ▦, Phase 14)

```
+-------------+-----------------------------------------------+-------------------+
| SCREENS     |  [🖼 Image] [T Text] [▭ Button] [🖼▭ Image btn] |  PROPERTIES       |
| Office desk |  [⬚ Hotspot] [▬ Bar]            zoom  fit ▾    |  Name [drawer   ] |
| Phone       |  ┌─────────────────────────────────────────┐  |  X [200] Y [500]  |
| + Screen    |  │  canvas at game resolution, scaled      │  |  W [180] H [ 60]  |
|             |  │   ┌──────────────┐  ⬚ ⬚                 │  |  Text [Open the…] |
| ☑ Blocks    |  │   │Open the drawer│                     │  |  When clicked     |
|   clicks    |  │   └──────────────┘                      │  |  (•) Leave screen |
|   behind    |  └─────────────────────────────────────────┘  |  ( ) Change variable
|             |  Layers: drag to reorder (top = in front)     |  ( ) Show screen… |
+-------------+-----------------------------------------------+-------------------+
```

Click a tool then click the canvas to place; drag to move; drag corner handles to resize; arrow keys nudge 1px (Shift = 10px); snapping to canvas edges and centre; Delete removes; Ctrl+D duplicates. An optional backdrop picker (any background asset, editor-only, not exported) helps line hotspots up with art. Elements whose action is "Leave screen" become exits wherever the screen is used as an ending.

### 10.15 Look & Feel view (rail icon 🎨, Phase 15)

A form with a live mock of the dialogue box beside it. Sections: **Colours** (accent, idle, hover, dialogue text, name text) · **Fonts** (dialogue, names, interface — upload `.ttf/.otf`; sizes) · **Dialogue box** (replace `gui/textbox.png` and `gui/namebox.png` by upload; height; text position and width) · **Menus** (replace `gui/main_menu.png`, `gui/game_menu.png`; show title on main menu) · **Game** (name, version, about text, window icon, default text speed).

How it is applied: each field maps to one existing `define …` line in `gui.rpy` or `options.rpy` of the linked Ren'Py project. Applying = replace that single line's value; replacing an image = copy the upload over the file in `gui/` (original kept in `backups/`). If a line cannot be found (because you edited the file by hand), the field shows "Edited by hand" with an "Open file" button and is left alone. Values are also stored in `project.look` so they can be re-applied to a freshly created Ren'Py project. This is the only place Fabula writes to `gui.rpy` / `options.rpy`, and only when you press Apply.

### 10.10 Export flows

- **Play in Ren'Py**: save → validate (errors open the Problems drawer and stop) → if no Ren'Py project is linked, open the "Create Ren'Py game" modal → export → `renpyRun`. If Ren'Py reports an error, show it in a modal with the text and a "Copy" button.
- **Play from here in Ren'Py**: same, with `--warp <file>:<line + 1>` from `sceneLocations`. If warping fails, fall back to a normal run and say so in a toast.
- **Check with Ren'Py lint**: export → `renpyLint` → report in a modal.
- **Build game for sharing…**: pick destination → `renpyDistribute` with `--package win` → toast with "Open folder".

---

## 11. Phases

One sub-agent per phase, run one after another (phases share files, so never in parallel). Each brief = this plan file + the phase section + the "Rules for sub-agents" below. After each phase the orchestrator runs the gate itself, looks at the app, and only then commits and starts the next phase.

**Gate for every phase:** `npm run typecheck` clean · `npm test` green · `npm run build` succeeds · phase-specific checks below.

### Phase 0 — Folder, git, and a command-line proof (orchestrator, no sub-agent)
1. Move the session to `C:\Users\youbl\Documents\Claude projects\Fabula`; `git init`.
2. By hand, in a temp folder: run `generate_gui` to create a project; replace `game/script.rpy` with the golden example from 6.3; run `lint` with an output file; run with `--warp`. Record the exact working argument lists in `docs/renpy-cli.md`. If any command behaves differently from section 1, fix this plan before Phase 1.

### Phase 1 — App skeleton
Steps: create `package.json` (scripts: `dev` = `electron-vite dev`, `build` = `electron-vite build`, `typecheck` = `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`, `test` = `vitest run`, `dev:web` = `vite --config vite.web.config.ts` serving the renderer alone); install packages from section 3; write the three tsconfigs with a `@shared/*` path alias; `electron.vite.config.ts` with main / preload / renderer entries; `main/index.ts` opening a 1440×900 window (min 1100×700) with the security settings from section 7; `tokens.css`, `base.css`; `App.tsx` rendering Home with two inert buttons; `api/index.ts` + an empty `browserMock.ts`; one trivial vitest test.
Check: `npm run dev` opens a dark window showing the Home screen; `npm run dev:web` shows the same page in a browser.

### Phase 2 — Model, naming, store
Steps: `model.ts` exactly as section 5; `schema.ts` (zod, one schema per type, `parseProject(json)` returning `{ok, project}` or `{ok:false, error}`); `factory.ts` (every `create…` returns a fully valid object with sensible defaults: say → narrator + empty text, show → position centre + transition none, new scene → `ending: {type:'jump', target:null}`); `naming.ts`; `edges.ts`; `conditions.ts`; `stage.ts`; `projectStore.ts` with all actions from section 9 + zundo; `uiStore.ts`.
Tests: slugify table (accents, emoji, digits first, empty, reserved words, duplicates) · `deleteScenes` clears exits and start · `setEndingType` keeps the first target · undo/redo restores the exact project · `deriveEdges` for every ending type · `computeStage` (background clears sprites, hide removes, show replaces same character).

### Phase 3 — Compiler and validator
Steps: `compiler/*` and `validate.ts` exactly per sections 6 and 8; the fixture; the golden files; `scripts/lint-fixture.mjs` (npm script `test:renpy`).
Tests: one test per row of the mapping table · escaping table (every rule in 6.4, alone and combined) · golden comparison byte-for-byte · compile twice → identical · a test that greps all output for `#` and for the words `Fabula`, `generated`, `AI` and expects none · one test per validation rule (a project that triggers it, and one that does not).
Check: `npm run test:renpy` reports no lint errors from Ren'Py 8.4.1.

### Phase 4 — Files, settings, assets, IPC
Steps: `ipc.ts` interface; `settings.ts`; `projectFiles.ts` (atomic save, zod-validated open with a readable error modal for bad files, asset import copying into `assets/<kind>s/<newId>.<ext>` and reading image dimensions via `nativeImage`); `protocol.ts`; preload bridge; `browserMock.ts` complete; Home screen fully working (New story modal without the Ren'Py checkbox acting yet, Open, Recent, SDK row with version check = existence of `renpy.exe` + version parsed from the folder's `renpy/vc_version.py` or folder name); Shell with rail, top bar, autosave indicator, Undo/Redo buttons; empty placeholder views.
Check: create a story, close the app, reopen from Recent, the "Start" scene is still there; a corrupt JSON file shows a friendly error, not a crash.

### Phase 5 — Characters, Assets, Variables views
Steps: shared components (`Button … DropZone`, `AssetPicker`, `Modal`, `Toast`); the three views per 10.5–10.7 including usage counting (`shared/usage.ts`: where is each asset/character/variable referenced) and the in-use delete guard.
Check: drop three PNGs on a character → three expressions with thumbnails; drop an `.exe` → rejected with a toast; delete an in-use asset → guard lists the scenes.

### Phase 6 — Story Map
Steps: `StoryMap/` with `SceneNode.tsx`, `ExitRow.tsx`, `MapToolbar.tsx`, `useMapInteractions.ts`, `layout.ts` (Tidy up), context menus, search, copy/paste, minimap — every bullet in 10.3.
Check: build a 6-scene branching story using only the mouse; undo all the way back to one scene and redo forward; no arrow ever points at a deleted scene.

### Phase 7 — Scene Editor
Steps: `SceneEditor/` with `Palette.tsx`, `BlockList.tsx`, `BlockRow.tsx`, `blockSummaries.ts` (plain-English one-liners), `Inspector/` (one file per block type), `EndingPanel/` (one file per ending type), `ConditionBuilder`, `EffectsEditor`, inline "+ New…" creation in dropdowns, keyboard shortcuts — everything in 10.4 except the stage.
Check: recreate the golden fixture's first scene by hand through the UI and confirm `compileProject` output (shown via a temporary dev-only "Copy script" button, removed in Phase 9) equals the golden label.

### Phase 8 — Stage preview and Quick play
Steps: `components/Stage.tsx` (pure presentational: takes a stage state + assets); wire into Scene Editor; `Playtest/` overlay with `interpreter.ts` (pure function `step(state, input) → state`, unit-tested: linear run, choice with effect, hidden conditional option, branch ending, end of story).
Check: Quick play the 6-scene story start to every ending; variables panel changes as expected.

### Phase 9 — Ren'Py integration
Steps: `renpy.ts` (spawn wrappers using the argument lists recorded in Phase 0), `exporter.ts` per section 7, Settings view, Export menu, all flows in 10.10, Problems drawer with click-to-navigate, "Create Ren'Py game" modal, New-story checkbox now functional.
Check: from a blank story to the real Ren'Py window showing your background, sprite, dialogue and a working choice, without touching a text editor; export twice → second export changes no file; delete a scene and re-export → its label is gone and no stale chapter file remains; `gui.rpy` and `screens.rpy` are byte-identical before and after export; a non-manifest `script.rpy` is backed up before being replaced.

**Milestone A (after Phase 9): a complete, usable visual novel maker for standard VNs.** Phases 10–15 widen it to the full coverage in section 1a; each one is independently shippable.

### Phase 10 — Richer story blocks
Steps: UI + compiler + validator + Quick play support for: voice lines, ambient channel, movie, Ask the player, text-box show/hide, Clear page, text toolbar tags, custom placement with stage dragging, z-order, persistent variables, character NVL mode and side image, new asset kinds and their Assets tabs, scene role, label lock. Extend the fixture and golden files; rerun `test:renpy`.
Check: a scene using every new block plays correctly in Ren'Py; golden test and lint pass.

### Phase 11 — Blocks inside blocks, and sub-scenes
Steps: `visit`, `if`, `inlineChoice` — nested drag-and-drop in `BlockList` (a recursive `BlockTree` with a path-based `moveBlock(sceneId, fromPath, toPath)` action), compiler recursion with indentation, `computeStage` and the Quick play interpreter walking nested blocks and a call stack, dotted visit arrows on the map, validation (visit target missing; sub-scene whose ending is not End is a warning).
Check: nested If inside an inline Choice compiles with correct indentation and passes lint; a sub-scene returns to the right place in Quick play and in Ren'Py.

As built: validation adds Visit without a scene (error), Visit cycles (error, "would never finish"), blocks nested deeper than 4 (error), an If with no condition or an unfinished one (error), a Choice with no options or an empty option text (error), a Choice whose options all have conditions (warning), a sub-scene whose ending is not End (warning), and the start scene being visited (warning); a scene that is only visited counts as reachable. The Story Map draws Visit blocks as thin dotted grey arrows from a hidden handle on the visiting card; they come from `deriveVisitEdges` and are not selectable, reconnectable or deletable, and Tidy up and the unreachable (60%) rule count them. Quick play keeps a call stack: Visit pushes the position after the Visit block, an End ending inside a visited scene pops it.

### Phase 12 — Code escape hatches
Steps: code block, code ending with named exits and `@exit()` / `@scene()` substitution, Script Files view, "View script" panel, generated-files reference list. Validation: every named exit is used in the code and connected; `@exit`/`@scene` names exist; script file names legal and unique. After export, lint runs automatically when the story contains any code, and errors are shown with the file and line.
Check: a hand-written screen in a script file, shown from a code block, works in Ren'Py; a code ending with two exits draws two arrows.

### Phase 13 — Kits and the Terminal kit
Steps: `shared/kits/manifest.ts` (zod schema for `kit.json`), `shared/kits/template.ts` + tests for every tag and filter, kit loading in main (`listKits(dir)` added to the Api, with the mock returning the built-in kit), generated inspector form (`KitForm.tsx`, one small component per field type), exit syncing, kit file copying in the exporter, Kits view, Quick play placeholder panel. Then the Terminal kit itself per 6.7, including `terminal.rpy`.
As built: see the "As built (Phase 13)" notes in section 6.7. The Terminal session adds a "Prompt" field, an "Add a help command" switch and a per-command "Only when" condition; the session starts with an empty-input branch so a bare Enter just asks again; `terminal_close()` waits for Enter ("Connection closed. Press Enter to continue.") so the last reply can be read before the story moves on. The real-typing proof is `npm run test:typing` (Ren'Py's own test framework types into the running game).

Check: a scene ending in a Terminal session with three commands (one stays, two leave) shows two arrows; in Ren'Py you can type the commands and reach both scenes; an unknown command prints the fallback; lint passes. Copying the kit folder, renaming its id, and changing a label produces a second working kit with no editor code changes.

### Phase 14 — Screen Designer
Steps: `ScreenDesigner/` per 10.14, screen compiler (`compiler/screens.ts`) per 6.6, screen block, screen ending with per-element targets, UI asset kind, Quick play rendering of designed screens (they are plain positioned elements, so they are rendered for real, unlike kits).
Check: a hub screen with a background image, two hotspots and a button leads to three scenes, in Quick play and in Ren'Py.

### Phase 15 — Look & Feel
Steps: `shared/look.ts` (table of fields: key, file, define name, value type, how to print the value), main-process `readLook(projectDir)` / `applyLook(projectDir, values)` using single-line replacement, the view per 10.15 with the live dialogue-box mock, re-apply on new Ren'Py project.
Check: change accent colour, dialogue font and text box image → visible in Ren'Py; diff of `gui.rpy` shows only the intended lines changed; a hand-edited line is reported as "Edited by hand" and not touched.

### Phase 16 — Polish and installer
Steps: empty states with one-sentence guidance on every view; first-run hint cards on the map (dismissible, stored in settings); consistent keyboard shortcuts + a `?` cheat-sheet modal; window title = story title; unsaved-changes guard on quit; chapter create/rename/recolour UI on the map; performance pass (300 scenes pan/zoom smoothly: memoised nodes, no store subscription wider than needed); `electron-builder` config producing a Windows installer; `README.md` for you (how to run, where files live).
Check: full end-to-end run of section 13 on the installed build.

### Later (not in this build; listed so nobody adds them early)
Importing existing `.rpy` scripts into the map · a visual animation (ATL keyframe) builder · speaker expression shortcut (`anna happy "…"`) · more built-in kits (phone messages, inventory, gallery, achievements, speech bubbles) — each is a kit folder, addable at any time without touching the editor · in-editor translation tables (Ren'Py's own translation tools already work on the export).

---

## 12. Rules for sub-agents (paste into every brief)

1. Do only the phase you were given. Do not start the next phase. Do not add features that are not written in the plan, including anything under "Later".
2. Before writing a file, read the plan section that describes it. Type names, field names, function names, file paths and UI labels must match the plan letter for letter.
3. `src/shared` is pure: no imports from `react`, `electron`, `fs`, `path`, or `node:*`.
4. Components never change project data directly; they call a store action. If an action is missing, add it to `projectStore.ts` with a test.
5. Never store edges. Never emit a comment or any tool name in compiler output. Never use `eval` or `new Function`.
6. Never run Ren'Py through a shell string. Use `spawn(exe, [args])`.
7. No network requests, no CDN links, no remote fonts, no analytics, no AI libraries, no bundled images or audio (icons come from `lucide-react` only).
8. No new dependencies beyond section 3 without stopping to ask.
8a. Nothing kit-specific may be coded in the editor. If the Terminal kit needs something the kit system cannot express, extend the kit system (field type, template filter) and document it in section 6.7.
8b. Code the user typed (code blocks, code endings, script files) is exported character for character. Never reformat, lint-fix or annotate it.
9. After every file or two: `npm run typecheck`. Before reporting done: `npm run typecheck && npm test && npm run build`, and paste the real output. If something fails and you cannot fix it in three attempts, stop and report exactly what fails; do not delete or weaken a test to make it pass.
10. Final report format: files created/changed · commands run with results · anything in the plan you could not do or had to interpret, and how.

## 13. End-to-end verification (orchestrator, after Phase 9 and again after Phase 10)

1. `npm run typecheck && npm test && npm run test:renpy && npm run build` all pass.
2. In the running app: New story "Verification" with a Ren'Py game → add two characters with uploaded sprites, two backgrounds, one music track, one number and one true/false variable → build 6 scenes with a choice ending (one conditional option with an effect), a branch ending, and two end scenes → Problems shows 0 errors.
3. Quick play reaches both endings.
4. Play in Ren'Py: the real engine shows the same story; the conditional choice appears only when its variable allows; "Play from here" lands in the chosen scene.
5. Check with Ren'Py lint: no errors.
6. Open the exported `script.rpy` in a text editor: reads like a hand-written script, no comments, no tool name; the Ren'Py project folder contains no editor files.
7. Build game for sharing → the zip runs on its own.
8. After Phase 15, a second story "Verification 2" exercising the wider coverage: an NVL character with a voiced line, a sub-scene, an inline If, a Terminal session with two leaving commands, a designed hub screen with hotspots, one hand-written script file, a changed font and text box. It must pass lint, play correctly in Ren'Py, and its exported files must contain no comments and no tool name (kit and script files included, except comments you typed yourself).
9. UI checks are also done in a plain browser via `npm run dev:web` (mock API) so each screen can be inspected and clicked through quickly.
