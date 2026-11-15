import type { Clause, Condition, Id, Scalar } from './model'

export type VariableValues = Record<Id, Scalar>

function compare(op: Clause['op'], left: Scalar, right: Scalar): boolean {
  switch (op) {
    case 'eq':
      return left === right
    case 'neq':
      return left !== right
    case 'gt':
      return left > right
    case 'gte':
      return left >= right
    case 'lt':
      return left < right
    case 'lte':
      return left <= right
  }
}

/** Empty clause list is true. A clause with no variable, or whose variable has no value, is false. */
export function evaluateCondition(condition: Condition, values: VariableValues): boolean {
  if (condition.clauses.length === 0) return true
  const results = condition.clauses.map((c) => {
    if (c.variableId === null) return false
    const v = values[c.variableId]
    if (v === undefined) return false
    return compare(c.op, v, c.value)
  })
  return condition.join === 'and' ? results.every(Boolean) : results.some(Boolean)
}

const OPS: Record<Clause['op'], string> = {
  eq: '==',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<='
}

function pyValue(v: Scalar): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return String(v)
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** Clauses without a variable are skipped (defensive). No usable clause gives "True". */
export function conditionToPython(condition: Condition, nameOf: (variableId: Id) => string): string {
  const parts: string[] = []
  for (const c of condition.clauses) {
    if (c.variableId === null) continue
    const name = nameOf(c.variableId)
    if (c.op === 'eq' && c.value === true) parts.push(name)
    else if (c.op === 'eq' && c.value === false) parts.push(`not ${name}`)
    else parts.push(`${name} ${OPS[c.op]} ${pyValue(c.value)}`)
  }
  if (parts.length === 0) return 'True'
  return parts.join(condition.join === 'and' ? ' and ' : ' or ')
}
