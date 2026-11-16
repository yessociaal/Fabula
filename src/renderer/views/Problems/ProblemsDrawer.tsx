import { useEffect } from 'react'
import { AlertTriangle, CircleAlert, X } from 'lucide-react'
import { findBlock } from '@shared/blockTree'
import type { Problem } from '@shared/validate'
import { validateProject } from '@shared/validate'
import { IconButton } from '../../components/IconButton'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { plural } from '../../util'

/** Bring the problem's block or exit into view and flash it, once the scene editor has drawn it. */
export function highlightProblem(problem: Problem): void {
  const selector = problem.blockId
    ? `[data-block-id="${CSS.escape(problem.blockId)}"]`
    : problem.exitId
      ? `[data-exit-id="${CSS.escape(problem.exitId)}"]`
      : null
  if (!selector) return
  let tries = 0
  const attempt = (): void => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) {
      if (++tries < 20) requestAnimationFrame(attempt)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('problem-flash')
    setTimeout(() => el.classList.remove('problem-flash'), 1800)
  }
  requestAnimationFrame(attempt)
}

/** Open the scene a problem belongs to and select its block (or point at its exit). */
export function goToProblem(problem: Problem): void {
  const ui = useUiStore.getState()
  if (!problem.sceneId) {
    ui.setView('map')
    return
  }
  // The block may be nested inside an If or Choice: it is found by id wherever it is.
  const project = useProjectStore.getState().project
  const found = problem.blockId && project ? findBlock(project, problem.blockId) : null
  ui.openScene(found ? found.sceneId : problem.sceneId)
  if (problem.blockId) ui.selectBlock(problem.blockId)
  highlightProblem(problem)
}

function ProblemList({ problems, title, kind }: { problems: Problem[]; title: string; kind: 'error' | 'warning' }) {
  if (problems.length === 0) return null
  return (
    <section className="problems-group">
      <h3 className={`problems-group-title ${kind}`}>
        {kind === 'error' ? <CircleAlert size={15} /> : <AlertTriangle size={15} />}
        {title} ({problems.length})
      </h3>
      <ul className="problems-list">
        {problems.map((p, i) => (
          <li key={`${p.sceneId ?? ''}-${p.blockId ?? ''}-${p.exitId ?? ''}-${i}`}>
            <button
              type="button"
              className={`problem-item ${kind}`}
              onClick={() => goToProblem(p)}
              title={p.sceneId ? 'Go to this problem' : 'Show the Story Map'}
            >
              {p.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Right-side drawer listing everything validateProject found, errors first. */
export function ProblemsDrawer() {
  const project = useProjectStore((s) => s.project)
  const open = useUiStore((s) => s.problemsOpen)
  const setOpen = useUiStore((s) => s.setProblemsOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || !project) return null
  const problems = validateProject(project)
  const errors = problems.filter((p) => p.severity === 'error')
  const warnings = problems.filter((p) => p.severity === 'warning')

  return (
    <aside className="problems-drawer" aria-label="Problems">
      <header className="problems-header">
        <h2>Problems</h2>
        <IconButton label="Close the problems list" onClick={() => setOpen(false)}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="problems-body">
        {problems.length === 0 ? (
          <p className="problems-empty">No problems found. The story is ready to play.</p>
        ) : (
          <>
            <p className="problems-summary">
              {plural(errors.length, 'error')} and {plural(warnings.length, 'warning')}.{' '}
              {errors.length > 0 ? 'Errors stop the game from running; warnings do not.' : 'Warnings do not stop the game from running.'}
            </p>
            <ProblemList problems={errors} title="Errors" kind="error" />
            <ProblemList problems={warnings} title="Warnings" kind="warning" />
          </>
        )}
      </div>
    </aside>
  )
}
