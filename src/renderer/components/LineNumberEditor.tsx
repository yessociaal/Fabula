import { useEffect, useRef, useState } from 'react'

interface LineNumberEditorProps {
  value: string
  /** Called after a pause in typing, when focus leaves, and when the editor goes away. Not called for a read-only editor. */
  onCommit?: (value: string) => void
  readOnly?: boolean
  'aria-label': string
  idleMs?: number
}

/**
 * A plain monospace text area with a line-number gutter that scrolls with it. Tab types four spaces.
 * It keeps what you type to itself and saves in one go, so a burst of typing is one undo step.
 */
export function LineNumberEditor({ value, onCommit, readOnly = false, idleMs = 700, ...rest }: LineNumberEditorProps) {
  const [draft, setDraft] = useState(value)
  const area = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const saved = useRef(value)
  const latest = useRef(draft)
  latest.current = draft
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    if (value !== saved.current) {
      saved.current = value
      setDraft(value)
      latest.current = value
    }
  }, [value])

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!readOnly && latest.current !== saved.current) {
      saved.current = latest.current
      commitRef.current?.(latest.current)
    }
  }

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        if (latest.current !== saved.current) commitRef.current?.(latest.current)
      }
    },
    []
  )

  const lines = draft.split('\n').length

  return (
    <div className="line-editor">
      <div className="line-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={area}
        className="line-text"
        value={draft}
        readOnly={readOnly}
        spellCheck={false}
        wrap="off"
        aria-label={rest['aria-label']}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          latest.current = e.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, idleMs)
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || readOnly) return
          e.preventDefault()
          const el = e.currentTarget
          // execCommand keeps the browser's own undo history; setRangeText is the fallback.
          if (!document.execCommand('insertText', false, '    ')) {
            el.setRangeText('    ', el.selectionStart, el.selectionEnd, 'end')
            setDraft(el.value)
            latest.current = el.value
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(flush, idleMs)
          }
        }}
      />
    </div>
  )
}
