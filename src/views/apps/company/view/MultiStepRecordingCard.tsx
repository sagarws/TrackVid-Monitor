'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

/**
 * Multi-Step Recording settings card.
 *
 * Shown on the company detail page. Reads and writes
 * `company.settings.multiStepRecording` via /api/company/multi-step-recording
 * (which proxies to the BE system-admin route).
 *
 * Rules mirrored from the BE validator so the UI catches malformed states
 * before the round-trip:
 *   - When `mode` is on, at least 2 feed rows are required.
 *   - Every row must pick a feed (from the company's live feed list) and a
 *     step number ≥ 1.
 *   - `totalFeed` must equal the row count. The UI keeps it in lockstep
 *     with the rows automatically — no separate input — so it can never
 *     drift out of the merge trigger's completeness threshold.
 *
 * `feedIds[i].date` is a server-owned audit field, set on save; the UI
 * neither reads nor edits it.
 */
type Toast = { severity: 'success' | 'error' | 'warning' | 'info'; message: string }

type FeedOption = {
  _id: string
  feedName: string
  isDisable: boolean
  isSelectedFeed: boolean
}

type FeedEntry = {
  feedId: string
  step: number
}

type Config = {
  mode: boolean
  feedIds: FeedEntry[]
  totalFeed: number
}

const emptyConfig = (): Config => ({ mode: false, feedIds: [], totalFeed: 0 })

// Local-only row id so React keys survive step-number edits (steps can change,
// order can change; feedId can be empty while the picker is open).
type Row = FeedEntry & { rowKey: string }

const rowKey = (() => {
  let n = 0
  return () => `r${++n}`
})()

const toRows = (entries: FeedEntry[]): Row[] =>
  entries.map(e => ({ feedId: e.feedId, step: e.step, rowKey: rowKey() }))

// Next unused positive step number given the rows currently on screen. Picking
// the smallest missing keeps the UI predictable (add row → get step 3 after
// deleting step 2, not step 4).
const nextStep = (rows: Row[]): number => {
  const used = new Set(rows.map(r => r.step).filter(s => s > 0))
  let n = 1
  while (used.has(n)) n++
  return n
}

type Props = {
  companyId: string
  onToast?: (toast: Toast) => void
}

const MultiStepRecordingCard = ({ companyId, onToast }: Props) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feeds, setFeeds] = useState<FeedOption[]>([])
  const [saved, setSaved] = useState<Config>(emptyConfig())
  const [mode, setMode] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/company/multi-step-recording?companyId=${encodeURIComponent(companyId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const cfg = (json?.data?.multiStepRecording ?? emptyConfig()) as Config
      const feedList = Array.isArray(json?.data?.feeds) ? (json.data.feeds as FeedOption[]) : []

      setSaved(cfg)
      setMode(cfg.mode === true)
      setRows(toRows(cfg.feedIds ?? []))
      setFeeds(feedList)
    } catch (err: any) {
      setError(err?.message || 'Failed to load multi-step recording config')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  // Dirty check: mode flip OR any row diff vs saved. Compared as sorted
  // (feedId, step) pairs so re-ordering doesn't false-positive.
  const dirty = useMemo(() => {
    if (mode !== saved.mode) return true
    if (!mode && !saved.mode) return false
    if (rows.length !== saved.feedIds.length) return true

    const norm = (list: FeedEntry[]) =>
      list
        .map(e => `${e.feedId}:${e.step}`)
        .sort()
        .join('|')

    return norm(rows) !== norm(saved.feedIds)
  }, [mode, rows, saved])

  // Validation reasons — shown inline (disabled Save + hint). Mirrors the BE
  // rules so the operator never sees a 400 for something the UI could catch.
  const validationError = useMemo<string | null>(() => {
    if (!mode) return null
    if (rows.length < 2) return 'Add at least two feed mappings before saving.'

    const seenFeeds = new Set<string>()
    const seenSteps = new Set<number>()

    for (const r of rows) {
      if (!r.feedId) return 'Every row must pick a feed.'
      if (!Number.isInteger(r.step) || r.step < 1) return 'Step must be a positive integer.'
      if (seenFeeds.has(r.feedId)) return `Feed used twice: ${feeds.find(f => f._id === r.feedId)?.feedName ?? r.feedId}`
      if (seenSteps.has(r.step)) return `Step used twice: ${r.step}`
      seenFeeds.add(r.feedId)
      seenSteps.add(r.step)
    }

    return null
  }, [mode, rows, feeds])

  const addRow = () => setRows(prev => [...prev, { feedId: '', step: nextStep(prev), rowKey: rowKey() }])

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r.rowKey !== key))

  const updateRow = (key: string, patch: Partial<FeedEntry>) =>
    setRows(prev => prev.map(r => (r.rowKey === key ? { ...r, ...patch } : r)))

  const save = useCallback(async () => {
    if (saving) return

    setSaving(true)

    try {
      const payload = mode
        ? {
            companyId,
            mode: true,
            feedIds: rows.map(r => ({ feedId: r.feedId, step: r.step })),
            totalFeed: rows.length
          }
        : {
            companyId,
            mode: false,
            feedIds: [],
            totalFeed: 0
          }

      const res = await fetch('/api/company/multi-step-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        onToast?.({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Save failed (${res.status})`
        })

        return
      }

      const nextCfg = (json?.data?.multiStepRecording ?? emptyConfig()) as Config

      setSaved(nextCfg)
      setMode(nextCfg.mode === true)
      setRows(toRows(nextCfg.feedIds ?? []))
      onToast?.({
        severity: 'success',
        message: nextCfg.mode ? 'Multi-step recording enabled' : 'Multi-step recording disabled'
      })
    } catch (err: any) {
      onToast?.({ severity: 'error', message: err?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [companyId, mode, rows, saving, onToast])

  const reset = () => {
    setMode(saved.mode === true)
    setRows(toRows(saved.feedIds ?? []))
  }

  return (
    <Card>
      <CardHeader
        title='Multi-Step Recording'
        subheader='Record one AWB across multiple feeds; the backend merges the parts once every step arrives.'
        action={
          <div className='flex items-center gap-2'>
            <FormControlLabel
              control={
                <Switch
                  checked={mode}
                  disabled={loading || saving}
                  onChange={e => setMode(e.target.checked)}
                />
              }
              label={mode ? 'Enabled' : 'Disabled'}
              sx={{ m: 0 }}
            />
            <Button
              size='small'
              variant='outlined'
              color='secondary'
              startIcon={<i className='tabler-refresh' />}
              disabled={loading}
              onClick={load}
            >
              Refresh
            </Button>
          </div>
        }
      />
      <Divider />
      <CardContent>
        {error && (
          <Alert severity='error' className='mbe-4'>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className='flex justify-center py-6'>
            <CircularProgress size={22} />
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {mode ? (
              <>
                {feeds.length === 0 ? (
                  <Alert severity='warning'>
                    This company has no feeds — create feeds first, then map each to a step here.
                  </Alert>
                ) : (
                  <>
                    <div className='flex items-center justify-between flex-wrap gap-2'>
                      <div className='flex items-center gap-2'>
                        <Chip
                          size='small'
                          variant='tonal'
                          color={validationError ? 'warning' : 'success'}
                          label={`${rows.length} step${rows.length === 1 ? '' : 's'} mapped`}
                        />
                        <Typography variant='caption' color='text.secondary'>
                          totalFeed auto-tracks the row count.
                        </Typography>
                      </div>
                      <Button
                        size='small'
                        variant='tonal'
                        color='primary'
                        startIcon={<i className='tabler-plus' />}
                        onClick={addRow}
                        disabled={saving}
                      >
                        Add feed
                      </Button>
                    </div>

                    <div className='flex flex-col gap-3'>
                      {rows.map(row => {
                        const chosen = feeds.find(f => f._id === row.feedId)

                        return (
                          <div
                            key={row.rowKey}
                            className='flex items-start gap-3 flex-wrap rounded border plb-3 pli-4'
                          >
                            <div className='flex-1 min-is-[220px]'>
                              <CustomTextField
                                select
                                fullWidth
                                label='Feed'
                                value={row.feedId}
                                disabled={saving}
                                onChange={e => updateRow(row.rowKey, { feedId: e.target.value })}
                              >
                                <MenuItem value=''>
                                  <em>Select a feed…</em>
                                </MenuItem>
                                {feeds.map(f => (
                                  <MenuItem key={f._id} value={f._id}>
                                    {f.feedName}
                                    {f.isDisable ? ' (disabled)' : ''}
                                  </MenuItem>
                                ))}
                              </CustomTextField>
                              {chosen?.isDisable && (
                                <Typography variant='caption' color='warning.main'>
                                  This feed is disabled — its packing station will not upload.
                                </Typography>
                              )}
                            </div>

                            <div className='min-is-[120px]'>
                              <CustomTextField
                                fullWidth
                                type='number'
                                label='Step'
                                inputProps={{ min: 1, step: 1 }}
                                value={row.step || ''}
                                disabled={saving}
                                onChange={e => {
                                  const n = parseInt(e.target.value, 10)
                                  updateRow(row.rowKey, { step: Number.isFinite(n) ? n : 0 })
                                }}
                              />
                            </div>

                            <div className='pbs-6'>
                              <IconButton
                                size='small'
                                color='error'
                                disabled={saving}
                                onClick={() => removeRow(row.rowKey)}
                                aria-label='Remove feed mapping'
                              >
                                <i className='tabler-trash' />
                              </IconButton>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {validationError && <Alert severity='warning'>{validationError}</Alert>}
                  </>
                )}
              </>
            ) : (
              <Typography color='text.secondary'>
                Multi-step recording is off — every upload creates a normal single-shot order. Turn on the switch to
                map feeds to steps.
              </Typography>
            )}

            <div className='flex items-center gap-2'>
              <Button
                variant='contained'
                disabled={!dirty || saving || (mode && validationError !== null)}
                onClick={save}
                startIcon={saving ? <CircularProgress size={14} color='inherit' /> : <i className='tabler-device-floppy' />}
              >
                Save
              </Button>
              <Button
                variant='outlined'
                color='secondary'
                disabled={!dirty || saving}
                onClick={reset}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default MultiStepRecordingCard
