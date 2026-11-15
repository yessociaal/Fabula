import { describe, expect, it } from 'vitest'
import { conditionToPython, evaluateCondition } from '@shared/conditions'
import type { Clause, Condition } from '@shared/model'

let n = 0
const cl = (variableId: string | null, op: Clause['op'], value: Clause['value']): Clause => ({
  id: `c${n++}`,
  variableId,
  op,
  value
})
const cond = (join: 'and' | 'or', ...clauses: Clause[]): Condition => ({ join, clauses })
const nameOf = (id: string): string => ({ a: 'courage', b: 'has_key', c: 'nickname' })[id] ?? id

describe('evaluateCondition', () => {
  const values = { a: 3, b: true, c: 'Al' }
  it('evaluates every operator', () => {
    expect(evaluateCondition(cond('and', cl('a', 'eq', 3)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('a', 'neq', 3)), values)).toBe(false)
    expect(evaluateCondition(cond('and', cl('a', 'gt', 2)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('a', 'gt', 3)), values)).toBe(false)
    expect(evaluateCondition(cond('and', cl('a', 'gte', 3)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('a', 'lt', 4)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('a', 'lt', 3)), values)).toBe(false)
    expect(evaluateCondition(cond('and', cl('a', 'lte', 3)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('b', 'eq', true)), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl('c', 'eq', 'Al')), values)).toBe(true)
  })
  it('joins with and / or', () => {
    const t = cl('b', 'eq', true)
    const f = cl('a', 'gt', 10)
    expect(evaluateCondition(cond('and', t, f), values)).toBe(false)
    expect(evaluateCondition(cond('or', t, f), values)).toBe(true)
    expect(evaluateCondition(cond('or', f, f), values)).toBe(false)
  })
  it('empty is true; missing variable is false', () => {
    expect(evaluateCondition(cond('and'), values)).toBe(true)
    expect(evaluateCondition(cond('and', cl(null, 'eq', true)), values)).toBe(false)
    expect(evaluateCondition(cond('and', cl('zzz', 'eq', true)), values)).toBe(false)
  })
})

describe('conditionToPython', () => {
  it('prints operators and boolean shortcuts', () => {
    expect(conditionToPython(cond('and', cl('b', 'eq', true)), nameOf)).toBe('has_key')
    expect(conditionToPython(cond('and', cl('b', 'eq', false)), nameOf)).toBe('not has_key')
    expect(conditionToPython(cond('and', cl('b', 'neq', true)), nameOf)).toBe('has_key != True')
    expect(conditionToPython(cond('and', cl('a', 'gte', 2)), nameOf)).toBe('courage >= 2')
    expect(conditionToPython(cond('and', cl('a', 'lt', 1.5)), nameOf)).toBe('courage < 1.5')
    expect(conditionToPython(cond('and', cl('a', 'neq', 0), cl('a', 'lte', 9), cl('a', 'gt', 1)), nameOf)).toBe(
      'courage != 0 and courage <= 9 and courage > 1'
    )
  })
  it('quotes and escapes text', () => {
    expect(conditionToPython(cond('and', cl('c', 'eq', 'Say "hi"\\')), nameOf)).toBe('nickname == "Say \\"hi\\"\\\\"')
  })
  it('joins with or, and empty is True', () => {
    expect(conditionToPython(cond('or', cl('b', 'eq', true), cl('a', 'eq', 1)), nameOf)).toBe('has_key or courage == 1')
    expect(conditionToPython(cond('and'), nameOf)).toBe('True')
    expect(conditionToPython(cond('and', cl(null, 'eq', true)), nameOf)).toBe('True')
  })
})
