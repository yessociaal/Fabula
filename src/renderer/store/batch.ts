import { pauseHistory, resumeHistory } from './projectStore'

/** Run several store actions so that Ctrl+Z undoes them together as one step (e.g. "create a scene and point the exit at it"). */
export function batch<T>(fn: () => T): T {
  pauseHistory()
  try {
    return fn()
  } finally {
    resumeHistory()
  }
}
