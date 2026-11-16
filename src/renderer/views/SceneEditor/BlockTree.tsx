import { createContext, useContext } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus, Trash2 } from 'lucide-react'
import type { BranchKey } from '@shared/blockTree'
import { createInlineOption } from '@shared/factory'
import type { Block, Id, InlineChoiceOption, Project } from '@shared/model'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { ConditionChip } from '../../components/ConditionChip'
import { IconButton } from '../../components/IconButton'
import { useProjectStore } from '../../store/projectStore'
import { addEntryAtPath } from './blockActions'
import { PALETTE } from './blockMeta'
import { BlockRow, type RowProblem } from './BlockRow'
import { areaId, insertionIntoArea, listKeyOf, type DropTarget } from './editorHelpers'

export interface TreeContextValue {
  sceneId: Id
  project: Project
  problems: Map<Id, RowProblem>
  selectedBlockId: Id | null
  /** Where the dragged block or palette entry would land, or null. */
  drop: DropTarget | null
}

export const TreeContext = createContext<TreeContextValue | null>(null)

function useTree(): TreeContextValue {
  const ctx = useContext(TreeContext)
  if (!ctx) throw new Error('TreeContext is missing')
  return ctx
}

function InsertLine({ listKey, index }: { listKey: string; index: number }) {
  const { drop } = useTree()
  if (!drop || drop.listKey !== listKey || drop.index !== index) return null
  return <div className={`insert-line ${drop.fits ? '' : 'refused'}`} aria-hidden />
}

/** The rows of one list of blocks (the scene's own, or one area of a container), each followed by its own areas. */
export function BlockItems({ blocks, parentId, branch }: { blocks: Block[]; parentId: Id | null; branch: BranchKey | null }) {
  const { sceneId, project, problems, selectedBlockId } = useTree()
  const listKey = listKeyOf(parentId, branch)
  return (
    <>
      {blocks.map((block, i) => (
        <div className="block-item" key={block.id}>
          <InsertLine listKey={listKey} index={i} />
          <BlockRow
            block={block}
            sceneId={sceneId}
            project={project}
            selected={block.id === selectedBlockId}
            problem={problems.get(block.id) ?? null}
          />
          {block.type === 'if' && (
            <div className="block-areas">
              <BlockArea label="Then" parentId={block.id} branch="then" blocks={block.then} />
              <BlockArea label="Otherwise" parentId={block.id} branch="otherwise" blocks={block.otherwise} />
            </div>
          )}
          {block.type === 'inlineChoice' && <ChoiceAreas block={block} />}
        </div>
      ))}
    </>
  )
}

/** One indented drop area: a label or header, the blocks inside, and an end zone that accepts drops and shows "Drop blocks here" when empty. */
function BlockArea({ label, header, parentId, branch, blocks }: { label?: string; header?: React.ReactNode; parentId: Id; branch: BranchKey; blocks: Block[] }) {
  const { sceneId } = useTree()
  const listKey = listKeyOf(parentId, branch)
  const { setNodeRef, isOver } = useDroppable({ id: areaId(parentId, branch), data: { kind: 'area' } })
  const empty = blocks.length === 0
  return (
    <div className="block-area" data-area={listKey}>
      {header ?? <div className="area-label">{label}</div>}
      <div className="area-body">
        <BlockItems blocks={blocks} parentId={parentId} branch={branch} />
        <div ref={setNodeRef} className={`area-end ${empty ? 'empty' : ''} ${isOver ? 'over' : ''}`}>
          <InsertLine listKey={listKey} index={blocks.length} />
          {empty && (
            <>
              <span>Drop blocks here</span>
              <Button
                icon={<Plus size={13} />}
                onClick={() => {
                  const scene = useProjectStore.getState().project?.scenes[sceneId]
                  const at = scene ? insertionIntoArea(scene.blocks, parentId, branch) : null
                  if (at) addEntryAtPath(sceneId, PALETTE[0], at)
                }}
                title="Add a dialogue line here"
              >
                Dialogue
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function OptionHeader({ block, option, index }: { block: Extract<Block, { type: 'inlineChoice' }>; option: InlineChoiceOption; index: number }) {
  const { sceneId } = useTree()
  const updateBlock = useProjectStore((s) => s.updateBlock)
  const setOptions = (options: InlineChoiceOption[]): void => updateBlock(sceneId, block.id, { options })
  const change = (patch: Partial<InlineChoiceOption>): void => setOptions(block.options.map((o) => (o.id === option.id ? { ...o, ...patch } : o)))
  return (
    <div className="area-head" data-option-id={option.id}>
      <span className="option-number">{index + 1}</span>
      <CommitField
        className="option-text"
        aria-label={`Text of option ${index + 1}`}
        placeholder="What the player picks"
        value={option.text}
        onCommit={(text) => change({ text })}
      />
      <ConditionChip
        value={option.condition}
        onChange={(condition) => change({ condition })}
        title="Show this option only when…"
        emptyTitle="Show this option only when a condition is true"
      />
      <IconButton label="Remove this option (and the blocks inside it)" onClick={() => setOptions(block.options.filter((o) => o.id !== option.id))}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  )
}

function ChoiceAreas({ block }: { block: Extract<Block, { type: 'inlineChoice' }> }) {
  const { sceneId } = useTree()
  const updateBlock = useProjectStore((s) => s.updateBlock)
  return (
    <div className="block-areas">
      {block.options.map((option, i) => (
        <BlockArea
          key={option.id}
          header={<OptionHeader block={block} option={option} index={i} />}
          parentId={block.id}
          branch={`opt:${option.id}`}
          blocks={option.blocks}
        />
      ))}
      {block.options.length === 0 && <p className="muted-note">No options yet. Add the first one.</p>}
      <div className="area-add">
        <Button icon={<Plus size={14} />} onClick={() => updateBlock(sceneId, block.id, { options: [...block.options, createInlineOption()] })}>
          Add option
        </Button>
      </div>
    </div>
  )
}
