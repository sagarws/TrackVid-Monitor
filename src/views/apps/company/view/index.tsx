'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CopyButton from '@/components/CopyButton'
import CopyableId from '@/components/CopyableId'
import CustomTextField from '@core/components/mui/TextField'

// Styled Component Imports — the template's react-datepicker wrapper, so the
// calendar matches every other date field in the app.
import AppReactDatepicker from '@/libs/styles/AppReactDatepicker'

// View Imports — the list owns the row shape and the credential panel; this
// page renders the same data for one company rather than restating it.
import {
  AGENT_URL,
  CredentialSyncPanel,
  formatSyncDate,
  isSyncable,
  mapUserToRow
} from '@views/apps/company/list'
import type { CompanyRow, CredentialSync, PlatformCredentials } from '@views/apps/company/list'

// Config Imports
import type { PlatformKey as FilterPlatformKey } from '@/configs/platforms'

type Props = {
  companyId: string
  impersonateBaseUrl: string
}

type Toast = { severity: 'success' | 'error' | 'warning' | 'info'; message: string }

// One connected mailbox, as /system-admin/company/mailboxes reports it.
type Mailbox = {
  id: string
  email: string
  displayName: string
  provider: string
  type?: string
  status: string
  statusChangedBy: string | null
  ownerEmail: string | null
  lastSyncedAt: string | null
  lastProcessedAt: string | null
  needsSync: boolean
  // A lease left behind by a worker that died — the usual reason a mailbox
  // quietly stops polling, and what Restart clears.
  occupiedAt: string | null
  occupiedBy: string | null
  watchError: Record<string, unknown> | null
}

const mailboxStatusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
  const s = (status || '').toLowerCase()

  if (s === 'connected') return 'success'
  if (s === 'token_expired') return 'warning'
  if (s === 'error') return 'error'

  return 'default'
}

// "40 minutes ago" — the only form of a sync time anyone reads at a glance.
const relativeTime = (iso: string | null) => {
  if (!iso) return 'never'
  const ms = new Date(iso).getTime()

  if (Number.isNaN(ms)) return 'unknown'

  const mins = Math.round((Date.now() - ms) / 60000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`

  return `${Math.floor(mins / 1440)}d ago`
}

// A labelled value with an optional copy button. The detail page is mostly
// these, so they are one component rather than a repeated flex row.
const Field = ({ label, value, copy }: { label: string; value: string; copy?: boolean }) => (
  <div className='flex flex-col gap-0.5'>
    <Typography variant='overline' color='text.disabled' className='leading-none'>
      {label}
    </Typography>
    <div className='flex items-center gap-1'>
      <Typography color={value ? 'text.primary' : 'text.disabled'} className='break-all'>
        {value || '—'}
      </Typography>
      {copy && value ? <CopyButton value={value} label={label.toLowerCase()} /> : null}
    </div>
  </div>
)

const CompanyView = ({ companyId, impersonateBaseUrl }: Props) => {
  const router = useRouter()

  const [row, setRow] = useState<CompanyRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const [inFlight, setInFlight] = useState<Set<string>>(new Set())
  const [agentReady, setAgentReady] = useState<boolean | null>(null)
  const [opening, setOpening] = useState<Set<string>>(new Set())

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [mailboxesLoading, setMailboxesLoading] = useState(true)
  const [mailboxesError, setMailboxesError] = useState<string | null>(null)

  // Integration access — server truth for this company's map + the ordered
  // list of valid keys the BE knows about (drives the toggle rendering, so
  // adding a key in TrackVid-BE surfaces here without a Monitor deploy).
  // `access` is the *last-saved* state; per-key dirty flags come from
  // comparing the switch state against this baseline, so a save shows the
  // diff cleanly.
  const [integrationAccess, setIntegrationAccess] = useState<Record<string, boolean>>({})
  const [integrationKeys, setIntegrationKeys] = useState<string[]>([])
  const [integrationLoading, setIntegrationLoading] = useState(true)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  // Per-key busy set so each Switch spins independently — a bulk write of
  // "email + ajio" holds both, a "myntra"-only write only holds myntra.
  const [integrationBusy, setIntegrationBusy] = useState<Set<string>>(new Set())
  // Keyed `${mailboxId}:${action}` so the two buttons on one row spin
  // independently.
  const [mailboxBusy, setMailboxBusy] = useState<Set<string>>(new Set())

  // Mailbox whose sync-time picker is open, and the date chosen in it. The
  // timestamp is what the poller reads mail forward from, so it is picked
  // rather than assumed — "now" is only one of the useful answers.
  const [syncTimeMailbox, setSyncTimeMailbox] = useState<Mailbox | null>(null)
  const [syncTimeValue, setSyncTimeValue] = useState<Date | null>(null)

  // Same endpoint the list uses, narrowed to one company by the companyIds
  // filter — no second read path to keep in step with it.
  const fetchCompany = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/company/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 1, limit: 1, companyIds: [companyId] })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)
        setRow(null)

        return
      }

      const users = Array.isArray(json?.data?.users) ? json.data.users : []

      if (users.length === 0) {
        setError('Company not found')
        setRow(null)

        return
      }

      setRow(mapUserToRow(users[0]))
    } catch (err: any) {
      setError(err?.message || 'Failed to load the company')
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  const fetchMailboxes = useCallback(async () => {
    setMailboxesLoading(true)
    setMailboxesError(null)

    try {
      const res = await fetch('/api/company/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setMailboxes([])
        setMailboxesError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      setMailboxes(Array.isArray(json?.data?.mailboxes) ? json.data.mailboxes : [])
    } catch (err: any) {
      setMailboxes([])
      setMailboxesError(err?.message || 'Failed to load mailboxes')
    } finally {
      setMailboxesLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchMailboxes()
  }, [fetchMailboxes])

  const fetchIntegrationAccess = useCallback(async () => {
    setIntegrationLoading(true)
    setIntegrationError(null)

    try {
      const res = await fetch(`/api/company/integration-access?companyId=${encodeURIComponent(companyId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setIntegrationError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const map = (json?.data?.integrationAccess ?? {}) as Record<string, boolean>
      const keys = Array.isArray(json?.data?.validKeys) ? (json.data.validKeys as string[]) : Object.keys(map)

      // Backfill any BE-declared key the map missed so the render always sees
      // every switch, and mirror the BE-declared ordering so the layout is
      // stable across companies.
      const normalized: Record<string, boolean> = {}

      for (const key of keys) normalized[key] = map[key] === true

      setIntegrationAccess(normalized)
      setIntegrationKeys(keys)
    } catch (err: any) {
      setIntegrationError(err?.message || 'Failed to load integration access')
    } finally {
      setIntegrationLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchIntegrationAccess()
  }, [fetchIntegrationAccess])

  // Toggle one key. Optimistic + rollback-on-error: the switch flips
  // immediately, and only reverts if the write fails. Same-company single-
  // key writes are the common case, so we send a minimal `access` diff
  // instead of the full map.
  const toggleIntegrationKey = useCallback(
    async (key: string, next: boolean) => {
      if (integrationBusy.has(key)) return

      const previous = integrationAccess[key] === true

      // Optimistic update.
      setIntegrationAccess(prev => ({ ...prev, [key]: next }))
      setIntegrationBusy(prev => new Set(prev).add(key))

      try {
        const res = await fetch('/api/company/integration-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyIds: [companyId], access: { [key]: next } })
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.isSuccess) {
          // Roll back on failure so the switch state matches server truth.
          setIntegrationAccess(prev => ({ ...prev, [key]: previous }))
          setToast({
            severity: 'error',
            message: json?.displayMessage || json?.message || `Update failed (${res.status})`
          })

          return
        }

        setToast({
          severity: 'success',
          message: `${key}: ${next ? 'enabled' : 'disabled'}`
        })
      } catch (err: any) {
        setIntegrationAccess(prev => ({ ...prev, [key]: previous }))
        setToast({ severity: 'error', message: err?.message || 'Update failed' })
      } finally {
        setIntegrationBusy(prev => {
          const nextSet = new Set(prev)

          nextSet.delete(key)

          return nextSet
        })
      }
    },
    [companyId, integrationAccess, integrationBusy]
  )

  const runMailboxAction = useCallback(
    async (mailbox: Mailbox, action: 'set-last-sync' | 'restart', lastSyncedAt?: Date | null) => {
      const key = `${mailbox.id}:${action}`

      setMailboxBusy(prev => new Set(prev).add(key))

      try {
        const res = await fetch('/api/company/mailbox-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mailboxIds: [mailbox.id],
            action,
            // Omitted means "now" server-side; sent as an ISO instant so the
            // BE stores the exact moment picked, not a re-parsed local string.
            ...(lastSyncedAt ? { lastSyncedAt: lastSyncedAt.toISOString() } : {})
          })
        })

        const json = await res.json().catch(() => null)

        // 409 = the BE refused because nothing is consuming mailbox-fetch.
        // Surfaced as a warning with the fix rather than a red failure: the
        // request was correct, the environment is not ready for it.
        if (res.status === 409) {
          setToast({
            severity: 'warning',
            message: json?.displayMessage || 'No worker is consuming mailbox-fetch — start the Email-Automation process'
          })

          return
        }

        if (!res.ok || !json?.isSuccess) {
          setToast({
            severity: 'error',
            message: json?.displayMessage || json?.message || `Request failed (${res.status})`
          })

          return
        }

        // "Restarted, 0 queued" is a real outcome — a disconnected mailbox is
        // skipped by the queue — so it is reported rather than dressed up as
        // success.
        const queued = json.data?.queued

        setToast({
          severity: action === 'restart' && queued === 0 ? 'warning' : 'success',
          message:
            action === 'restart' && queued === 0
              ? 'Lease cleared, but no job was queued — the mailbox is not connected'
              : json.displayMessage || json.message || 'Done'
        })

        fetchMailboxes()
      } catch (err: any) {
        setToast({ severity: 'error', message: err?.message || 'Request failed' })
      } finally {
        setMailboxBusy(prev => {
          const next = new Set(prev)

          next.delete(key)

          return next
        })
      }
    },
    [fetchMailboxes]
  )

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${AGENT_URL}/health`, { signal: controller.signal })
      .then(res => res.ok)
      .catch(() => false)
      .then(ok => {
        if (!controller.signal.aborted) setAgentReady(ok)
      })

    return () => controller.abort()
  }, [])

  const runSyncForCredential = useCallback(
    async (company: string, platform: FilterPlatformKey, credentialId: string) => {
      if (!isSyncable(platform)) return
      const key = `${company}:${platform}:${credentialId}`

      setInFlight(prev => new Set(prev).add(key))

      try {
        const res = await fetch('/api/company/trigger-master-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyIds: [company], platforms: [platform], credentialIds: [credentialId] })
        })

        const json = await res.json().catch(() => null)

        setToast({
          severity: json?.isSuccess ? 'success' : 'error',
          message: json?.displayMessage || json?.message || `Sync request failed (${res.status})`
        })
        fetchCompany()
      } catch (err: any) {
        setToast({ severity: 'error', message: err?.message || 'Sync request failed' })
      } finally {
        setInFlight(prev => {
          const next = new Set(prev)

          next.delete(key)

          return next
        })
      }
    },
    [fetchCompany]
  )

  const openAccount = useCallback(async (platform: FilterPlatformKey, acc: CredentialSync) => {
    const key = `${platform}:${acc.username}`

    setOpening(prev => new Set(prev).add(key))
    setToast({ severity: 'warning', message: `Opening ${platform} as ${acc.username} — this takes up to a minute…` })

    try {
      const res = await fetch(`${AGENT_URL}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username: acc.username, password: acc.password })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        setToast({
          severity: 'error',
          message: json?.error ? `${json.error}${json.hint ? ` — ${json.hint}` : ''}` : `Open failed (${res.status})`
        })

        return
      }

      setToast(
        json.awaiting === 'otp'
          ? { severity: 'warning', message: `${acc.username}: the portal is asking for an OTP — enter it in the window` }
          : { severity: 'success', message: `${acc.username} is open (${json.method})` }
      )
    } catch {
      setAgentReady(false)
      setToast({ severity: 'error', message: 'Local browser agent unreachable — start it with "pnpm dev"' })
    } finally {
      setOpening(prev => {
        const next = new Set(prev)

        next.delete(key)

        return next
      })
    }
  }, [])

  const openImpersonate = () => {
    if (!row?.userId) return
    window.open(`${impersonateBaseUrl}/${row.userId}`, '_blank', 'noopener,noreferrer')
  }

  const totalAccounts = row?.credentials.reduce((n: number, p: PlatformCredentials) => n + p.accounts.length, 0) ?? 0

  return (
    <div className='flex flex-col gap-6'>
      {/* Back first, so the exit is visible before the content is read. Uses
          router.back() to preserve the list's page/search/filters, falling back
          to the list route when this page was opened directly. */}
      <div className='flex items-center justify-between flex-wrap gap-4'>
        <Button
          variant='tonal'
          color='secondary'
          startIcon={<i className='tabler-arrow-left' />}
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/apps/company/list'))}
        >
          Back to companies
        </Button>
        {row?.userId ? (
          <Button variant='contained' startIcon={<i className='tabler-external-link' />} onClick={openImpersonate}>
            Open in TrackVid
          </Button>
        ) : null}
      </div>

      {error && <Alert severity='error'>{error}</Alert>}

      {loading ? (
        <div className='flex justify-center py-10'>
          <CircularProgress />
        </div>
      ) : row ? (
        <>
          <Card>
            <CardHeader
              title={row.companyName}
              subheader={<CopyableId id={row.companyId} label='company id' />}
            />
            <CardContent>
              <Grid container spacing={6}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Field label='Admin' value={row.adminName} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Field label='Email' value={row.adminEmail} copy />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Field label='Phone' value={row.adminPhone} copy />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <div className='flex flex-col gap-0.5'>
                    <Typography variant='overline' color='text.disabled' className='leading-none'>
                      Accounts
                    </Typography>
                    <Typography color='text.primary'>
                      {totalAccounts} across {row.credentials.filter(p => p.accounts.length > 0).length} platform
                      {row.credentials.filter(p => p.accounts.length > 0).length === 1 ? '' : 's'}
                    </Typography>
                  </div>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title='Master data sync' subheader='Oldest sync across each platform&apos;s credentials' />
            <CardContent>
              <div className='flex flex-wrap gap-4'>
                {row.credentials.filter(c => isSyncable(c.key)).map(({ key, label, accounts }) => {
                  const rollup = isSyncable(key) ? row.lastSync[key] : ''
                  const synced = accounts.filter(a => a.lastSync).length

                  return (
                    <div key={key} className='flex flex-col gap-1 rounded border plb-3 pli-4 min-is-[200px]'>
                      <Typography color='text.primary' className='font-medium'>
                        {label}
                      </Typography>
                      <Typography variant='body2' color={rollup ? 'text.secondary' : 'text.disabled'}>
                        {formatSyncDate(rollup)}
                      </Typography>
                      <Chip
                        size='small'
                        variant='tonal'
                        color={
                          accounts.length === 0 ? 'secondary' : synced === accounts.length ? 'success' : 'warning'
                        }
                        label={
                          accounts.length === 0
                            ? 'Not configured'
                            : `${synced} of ${accounts.length} synced`
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title='Connected Mailboxes'
              subheader='Inboxes this company&apos;s email automation reads from'
              action={
                <Button
                  size='small'
                  variant='outlined'
                  color='secondary'
                  startIcon={<i className='tabler-refresh' />}
                  disabled={mailboxesLoading}
                  onClick={fetchMailboxes}
                >
                  Refresh
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {mailboxesError && (
                <Alert severity='error' className='mbe-4'>
                  {mailboxesError}
                </Alert>
              )}
              {mailboxesLoading ? (
                <div className='flex justify-center py-6'>
                  <CircularProgress size={22} />
                </div>
              ) : mailboxes.length === 0 ? (
                <Typography color='text.disabled'>No mailboxes connected for this company.</Typography>
              ) : (
                <div className='flex flex-col gap-3'>
                  {mailboxes.map(mailbox => {
                    const stampBusy = mailboxBusy.has(`${mailbox.id}:set-last-sync`)
                    const restartBusy = mailboxBusy.has(`${mailbox.id}:restart`)

                    return (
                      <div
                        key={mailbox.id}
                        className='flex items-center justify-between gap-4 flex-wrap rounded border plb-3 pli-4'
                      >
                        <div className='flex items-start gap-3 min-is-0'>
                          <i className='tabler-mail text-xl text-textSecondary mbs-1' />
                          <div className='flex flex-col gap-1 min-is-0'>
                            <div className='flex items-center gap-2 flex-wrap'>
                              <Typography color='text.primary' className='font-medium break-all'>
                                {mailbox.displayName}
                              </Typography>
                              <Chip
                                size='small'
                                variant='tonal'
                                color={mailboxStatusColor(mailbox.status)}
                                label={mailbox.status}
                              />
                              <Chip size='small' variant='tonal' label={mailbox.provider} />
                              {/* A held lease is why a "connected" mailbox can
                                  still be silently stuck — surfaced, because it
                                  is the thing Restart fixes. */}
                              {mailbox.occupiedAt && (
                                <Tooltip
                                  title={`Held by ${mailbox.occupiedBy || 'a worker'} since ${new Date(
                                    mailbox.occupiedAt
                                  ).toLocaleString('en-IN')} — Restart releases it`}
                                >
                                  <Chip size='small' variant='tonal' color='warning' label='Lease held' />
                                </Tooltip>
                              )}
                              {mailbox.needsSync && <Chip size='small' variant='tonal' color='info' label='Sync queued' />}
                            </div>
                            <div className='flex items-center gap-1 flex-wrap'>
                              <Typography variant='caption' color='text.secondary' className='break-all'>
                                {mailbox.email}
                              </Typography>
                              <CopyButton value={mailbox.email} label='mailbox address' />
                              <Tooltip
                                title={
                                  mailbox.lastSyncedAt
                                    ? new Date(mailbox.lastSyncedAt).toLocaleString('en-IN')
                                    : 'This mailbox has never completed a sync'
                                }
                              >
                                <Typography variant='caption' color='text.secondary'>
                                  · Synced {relativeTime(mailbox.lastSyncedAt)}
                                </Typography>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <Tooltip title='Pick the point the poller should read mail forward from'>
                            <span>
                              <Button
                                size='small'
                                variant='outlined'
                                color='secondary'
                                disabled={stampBusy || restartBusy}
                                startIcon={
                                  stampBusy ? <CircularProgress size={14} /> : <i className='tabler-calendar-clock' />
                                }
                                onClick={() => {
                                  setSyncTimeMailbox(mailbox)
                                  // Seeded with the current value so the dialog
                                  // opens on the date being changed, not today.
                                  setSyncTimeValue(mailbox.lastSyncedAt ? new Date(mailbox.lastSyncedAt) : new Date())
                                }}
                              >
                                Update sync time
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip title='Release a stuck lease, clear the watch error and re-queue the fetch job'>
                            <span>
                              <Button
                                size='small'
                                variant='tonal'
                                color='primary'
                                disabled={stampBusy || restartBusy}
                                startIcon={
                                  restartBusy ? (
                                    <CircularProgress size={14} color='inherit' />
                                  ) : (
                                    <i className='tabler-player-play' />
                                  )
                                }
                                onClick={() => runMailboxAction(mailbox, 'restart')}
                              >
                                Restart job
                              </Button>
                            </span>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title='Integration Access'
              subheader='Toggle which integrations this company can see on /integrations'
              action={
                <Button
                  size='small'
                  variant='outlined'
                  color='secondary'
                  startIcon={<i className='tabler-refresh' />}
                  disabled={integrationLoading}
                  onClick={fetchIntegrationAccess}
                >
                  Refresh
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {integrationError && (
                <Alert severity='error' className='mbe-4'>
                  {integrationError}
                </Alert>
              )}
              {integrationLoading ? (
                <div className='flex justify-center py-6'>
                  <CircularProgress size={22} />
                </div>
              ) : integrationKeys.length === 0 ? (
                <Typography color='text.disabled'>No integrations configured on the server.</Typography>
              ) : (
                // One switch per BE-declared key. Optimistic toggle writes to
                // the same bulk endpoint the CLI would call, so nothing else
                // needs to know about this page.
                <Grid container spacing={3}>
                  {integrationKeys.map(key => {
                    const enabled = integrationAccess[key] === true
                    const busy = integrationBusy.has(key)

                    return (
                      <Grid key={key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                        <div className='flex items-center justify-between gap-2 rounded border plb-2 pli-3'>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={enabled}
                                disabled={busy}
                                onChange={e => toggleIntegrationKey(key, e.target.checked)}
                              />
                            }
                            label={
                              <Typography color='text.primary' className='capitalize'>
                                {key}
                              </Typography>
                            }
                            sx={{ m: 0 }}
                          />
                          {busy && <CircularProgress size={14} />}
                        </div>
                      </Grid>
                    )
                  })}
                </Grid>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title='Credentials' subheader='Every marketplace login configured for this company' />
            <Divider />
            {/* The same panel the list expands, with the same actions — a
                detail page that could only look would be a downgrade. */}
            <CredentialSyncPanel
              credentials={row.credentials}
              companyId={row.companyId}
              inFlight={inFlight}
              agentReady={agentReady}
              opening={opening}
              onSyncCredential={runSyncForCredential}
              onOpenAccount={openAccount}
            />
          </Card>
        </>
      ) : null}

      <Dialog
        open={Boolean(syncTimeMailbox)}
        onClose={() => setSyncTimeMailbox(null)}
        maxWidth='xs'
        fullWidth
        // react-datepicker renders its calendar in a portal; without this the
        // popup lands behind the dialog surface.
        sx={{ '& .react-datepicker-popper': { zIndex: 1400 } }}
      >
        <DialogTitle>Update sync time</DialogTitle>
        <DialogContent>
          <div className='flex flex-col gap-4 pbs-2'>
            <Typography variant='body2'>
              Set the point <strong>{syncTimeMailbox?.email}</strong> reads mail forward from. Anything older than this
              is skipped; moving it back makes the poller re-read that window.
            </Typography>
            <AppReactDatepicker
              selected={syncTimeValue}
              onChange={(date: Date | null) => setSyncTimeValue(date)}
              showTimeSelect
              timeIntervals={15}
              dateFormat='dd MMM yyyy, h:mm aa'
              // A future timestamp would silently mute the mailbox until that
              // moment passed, which looks identical to a broken poller.
              maxDate={new Date()}
              customInput={<CustomTextField fullWidth label='Last synced at' />}
            />
            <div className='flex items-center gap-2 flex-wrap'>
              <Button size='small' variant='tonal' color='secondary' onClick={() => setSyncTimeValue(new Date())}>
                Now
              </Button>
              <Button
                size='small'
                variant='tonal'
                color='secondary'
                onClick={() => setSyncTimeValue(new Date(Date.now() - 24 * 60 * 60 * 1000))}
              >
                24 hours ago
              </Button>
              <Button
                size='small'
                variant='tonal'
                color='secondary'
                onClick={() => setSyncTimeValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))}
              >
                7 days ago
              </Button>
            </div>
            <Typography variant='caption' color='text.secondary'>
              Currently{' '}
              {syncTimeMailbox?.lastSyncedAt
                ? new Date(syncTimeMailbox.lastSyncedAt).toLocaleString('en-IN')
                : 'never synced'}
              .
            </Typography>
          </div>
        </DialogContent>
        <DialogActions>
          <Button color='secondary' onClick={() => setSyncTimeMailbox(null)}>
            Cancel
          </Button>
          <Button
            variant='contained'
            disabled={!syncTimeValue || mailboxBusy.has(`${syncTimeMailbox?.id}:set-last-sync`)}
            onClick={async () => {
              if (!syncTimeMailbox || !syncTimeValue) return
              const target = syncTimeMailbox

              setSyncTimeMailbox(null)
              await runMailboxAction(target, 'set-last-sync', syncTimeValue)
            }}
          >
            Update
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
    </div>
  )
}

export default CompanyView
