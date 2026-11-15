import { describe, expect, it } from 'vitest'
import { conditionToWords } from '@shared/conditions'
import type { Clause, Condition } from '@shared/model'

let n = 0
const cl = (variableId: string | null, op: Clause['op'], value: Clause['value']): Clause => ({
  id: `w${n++}`,
  variableId,
  op,
  value
})
const cond = (join: 'and' | 'or', ...clauses: Clause[]): Condition => ({ join, clauses })
const nameOf = (id: string): string => ({ a: 'courage', b: 'has_key', c: 'nickname' })[id] ?? id

describe('conditionToWords', () => {
  it('reads booleans naturally', () => {
    expect(conditionToWords(cond('and', cl('b', 'eq', true)), nameOf)).toBe('has_key')
    expect(conditionToWords(cond('and', cl('b', 'eq', false)), nameOf)).toBe('not has_key')
  })
  it('spells out every other operator', () => {
    expect(conditionToWords(cond('and', cl('a', 'eq', 3)), nameOf)).toBe('courage is 3')
    expect(conditionToWords(cond('and', cl('a', 'neq', 3)), nameOf)).toBe('courage is not 3')
    expect(conditionToWords(cond('and', cl('a', 'gt', 3)), nameOf)).toBe('courage is more than 3')
    expect(conditionToWords(cond('and', cl('a', 'gte', 3)), nameOf)).toBe('courage is at least 3')
    expect(conditionToWords(cond('and', cl('a', 'lt', 3)), nameOf)).toBe('courage is less than 3')
    expect(conditionToWords(cond('and', cl('a', 'lte', 3)), nameOf)).toBe('courage is at most 3')
    expect(conditionToWords(cond('and', cl('c', 'eq', 'Al')), nameOf)).toBe('nickname is "Al"')
  })
  it('joins with and / or', () => {
    expect(conditionToWords(cond('and', cl('b', 'eq', true), cl('a', 'gte', 2)), nameOf)).toBe('has_key and courage is at least 2')
    expect(conditionToWords(cond('or', cl('b', 'eq', true), cl('a', 'gte', 2)), nameOf)).toBe('has_key or courage is at least 2')
  })
  it('skips clauses without a variable and says Always when nothing is left', () => {
    expect(conditionToWords(cond('and', cl(null, 'eq', 1), cl('b', 'eq', true)), nameOf)).toBe('has_key')
    expect(conditionToWords(cond('and', cl(null, 'eq', 1)), nameOf)).toBe('Always')
    expect(conditionToWords(cond('and'), nameOf)).toBe('Always')
  })
})
