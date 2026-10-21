'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

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

// Bulk integration access.
//
//   integrationAccess  which integration cards the web FE renders on
//                      /integrations, one boolean per integration key
//
// The bulk counterpart of the company page's Integration Access card. The rows
// are the BE's `validKeys` (INTEGRATION_ACCESS_KEYS), never a list typed in
// here: a key added on the backend — kwikengage was the latest — has to show up
// on this screen on its own, and a key the backend does not know is refused.

/** One column: an integration is either visible to the company or it is not. */
const VISIBLE_COLUMN = 'visible'

type Summary = {
  totalCompanies: number
  enabledCounts: Record<string, number>
  keys: string[]
}

const EMPTY: Summary = { totalCompanies: 0, enabledCounts: {}, keys: [] }

const IntegrationsTab = () => {
  const [summary, setSummary] = useState<Summary>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useCompanyRoster()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // No companyId: the endpoint answers with a per-key count across every
      // company rather than one company's map.
      const res = await fetch('/api/company/integration-access', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const enabledCounts = (json?.data?.enabledCounts ?? {}) as Record<string, number>

      setSummary({
        totalCompanies: Number(json?.data?.totalCompanies ?? 0),
        enabledCounts,
        keys: Array.isArray(json?.data?.validKeys) ? (json.data.validKeys as string[]) : Object.keys(enabledCounts)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load integration access')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** `{ access: { <key>: boolean } }` — only the moved rows. */
  const buildPayload = useCallback((intents: Intents) => {
    const access: Record<string, boolean> = {}

    for (const [key, row] of Object.entries(intents)) {
      const intent = row[VISIBLE_COLUMN]

      if (intent) access[key] = intent === 'on'
    }

    return { access }
  }, [])

  if (loading && summary.keys.length === 0) {
    return (
      <div className='flex justify-center py-10'>
        <CircularProgress size={24} />
      </div>
    )
  }

  if (error && summary.keys.length === 0) {
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

  if (summary.keys.length === 0) {
    return <Typography color='text.disabled'>No integrations configured on the server.</Typography>
  }

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Typography variant='body2' color='text.secondary'>
            Which integrations each company sees on /integrations. The web app reads this on the next page load.
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
          title='Integration access'
          subheader='settings.integrationAccess — one flag per integration'
          help='Shows or hides an integration’s card on the company’s /integrations page. Hiding one does not disconnect anything already set up; it only removes the entry point.'
          rowLabel='Integration'
          platforms={summary.keys}
          columns={[{ key: VISIBLE_COLUMN, label: 'Visible' }]}
          supports={() => true}
          enabledCount={key => {
            const value = summary.enabledCounts?.[key]

            return typeof value === 'number' ? value : null
          }}
          totalCompanies={summary.totalCompanies}
          roster={roster}
          endpoint='/api/company/integration-access'
          buildPayload={buildPayload}
          onApplied={load}
        />
      </Grid>
    </Grid>
  )
}

export default IntegrationsTab
