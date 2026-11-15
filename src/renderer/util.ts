/** "just now", "5 minutes ago", "2 days ago", "last week"… */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks === 1) return 'last week'
  if (days < 30) return `${weeks} weeks ago`
  const months = Math.round(days / 30)
  if (months < 12) return months === 1 ? 'last month' : `${months} months ago`
  return 'over a year ago'
}
