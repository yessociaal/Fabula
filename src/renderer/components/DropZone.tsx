import { useRef, useState, type DragEvent, type ReactNode } from 'react'

/** A hidden `<input type=file multiple>`; call `open()` to show the browse dialog. */
export function useFileInput(accept: string, onFiles: (files: File[]) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept={accept}
      hidden
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (files.length) onFiles(files)
      }}
    />
  )
  return { input, open: () => ref.current?.click() }
}

interface DropZoneProps {
  /** Comma-separated extensions for the browse dialog, e.g. ".png,.jpg". Dropped files are not filtered here. */
  accept: string
  onFiles: (files: File[]) => void
  children?: ReactNode
  className?: string
  /** Also open the browse dialog when the zone is clicked or activated with Enter / Space (for tile-style zones). */
  clickToBrowse?: boolean
  label?: string
}

/** Accepts files dropped from the operating system and (optionally) chosen with the browse dialog. */
export function DropZone({ accept, onFiles, children, className, clickToBrowse, label }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const { input, open } = useFileInput(accept, onFiles)

  const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''} ${clickToBrowse ? 'clickable' : ''} ${className ?? ''}`}
      role={clickToBrowse ? 'button' : undefined}
      tabIndex={clickToBrowse ? 0 : undefined}
      aria-label={clickToBrowse ? label : undefined}
      title={clickToBrowse ? label : undefined}
      onClick={clickToBrowse ? open : undefined}
      onKeyDown={
        clickToBrowse
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                open()
              }
            }
          : undefined
      }
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(files)
      }}
    >
      {children}
      {input}
    </div>
  )
}
