import { Puzzle, icons } from 'lucide-react'

/** `message-square` -> `MessageSquare`. */
export function pascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('')
}

/** The icon a kit manifest names (a lucide icon name in kebab case), or a puzzle piece when the name is missing or unknown. */
export function KitIcon({ name, size = 16 }: { name?: string; size?: number }) {
  const Icon = (name ? (icons as Record<string, typeof Puzzle>)[pascalCase(name)] : undefined) ?? Puzzle
  return <Icon size={size} />
}
