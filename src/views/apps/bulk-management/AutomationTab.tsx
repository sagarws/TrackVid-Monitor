'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Component Imports
import BulkSettingCard from './BulkSettingCard'
import type { Intents } from './BulkSettingCard'
import { useCompanyRoster } from '@/components/CompanyScopeSelector'

// Config Imports
import { automationLabel } from '@/configs/platforms'

// Bulk automation routing.
//
// The same three settings the per-company card writes, applied across many
// companies at once:
//
//   desktopExecution            where a claim runs — server or the operator's
//                               Trackvid-CMS desktop app
//   apiBasedAutomation          which flow it uses — direct API or browser
//   isAutoLoginOnActiveSession  whether a re-captured session signs in by script
//
// The grid comes from `platformAutomations` in the response, never from a list
// typed in here: a platform added to the runner tomorrow has to appear on this
// screen on its own, or it is a platform ops can never route. Same reason the
// per-company card builds its grid the same way.

/** The flat per-platform card has no automations to spread across columns. */
const FLAG_COLUMN = 'enabled'

type Summary = {
  totalCompanies: number
  // `{ desktopExecution: { "ajio.claim": 12 }, … }` — how many companies have
  // each pair on today, so an operator can see what they are about to change.
  enabledCounts: Record<string, Record<string, number>>
  autoLoginCounts: Record<string, number>
  platformAutomations: Record<string, string[]>
}

const EMPTY: Summary = { totalCompanies: 0, enabledCounts: {}, autoLoginCounts: {}, platformAutomations: {} }

/** Every automation any platform has, in a stable column order. */
const columnsFor = (platformAutomations: Record<string, string[]>) => {
  const seen: string[] = []

  for (const list of Object.values(platformAutomations)) {
    for (const automation of list) if (!seen.includes(automation)) seen.push(automation)
  }

  return seen.map(key => ({ key, label: automationLabel(key) }))
}

const AutomationTab = () => {
  const [summary, setSummary] = useState<Summary>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One roster for all three cards — three copies of the same 600 companies is
  // three fetches and three chances for them to disagree.
  const roster = useCompanyRoster()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // No companyId: the endpoint answers with the cross-company summary
      // rather than one company's stored maps.
      const res = await fetch('/api/company/automation-routing', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      setSummary({
        totalCompanies: Number(json?.data?.totalCompanies ?? 0),
        enabledCounts: (json?.data?.enabledCounts ?? {}) as Record<string, Record<string, number>>,
        autoLoginCounts: (json?.data?.isAutoLoginOnActiveSession ?? {}) as Record<string, number>,
        platformAutomations: (json?.data?.platformAutomations ?? {}) as Record<string, string[]>
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load automation settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const platforms = useMemo(() => Object.keys(summary.platformAutomations), [summary.platformAutomations])
  const columns = useMemo(() => columnsFor(summary.platformAutomations), [summary.platformAutomations])

  const supportsPair = useCallback(
    (platform: string, automation: string) => (summary.platformAutomations[platform] ?? []).includes(automation),
    [summary.platformAutomations]
  )

  const pairCount = useCallback(
    (field: string) => (platform: string, automation: string) => {
      const value = summary.enabledCounts?.[field]?.[`${platform}.${automation}`]

      return typeof value === 'number' ? value : null
    },
    [summary.enabledCounts]
  )

  /** `{ <field>: { <platform>: { <automation>: boolean } } }` — only moved cells. */
  const buildPairPayload = useCallback(
    (field: string) => (intents: Intents) => {
      const map: Record<string, Record<string, boolean>> = {}

      for (const [platform, row] of Object.entries(intents)) {
        for (const [automation, intent] of Object.entries(row)) {
          map[platform] = { ...(map[platform] ?? {}), [automation]: intent === 'on' }
        }
      }

      return { [field]: map }
    },
    []
  )

  /** `{ isAutoLoginOnActiveSession: { <platform>: boolean } }` — flat, one flag per platform. */
  const buildFlagPayload = useCallback((intents: Intents) => {
    const map: Record<string, boolean> = {}

    for (const [platform, row] of Object.entries(intents)) {
      const intent = row[FLAG_COLUMN]

      if (intent) map[platform] = intent === 'on'
    }

    return { isAutoLoginOnActiveSession: map }
  }, [])

  if (loading && platforms.length === 0) {
    return (
      <div className='flex justify-center py-10'>
        <CircularProgress size={24} />
      </div>
    )
  }

  if (error && platforms.length === 0) {
    return (
      <Alert
        severity='error'
        action={
          <Button size='small' color='inherit' onClick={() => void load()}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    )
  }

  if (platforms.length === 0) {
    return <Typography color='text.disabled'>No automation platforms configured on the server.</Typography>
  }

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Typography variant='body2' color='text.secondary'>
            Settings written here take effect on the next automation run, on machines nobody is watching. Each card has
            its own company scope.
          </Typography>
          <Button
            size='small'
            variant='outlined'
            color='secondary'
            startIcon={<i className='tabler-refresh' />}
            disabled={loading}
            onClick={() => {
              void load()
              void roster.reload()
            }}
          >
            Refresh
          </Button>
        </div>
        {error && (
          <Alert severity='error' className='mbs-4'>
            {error}
          </Alert>
        )}
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkSettingCard
          title='Run in the desktop app'
          subheader='Server, or the operator’s Trackvid-CMS app'
          help='Claims are pushed to the operator’s Trackvid-CMS desktop app instead of running on the server. A company with no desktop client connected leaves those claims queued and unworked.'
          platforms={platforms}
          columns={columns}
          supports={supportsPair}
          enabledCount={pairCount('desktopExecution')}
          totalCompanies={summary.totalCompanies}
          roster={roster}
          buildPayload={buildPairPayload('desktopExecution')}
          onApplied={load}
          warning='Turning this on for a company with no desktop client connected leaves its claims queued and unworked — and a queued claim looks exactly like one that has not run yet.'
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkSettingCard
          title='Use the direct-API flow'
          subheader='Platform APIs, or the browser-driven flow'
          help='Talks to the platform’s APIs rather than driving its web UI. Unset falls back to the runner’s legacy *_APIBASE_AUTOMATION env vars.'
          platforms={platforms}
          columns={columns}
          supports={supportsPair}
          enabledCount={pairCount('apiBasedAutomation')}
          totalCompanies={summary.totalCompanies}
          roster={roster}
          buildPayload={buildPairPayload('apiBasedAutomation')}
          onApplied={load}
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkSettingCard
          title='Auto-login on re-capture'
          subheader='One flag per platform, not per automation'
          help='Sign in to the marketplace by script when a session is re-captured, instead of asking the operator to type the password. One sign-in serves every automation on that platform, so this is set per platform.'
          platforms={platforms}
          // One column, because a session is captured once and every automation
          // on the platform reuses it.
          columns={[{ key: FLAG_COLUMN, label: 'Auto-login' }]}
          supports={() => true}
          enabledCount={platform => {
            const value = summary.autoLoginCounts?.[platform]

            return typeof value === 'number' ? value : null
          }}
          totalCompanies={summary.totalCompanies}
          roster={roster}
          buildPayload={buildFlagPayload}
          onApplied={load}
          warning='This is a security control, not a preference: the backend gates the only endpoint that emits a stored marketplace password on the same flag. Turning it on makes those passwords reachable by the desktop app.'
        />
      </Grid>
    </Grid>
  )
}

export default AutomationTab
