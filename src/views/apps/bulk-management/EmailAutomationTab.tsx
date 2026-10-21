'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Component Imports
import BulkActionCard from './BulkActionCard'
import BulkFlagCard from './BulkFlagCard'
import { useCompanyRoster } from '@/components/CompanyScopeSelector'
import CustomTextField from '@core/components/mui/TextField'
import AppReactDatepicker from '@/libs/styles/AppReactDatepicker'

// Bulk settings for the AJIO email automation.
//
//   emailAutomation.mailFetchFolder  which folder the mail sync searches:
//                                    "inbox" (default) or "allMail"
//   Run mail fetch now               the BE's Email polling cron cycle, for the
//                                    companies in scope (an action, not a setting)
//   Mailbox last sync time           inboxSync.lastSyncedAt on every mailbox in scope
//
// Two values today, so it rides BulkFlagCard: "All Mail" is the on side,
// "Inbox" the off side. If the server ever accepts a third folder this card
// needs its own picker — the BE already returns `options` for that.

const ALL_MAIL = 'allMail'
const INBOX = 'inbox'

type Summary = { totalCompanies: number; allMailCount: number | null }

const EMPTY: Summary = { totalCompanies: 0, allMailCount: null }

const EmailAutomationTab = () => {
  const [summary, setSummary] = useState<Summary>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roster = useCompanyRoster()

  // The bulk last-sync card's input. null until picked: there is no safe default
  // for "read mail from" across many companies.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // No companyId: the endpoint answers with per-folder counts across every
      // company rather than one company's folder.
      const res = await fetch('/api/company/mail-fetch-folder', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const allMail = json?.data?.counts?.[ALL_MAIL]

      setSummary({
        totalCompanies: Number(json?.data?.totalCompanies ?? 0),
        allMailCount: typeof allMail === 'number' ? allMail : null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the email automation settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const buildPayload = useCallback((allMail: boolean) => ({ mailFetchFolder: allMail ? ALL_MAIL : INBOX }), [])

  const buildPollingPayload = useCallback(() => ({}), [])

  const buildLastSyncPayload = useCallback(
    () => (lastSyncedAt ? { lastSyncedAt: lastSyncedAt.toISOString() } : null),
    [lastSyncedAt]
  )

  const describePolling = useCallback((json: any) => {
    const d = json?.data ?? {}
    const failed = Array.isArray(d.failed) ? d.failed.length : 0

    // "0 queued" on a success is normal — every mailbox was fetched recently —
    // so say how many were skipped rather than leave it reading as a failure.
    return (
      `${d.enqueued ?? 0} of ${d.total ?? 0} connected mailbox(es) queued for fetch` +
      `, ${d.skipped ?? 0} skipped as not due` +
      (failed ? `, ${failed} failed` : '') +
      '.'
    )
  }, [])

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Typography variant='body2' color='text.secondary'>
            Settings the AJIO email automation reads on its next mail sync. Each card has its own company scope.
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
          title='Mail fetch folder'
          subheader='settings.emailAutomation.mailFetchFolder — per company, applies to every mailbox'
          help='Which folder the AJIO email automation searches. Inbox is the default. All Mail (Gmail only) also finds AJIO mail that a Gmail filter archived out of the inbox; Outlook and Zoho mailboxes always read the inbox whatever this says.'
          onLabel='All Mail'
          offLabel='Inbox'
          enabledCount={summary.allMailCount}
          countNoun='on All Mail'
          totalCompanies={summary.totalCompanies}
          roster={roster}
          endpoint='/api/company/mail-fetch-folder'
          buildPayload={buildPayload}
          onApplied={load}
          warning='All Mail widens what each sync walks — archived and sent mail too — so the first sync after switching can take longer and pick up older AJIO mail. Inbox stops finding mail that a Gmail filter archives.'
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkActionCard
          title='Run mail fetch now'
          subheader='The Email polling cron cycle — queue a fetch, then the auto-reply'
          help='Runs the same cycle the server’s polling cron runs every minute, now, for the companies in scope. Only connected mailboxes that are due are queued — one fetched in the last few minutes with nothing pending is skipped, exactly as the cron skips it. Use Restart job on a mailbox to force it.'
          actionLabel='Run fetch'
          actionIcon='tabler-mail-down'
          totalCompanies={summary.totalCompanies}
          roster={roster}
          endpoint='/api/company/mailbox-polling-cycle'
          buildPayload={buildPollingPayload}
          describeResult={describePolling}
          warning='Queued mailboxes are fetched and replied to by the email worker straight away — this sends AJIO auto-replies for any new mail it finds.'
        />
      </Grid>

      <Grid size={{ xs: 12 }}>
        <BulkActionCard
          title='Mailbox last sync time'
          subheader='inboxSync.lastSyncedAt — on every mailbox of each company in scope'
          help='The point each mailbox reads mail forward from on its next sync. Move it back to re-read a window of mail; move it forward to skip a backlog. A mailbox is never set earlier than the time it was connected.'
          actionLabel='Set sync time'
          actionIcon='tabler-calendar-clock'
          totalCompanies={summary.totalCompanies}
          roster={roster}
          endpoint='/api/company/mailbox-bulk-last-sync'
          buildPayload={buildLastSyncPayload}
          incompleteHint='Pick a last sync time.'
          onApplied={() => setLastSyncedAt(null)}
          warning='Moving it back makes the next sync re-read that mail, and auto-reply to any AJIO mail in the window that was not replied to before. Moving it forward means mail before that time is never read.'
        >
          <div className='flex flex-wrap items-center gap-2'>
            <div className='max-is-[280px]'>
              <AppReactDatepicker
                selected={lastSyncedAt}
                onChange={(date: Date | null) => setLastSyncedAt(date)}
                showTimeSelect
                timeIntervals={15}
                dateFormat='dd MMM yyyy, h:mm aa'
                // A future time would silently mute every mailbox until it passed.
                maxDate={new Date()}
                customInput={<CustomTextField fullWidth label='Last synced at' />}
              />
            </div>
            <Button size='small' variant='tonal' color='secondary' onClick={() => setLastSyncedAt(new Date())}>
              Now
            </Button>
          </div>
        </BulkActionCard>
      </Grid>
    </Grid>
  )
}

export default EmailAutomationTab
