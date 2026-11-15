import { useId } from 'react'

interface SelectProps<T extends string> {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId()
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
