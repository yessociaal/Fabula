import type { Clause, ClauseOp, Effect, Scalar, Variable } from '@shared/model'
import { defaultValueFor } from '@shared/factory'

type VarType = Variable['type']
type EffectOp = Effect['op']

export const EFFECT_OP_LABELS: Record<EffectOp, string> = {
  set: 'Set to',
  add: 'Add',
  subtract: 'Subtract',
  toggle: 'Flip'
}

export const CLAUSE_OP_LABELS: Record<ClauseOp, string> = {
  eq: 'is',
  neq: 'is not',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤'
}

/** Operations a Variable block or effect may use on a variable of this type. No variable picked: all of them. */
export function effectOpsFor(type: VarType | null): EffectOp[] {
  switch (type) {
    case 'boolean':
      return ['set', 'toggle']
    case 'number':
      return ['set', 'add', 'subtract']
    case 'text':
      return ['set']
    default:
      return ['set', 'add', 'subtract', 'toggle']
  }
}

/** Comparison operators for a condition row: true/false and text only get "is" / "is not". */
export function clauseOpsFor(type: VarType | null): ClauseOp[] {
  return type === 'number' || type === null ? ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] : ['eq', 'neq']
}

export function valueMatchesType(type: VarType, value: Scalar): boolean {
  return type === 'boolean' ? typeof value === 'boolean' : type === 'number' ? typeof value === 'number' : typeof value === 'string'
}

/** An effect pointed at another variable: keeps the operation and value when they still make sense, otherwise resets them. */
export function retargetEffect(effect: Effect, variable: Variable | undefined): Effect {
  if (!variable) return { ...effect, variableId: null }
  let op = effect.op
  if (!effectOpsFor(variable.type).includes(op)) op = 'set'
  const value = valueMatchesType(variable.type, effect.value) ? effect.value : defaultValueFor(variable.type)
  return { variableId: variable.id, op, value }
}

/** A condition clause pointed at another variable, same idea as `retargetEffect`. */
export function retargetClause(clause: Clause, variable: Variable | undefined): Clause {
  if (!variable) return { ...clause, variableId: null }
  let op = clause.op
  if (!clauseOpsFor(variable.type).includes(op)) op = 'eq'
  const value = valueMatchesType(variable.type, clause.value) ? clause.value : defaultValueFor(variable.type)
  return { ...clause, variableId: variable.id, op, value }
}
