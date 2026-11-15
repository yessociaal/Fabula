import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title?: string
  children: ReactNode
}

export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon}
      {title && <h2 className="empty-title">{title}</h2>}
      <p>{children}</p>
    </div>
  )
}
