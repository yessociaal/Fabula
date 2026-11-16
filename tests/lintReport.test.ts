import { describe, expect, it } from 'vitest'
import { parseLintReport } from '../src/shared/lintReport'

const CLEAN = `\uFEFFRen'Py 8.4.1.25072401 lint report, generated at: Sun Nov 15 20:21:30 2026


Statistics:

The game contains 9 dialogue blocks, containing 38 words and 252 characters,
for an average of 4.2 words and 28 characters per block.

The game contains 2 menus, 0 images, and 24 screens.


Lint is not a substitute for thorough testing. Remember to update Ren'Py
before releasing. New releases fix bugs and improve compatibility.
`

describe('parseLintReport', () => {
  it('accepts a clean report', () => {
    expect(parseLintReport(CLEAN)).toEqual({ ok: true, problems: [] })
  })

  it('flags lines that name a script location', () => {
    const r = parseLintReport(`${CLEAN}\ngame/script.rpy:12 The image 'bg x' is not known.\r\ngame/a.rpy:3 Something else.`)
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual(["game/script.rpy:12 The image 'bg x' is not known.", 'game/a.rpy:3 Something else.'])
  })

  it('flags a traceback or an exception', () => {
    expect(parseLintReport('Traceback (most recent call last):\n  File x').ok).toBe(false)
    expect(parseLintReport('Exception: boom').ok).toBe(false)
  })

  it('does not treat the word "image" or numbers as problems', () => {
    expect(parseLintReport('The game contains 2 menus, 5 images, and 24 screens.').ok).toBe(true)
  })
})
