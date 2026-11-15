import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './editorWidgets.css'

/** Open popovers, bottom to top. A click outside closes every popover above the one that was clicked. */
const stack: HTMLElement[] = []

interface PopoverPanelProps {
  /** The element the panel hangs from (a button). Clicks on it do not count as "outside". */
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  className?: string
  /** Match the anchor's width (dropdowns) instead of sizing to the content. */
  matchWidth?: boolean
  label?: string
}

/** A floating panel under its anchor. Closes on outside click or Escape (topmost panel first). */
export function PopoverPanel({ anchor, onClose, children, className, matchWidth, label }: PopoverPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width?: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const panel = ref.current
    if (!anchor || !panel) return
    const place = (): void => {
      const a = anchor.getBoundingClientRect()
      const r = panel.getBoundingClientRect()
      const below = window.innerHeight - a.bottom
      const top = below >= Math.min(r.height, 260) || a.top < r.height ? a.bottom + 4 : a.top - r.height - 4
      const left = Math.max(8, Math.min(a.left, window.innerWidth - r.width - 8))
      setPos({ left, top: Math.max(8, top), width: matchWidth ? a.width : undefined })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, matchWidth])

  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    stack.push(panel)
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (panel.contains(target) || anchor?.contains(target)) return
      const mine = stack.indexOf(panel)
      if (stack.slice(mine + 1).some((p) => p.contains(target))) return
      closeRef.current()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && stack[stack.length - 1] === panel) {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      const at = stack.indexOf(panel)
      if (at >= 0) stack.splice(at, 1)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className ?? ''}`}
      role="dialog"
      aria-label={label}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body
  )
}

interface PopoverProps {
  /** Renders the trigger button. Spread `props` on it. */
  trigger: (props: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'dialog' }, open: boolean) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  className?: string
  label?: string
}

/** A trigger button that opens a floating panel. */
export function Popover({ trigger, children, className, label }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const close = (): void => setOpen(false)
  return (
    <>
      {trigger({ ref: setAnchor, onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'dialog' }, open)}
      {open && (
        <PopoverPanel anchor={anchor} onClose={close} className={className} label={label}>
          {typeof children === 'function' ? children(close) : children}
        </PopoverPanel>
      )}
    </>
  )
}
