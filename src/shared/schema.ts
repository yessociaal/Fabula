import { z } from 'zod'
import type {
  Asset,
  BranchCase,
  Block,
  Chapter,
  Character,
  ChoiceOption,
  Clause,
  Condition,
  Effect,
  Ending,
  Expression,
  NamedExit,
  Placement,
  Project,
  ScreenAction,
  ScreenDef,
  ScreenElement,
  Scene,
  ScriptFile,
  Variable
} from './model'

const id = z.string()
const nullableId = z.string().nullable()
const scalar = z.union([z.boolean(), z.number(), z.string()])

export const transitionSchema = z.enum([
  'none',
  'dissolve',
  'fade',
  'pixellate',
  'hpunch',
  'vpunch',
  'wipeleft',
  'wiperight',
  'slideleft',
  'slideright',
  'moveinleft',
  'moveinright',
  'moveoutleft',
  'moveoutright',
  'zoomin',
  'zoomout'
])
const stagePositionSchema = z.enum(['left', 'center', 'right'])
const channelSchema = z.enum(['music', 'ambient'])

const placementSchema: z.ZodType<Placement> = z.union([
  z.object({ mode: z.literal('preset') }),
  z.object({
    mode: z.literal('custom'),
    xalign: z.number(),
    yalign: z.number(),
    zoom: z.number(),
    rotate: z.number(),
    alpha: z.number()
  })
])

export const effectSchema: z.ZodType<Effect> = z.object({
  variableId: nullableId,
  op: z.enum(['set', 'add', 'subtract', 'toggle']),
  value: scalar
})

export const clauseSchema: z.ZodType<Clause> = z.object({
  id,
  variableId: nullableId,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  value: scalar
})

export const conditionSchema: z.ZodType<Condition> = z.object({
  join: z.enum(['and', 'or']),
  clauses: z.array(clauseSchema)
})

const promptSchema = z.object({ characterId: nullableId, text: z.string() })
const params = z.record(z.string(), z.unknown())

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    z.object({ id, type: z.literal('say'), characterId: nullableId, text: z.string(), voiceAssetId: nullableId }),
    z.object({ id, type: z.literal('background'), assetId: nullableId, transition: transitionSchema }),
    z.object({
      id,
      type: z.literal('show'),
      characterId: nullableId,
      expressionId: nullableId,
      position: stagePositionSchema,
      transition: transitionSchema,
      placement: placementSchema,
      zorder: z.number()
    }),
    z.object({ id, type: z.literal('hide'), characterId: nullableId, transition: transitionSchema }),
    z.object({
      id,
      type: z.literal('playMusic'),
      assetId: nullableId,
      fadeIn: z.number(),
      loop: z.boolean(),
      channel: channelSchema
    }),
    z.object({ id, type: z.literal('stopMusic'), fadeOut: z.number(), channel: channelSchema }),
    z.object({ id, type: z.literal('playSound'), assetId: nullableId }),
    z.object({ id, type: z.literal('setVariable'), effect: effectSchema }),
    z.object({ id, type: z.literal('pause'), seconds: z.number().nullable() }),
    z.object({ id, type: z.literal('transition'), transition: transitionSchema }),
    z.object({ id, type: z.literal('visit'), sceneId: nullableId }),
    z.object({
      id,
      type: z.literal('if'),
      condition: conditionSchema,
      then: z.array(blockSchema),
      otherwise: z.array(blockSchema)
    }),
    z.object({
      id,
      type: z.literal('inlineChoice'),
      prompt: promptSchema.nullable(),
      options: z.array(
        z.object({
          id,
          text: z.string(),
          condition: conditionSchema.nullable(),
          blocks: z.array(blockSchema)
        })
      )
    }),
    z.object({
      id,
      type: z.literal('ask'),
      variableId: nullableId,
      prompt: z.string(),
      defaultText: z.string(),
      maxLength: z.number()
    }),
    z.object({ id, type: z.literal('movie'), assetId: nullableId }),
    z.object({ id, type: z.literal('window'), action: z.enum(['show', 'hide']) }),
    z.object({ id, type: z.literal('clearPage') }),
    z.object({ id, type: z.literal('screen'), action: z.enum(['show', 'hide']), screenId: nullableId }),
    z.object({ id, type: z.literal('code'), code: z.string() }),
    z.object({ id, type: z.literal('kit'), kitId: z.string(), blockType: z.string(), params })
  ])
)

const choiceOptionSchema: z.ZodType<ChoiceOption> = z.object({
  id,
  text: z.string(),
  condition: conditionSchema.nullable(),
  effects: z.array(effectSchema),
  target: nullableId
})
const branchCaseSchema: z.ZodType<BranchCase> = z.object({
  id,
  condition: conditionSchema,
  target: nullableId
})
const namedExitSchema: z.ZodType<NamedExit> = z.object({ id, name: z.string(), target: nullableId })

export const endingSchema: z.ZodType<Ending> = z.union([
  z.object({ type: z.literal('jump'), target: nullableId }),
  z.object({ type: z.literal('choice'), prompt: promptSchema.nullable(), options: z.array(choiceOptionSchema) }),
  z.object({ type: z.literal('branch'), cases: z.array(branchCaseSchema), elseTarget: nullableId }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('code'), code: z.string(), exits: z.array(namedExitSchema) }),
  z.object({ type: z.literal('screen'), screenId: nullableId, targets: z.record(z.string(), nullableId) }),
  z.object({
    type: z.literal('kit'),
    kitId: z.string(),
    endingType: z.string(),
    params,
    exits: z.array(namedExitSchema)
  })
])

const sceneSchema: z.ZodType<Scene> = z.object({
  id,
  name: z.string(),
  notes: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  chapterId: nullableId,
  blocks: z.array(blockSchema),
  ending: endingSchema,
  labelLock: z.string().nullable(),
  role: z.enum(['normal', 'splashscreen'])
})
const chapterSchema: z.ZodType<Chapter> = z.object({ id, name: z.string(), color: z.string() })

const expressionSchema: z.ZodType<Expression> = z.object({ id, name: z.string(), assetId: nullableId })
const characterSchema: z.ZodType<Character> = z.object({
  id,
  name: z.string(),
  color: z.string(),
  expressions: z.array(expressionSchema),
  mode: z.enum(['adv', 'nvl']),
  sideAssetId: nullableId
})
const variableSchema: z.ZodType<Variable> = z.object({
  id,
  name: z.string(),
  type: z.enum(['boolean', 'number', 'text']),
  defaultValue: scalar,
  description: z.string(),
  persistent: z.boolean()
})
const assetSchema: z.ZodType<Asset> = z.object({
  id,
  kind: z.enum(['background', 'sprite', 'music', 'sound', 'ambient', 'voice', 'movie', 'ui', 'font']),
  name: z.string(),
  file: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bytes: z.number()
})
const scriptFileSchema: z.ZodType<ScriptFile> = z.object({ id, name: z.string(), content: z.string() })

const screenActionSchema: z.ZodType<ScreenAction> = z.union([
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('setVariable'), effect: effectSchema }),
  z.object({ type: z.literal('showScreen'), screenId: nullableId }),
  z.object({ type: z.literal('hideThis') })
])
const box = { id, name: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }
const screenElementSchema: z.ZodType<ScreenElement> = z.union([
  z.object({ ...box, type: z.literal('image'), assetId: nullableId }),
  z.object({
    ...box,
    type: z.literal('text'),
    text: z.string(),
    size: z.number(),
    color: z.string(),
    fontAssetId: nullableId
  }),
  z.object({ ...box, type: z.literal('button'), text: z.string(), action: screenActionSchema }),
  z.object({
    ...box,
    type: z.literal('imageButton'),
    idleAssetId: nullableId,
    hoverAssetId: nullableId,
    action: screenActionSchema
  }),
  z.object({ ...box, type: z.literal('hotspot'), action: screenActionSchema }),
  z.object({ ...box, type: z.literal('bar'), variableId: nullableId, max: z.number() })
])
const screenDefSchema: z.ZodType<ScreenDef> = z.object({
  id,
  name: z.string(),
  modal: z.boolean(),
  elements: z.array(screenElementSchema)
})

export const projectSchema: z.ZodType<Project> = z.object({
  formatVersion: z.literal(1),
  meta: z.object({ title: z.string(), width: z.number(), height: z.number(), accentColor: z.string() }),
  renpyProjectDir: z.string().nullable(),
  startSceneId: nullableId,
  scenes: z.record(z.string(), sceneSchema),
  chapters: z.record(z.string(), chapterSchema),
  chapterOrder: z.array(id),
  characters: z.record(z.string(), characterSchema),
  characterOrder: z.array(id),
  variables: z.record(z.string(), variableSchema),
  variableOrder: z.array(id),
  assets: z.record(z.string(), assetSchema),
  screens: z.record(z.string(), screenDefSchema),
  screenOrder: z.array(id),
  scriptFiles: z.array(scriptFileSchema),
  kits: z.array(z.string()),
  look: z.record(z.string(), z.string())
})

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string }

export function parseProject(json: unknown): ParseResult {
  let data = json
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json)
    } catch (e) {
      return { ok: false, error: `The story file is not valid JSON: ${(e as Error).message}` }
    }
  }
  const result = projectSchema.safeParse(data)
  if (result.success) return { ok: true, project: result.data }
  const issues = result.error.issues.slice(0, 5).map((i) => {
    const where = i.path.length ? i.path.join(' > ') : 'the file'
    return `${where}: ${i.message}`
  })
  const more = result.error.issues.length > 5 ? ` (and ${result.error.issues.length - 5} more problems)` : ''
  return { ok: false, error: `The story file is not in the expected format. ${issues.join('; ')}${more}` }
}
