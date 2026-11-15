import { useId, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string
  value: string
  onChange: (value: string) => void
}

export function TextField({ label, value, onChange, className, ...rest }: TextFieldProps) {
  const id = useId()
  return (
    <div className="field">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <input id={id} className={`input ${className ?? ''}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  )
}
