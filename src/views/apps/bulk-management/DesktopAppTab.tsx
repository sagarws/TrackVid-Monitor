'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Component Imports
import BulkFlagCard from './BulkFlagCard'
import { useCompanyRoster } from '@/components/CompanyScopeSelector'

// Bulk settings that belong to the Trackvid-CMS desktop app rather than to
// automation routing.
//
//   cmsTermsAgreed  whether someone at the company has accepted the app's
//                   responsible-use notice
//
// Its own tab because the Automation tab's three cards are all "where and how
// does an automation run"; this one is an agreement the business made, and the
// desktop app reads it on launch rather than on the next automation run.

type Summary = { totalCompanies: number; agreedCount: number }

const EMPTY: Summary = { totalCompanies: 0, agreedCount: 0 }

const DesktopAppTab = () => {
  const [summary, setSummary] = useState<Summary>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useCompanyRoster()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // No companyId: the endpoint answers with the cross-company summary
      // rather than one company's stored flag.
      const res = await fetch('/api/company/cms-terms-agreed', {
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
        agreedCount: Number(json?.data?.agreedCount ?? 0)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the desktop-app settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const buildPayload = useCallback((agreed: boolean) => ({ agreed }), [])

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Typography variant='body2' color='text.secondary'>
            Settings the Trackvid-CMS desktop app reads when an operator launches it. Each card has its own company
            scope.
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
          <Alert
            severity='error'
            className='mbs-4'
            action={
              <Button size='small' color='inherit' onClick={() => void load()}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        )}
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkFlagCard
          title='CMS terms agreement'
          subheader='settings.cmsTermsAgreed — per company, not per machine'
          help='Records that someone at the company has accepted the desktop app’s responsible-use notice. The app checks it on launch: not agreed means it shows the notice and waits before doing anything else.'
          onLabel='Agreed'
          offLabel='Not agreed'
          enabledCount={summary.agreedCount}
          countNoun='agreed'
          totalCompanies={summary.totalCompanies}
          roster={roster}
          endpoint='/api/company/cms-terms-agreed'
          buildPayload={buildPayload}
          onApplied={load}
          warning='Setting this to “Not agreed” puts the notice back in front of every operator at those companies on their next launch, including ones who already accepted it. Setting it to “Agreed” records an acceptance nobody at that company clicked — do it only where a signed agreement covers them.'
        />
      </Grid>
    </Grid>
  )
}

export default DesktopAppTab
