import { useEffect, useId, useState } from 'react'

interface NumberFieldProps {
  label?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  'aria-label'?: string
}

/** A number input that lets you type freely ("-", "1.") and only reports complete numbers. */
export function NumberField({ label, value, onChange, min, max, step = 1, ...rest }: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)))
  }, [value])

  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))

  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        aria-label={rest['aria-label']}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) onChange(clamp(n))
        }}
        onBlur={() => setDraft(String(value))}
      />
    </div>
  )
}
