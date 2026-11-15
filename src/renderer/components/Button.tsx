import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  icon?: ReactNode
}

/** A labelled button. A disabled button should still say why through `title`. */
export function Button({ variant = 'default', icon, children, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant} ${className ?? ''}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}
