import { useState } from 'react'
import { Music } from 'lucide-react'
import type { Asset, Character, Id } from '@shared/model'
import type { StageState } from '@shared/stage'
import { parseRichText } from '@shared/richText'
import { resolveSprites, type StageDialogue } from '@shared/stageView'
import { api } from '../api'
import './stage.css'

export interface StageMenuOption {
  id: Id
  text: string
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
        return style.length === 0 ? (
          <span key={i}>{span.text}</span>
        ) : (
          <span key={i} className={style.join(' ')}>
            {span.text}
          </span>
        )
      })}
    </>
  )
}

/** The 16:9 picture of a scene: background, sprites, dialogue box, music chip and optional choice buttons. Purely presentational. */
export function Stage({ stage, assets, characters, dir, dialogue, resolveVariable, menu, onChoose, carryOverNote, fade, className }: StageProps) {
  const background = stage.background ? (assets[stage.background] ?? null) : null
  const sprites = resolveSprites(characters, assets, stage.sprites)
  const track = stage.music ? (assets[stage.music]?.name ?? 'Missing track') : null
  const showChecker = stage.background === null && carryOverNote
  const frame = `stage ${fade ? 'stage-fade' : ''} ${className ?? ''}`

  return (
    <div className={frame}>
      {stage.background !== null && (
        <Art key={stage.background} asset={background} dir={dir} label={background ? background.name : 'Missing background'} className="stage-bg" />
      )}
      {showChecker && (
        <div className="stage-checker">
          <span>Background carries over from the previous scene</span>
        </div>
      )}
      {sprites.map((s) => (
        <div key={`${s.key}:${s.asset?.id ?? s.label}`} className={`stage-sprite stage-sprite-${s.position}`}>
          <Art asset={s.asset} dir={dir} label={s.label} className="stage-sprite-art" />
        </div>
      ))}
      {track && (
        <div className="stage-music" title={`Playing: ${track}`}>
          <Music size={12} aria-hidden />
          <span>{track}</span>
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
    </div>
  )
}
