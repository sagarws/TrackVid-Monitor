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
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'

// Component Imports
import CopyButton from '@/components/CopyButton'
import CopyableId from '@/components/CopyableId'

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
