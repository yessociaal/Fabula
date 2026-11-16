export interface LintSummary {
  ok: boolean
  /** The lines of the report that describe a problem. */
  problems: string[]
}

/**
 * Ren'Py lint exits 0 even when it finds problems, so the report decides. A problem line names a script
 * location (`game/script.rpy:12 ...`) or is part of a traceback. A clean report has only statistics.
 */
export function parseLintReport(report: string): LintSummary {
  const problems = report
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => /\.rpym?:\d+/.test(line) || /^Traceback\b/.test(line.trim()) || /\bException\b/.test(line))
    .map((line) => line.trim())
  return { ok: problems.length === 0, problems }
}
