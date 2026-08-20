'use client'

// The company's own Accounts page ("My Usage" on TrackVid), read here for
// someone else's company: credit balance + plan on top, and the year → month →
// day order-usage rollup below. Same figures, same column set as the seller
// sees, so a support conversation about a bill can be had from the Monitor
// without impersonating the account.
//
// Lives beside the detail page rather than in src/components/ because nothing
// outside this feature renders it; the shapes and the number formatting are in
// src/utils/usage.ts, which the company list shares.

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
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Util Imports
import {
  formatCredits,
  formatQty,
  formatRupees,
  formatUsageDay,
  type CompanyUsage,
  type UsageTotals
} from '@/utils/usage'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type UsageResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: CompanyUsage | null
}

// One row of the rollup table, flattened out of the year → month → day tree so
// the three levels render through a single code path (the FE's Accounts table
// does the same).
type Row = UsageTotals & {
  id: string
  level: 'year' | 'month' | 'day'
  label: string
}

const KpiTile = ({
  label,
  value,
  caption,
  progress,
  progressColor
}: {
  label: string
  value: string
  caption?: React.ReactNode
  progress?: number
  progressColor?: 'success' | 'warning' | 'error' | 'primary'
}) => (
  <div className='flex flex-col gap-1 rounded border plb-4 pli-4 bs-full'>
    <Typography variant='overline' color='text.disabled' className='leading-none'>
      {label}
    </Typography>
    <Typography variant='h5' color='text.primary' className='tabular-nums'>
      {value}
    </Typography>
    {caption && (
      <Typography variant='caption' color='text.secondary'>
        {caption}
      </Typography>
    )}
    {typeof progress === 'number' && (
      <LinearProgress
        variant='determinate'
        value={Math.min(Math.max(progress, 0), 100)}
        color={progressColor ?? 'primary'}
        className='mbs-auto'
      />
    )}
  </div>
)

const UsageCard = ({ companyId }: { companyId: string }) => {
  const [usage, setUsage] = useState<CompanyUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Which year / month rows are open. Seeded from the response so the newest
  // month is already expanded — a card that opens on a single "Year 2026" row
  // would answer nothing without two clicks.
  const [openYears, setOpenYears] = useState<Set<string>>(new Set())
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())

  const fetchUsage = useCallback(async () => {
    if (!companyId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/company/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      })

      const json = (await res.json().catch(() => null)) as UsageResponse | null

      if (!res.ok || !json?.isSuccess || !json.data) {
        setUsage(null)
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      setUsage(json.data)

      const newestYear = json.data.history[0]

      if (newestYear) {
        const newestMonth = newestYear.monthly[newestYear.monthly.length - 1]

        setOpenYears(new Set([String(newestYear.year)]))
        setOpenMonths(newestMonth ? new Set([`${newestYear.year}-${newestMonth.month}`]) : new Set())
      }
    } catch (err: any) {
      setUsage(null)
      setError(err?.message || 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    next.has(id) ? next.delete(id) : next.add(id)

    return next
  }

  const rows = useMemo<Row[]>(() => {
    if (!usage) return []

    return usage.history.flatMap(year => {
      const yearId = String(year.year)
      const yearRow: Row = { ...year, id: yearId, level: 'year', label: `Year ${year.year}` }

      if (!openYears.has(yearId)) return [yearRow]

      return [
        yearRow,
        ...year.monthly.flatMap(month => {
          const monthId = `${year.year}-${month.month}`
          const monthRow: Row = { ...month, id: monthId, level: 'month', label: month.monthName }

          if (!openMonths.has(monthId)) return [monthRow]

          return [
            monthRow,
            ...month.daily.map(
              (day): Row => ({
                ...day,
                id: `${monthId}-${day.date}`,
                level: 'day',
                label: formatUsageDay(day.date)
              })
            )
          ]
        })
      ]
    })
  }, [usage, openYears, openMonths])

  const credit = usage?.credit
  const total = credit?.total ?? 0
  const used = credit?.used ?? 0
  const remaining = credit?.remaining ?? Math.max(total - used, 0)
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0
  const remainingPct = total > 0 ? 100 - usedPct : 0

  return (
    <Card>
      <CardHeader
        title='Usage'
        subheader="Credit balance and order usage — the same figures the company sees on its own Accounts page"
        action={
          <Button
            size='small'
            variant='outlined'
            color='secondary'
            startIcon={<i className='tabler-refresh' />}
            disabled={loading}
            onClick={fetchUsage}
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
          <div className='flex justify-center plb-10'>
            <CircularProgress />
          </div>
        ) : !usage ? null : (
          <>
            {credit ? (
              <Grid container spacing={4} className='mbe-6'>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiTile
                    label='Remaining credit'
                    value={formatCredits(remaining)}
                    caption={`${remainingPct}% of ${formatCredits(total)} available`}
                    progress={remainingPct}
                    // The balance is the number ops is asked about, and it only
                    // matters once it is nearly gone — so it changes colour
                    // before the company runs out, not after.
                    progressColor={remainingPct <= 10 ? 'error' : remainingPct <= 25 ? 'warning' : 'success'}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiTile
                    label='Used credit'
                    value={formatCredits(used)}
                    caption={`${usedPct}% of total consumed`}
                    progress={usedPct}
                    progressColor='primary'
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiTile
                    label='Total credit'
                    value={formatCredits(total)}
                    caption={
                      usage.plan
                        ? `${formatCredits(usage.plan.credit)} plan + ${formatCredits(usage.plan.bonus)} bonus`
                        : 'No plan attached'
                    }
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiTile
                    label='Current plan'
                    value={usage.plan?.name || '—'}
                    caption={usage.plan ? `${formatRupees(usage.plan.price)} / cycle` : 'No credit plan set'}
                  />
                </Grid>
              </Grid>
            ) : (
              <Alert severity='info' className='mbe-4'>
                This company has no credit record — nothing has ever been billed to it.
              </Alert>
            )}

            {rows.length === 0 ? (
              <Typography color='text.disabled'>No orders have been processed for this company yet.</Typography>
            ) : (
              <div className='overflow-x-auto rounded border'>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th className='is-[60px] text-center'>#</th>
                      <th className='is-[180px]'>Date</th>
                      <th className='is-[140px]'>
                        CMS
                        <Typography variant='caption' color='text.disabled' component='div' className='leading-none'>
                          (Qty / Credits)
                        </Typography>
                      </th>
                      <th className='is-[150px]'>
                        Forward
                        <Typography variant='caption' color='text.disabled' component='div' className='leading-none'>
                          (Qty / Credits)
                        </Typography>
                      </th>
                      <th className='is-[150px]'>
                        Return
                        <Typography variant='caption' color='text.disabled' component='div' className='leading-none'>
                          (Qty / Credits)
                        </Typography>
                      </th>
                      <th className='is-[130px]'>Total credits</th>
                      <th className='is-[130px]'>Total orders</th>
                      <th className='is-[150px] text-right'>Effective amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td className='text-center'>
                          {row.level === 'day' ? null : (
                            <IconButton
                              size='small'
                              aria-label={`Toggle ${row.label}`}
                              onClick={() =>
                                row.level === 'year'
                                  ? setOpenYears(prev => toggle(prev, row.id))
                                  : setOpenMonths(prev => toggle(prev, row.id))
                              }
                            >
                              <i
                                className={
                                  (row.level === 'year' ? openYears : openMonths).has(row.id)
                                    ? 'tabler-minus text-base'
                                    : 'tabler-plus text-base'
                                }
                              />
                            </IconButton>
                          )}
                        </td>
                        <td>
                          <Typography
                            variant='body2'
                            color={row.level === 'day' ? 'text.secondary' : 'text.primary'}
                            className={row.level === 'year' ? 'font-medium' : ''}
                            // Indent stands in for the tree lines: a month sits
                            // under its year, a day under its month.
                            style={{ paddingInlineStart: row.level === 'month' ? 16 : row.level === 'day' ? 32 : 0 }}
                          >
                            {row.label}
                          </Typography>
                        </td>
                        <td>
                          <Typography variant='body2' className='tabular-nums'>
                            {formatQty(row.cms_orders)} / {formatCredits(row.cms_orders_credits)}
                          </Typography>
                        </td>
                        <td>
                          <Typography variant='body2' className='tabular-nums'>
                            {formatQty(row.forward_orders)} / {formatCredits(row.forward_orders_credits)}
                          </Typography>
                        </td>
                        <td>
                          <Typography variant='body2' className='tabular-nums'>
                            {formatQty(row.return_orders)} / {formatCredits(row.return_orders_credits)}
                          </Typography>
                        </td>
                        <td>
                          <Typography variant='body2' className='tabular-nums'>
                            {formatCredits(row.total_orders_credits)}
                          </Typography>
                        </td>
                        <td>
                          <Typography variant='body2' className='tabular-nums'>
                            {formatQty(row.total_orders)}
                          </Typography>
                        </td>
                        <td className='text-right'>
                          <Tooltip
                            title={
                              credit?.effectiveVariable
                                ? `${formatCredits(row.total_orders_credits)} credits × ₹${credit.effectiveVariable} per credit`
                                : 'No per-credit rate set for this company, so every effective amount is ₹0'
                            }
                          >
                            <Typography
                              variant='body2'
                              color='text.primary'
                              className={row.level === 'year' ? 'font-medium tabular-nums' : 'tabular-nums'}
                            >
                              {formatRupees(row.total_effective_amount)}
                            </Typography>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* The day a usage document belongs to is stamped at UTC midnight,
                so a late-evening IST order lands on the next day here. Said out
                loud because the totals otherwise look off by a day. */}
            <div className='flex items-center gap-2 mbs-3'>
              <Chip size='small' variant='tonal' color='secondary' label='Days are UTC' />
              <Typography variant='caption' color='text.secondary'>
                Usage is bucketed at UTC midnight, so orders placed after 05:30 IST on a day count against that day.
              </Typography>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default UsageCard
