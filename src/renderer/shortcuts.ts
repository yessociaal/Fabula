/**
 * Every keyboard shortcut the editor reacts to, for the "?" cheat sheet. Each line here matches code that exists:
 * Shell.tsx (undo, redo, ?), useMapInteractions.ts and StoryMap.tsx (map), useEditorKeys.ts and BlockRow.tsx (scene editor),
 * ScreenDesigner.tsx, Playtest.tsx, LineNumberEditor.tsx and CodeEditing.ts (code boxes).
 */
export interface ShortcutGroup {
  title: string
  items: { keys: string; does: string }[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Everywhere',
    items: [
      { keys: 'Ctrl+Z', does: 'Undo' },
      { keys: 'Ctrl+Y or Ctrl+Shift+Z', does: 'Redo' },
      { keys: '?', does: 'Show this list (when no text box has the keyboard)' },
      { keys: 'Esc', does: 'Close the open window, menu or Quick play' }
    ]
  },
  {
    title: 'Story Map',
    items: [
      { keys: 'Double-click empty space', does: 'Add a scene there' },
      { keys: 'Double-click a scene', does: 'Open it in the Scene Editor' },
      { keys: 'Shift+drag on empty space', does: 'Select several scenes with a box' },
      { keys: 'Shift+click', does: 'Add a scene to the selection' },
      { keys: 'Delete or Backspace', does: 'Delete the selected scenes (asks first) or the selected arrow' },
      { keys: 'Ctrl+C / Ctrl+V', does: 'Copy and paste the selected scenes' },
      { keys: 'Ctrl+F', does: 'Search scene names and dialogue' },
      { keys: 'Enter / Shift+Enter (in search)', does: 'Jump to the next / previous match' }
    ]
  },
  {
    title: 'Scene Editor',
    items: [
      { keys: 'Enter (in a dialogue line)', does: 'Add a new dialogue block below' },
      { keys: 'Shift+Enter (in a dialogue line)', does: 'Insert a line break' },
      { keys: 'Up / Down', does: 'Select the previous / next block' },
      { keys: 'Alt+Up / Alt+Down', does: 'Move the selected block up / down' },
      { keys: 'Delete', does: 'Delete the selected block' },
      { keys: 'Ctrl+D', does: 'Duplicate the selected block' }
    ]
  },
  {
    title: 'Screen Designer',
    items: [
      { keys: 'Arrow keys', does: 'Nudge the selected element by 1 pixel' },
      { keys: 'Shift+Arrow keys', does: 'Nudge the selected element by 10 pixels' },
      { keys: 'Delete or Backspace', does: 'Delete the selected element' },
      { keys: 'Ctrl+D', does: 'Duplicate the selected element' },
      { keys: 'Esc', does: 'Put the placing tool down' }
    ]
  },
  {
    title: 'Quick play',
    items: [
      { keys: 'Space or Enter', does: 'Continue' },
      { keys: '1 to 9', does: 'Pick a numbered exit of a Ren\'Py code ending' },
      { keys: 'Esc', does: 'Back to the editor' }
    ]
  },
  {
    title: 'Code boxes (Ren\'Py code, script files)',
    items: [{ keys: 'Tab', does: 'Type four spaces (press Esc, then Tab, to move to the next control)' }]
  }
]
