import type { RefObject } from 'react'
import { useStore } from '@xyflow/react'
import { Layers, Maximize, Minus, Plus, Search, Wand2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { useMapUi } from './mapUi'

interface MapToolbarProps {
  searchRef: RefObject<HTMLInputElement | null>
  matchCount: number
  onAddScene(): void
  onAddChapter(): void
  onTidy(): void
  onZoomIn(): void
  onZoomOut(): void
  onFit(): void
  onNextMatch(step: 1 | -1): void
}

export function MapToolbar(props: MapToolbarProps) {
  const query = useMapUi((s) => s.query)
  const setQuery = useMapUi((s) => s.setQuery)
  const zoom = useStore((s) => s.transform[2])
  const searching = query.trim() !== ''

  return (
    <div className="map-toolbar">
      <Button icon={<Plus size={16} />} onClick={props.onAddScene} title="Add a scene in the middle of the view">
        Scene
      </Button>
      <Button icon={<Layers size={16} />} onClick={props.onAddChapter} title="Add a coloured chapter">
        Chapter
      </Button>
      <Button icon={<Wand2 size={16} />} onClick={props.onTidy} title="Lay the scenes out left to right by distance from the start">
        Tidy up
      </Button>
      <label className="map-search" title="Search scene names and dialogue (Ctrl+F). Enter jumps to the next match.">
        <Search size={14} />
        <input
          ref={props.searchRef}
          className="input"
          type="search"
          placeholder="Search"
          aria-label="Search scenes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              props.onNextMatch(e.shiftKey ? -1 : 1)
            }
            if (e.key === 'Escape') {
              setQuery('')
              e.currentTarget.blur()
            }
          }}
        />
        {searching && <span className="map-search-count">{props.matchCount === 1 ? '1 match' : `${props.matchCount} matches`}</span>}
      </label>
      <div className="topbar-spacer" />
      <div className="map-zoom">
        <IconButton label="Zoom out" onClick={props.onZoomOut}>
          <Minus size={16} />
        </IconButton>
        <span className="map-zoom-value" aria-label="Zoom level">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton label="Zoom in" onClick={props.onZoomIn}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Fit the whole story in view" onClick={props.onFit}>
          <Maximize size={16} />
        </IconButton>
      </div>
    </div>
  )
}
