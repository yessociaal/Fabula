import type { KeyboardEvent } from 'react'
import { insertAtSelection } from '../views/SceneEditor/editorHelpers'
import type { DraftAreaHandle } from './DraftArea'

/** Tab types four spaces in a code box (Esc, then Tab, still moves on to the next control). */
export function tabAsSpaces(e: KeyboardEvent<HTMLTextAreaElement>, handle: DraftAreaHandle | null): void {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !handle) return
  e.preventDefault()
  const sel = handle.getSelection()
  const edit = insertAtSelection(sel.text, sel.start, sel.end, '    ')
  handle.apply(edit.text, edit.selStart, edit.selEnd)
}

/** Put `insert` at the caret of a code box (or at the end when it never had focus). */
export function insertIntoCode(handle: DraftAreaHandle | null, fallback: string, insert: string): void {
  if (!handle) return
  const sel = handle.getSelection()
  const text = sel.text ?? fallback
  const edit = insertAtSelection(text, sel.start, sel.end, insert)
  handle.apply(edit.text, edit.selStart, edit.selEnd)
}
