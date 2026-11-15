import { create } from 'zustand'

type ToastKind = 'info' | 'error' | 'ok'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastState {
  items: ToastItem[]
  dismiss(id: number): void
}

let nextId = 1

const useToasts = create<ToastState>()((set) => ({
  items: [],
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
}))

/** Show a message in the corner. Disappears after a few seconds. */
export function toast(message: string, kind: ToastKind = 'info'): void {
  const id = nextId++
  useToasts.setState((s) => ({ items: [...s.items, { id, message, kind }] }))
  setTimeout(() => useToasts.getState().dismiss(id), kind === 'error' ? 7000 : 3500)
}

export function ToastHost() {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)} title="Dismiss">
          {t.message}
        </button>
      ))}
    </div>
  )
}
