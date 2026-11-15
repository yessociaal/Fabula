import { useId } from 'react'

interface ColorFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const id = useId()
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <div className="color-field">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} title="Pick a colour" />
        <span className="color-hex">{value}</span>
      </div>
    </div>
  )
}
