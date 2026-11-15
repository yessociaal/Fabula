import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

export type MenuItem =
  | { separator: true }
  | {
      separator?: false
      label: string
      onSelect?: () => void
      /** Shown as a tooltip; a disabled item should say why. */
      title?: string
      disabled?: boolean
      danger?: boolean
      /** Opens a submenu on hover or click instead of running `onSelect`. */
      submenu?: MenuItem[]
    }

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

function MenuList({ items, onClose, className }: { items: MenuItem[]; onClose: () => void; className?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className={`context-menu ${className ?? ''}`} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="context-sep" role="separator" />
        const hasSub = !!item.submenu
        return (
          <div key={i} className="context-item-wrap" onMouseEnter={() => setOpen(hasSub ? i : null)}>
            <button
              type="button"
              role="menuitem"
              className={`context-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              title={item.title}
              aria-haspopup={hasSub ? 'menu' : undefined}
              onClick={() => {
                if (hasSub) {
                  setOpen(i)
                  return
                }
                onClose()
                item.onSelect?.()
              }}
            >
              <span>{item.label}</span>
              {hasSub && <ChevronRight size={14} />}
            </button>
            {hasSub && open === i && item.submenu && <MenuList items={item.submenu} onClose={onClose} className="context-sub" />}
          </div>
        )
      })}
    </div>
  )
}

/** A small right-click menu at a screen position. Closes on outside click, Escape, scroll or resize. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4))
    })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-root" style={{ left: pos.x, top: pos.y }}>
      <MenuList items={items} onClose={onClose} />
    </div>
  )
}
