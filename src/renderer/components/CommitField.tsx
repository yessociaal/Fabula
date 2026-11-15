import { useEffect, useRef, useState } from 'react'

interface CommitFieldProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  'aria-label': string
  className?: string
  /** When true the value may not be committed empty (the old value comes back). */
  required?: boolean
}

/** A text box that keeps what you type to itself and saves on Enter or when you leave it (Esc cancels). */
export function CommitField({ value, onCommit, placeholder, required, className, ...rest }: CommitFieldProps) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])

  const commit = (): void => {
    const next = draft.trim()
    if (required && !next) setDraft(value)
    else if (draft !== value) onCommit(required ? next : draft)
  }

  return (
    <input
      ref={ref}
      className={`input ${className ?? ''}`}
      value={draft}
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      title={rest['aria-label']}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ref.current?.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          ref.current?.blur()
        }
      }}
    />
  )
}
