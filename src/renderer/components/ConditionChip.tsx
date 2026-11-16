import { X } from 'lucide-react'
import type { Condition, Id } from '@shared/model'
import { conditionToWords } from '@shared/conditions'
import { useProjectStore } from '../store/projectStore'
import { Button } from './Button'
import { ConditionBuilder } from './ConditionBuilder'
import { Popover } from './Popover'

interface ConditionChipProps {
  value: Condition | null
  onChange: (condition: Condition | null) => void
  /** Heading of the popover, e.g. "Show this choice only when…". */
  title: string
  /** Tooltip when no condition is set. */
  emptyTitle: string
}

/** The small `if` button that opens a condition editor. Shows the condition in words once one is set. */
export function ConditionChip({ value, onChange, title, emptyTitle }: ConditionChipProps) {
  const variables = useProjectStore((s) => s.project?.variables)
  const nameOf = (id: Id): string => variables?.[id]?.name ?? 'a missing variable'
  const words = value ? conditionToWords(value, nameOf) : null
  return (
    <Popover
      label={title}
      className="popover-wide"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={`chip-btn ${value ? 'active' : ''}`}
          title={words ? `Shown only when ${words}` : emptyTitle}
        >
          {words ? `if ${words}` : 'if'}
        </button>
      )}
    >
      {(close) => (
        <div className="popover-body">
          <div className="popover-title">{title}</div>
          <ConditionBuilder value={value} onChange={onChange} />
          {value && (
            <div className="popover-footer">
              <span className="muted-note">{words}</span>
              <Button
                icon={<X size={14} />}
                onClick={() => {
                  onChange(null)
                  close()
                }}
              >
                Clear condition
              </Button>
            </div>
          )}
        </div>
      )}
    </Popover>
  )
}
