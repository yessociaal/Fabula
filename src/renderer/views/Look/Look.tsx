import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, Palette } from 'lucide-react'
import { cleanErrorMessage } from '@shared/ipc'
import {
  LOOK_FIELDS,
  LOOK_GROUPS,
  LOOK_STATUS_LABEL,
  colourToHex6,
  type LookField,
  type LookFieldResult,
  type LookReadEntry
} from '@shared/look'
import { lookRequest, lookSummary, pendingLookKeys } from '@shared/lookRequest'
import type { Asset, Project } from '@shared/model'
import { api } from '../../api'
import { AssetPicker } from '../../components/AssetPicker'
import { Button } from '../../components/Button'
import { DraftArea } from '../../components/DraftArea'
import { EmptyState } from '../../components/EmptyState'
import { CommitField } from '../../components/CommitField'
import { NumberField } from '../../components/NumberField'
import { Select } from '../../components/Select'
import { toast } from '../../components/Toast'
import { joinPath } from '../../pathUtil'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { DialogueMock } from './DialogueMock'
import './look.css'

interface ApplyReport {
  results: LookFieldResult[]
  skipped: string[]
  backupDir: string | null
  summary: string
}

const labelOf = (key: string): string => LOOK_FIELDS.find((f) => f.key === key)?.label ?? key

/** What a field shows in the game right now, in words. */
function currentText(field: LookField, entry: LookReadEntry | undefined): string {
  if (!entry) return '…'
  if (entry.editedByHand) return 'edited by hand'
  if (!entry.found) return field.type === 'image-file' ? 'no picture yet' : 'not found'
  if (field.type === 'multiline') return entry.value ? `${entry.value.length} characters` : 'empty'
  if (field.type === 'boolean') return entry.value === 'True' ? 'on' : 'off'
  return entry.value ?? ''
}

interface RowProps {
  field: LookField
  entry: LookReadEntry | undefined
  project: Project
  pending: string | undefined
  renpyDir: string
  setValue: (key: string, value: string) => void
  reset: (key: string) => void
}

function FieldRow({ field, entry, project, pending, renpyDir, setValue, reset }: RowProps) {
  const byHand = entry?.editedByHand === true
  const missing = field.type !== 'image-file' && entry !== undefined && !entry.found && !byHand
  const disabled = byHand || missing || field.readOnly === true
  const current = entry?.value ?? ''
  const shown = pending ?? current

  const control = (() => {
    switch (field.type) {
      case 'colour':
        return (
          <div className="color-field">
            <input
              type="color"
              aria-label={field.label}
              disabled={disabled}
              value={colourToHex6(shown) ?? '#000000'}
              onChange={(e) => setValue(field.key, e.target.value)}
              title="Pick a colour"
            />
            <span className="color-hex">{colourToHex6(shown) ?? shown}</span>
          </div>
        )
      case 'number':
        return (
          <div className={disabled ? 'look-disabled' : ''}>
            <NumberField
              aria-label={field.label}
              value={Number.isFinite(Number(shown)) && shown !== '' ? Number(shown) : 0}
              min={field.min}
              onChange={(n) => !disabled && setValue(field.key, String(n))}
            />
          </div>
        )
      case 'boolean':
        return (
          <label className="check-row">
            <input
              type="checkbox"
              disabled={disabled}
              checked={shown === 'True'}
              onChange={(e) => setValue(field.key, e.target.checked ? 'True' : 'False')}
            />
            <span>{shown === 'True' ? 'On' : 'Off'}</span>
          </label>
        )
      case 'text':
        return (
          <CommitField
            aria-label={field.label}
            className={`look-text-input ${disabled ? 'look-disabled' : ''}`}
            value={shown}
            onCommit={(v) => !disabled && setValue(field.key, v)}
          />
        )
      case 'multiline':
        return (
          <div className={disabled ? 'look-disabled' : ''}>
            <DraftArea
              aria-label={field.label}
              className="input look-about"
              rows={4}
              value={shown}
              onCommit={(v) => !disabled && setValue(field.key, v)}
            />
          </div>
        )
      case 'font-file':
        return disabled ? null : (
          <AssetPicker
            kind="font"
            value={pending && project.assets[pending] ? pending : null}
            noneLabel="Keep the game's font"
            onChange={(id) => (id === null ? reset(field.key) : setValue(field.key, id))}
          />
        )
      case 'image-file':
        return (
          <AssetPicker
            kind="ui"
            value={pending && project.assets[pending] ? pending : null}
            noneLabel="Keep the game's picture"
            onChange={(id) => {
              if (id === null) return reset(field.key)
              const asset = project.assets[id]
              if (asset && !asset.file.toLowerCase().endsWith('.png')) {
                toast('Use a PNG picture here. Ren\'Py reads these pictures as PNG files.', 'error')
                return
              }
              setValue(field.key, id)
            }}
          />
        )
    }
  })()

  const pendingAsset = pending !== undefined ? project.assets[pending] : undefined
  return (
    <div className={`look-row ${byHand ? 'look-row-hand' : ''}`} data-field={field.key}>
      <div className="look-row-head">
        <span className="look-row-label">{field.label}</span>
        {byHand && <span className="look-badge">Edited by hand</span>}
        {missing && <span className="look-badge look-badge-quiet">Not found in the game files</span>}
        {pending !== undefined && !field.readOnly && (
          <button type="button" className="link-button" onClick={() => reset(field.key)} title="Forget this change and go back to what the game has">
            Reset
          </button>
        )}
      </div>
      {control}
      <p className="look-row-note">
        In the game: <strong>{currentText(field, entry)}</strong>
        {pendingAsset && (field.type === 'font-file' || field.type === 'image-file') && <> · chosen: <strong>{pendingAsset.name}</strong></>}
        {field.type !== 'font-file' && field.type !== 'image-file' && field.type !== 'multiline' && pending !== undefined && pending !== current && !disabled && (
          <> · new: <strong>{field.type === 'boolean' ? (pending === 'True' ? 'on' : 'off') : pending}</strong></>
        )}
      </p>
      {field.help && <p className="look-row-help">{field.help}</p>}
      {byHand && (
        <div className="look-row-hand-actions">
          <p className="look-row-help">This line no longer looks like the one Ren'Py made, so Fabula will not change it.</p>
          <Button
            icon={<FolderOpen size={14} />}
            title={`Show ${field.file} in Explorer`}
            onClick={() => void api.revealInExplorer(joinPath(joinPath(renpyDir, 'game'), field.file))}
          >
            Open file
          </Button>
        </div>
      )}
    </div>
  )
}

/** Look & Feel: a form for the common gui.rpy / options.rpy lines, beside a live mock of the dialogue box. */
export default function Look() {
  const project = useProjectStore((s) => s.project)
  const dir = useProjectStore((s) => s.dir)
  const setLookValue = useProjectStore((s) => s.setLookValue)
  const resetLookValue = useProjectStore((s) => s.resetLookValue)
  const setView = useUiStore((s) => s.setView)
  const openCreateGame = useUiStore((s) => s.openCreateGame)
  const renpyDir = project?.renpyProjectDir ?? null

  const [entries, setEntries] = useState<LookReadEntry[] | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [report, setReport] = useState<ApplyReport | null>(null)
  const [applied, setApplied] = useState<Record<string, string>>({})
  const [backgroundId, setBackgroundId] = useState<string>('')

  const reread = useCallback(async (): Promise<void> => {
    if (!renpyDir) return
    try {
      setEntries(await api.readLook(renpyDir))
      setReadError(null)
    } catch (e) {
      setEntries(null)
      setReadError(cleanErrorMessage(e))
    }
  }, [renpyDir])

  useEffect(() => {
    setEntries(null)
    setReport(null)
    setApplied({})
    void reread()
  }, [reread])

  const backgrounds = useMemo(() => Object.values(project?.assets ?? {}).filter((a) => a.kind === 'background'), [project?.assets])
  const bgAsset = backgrounds.find((a) => a.id === backgroundId) ?? backgrounds[0] ?? null

  const pendingKeys = useMemo(() => (project && entries ? pendingLookKeys(project, entries, applied) : []), [project, entries, applied])

  if (!project) return null

  if (!renpyDir) {
    return (
      <div className="look-view look-view-empty">
        <EmptyState icon={<Palette size={36} />} title="Look & Feel">
          Create or link a Ren'Py game in Settings first. Colours, fonts and the dialogue box are written into that game.
        </EmptyState>
        <div className="look-empty-actions">
          <Button variant="primary" onClick={() => setView('settings')}>
            Open Settings
          </Button>
          <Button onClick={() => openCreateGame(null)}>Create Ren'Py game…</Button>
        </div>
      </div>
    )
  }

  const entryOf = (key: string): LookReadEntry | undefined => entries?.find((e) => e.key === key)
  const assetOf = (key: string): Asset | null => {
    const id = project.look[key]
    return id !== undefined ? (project.assets[id] ?? null) : null
  }

  // What the game would show once applied: the pending value of each field, else the value it has now.
  const mockValues: Record<string, string> = {}
  for (const f of LOOK_FIELDS) {
    if (f.type === 'image-file' || f.type === 'font-file') continue
    const e = entryOf(f.key)
    const pending = project.look[f.key]
    const value = e?.found && !f.readOnly && pending !== undefined ? pending : e?.value
    if (value !== null && value !== undefined) mockValues[f.key] = value
  }

  const apply = async (): Promise<void> => {
    if (!dir || applying) return
    const request = lookRequest(project, pendingKeys)
    setApplying(true)
    try {
      const result = await api.applyLook(renpyDir, dir, request.values, request.uploads)
      if (!result.ok) {
        toast(result.error ?? 'Could not write the Look & Feel to the game.', 'error')
        return
      }
      // Saved values whose line is edited by hand or missing were not sent; they still belong in the list of what happened.
      const notSent: LookFieldResult[] = LOOK_FIELDS.flatMap((f): LookFieldResult[] => {
        const e = entryOf(f.key)
        if (project.look[f.key] === undefined || f.readOnly || f.type === 'image-file' || !e || e.found) return []
        return [{ key: f.key, status: e.editedByHand ? 'edited-by-hand' : 'not-found' }]
      })
      const all = [...result.results, ...notSent]
      const summary = lookSummary(all, request.skipped.length)
      setReport({ results: all, skipped: request.skipped.map((s) => s.reason), backupDir: result.backupDir, summary })
      toast(`Look & Feel: ${summary}`, all.every((r) => r.status === 'applied' || r.status === 'unchanged') ? 'ok' : 'info')
      const done: Record<string, string> = {}
      for (const r of result.results) {
        const field = LOOK_FIELDS.find((f) => f.key === r.key)
        if (field?.type === 'image-file' && (r.status === 'applied' || r.status === 'unchanged')) done[r.key] = project.look[r.key]
      }
      setApplied((a) => ({ ...a, ...done }))
      await reread()
    } catch (e) {
      toast(cleanErrorMessage(e), 'error')
    } finally {
      setApplying(false)
    }
  }

  const resetAll = (): void => {
    for (const k of Object.keys(project.look)) resetLookValue(k)
    setReport(null)
  }

  return (
    <div className="look-view">
      <div className="look-form">
        <header className="look-head">
          <h1 className="settings-title">Look & Feel</h1>
          <p className="settings-note">
            Applying writes only the lines of <code>gui.rpy</code> and <code>options.rpy</code> that belong to the settings you changed, plus the pictures and
            fonts you chose. Everything else in your game stays as it is, and a copy of each file it replaced is kept in this story's backups folder.
          </p>
          {readError && <p className="form-error">{readError}</p>}
        </header>

        {LOOK_GROUPS.map((group) => (
          <section key={group} className="settings-section" aria-label={group}>
            <h2 className="settings-heading">{group}</h2>
            {LOOK_FIELDS.filter((f) => f.group === group).map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                entry={entryOf(field.key)}
                project={project}
                pending={project.look[field.key]}
                renpyDir={renpyDir}
                setValue={setLookValue}
                reset={resetLookValue}
              />
            ))}
          </section>
        ))}
      </div>

      <aside className="look-side">
        <DialogueMock
          dir={dir}
          game={{ width: project.meta.width, height: project.meta.height }}
          values={mockValues}
          background={bgAsset}
          fonts={{ text: assetOf('gui.text_font'), name: assetOf('gui.name_text_font'), interface: assetOf('gui.interface_text_font') }}
          textboxImage={assetOf('gui/textbox.png')}
          nameboxImage={assetOf('gui/namebox.png')}
        />
        {backgrounds.length > 1 && (
          <Select
            label="Preview background"
            value={bgAsset?.id ?? ''}
            options={backgrounds.map((b) => ({ value: b.id, label: b.name }))}
            onChange={setBackgroundId}
          />
        )}
        <p className="look-row-help">A stand-in: the real game draws with Ren'Py. Fonts already in your game show as a plain font here.</p>
        <div className="look-apply">
          <Button
            variant="primary"
            disabled={pendingKeys.length === 0 || applying}
            title={pendingKeys.length === 0 ? 'Change a setting first' : 'Write the changed settings into the Ren\'Py game'}
            onClick={() => void apply()}
          >
            {applying ? 'Applying…' : pendingKeys.length > 0 ? `Apply to game (${pendingKeys.length})` : 'Apply to game'}
          </Button>
          <Button disabled={Object.keys(project.look).length === 0} onClick={resetAll} title="Forget every change that has not been applied and every saved value">
            Reset all
          </Button>
        </div>
        {report && (
          <section className="look-report" aria-label="Result of the last Apply">
            <h3>{report.summary}</h3>
            <ul>
              {report.results.map((r) => (
                <li key={r.key} className={`look-result look-result-${r.status}`} data-status={r.status}>
                  <span>{labelOf(r.key)}</span>
                  <span>{LOOK_STATUS_LABEL[r.status]}</span>
                  {r.message && <em>{r.message}</em>}
                </li>
              ))}
              {report.skipped.map((s) => (
                <li key={s} className="look-result look-result-invalid">
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            {report.backupDir && <p className="look-row-help">The files that were replaced are kept in {report.backupDir}</p>}
          </section>
        )}
      </aside>
    </div>
  )
}
