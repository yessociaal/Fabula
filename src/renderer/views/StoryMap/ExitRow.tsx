import { Handle, Position } from '@xyflow/react'
import type { ExitRowInfo } from './mapModel'

/** One exit of a scene card: its label and its own source dot on the right edge. The dot is red while the exit has no target. */
export function ExitRow({ row }: { row: ExitRowInfo }) {
  return (
    <div className="exit-row" title={row.unset ? `${row.text}: not connected yet. Drag its dot to a scene.` : row.text}>
      <span className="exit-text">{row.text}</span>
      {row.ifTag && <span className="if-tag">if</span>}
      <Handle
        type="source"
        position={Position.Right}
        id={row.handleId}
        className={`exit-handle ${row.unset ? 'unset' : ''}`}
      />
    </div>
  )
}
