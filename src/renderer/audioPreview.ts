import { create } from 'zustand'

/** One shared audio element for every preview button in the app: only one sound plays at a time. */
let element: HTMLAudioElement | null = null

interface PreviewState {
  playingUrl: string | null
  toggle(url: string): void
  stop(): void
}

export const useAudioPreview = create<PreviewState>()((set, get) => ({
  playingUrl: null,
  toggle(url) {
    if (!element) {
      element = new Audio()
      element.addEventListener('ended', () => set({ playingUrl: null }))
      element.addEventListener('error', () => set({ playingUrl: null }))
    }
    if (get().playingUrl === url) {
      element.pause()
      set({ playingUrl: null })
      return
    }
    element.src = url
    set({ playingUrl: url })
    element.play().catch(() => set({ playingUrl: null }))
  },
  stop() {
    element?.pause()
    set({ playingUrl: null })
  }
}))

/** Read an audio file's length from its metadata. Resolves null when it cannot be read. */
export function readAudioDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => resolve(null)
    a.src = url
  })
}
