import { useDraggable } from '@dnd-kit/core'
import { KitIcon } from '../../components/KitIcon'
import { useKitStore } from '../../store/kitStore'
import { useProjectStore } from '../../store/projectStore'
import { MORE_PALETTE, PALETTE, iconFor, kitPaletteGroups, type PaletteEntry } from './blockMeta'
import { appendEntry } from './blockActions'

export const PALETTE_ID_PREFIX = 'palette:'

function PaletteItem({ entry, sceneId }: { entry: PaletteEntry; sceneId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_ID_PREFIX}${entry.key}`,
    data: { entry }
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`palette-item ${isDragging ? 'dragging' : ''}`}
      title={`Add a ${entry.label.toLowerCase()} block (click to add, or drag it into the list)`}
      {...attributes}
      {...listeners}
      onClick={() => appendEntry(sceneId, entry)}
    >
      {entry.kit ? <KitIcon name={entry.icon} /> : iconFor(entry.type, !!entry.narration, 16)}
      <span>{entry.label}</span>
    </button>
  )
}

/** The look of a palette entry while it is being dragged. */
export function PaletteGhost({ entry }: { entry: PaletteEntry }) {
  return (
    <div className="palette-item palette-ghost">
      {entry.kit ? <KitIcon name={entry.icon} /> : iconFor(entry.type, !!entry.narration, 16)}
      <span>{entry.label}</span>
    </div>
  )
}

export function Palette({ sceneId }: { sceneId: string }) {
  const kits = useKitStore((s) => s.kits)
  const enabled = useProjectStore((s) => s.project?.kits)
  const groups = kitPaletteGroups({ kits }, enabled ?? [])
  return (
    <aside className="palette" aria-label="Add block">
      <h3 className="panel-heading">Add block</h3>
      {PALETTE.map((entry) => (
        <PaletteItem key={entry.key} entry={entry} sceneId={sceneId} />
      ))}
      <h3 className="panel-heading palette-group">More</h3>
      {MORE_PALETTE.map((entry) => (
        <PaletteItem key={entry.key} entry={entry} sceneId={sceneId} />
      ))}
      {groups.map((g) => (
        <div key={g.kitId} className="palette-kit-group" aria-label={`${g.kitName} blocks`}>
          <h3 className="panel-heading palette-group">{g.kitName}</h3>
          {g.entries.map((entry) => (
            <PaletteItem key={entry.key} entry={entry} sceneId={sceneId} />
          ))}
        </div>
      ))}
    </aside>
  )
}
