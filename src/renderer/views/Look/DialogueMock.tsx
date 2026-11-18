import { useMemo } from 'react'
import { dialogueMock } from '@shared/lookMock'
import type { Asset } from '@shared/model'
import { api } from '../../api'

export interface MockFonts {
  /** The picked font asset for each role, when one is picked in this session. */
  text: Asset | null
  name: Asset | null
  interface: Asset | null
}

interface Props {
  dir: string | null
  game: { width: number; height: number }
  /** The values the game would have: the pending value of each field, else its current value. */
  values: Record<string, string>
  /** The user's own background, if there is one. */
  background: Asset | null
  fonts: MockFonts
  /** A picked text box / name box picture (not applied yet). */
  textboxImage: Asset | null
  nameboxImage: Asset | null
}

const FALLBACK_FONT = '"DejaVu Sans", system-ui, sans-serif'

/**
 * A 16:9 stand-in for the game's dialogue box, drawn with the chosen colours, fonts, sizes, box height and text position.
 * It has no art of its own: without a background it is a plain dark panel, and without a text box picture the box is a plain translucent panel.
 */
export function DialogueMock({ dir, game, values, background, fonts, textboxImage, nameboxImage }: Props) {
  const m = useMemo(() => dialogueMock(values, game), [values, game])
  const faces = ([['text', fonts.text], ['name', fonts.name], ['interface', fonts.interface]] as const).flatMap(([role, asset]) =>
    asset && dir ? [{ role, family: `look-${role}-${asset.id}`, url: api.assetUrl(dir, asset.file) }] : []
  )
  const family = (role: 'text' | 'name' | 'interface'): string => {
    const f = faces.find((x) => x.role === role)
    return f ? `"${f.family}", ${FALLBACK_FONT}` : FALLBACK_FONT
  }
  const css = faces.map((f) => `@font-face { font-family: "${f.family}"; src: url(${JSON.stringify(f.url)}); }`).join('\n')
  const bg = background && dir ? api.assetUrl(dir, background.file) : null
  const boxImage = textboxImage && dir ? api.assetUrl(dir, textboxImage.file) : null
  const nameImage = nameboxImage && dir ? api.assetUrl(dir, nameboxImage.file) : null
  const boxImageWidth = textboxImage?.width ? `${(textboxImage.width / game.width) * 100}% auto` : 'auto 100%'

  return (
    <div className="look-mock" role="img" aria-label="Preview of the dialogue box with the chosen look">
      {css && <style>{css}</style>}
      <div className="look-stage" style={{ aspectRatio: `${game.width} / ${game.height}`, backgroundImage: bg ? `url(${JSON.stringify(bg)})` : undefined }}>
        {!bg && <span className="look-stage-note">Your own background shows here once you upload one in Assets</span>}
        <div className="look-menu" style={{ fontFamily: family('interface'), fontSize: `${m.interfaceSizePct}cqw`, color: m.interfaceText }}>
          <span style={{ color: m.hover }}>Start</span>
          <span style={{ color: m.idle }}>Load</span>
          <span style={{ color: m.idle }}>Preferences</span>
        </div>
        <div
          className="look-box"
          style={{
            height: `${m.boxHeightPct}%`,
            backgroundImage: boxImage ? `url(${JSON.stringify(boxImage)})` : undefined,
            backgroundSize: boxImage ? boxImageWidth : undefined
          }}
        >
          <div
            className="look-name"
            style={{
              left: `${m.nameLeftPct}%`,
              top: `${m.nameTopPct}%`,
              fontFamily: family('name'),
              fontSize: `${m.nameSizePct}cqw`,
              color: m.accent,
              backgroundImage: nameImage ? `url(${JSON.stringify(nameImage)})` : undefined
            }}
          >
            Anna
          </div>
          <div
            className="look-text"
            style={{
              left: `${m.textLeftPct}%`,
              top: `${m.textTopPct}%`,
              width: `${m.textWidthPct}%`,
              fontFamily: family('text'),
              fontSize: `${m.textSizePct}cqw`,
              color: m.text
            }}
          >
            “You made it! I was starting to think the road had swallowed you whole.”
          </div>
        </div>
      </div>
    </div>
  )
}
