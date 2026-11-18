import type { ExtraBlock } from '@shared/model'
import { Button } from '../../../components/Button'
import { ScreenSelect } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { useBlockPatch, type InspectorProps } from './types'

type ScreenBlock = Extract<ExtraBlock, { type: 'screen' }>

export function ScreenBlockInspector({ sceneId, block }: InspectorProps<ScreenBlock>) {
  const patch = useBlockPatch<ScreenBlock>(sceneId, block.id)
  const def = useProjectStore((s) => (block.screenId ? s.project?.screens[block.screenId] : undefined))
  const hasLeave = def?.elements.some((el) => 'action' in el && el.action.type === 'leave') ?? false
  return (
    <>
      <div className="field">
        <span className="field-label">Action</span>
        <div className="seg" role="radiogroup" aria-label="Show or hide the screen">
          {(['show', 'hide'] as const).map((action) => (
            <button
              key={action}
              type="button"
              role="radio"
              aria-checked={block.action === action}
              className={block.action === action ? 'active' : ''}
              onClick={() => patch({ action })}
            >
              {action === 'show' ? 'Show' : 'Hide'}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Screen</span>
        <ScreenSelect value={block.screenId} aria-label="Screen" onChange={(screenId) => patch({ screenId })} />
      </div>
      {def && (
        <div>
          <Button onClick={() => useUiStore.getState().openScreen(def.id)} title="Edit this screen in the Screen Designer">
            Open in Screen Designer
          </Button>
        </div>
      )}
      <p className="muted-note">The screen stays on top of the story until a Hide screen block (or its own Close button) hides it.</p>
      {hasLeave && block.action === 'show' && (
        <p className="muted-note">Its "Leave screen" buttons do nothing here. They only work when the screen is the ending of a scene.</p>
      )}
    </>
  )
}
