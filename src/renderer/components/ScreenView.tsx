import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Asset, Id, ScreenDef, ScreenElement } from '@shared/model'
import { actionOf } from '@shared/screens'
import { api } from '../api'
import './screenView.css'

/** What the elements need from the story to draw themselves. */
export interface ScreenContext {
  assets: Record<Id, Asset>
  /** Editor project folder, used to build image URLs. */
  dir: string | null
  /** Variable names by id, for the bar tooltip. */
  variableNames?: Record<Id, string>
  /** Quick play: the current value of every variable, so a bar shows the real value. The editor leaves it out and bars show a sample. */
  values?: Record<Id, boolean | number | string>
}

/** The picture of an uploaded image, or a dashed box with its name when the art is missing or will not load. */
function Pic({ asset, dir, label, fit }: { asset: Asset | null | undefined; dir: string | null; label: string; fit?: 'fill' | 'contain' }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!asset || !dir || failed === asset.file) return <div className="scr-missing">{asset?.name ?? label}</div>
  return <img className="scr-img" style={{ objectFit: fit ?? 'fill' }} src={api.assetUrl(dir, asset.file)} alt={asset.name} draggable={false} onError={() => setFailed(asset.file)} />
}

/** The look of one element inside its own box (the box itself is placed by the caller). */
export function ElementBody({ el, ctx, mode }: { el: ScreenElement; ctx: ScreenContext; mode: 'editor' | 'play' }): ReactNode {
  switch (el.type) {
    case 'image':
      return <Pic asset={el.assetId ? ctx.assets[el.assetId] : null} dir={ctx.dir} label={el.name} />
    case 'text': {
      const style: CSSProperties = { color: el.color, fontSize: el.size }
      return (
        <div className="scr-text" style={style}>
          {el.text}
        </div>
      )
    }
    case 'button':
      return <div className="scr-button">{el.text}</div>
    case 'imageButton':
      return <Pic asset={el.idleAssetId ? ctx.assets[el.idleAssetId] : null} dir={ctx.dir} label={el.name} />
    case 'hotspot':
      return mode === 'editor' ? <div className="scr-hotspot">{el.name}</div> : <div className="scr-hotspot-play" />
    case 'bar': {
      const value = el.variableId && ctx.values ? ctx.values[el.variableId] : undefined
      const fraction = typeof value === 'number' ? Math.max(0, Math.min(1, value / (el.max > 0 ? el.max : 1))) : 0.6
      return (
        <div className="scr-bar" title={el.variableId ? ctx.variableNames?.[el.variableId] : undefined}>
          <div className="scr-bar-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      )
    }
  }
}

/** The box of an element in game pixels. */
export function boxStyle(el: ScreenElement): CSSProperties {
  return { left: el.x, top: el.y, width: el.w, height: el.h }
}

interface ScreenViewProps {
  def: ScreenDef
  /** Game size in pixels. */
  width: number
  height: number
  ctx: ScreenContext
  /** Quick play: called when the player clicks an element that has an action. */
  onElementClick?: (elementId: Id) => void
  className?: string
}

/**
 * A designed screen drawn at game size and scaled to fill its container (which must be positioned). Elements sit at their
 * absolute positions, last element in front. Used by Quick play over the stage; clicks on elements with an action are
 * reported, clicks anywhere else pass through (or are absorbed when the screen is modal).
 */
export function ScreenView({ def, width, height, ctx, onElementClick, className }: ScreenViewProps) {
  const root = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = (): void => setScale(el.clientWidth > 0 ? el.clientWidth / width : 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div
      ref={root}
      className={`screen-layer ${def.modal ? 'modal' : ''} ${className ?? ''}`}
      data-screen-id={def.id}
      data-testid={`screen-${def.id}`}
      aria-label={`Screen ${def.name}`}
    >
      <div className="screen-surface" style={{ width, height, transform: `scale(${scale})` }}>
        {def.elements.map((el) => {
          const clickable = actionOf(el) !== null
          return (
            <div
              key={el.id}
              className={`scr-el scr-${el.type} ${clickable ? 'scr-clickable' : ''}`}
              style={boxStyle(el)}
              data-element-id={el.id}
              data-element-name={el.name}
              role={clickable ? 'button' : undefined}
              aria-label={clickable ? el.name : undefined}
              onClick={clickable && onElementClick ? (e) => { e.stopPropagation(); onElementClick(el.id) } : undefined}
            >
              <ElementBody el={el} ctx={ctx} mode="play" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
