import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { PopoverPanel } from './Popover'

export type DropdownItem<T extends string> =
  | { kind: 'item'; value: T; label: string; color?: string; disabled?: boolean }
  | { kind: 'header'; label: string }
  | { kind: 'separator' }
  /** A "+ New…" style entry: runs `onSelect` instead of choosing a value. */
  | { kind: 'action'; label: string; onSelect: () => void }

interface DropdownProps<T extends string> {
  value: T | null
  items: DropdownItem<T>[]
  onChange: (value: T) => void
  placeholder?: string
  'aria-label': string
  disabled?: boolean
  className?: string
}

/** Like a select box, but entries can carry a colour dot and the list can end with "+ New…" actions. */
export function Dropdown<T extends string>({
  value,
  items,
  onChange,
  placeholder = 'Choose…',
  disabled,
  className,
  ...rest
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const current = items.find((i): i is Extract<DropdownItem<T>, { kind: 'item' }> => i.kind === 'item' && i.value === value)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const list = listRef.current
      const target =
        list?.querySelector<HTMLButtonElement>('button[aria-selected="true"]') ??
        list?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      target?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  const close = (refocus = true): void => {
    setOpen(false)
    if (refocus) anchor?.focus()
  }

  const focusOption = (delta: number): void => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[Math.max(0, Math.min(buttons.length - 1, at + delta))]?.focus()
  }

  const onListKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusOption(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusOption(-1)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const row = (item: DropdownItem<T>, i: number): ReactNode => {
    switch (item.kind) {
      case 'header':
        return (
          <div key={i} className="dd-header">
            {item.label}
          </div>
        )
      case 'separator':
        return <div key={i} className="context-sep" role="separator" />
      case 'action':
        return (
          <button
            key={i}
            type="button"
            className="dd-item dd-action"
            onClick={() => {
              close(false)
              item.onSelect()
            }}
          >
            <Plus size={14} />
            {item.label.replace(/^\+\s*/, '')}
          </button>
        )
      case 'item':
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={item.value === value}
            disabled={item.disabled}
            className={`dd-item ${item.value === value ? 'selected' : ''}`}
            onClick={() => {
              close()
              onChange(item.value)
            }}
          >
            {item.color && <span className="color-dot" style={{ background: item.color }} />}
            <span className="dd-label">{item.label}</span>
          </button>
        )
    }
  }

  return (
    <>
      <button
        type="button"
        ref={setAnchor}
        className={`input dd-trigger ${className ?? ''}`}
        disabled={disabled}
        aria-label={rest['aria-label']}
        title={rest['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {current?.color && <span className="color-dot" style={{ background: current.color }} />}
        <span className={`dd-label ${current ? '' : 'dd-placeholder'}`}>{current ? current.label : placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <PopoverPanel anchor={anchor} onClose={() => close()} matchWidth className="dd-panel">
          <div ref={listRef} role="listbox" aria-label={rest['aria-label']} onKeyDown={onListKey}>
            {items.map(row)}
          </div>
        </PopoverPanel>
      )}
    </>
  )
}
