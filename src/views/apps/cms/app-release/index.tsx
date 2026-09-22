'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

/**
 * The Trackvid-CMS desktop app's release policy.
 *
 * Reads and writes `appsettings.cmsApp` through /api/cms/app-release. It is ONE
 * object for the whole estate, not a per-company setting: every installed copy
 * of the desktop app polls the public `/cms/version` on launch and compares
 * what it finds against its own build number.
 *
 * WHAT THE APP ACTUALLY DOES WITH IT, since that is what makes this page
 * dangerous and decides every rule below:
 *
 *   versionName          the build the estate should be on. The app treats
 *                        anything older as out of date.
 *   isForceFullyUpdate   when on, an out-of-date machine gets a BLOCKING
 *                        screen. It outranks the login screen and there is no
 *                        way past it — the app cannot be used until it updates.
 *   link                 a manual download URL, stored and served for an
 *                        operator whose automatic update failed.
 *
 * THREE THINGS ARE EASY TO GET WRONG HERE, so the form guards each:
 *
 * 1. A VERSION THE APP CANNOT PARSE IS A SILENT DEAD END. The app compares
 *    with a strict three-part `x.y.z` parse, and anything it cannot read
 *    compares EQUAL — deliberately, so a malformed value can never nag the
 *    whole estate. The effect is that "0.2" or "1.2.3.4" saves happily and
 *    then does nothing at all, for ever, with no error anywhere. The backend's
 *    own check is looser than the app's, so this form is the strict one.
 *
 * 2. FORCING ONLY BITES ON MACHINES BELOW `versionName`. The app enforces
 *    `mandatory && versionName is newer than mine`, so a forced policy set to
 *    a version at or below what a machine runs is a no-op there. Useful — it
 *    is what stops a force from locking out the very build you just shipped —
 *    but it means "nothing happened" is not proof the policy is wrong.
 *
 * 3. A FORCED POLICY POINTING AT A BUILD THAT DOES NOT EXIST LOCKS EVERYONE
 *    OUT. Hence the confirmation step: turning the block on is not something
 *    to do by nudging a switch.
 */

type Toast = { severity: 'success' | 'error' | 'warning' | 'info'; message: string }

type Policy = {
  versionName: string
  isForceFullyUpdate: boolean
  link: string
}

const emptyPolicy = (): Policy => ({ versionName: '', isForceFullyUpdate: false, link: '' })

/**
 * Exactly what the desktop app's own parser accepts: three numeric parts, with
 * an optional pre-release tag. Tighter than the backend on purpose — see (1).
 */
const APP_PARSEABLE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/

const CmsAppRelease = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Policy>(emptyPolicy())
  const [versionName, setVersionName] = useState('')
  const [isForceFullyUpdate, setIsForceFullyUpdate] = useState(false)
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const apply = useCallback((policy: Policy) => {
    setSaved(policy)
    setVersionName(policy.versionName ?? '')
    setIsForceFullyUpdate(policy.isForceFullyUpdate === true)
    setLink(policy.link ?? '')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/cms/app-release', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      apply((json?.data ?? emptyPolicy()) as Policy)
    } catch (err: any) {
      setError(err?.message || 'Failed to load the release policy')
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    load()
  }, [load])

  const trimmedVersion = versionName.trim()
  const trimmedLink = link.trim()

  const versionError = useMemo(() => {
    if (trimmedVersion === '') return null
    if (APP_PARSEABLE_VERSION.test(trimmedVersion)) return null

    return 'Use three parts — 0.1.17. The app ignores anything else without reporting an error.'
  }, [trimmedVersion])

  const linkError = useMemo(() => {
    if (trimmedLink === '') return null
    if (/^https?:\/\//i.test(trimmedLink)) return null

    return 'Must start with http:// or https://'
  }, [trimmedLink])

  // The backend refuses this too; catching it here explains it in place rather
  // than as a failed save.
  const forceWithoutVersion = isForceFullyUpdate && trimmedVersion === ''

  const dirty = useMemo(
    () =>
      trimmedVersion !== saved.versionName ||
      isForceFullyUpdate !== saved.isForceFullyUpdate ||
      trimmedLink !== saved.link,
    [trimmedVersion, trimmedLink, isForceFullyUpdate, saved]
  )

  const canSave = dirty && !saving && !versionError && !linkError && !forceWithoutVersion

  const submit = useCallback(async () => {
    setSaving(true)

    try {
      const res = await fetch('/api/cms/app-release', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionName: trimmedVersion,
          isForceFullyUpdate,
          link: trimmedLink
        })
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setToast({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Save failed (${res.status})`
        })

        return
      }

      const next = (json?.data ?? emptyPolicy()) as Policy

      apply(next)
      setToast({
        severity: next.isForceFullyUpdate ? 'warning' : 'success',
        message: next.versionName
          ? next.isForceFullyUpdate
            ? `Saved. Machines below ${next.versionName} are now blocked until they update.`
            : `Saved. ${next.versionName} is offered to machines running anything older.`
          : 'Saved. No version is set, so nothing is enforced.'
      })
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Save failed' })
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }, [trimmedVersion, trimmedLink, isForceFullyUpdate, apply])

  // Every save that leaves the block ON is confirmed, not only the one that
  // turns it on: changing the version under a live force is the same act with
  // the same blast radius.
  const save = useCallback(() => {
    if (isForceFullyUpdate) {
      setConfirming(true)

      return
    }

    void submit()
  }, [isForceFullyUpdate, submit])

  const reset = () => apply(saved)

  return (
    <>
      <Card>
        <CardHeader
          title='Desktop App Version'
          subheader='The build every Trackvid-CMS installation should be on. One policy for the whole estate — this is not per-company.'
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
              <div className='max-is-[360px]'>
                <CustomTextField
                  fullWidth
                  label='Version'
                  placeholder='0.1.17'
                  value={versionName}
                  disabled={saving}
                  error={Boolean(versionError)}
                  onChange={e => setVersionName(e.target.value)}
                  helperText={
                    versionError ??
                    'Leave empty for no policy. An app on an older build is told an update is available.'
                  }
                />
              </div>

              <FormControlLabel
                control={
                  <Switch
                    checked={isForceFullyUpdate}
                    disabled={saving}
                    onChange={e => setIsForceFullyUpdate(e.target.checked)}
                  />
                }
                label={
                  <div className='flex flex-col gap-0.5'>
                    <Typography color='text.primary'>Make the update compulsory</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      An out-of-date machine gets a blocking screen instead of the app. It comes before the login
                      screen and cannot be dismissed.
                    </Typography>
                  </div>
                }
                sx={{ m: 0, alignItems: 'flex-start' }}
              />

              {forceWithoutVersion && (
                <Alert severity='error'>Set the version first — there is nothing to enforce without one.</Alert>
              )}

              {isForceFullyUpdate && !forceWithoutVersion && (
                <Alert severity='warning'>
                  <AlertTitle>This locks people out of the app</AlertTitle>
                  Anything below {trimmedVersion} stops working until it updates. Check that {trimmedVersion} has
                  actually been published to the update feed — a forced version that was never released blocks the
                  whole estate with no way back in.
                </Alert>
              )}

              <div className='max-is-[520px]'>
                <CustomTextField
                  fullWidth
                  label='Download link'
                  placeholder='https://…'
                  value={link}
                  disabled={saving}
                  error={Boolean(linkError)}
                  onChange={e => setLink(e.target.value)}
                  helperText={
                    linkError ??
                    'Optional fallback for a machine whose automatic update failed. Stored and served; the app updates itself from its own feed.'
                  }
                />
              </div>

              <div className='flex items-center gap-2'>
                <Button
                  variant='contained'
                  color={isForceFullyUpdate ? 'error' : 'primary'}
                  disabled={!canSave}
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

      <Dialog open={confirming} onClose={() => !saving && setConfirming(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Block every machine below {trimmedVersion}?</DialogTitle>
        <DialogContent>
          <DialogContentText component='div'>
            <p className='mbe-3'>
              Every Trackvid-CMS installation running an older build will show a blocking screen on its next check and
              cannot be used until it updates.
            </p>
            <p>
              Confirm {trimmedVersion} is published and installable before continuing. If it is not, nobody can get
              back into the app.
            </p>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color='secondary' disabled={saving} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant='contained'
            color='error'
            disabled={saving}
            onClick={() => void submit()}
            startIcon={saving ? <CircularProgress size={14} color='inherit' /> : undefined}
          >
            Block older builds
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  )
}

export default CmsAppRelease
