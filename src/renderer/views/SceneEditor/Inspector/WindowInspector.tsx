import type { ExtraBlock } from '@shared/model'
import { useBlockPatch, type InspectorProps } from './types'

type Window = Extract<ExtraBlock, { type: 'window' }>

export function WindowInspector({ sceneId, block }: InspectorProps<Window>) {
  const patch = useBlockPatch<Window>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Text box</span>
        <div className="seg" role="radiogroup" aria-label="Text box">
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
      <p className="muted-note">Hide the dialogue box to show the picture on its own, then show it again before the next line.</p>
    </>
  )
}
