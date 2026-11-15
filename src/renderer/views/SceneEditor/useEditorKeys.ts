import { useEffect } from 'react'
import type { Id } from '@shared/model'
import { deleteSelected, duplicateSelected, moveSelectedBlock, moveSelection } from './blockActions'

/**
 * Scene Editor shortcuts: Delete removes the selected block, Ctrl+D duplicates, Up/Down moves the selection,
 * Alt+Up/Down moves the block. Plain keys only act when no text box or popup has the keyboard.
 */
export function useEditorKeys(sceneId: Id): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      if (document.querySelector('.modal-backdrop, .popover')) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const onList = !t || t === document.body || !!t.closest('.block-list, .palette')

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        moveSelectedBlock(sceneId, e.key === 'ArrowUp' ? -1 : 1)
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        if (typing && !t?.classList.contains('row-text')) return
        e.preventDefault()
        duplicateSelected(sceneId)
        return
      }
      if (typing || !onList || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Delete') {
        e.preventDefault()
        deleteSelected(sceneId)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        moveSelection(sceneId, e.key === 'ArrowUp' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sceneId])
}
