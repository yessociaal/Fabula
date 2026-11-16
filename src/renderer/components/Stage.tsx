import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Film, Music, Waves } from 'lucide-react'
import type { Asset, Character, Id } from '@shared/model'
import { PRESET_XALIGN, clamp01 } from '@shared/placement'
import type { StageState } from '@shared/stage'
import { parseRichText } from '@shared/richText'
import { resolveSprites, type ResolvedSprite, type StageDialogue } from '@shared/stageView'
import { api } from '../api'
import './stage.css'

export interface StageMenuOption {
  id: Id
  text: string
}

/** Editor only: the sprite of the selected Show block can be dragged; `onMove` gets the new xalign / yalign (0 to 1). */
export interface StageDrag {
  characterId: Id
  onStart: () => void
  onMove: (xalign: number, yalign: number) => void
  onEnd: () => void
}

export interface StageProps {
  stage: StageState
  assets: Record<Id, Asset>
  characters: Record<Id, Character>
  /** Editor project folder, used to build image URLs. */
  dir: string | null
  dialogue?: StageDialogue | null
  /** `[name]` in dialogue text: return the value to show, or undefined to show `[name]` as written. */
  resolveVariable?: (name: string) => string | undefined
  /** Centred choice buttons (Quick play). */
  menu?: StageMenuOption[] | null
  onChoose?: (optionId: Id) => void
  /** Editor only: show a checkerboard with a note instead of black when no background has been set yet. */
  carryOverNote?: boolean
  /** Quick play only: fade new backgrounds and sprites in over 300 ms. */
  fade?: boolean
  /** The ambient track playing under the music (a second chip). */
  ambientName?: string | null
  /** Quick play: a movie block is waiting. The movie itself only plays in Ren'Py. */
  movie?: { name: string | null } | null
  /** Quick play: an Ask the player block is waiting for text. */
  ask?: { prompt: string; defaultText: string; maxLength: number } | null
  onAnswer?: (text: string) => void
  drag?: StageDrag | null
  className?: string
}

/** An uploaded image, or a dashed outlined box with a name when the art is missing or will not load. Never invents art. */
function Art({ asset, dir, label, className }: { asset: Asset | null; dir: string | null; label: string; className: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!asset || !dir || failed === asset.file) {
    return <div className={`stage-missing ${className}`}>{label}</div>
  }
  return <img className={className} src={api.assetUrl(dir, asset.file)} alt={label} draggable={false} onError={() => setFailed(asset.file)} />
}

function RichText({ text, resolveVariable }: { text: string; resolveVariable?: (name: string) => string | undefined }) {
  return (
    <>
      {parseRichText(text, resolveVariable).map((span, i) => {
        if (span.kind === 'br') return <br key={i} />
        const style: string[] = []
        if (span.bold) style.push('rt-b')
        if (span.italic) style.push('rt-i')
        if (span.underline) style.push('rt-u')
        return style.length === 0 && !span.color ? (
          <span key={i}>{span.text}</span>
        ) : (
          <span key={i} className={style.join(' ')} style={span.color ? { color: span.color } : undefined}>
            {span.text}
          </span>
        )
      })}
    </>
  )
}

function spriteStyle(s: ResolvedSprite): CSSProperties | undefined {
  const style: CSSProperties = {}
  if (s.zorder !== undefined) style.zIndex = s.zorder
  const p = s.placement
  if (p) {
    style.left = `${p.xalign * 100}%`
    style.top = `${p.yalign * 100}%`
    style.transform = `translate(${-p.xalign * 100}%, ${-p.yalign * 100}%) rotate(${p.rotate}deg) scale(${p.zoom})`
    style.opacity = p.alpha
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function AskPanel({ ask, onAnswer }: { ask: NonNullable<StageProps['ask']>; onAnswer?: (text: string) => void }) {
  const [text, setText] = useState(ask.defaultText)
  const submit = (): void => onAnswer?.(text)
  return (
    <div className="stage-ask" role="group" aria-label="Question">
      <div>{ask.prompt || 'Type your answer'}</div>
      <div className="stage-ask-row">
        <input
          autoFocus
          aria-label="Answer"
          value={text}
          maxLength={ask.maxLength > 0 ? ask.maxLength : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
          }}
        />
        <button type="button" onClick={submit}>
          OK
        </button>
      </div>
    </div>
  )
}

/** The 16:9 picture of a scene: background, sprites, dialogue box, music chip and optional choice buttons. Purely presentational. */
export function Stage({
  stage,
  assets,
  characters,
  dir,
  dialogue,
  resolveVariable,
  menu,
  onChoose,
  carryOverNote,
  fade,
  ambientName,
  movie,
  ask,
  onAnswer,
  drag,
  className
}: StageProps) {
  const background = stage.background ? (assets[stage.background] ?? null) : null
  const sprites = resolveSprites(characters, assets, stage.sprites)
  const track = stage.music ? (assets[stage.music]?.name ?? 'Missing track') : null
  const showChecker = stage.background === null && carryOverNote
  const frame = `stage ${fade ? 'stage-fade' : ''} ${className ?? ''}`
  const root = useRef<HTMLDivElement>(null)
  const grab = useRef<{ px: number; py: number; x0: number; y0: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onDown = (e: ReactPointerEvent<HTMLDivElement>, s: ResolvedSprite): void => {
    if (!drag) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // not an active pointer (for example a scripted event): dragging still works while the pointer is over the sprite
    }
    grab.current = {
      px: e.clientX,
      py: e.clientY,
      x0: s.placement?.xalign ?? PRESET_XALIGN[s.position],
      y0: s.placement?.yalign ?? 1
    }
    setDragging(true)
    drag.onStart()
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const g = grab.current
    const frameEl = root.current
    if (!drag || !g || !frameEl) return
    const spaceX = frameEl.offsetWidth - e.currentTarget.offsetWidth
    const spaceY = frameEl.offsetHeight - e.currentTarget.offsetHeight
    // the stage may be shown scaled, so convert from screen pixels to layout pixels
    const scale = frameEl.getBoundingClientRect().width / frameEl.offsetWidth || 1
    const dx = (e.clientX - g.px) / scale
    const dy = (e.clientY - g.py) / scale
    drag.onMove(spaceX > 0 ? clamp01(g.x0 + dx / spaceX) : g.x0, spaceY > 0 ? clamp01(g.y0 + dy / spaceY) : g.y0)
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!grab.current) return
    grab.current = null
    setDragging(false)
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // nothing to release
    }
    drag?.onEnd()
  }

  return (
    <div className={frame} ref={root}>
      {stage.background !== null && (
        <Art key={stage.background} asset={background} dir={dir} label={background ? background.name : 'Missing background'} className="stage-bg" />
      )}
      {showChecker && (
        <div className="stage-checker">
          <span>Background carries over from the previous scene</span>
        </div>
      )}
      {sprites.map((s) => {
        const draggable = drag?.characterId === s.key
        const cls = [
          'stage-sprite',
          s.placement ? 'stage-sprite-custom' : `stage-sprite-${s.position}`,
          draggable ? 'stage-sprite-draggable' : '',
          draggable && dragging ? 'dragging' : ''
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div
            key={`${s.key}:${s.asset?.id ?? s.label}`}
            className={cls}
            style={spriteStyle(s)}
            data-testid={draggable ? 'stage-sprite-drag' : undefined}
            title={draggable ? 'Drag to place this sprite' : undefined}
            onPointerDown={draggable ? (e) => onDown(e, s) : undefined}
            onPointerMove={draggable ? onMove : undefined}
            onPointerUp={draggable ? onUp : undefined}
            onPointerCancel={draggable ? onUp : undefined}
          >
            <Art asset={s.asset} dir={dir} label={s.label} className="stage-sprite-art" />
          </div>
        )
      })}
      {track && (
        <div className="stage-music" title={`Playing: ${track}`}>
          <Music size={12} aria-hidden />
          <span>{track}</span>
        </div>
      )}
      {ambientName && (
        <div className="stage-ambient" title={`Ambient: ${ambientName}`}>
          <Waves size={12} aria-hidden />
          <span>{ambientName}</span>
        </div>
      )}
      {menu && menu.length > 0 && (
        <div className="stage-menu" role="group" aria-label="Choices">
          {menu.map((o, i) => (
            <button key={o.id} type="button" className="stage-choice" onClick={() => onChoose?.(o.id)} title={i < 9 ? `Press ${i + 1}` : undefined}>
              {i < 9 && <span className="stage-choice-key">{i + 1}</span>}
              <RichText text={o.text} resolveVariable={resolveVariable} />
            </button>
          ))}
        </div>
      )}
      {dialogue && (
        <div className="stage-dialogue" role="status">
          {dialogue.speakerName && (
            <div className="stage-speaker" style={dialogue.speakerColor ? { color: dialogue.speakerColor } : undefined}>
              {dialogue.speakerName}
            </div>
          )}
          <div className="stage-text">
            <RichText text={dialogue.text} resolveVariable={resolveVariable} />
          </div>
        </div>
      )}
      {movie && (
        <div className="stage-movie" role="status">
          <Film size={28} aria-hidden />
          <div>Movie plays in Ren'Py</div>
          {movie.name && <div className="stage-movie-name">{movie.name}</div>}
          <div className="stage-movie-hint">Click to continue</div>
        </div>
      )}
      {ask && <AskPanel key={ask.prompt + ask.defaultText} ask={ask} onAnswer={onAnswer} />}
    </div>
  )
}
