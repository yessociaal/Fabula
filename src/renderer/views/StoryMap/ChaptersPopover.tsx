import { Layers, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { ColorField } from '../../components/ColorField'
import { CommitField } from '../../components/CommitField'
import { IconButton } from '../../components/IconButton'
import { Popover } from '../../components/Popover'
import { toast } from '../../components/Toast'
import { useProjectStore } from '../../store/projectStore'
import { plural } from '../../util'
import { CHAPTER_PALETTE, nextChapter } from './mapModel'

/** Chapters list on the map toolbar: add, rename, recolour (fixed palette or any colour) and delete. */
export function ChaptersPopover() {
  const project = useProjectStore((s) => s.project)
  const addChapter = useProjectStore((s) => s.addChapter)
  const updateChapter = useProjectStore((s) => s.updateChapter)
  const deleteChapter = useProjectStore((s) => s.deleteChapter)
  if (!project) return null

  const sceneCount = (chapterId: string): number => Object.values(project.scenes).filter((s) => s.chapterId === chapterId).length

  return (
    <Popover
      label="Chapters"
      className="popover-wide chapters-popover"
      trigger={(props) => (
        <Button icon={<Layers size={16} />} title="Coloured groups of scenes. Each chapter is its own file in the Ren'Py game." {...props}>
          Chapters
        </Button>
      )}
    >
      <div className="popover-body">
        <div className="popover-title">Chapters</div>
        {project.chapterOrder.length === 0 && (
          <p className="muted-note">No chapters yet. A chapter is a coloured group of scenes; add one, then use a scene's right-click menu to move it in.</p>
        )}
        {project.chapterOrder
          .filter((id) => project.chapters[id])
          .map((id) => {
            const c = project.chapters[id]
            const n = sceneCount(id)
            return (
              <div className="chapter-row" key={id} data-chapter-id={id}>
                <div className="chapter-line">
                  <span className="color-dot chapter-dot" style={{ background: c.color }} />
                  <CommitField className="chapter-name" aria-label="Chapter name" required value={c.name} onCommit={(name) => updateChapter(id, { name })} />
                  <span className="chapter-count">{plural(n, 'scene')}</span>
                  <IconButton label="Delete this chapter. Scenes in it become uncategorised." onClick={() => {
                    deleteChapter(id)
                    toast(n > 0 ? `Chapter deleted. ${plural(n, 'scene')} became uncategorised. Ctrl+Z undoes this.` : 'Chapter deleted. Ctrl+Z undoes this.')
                  }}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
                <div className="chapter-colors" role="group" aria-label="Chapter colour">
                  {CHAPTER_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`chapter-swatch ${c.color.toLowerCase() === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      title={color}
                      aria-label={`Colour ${color}`}
                      aria-pressed={c.color.toLowerCase() === color}
                      onClick={() => updateChapter(id, { color })}
                    />
                  ))}
                  <ColorField value={c.color} onChange={(color) => updateChapter(id, { color })} />
                </div>
              </div>
            )
          })}
        <Button
          icon={<Plus size={14} />}
          onClick={() => {
            const { name, color } = nextChapter(project)
            addChapter(name, color)
          }}
        >
          Add chapter
        </Button>
        <p className="muted-note">Deleting a chapter does not delete its scenes: scenes in it become uncategorised.</p>
      </div>
    </Popover>
  )
}
