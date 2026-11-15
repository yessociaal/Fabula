import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Used as both the tooltip and the accessible name. */
  label: string
  children: ReactNode
}

export function IconButton({ label, children, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={`icon-btn ${className ?? ''}`} title={label} aria-label={label} {...rest}>
      {children}
    </button>
  )
}
