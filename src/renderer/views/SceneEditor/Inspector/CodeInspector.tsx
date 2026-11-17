import { useMemo, useRef } from 'react'
import type { ExtraBlock } from '@shared/model'
import { sceneOrder } from '@shared/naming'
import { DraftArea, type DraftAreaHandle } from '../../../components/DraftArea'
import { Dropdown, type DropdownItem } from '../../../components/Dropdown'
import { insertIntoCode, tabAsSpaces } from '../../../components/CodeEditing'
import { useProjectStore } from '../../../store/projectStore'
import { useBlockPatch, type InspectorProps } from './types'

type Code = Extract<ExtraBlock, { type: 'code' }>

/** Free-form Ren'Py code. It is exported exactly as written; the only thing Fabula changes is @scene(Scene name). */
export function CodeInspector({ sceneId, block }: InspectorProps<Code>) {
  const patch = useBlockPatch<Code>(sceneId, block.id)
  const project = useProjectStore((s) => s.project)
  const area = useRef<DraftAreaHandle>(null)

  const items = useMemo<DropdownItem<string>[]>(
    () =>
      project
        ? sceneOrder(project).map((s) => ({ kind: 'item' as const, value: s.id, label: s.name || 'Untitled scene' }))
        : [],
    [project]
  )

  const insertSceneLabel = (id: string): void => {
    const scene = project?.scenes[id]
    if (scene) insertIntoCode(area.current, block.code, `@scene(${scene.name})`)
  }

  return (
    <>
      <div className="field">
        <span className="field-label">Code</span>
        <DraftArea
          handle={area}
          className="code-area"
          rows={10}
          aria-label="Ren'Py code"
          placeholder={'$ score += 1\nshow screen hud'}
          value={block.code}
          onCommit={(code) => patch({ code })}
          onKeyDown={(e) => tabAsSpaces(e, area.current)}
        />
      </div>
      <p className="muted-note">Exported exactly as written.</p>
      <div className="field">
        <span className="field-label">Helper</span>
        <Dropdown value={null} items={items} onChange={insertSceneLabel} placeholder="Insert scene label" aria-label="Insert scene label" />
      </div>
      <p className="muted-note">
        <code>@scene(Scene name)</code> becomes the Ren'Py label of that scene when the game is exported, so you can write <code>call @scene(Cellar)</code> or <code>jump @scene(Cellar)</code>.
      </p>
    </>
  )
}
