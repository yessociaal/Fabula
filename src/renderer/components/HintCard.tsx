import { useEffect } from 'react'
import { X } from 'lucide-react'
import { create } from 'zustand'
import { api } from '../api'
import { IconButton } from './IconButton'

interface HintState {
  /** Ids of the closed hints; null until the settings have been read. */
  dismissed: string[] | null
  load(): Promise<void>
  dismiss(id: string): void
}

export const useHints = create<HintState>()((set, get) => ({
  dismissed: null,
  async load() {
    if (get().dismissed !== null) return
    try {
      set({ dismissed: (await api.getSettings()).dismissedHints ?? [] })
    } catch {
      set({ dismissed: [] })
    }
  },
  dismiss(id) {
    set((s) => ({ dismissed: [...(s.dismissed ?? []).filter((d) => d !== id), id] }))
    void api.dismissHint(id)
  }
}))

interface HintCardProps {
  /** Stable id; once closed, the card never comes back (it is remembered in the app settings). */
  id: string
  title: string
  children: string
  className?: string
}

/** A small dismissible first-run tip. */
export function HintCard({ id, title, children, className }: HintCardProps) {
  const dismissed = useHints((s) => s.dismissed)
  useEffect(() => {
    void useHints.getState().load()
  }, [])
  if (dismissed === null || dismissed.includes(id)) return null
  return (
    <aside className={`hint-card ${className ?? ''}`} role="note" aria-label={title} data-hint={id}>
      <div className="hint-card-text">
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
      <IconButton label="Close this tip" onClick={() => useHints.getState().dismiss(id)}>
        <X size={14} />
      </IconButton>
    </aside>
  )
}
