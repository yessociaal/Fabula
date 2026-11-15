import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react'

export interface DraftAreaHandle {
  focus(): void
  getSelection(): { start: number; end: number; text: string }
  /** Replace the text, save it at once and select the given range afterwards. */
  apply(text: string, selStart: number, selEnd: number): void
}

interface DraftAreaProps {
  value: string
  onCommit: (value: string) => void
  handle?: Ref<DraftAreaHandle>
  rows?: number
  placeholder?: string
  className?: string
  'aria-label': string
  /** Runs before the area's own handling; call `preventDefault()` to take over a key. */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>, current: string) => void
  onFocus?: () => void
  /** Save after this many ms without typing (and always when focus leaves). */
  idleMs?: number
}

/**
 * A multi-line box that keeps what you type to itself and saves into the story after a short pause or when you
 * leave it, so one burst of typing is one undo step instead of one per letter.
 */
export function DraftArea({ value, onCommit, handle, rows = 1, className, onKeyDown, onFocus, idleMs = 700, placeholder, ...rest }: DraftAreaProps) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const saved = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(draft)
  latest.current = draft
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  // Pick up changes made elsewhere (undo, the inspector) but not our own saves.
  useEffect(() => {
    if (value !== saved.current) {
      saved.current = value
      setDraft(value)
    }
  }, [value])

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (latest.current !== saved.current) {
      saved.current = latest.current
      commitRef.current(latest.current)
    }
  }

  useEffect(
    () => () => {
      // Leaving the screen (or the block being deleted) must not lose the last few letters.
      if (timer.current) {
        clearTimeout(timer.current)
        if (latest.current !== saved.current) commitRef.current(latest.current)
      }
    },
    []
  )

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus(),
    getSelection: () => {
      const el = ref.current
      const start = el?.selectionStart ?? latest.current.length
      const end = el?.selectionEnd ?? start
      return { start, end, text: latest.current }
    },
    apply: (text, selStart, selEnd) => {
      latest.current = text
      setDraft(text)
      flush()
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.setSelectionRange(selStart, selEnd)
      })
    }
  }))

  return (
    <textarea
      ref={ref}
      className={`input draft-area ${className ?? ''}`}
      rows={rows}
      value={draft}
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      onFocus={onFocus}
      onChange={(e) => {
        setDraft(e.target.value)
        latest.current = e.target.value
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, idleMs)
      }}
      onBlur={flush}
      onKeyDown={(e) => {
        onKeyDown?.(e, latest.current)
        if (e.defaultPrevented) return
        if (e.key === 'Escape') {
          latest.current = saved.current
          setDraft(saved.current)
          ref.current?.blur()
        }
      }}
    />
  )
}
