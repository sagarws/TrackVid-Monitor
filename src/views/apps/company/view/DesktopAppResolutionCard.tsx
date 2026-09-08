'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

/**
 * Desktop-App Resolution settings card.
 *
 * Shown on the company detail page. Reads/writes
 * `company.settings.desktopAppResolution` via
 * /api/company/desktop-app-resolution (proxies to the BE system-admin route).
 *
 * The setting is consumed by the desktop apps' webcam recorder to shape
 * getUserMedia constraints — this card only stores + serves. The desktop
 * app enforces the resolution or the "as per camera" behaviour; a save here
 * never re-encodes existing videos.
 *
 * `asPerCamera=true` disables the resolution dropdown (grey but the value
 * is preserved on the server, so toggling off later restores the pick).
 * `resolution` accepts a fixed set of common presets — a free-text input
 * would invite typos and the BE validator would reject anything not
 * matching /^\d{3,5}x\d{3,5}$/.
 */
type Toast = { severity: 'success' | 'error' | 'warning' | 'info'; message: string }

type Config = {
  asPerCamera: boolean
  resolution: string
}

const DEFAULT_RESOLUTION = '1280x720'

// Fixed preset list. Add more here if you ever want 5K / 8K options — the
// BE just validates the "WIDTHxHEIGHT" shape, so any real resolution works.
const RESOLUTION_PRESETS: { value: string; label: string }[] = [
  { value: '640x480', label: '640 × 480 (VGA)' },
  { value: '1280x720', label: '1280 × 720 (HD)' },
  { value: '1920x1080', label: '1920 × 1080 (Full HD)' },
  { value: '2560x1440', label: '2560 × 1440 (QHD)' },
  { value: '3840x2160', label: '3840 × 2160 (4K UHD)' }
]

const emptyConfig = (): Config => ({ asPerCamera: false, resolution: DEFAULT_RESOLUTION })

type Props = {
  companyId: string
  onToast?: (toast: Toast) => void
}

const DesktopAppResolutionCard = ({ companyId, onToast }: Props) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Config>(emptyConfig())
  const [asPerCamera, setAsPerCamera] = useState(false)
  const [resolution, setResolution] = useState<string>(DEFAULT_RESOLUTION)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/company/desktop-app-resolution?companyId=${encodeURIComponent(companyId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const cfg = (json?.data?.desktopAppResolution ?? emptyConfig()) as Config

      // Normalise: pick a preset that matches, else keep the stored value so
      // the display isn't blank (dropdown shows it as "custom" via the
      // matching MenuItem check below).
      setSaved(cfg)
      setAsPerCamera(cfg.asPerCamera === true)
      setResolution(cfg.resolution || DEFAULT_RESOLUTION)
    } catch (err: any) {
      setError(err?.message || 'Failed to load desktop-app resolution')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  const dirty = useMemo(() => {
    if (asPerCamera !== saved.asPerCamera) return true

    // Compare resolution only when both sides intend to use it. When
    // `asPerCamera` is true the resolution field is preserved server-side
    // but ignored by the app — a change to `resolution` in that mode is
    // still a real edit (persisted so a later toggle-off restores it).
    return resolution !== saved.resolution
  }, [asPerCamera, resolution, saved])

  // A stored resolution that isn't one of the presets should still render
  // — surface it as an extra option so the operator sees the current value
  // rather than a silently-defaulted dropdown.
  const presetsWithCurrent = useMemo(() => {
    if (RESOLUTION_PRESETS.some(p => p.value === resolution)) return RESOLUTION_PRESETS

    return [{ value: resolution, label: `${resolution} (custom)` }, ...RESOLUTION_PRESETS]
  }, [resolution])

  const save = useCallback(async () => {
    if (saving) return

    setSaving(true)

    try {
      const payload = { companyId, asPerCamera, resolution }

      const res = await fetch('/api/company/desktop-app-resolution', {
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

      const nextCfg = (json?.data?.desktopAppResolution ?? emptyConfig()) as Config

      setSaved(nextCfg)
      setAsPerCamera(nextCfg.asPerCamera === true)
      setResolution(nextCfg.resolution || DEFAULT_RESOLUTION)
      onToast?.({
        severity: 'success',
        message: nextCfg.asPerCamera
          ? 'Desktop-app resolution set to "as per camera"'
          : `Desktop-app resolution set to ${nextCfg.resolution}`
      })
    } catch (err: any) {
      onToast?.({ severity: 'error', message: err?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [companyId, asPerCamera, resolution, saving, onToast])

  const reset = () => {
    setAsPerCamera(saved.asPerCamera === true)
    setResolution(saved.resolution || DEFAULT_RESOLUTION)
  }

  return (
    <Card>
      <CardHeader
        title='Desktop-App Recording Resolution'
        subheader='Sets the webcam capture size for this company. Applies to the desktop apps; existing videos are not re-encoded.'
        action={
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
            <FormControlLabel
              control={
                <Switch
                  checked={asPerCamera}
                  disabled={saving}
                  onChange={e => setAsPerCamera(e.target.checked)}
                />
              }
              label={
                <div className='flex flex-col gap-0.5'>
                  <Typography color='text.primary'>Use camera's native resolution</Typography>
                  <Typography variant='caption' color='text.secondary'>
                    The app asks for the highest resolution the connected camera supports and ignores the value below.
                  </Typography>
                </div>
              }
              sx={{ m: 0, alignItems: 'flex-start' }}
            />

            <div className='max-is-[360px]'>
              <CustomTextField
                select
                fullWidth
                label='Fixed resolution'
                value={resolution}
                disabled={saving || asPerCamera}
                onChange={e => setResolution(e.target.value)}
                helperText={
                  asPerCamera
                    ? 'Ignored while "Use camera\'s native resolution" is on. Saved for later.'
                    : 'Applied to every recording started by this company\'s desktop apps.'
                }
              >
                {presetsWithCurrent.map(p => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </CustomTextField>
            </div>

            <div className='flex items-center gap-2'>
              <Button
                variant='contained'
                disabled={!dirty || saving}
                onClick={save}
                startIcon={
                  saving ? <CircularProgress size={14} color='inherit' /> : <i className='tabler-device-floppy' />
                }
              >
                Save
              </Button>
              <Button variant='outlined' color='secondary' disabled={!dirty || saving} onClick={reset}>
                Reset
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default DesktopAppResolutionCard
