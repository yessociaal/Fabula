import type { ExtraBlock } from '@shared/model'
import type { InspectorProps } from './types'

type ClearPage = Extract<ExtraBlock, { type: 'clearPage' }>

export function ClearPageInspector(_props: InspectorProps<ClearPage>) {
  return <p className="muted-note">Clears the text on screen so the next line starts a fresh page. Use it with characters set to NVL mode.</p>
}
