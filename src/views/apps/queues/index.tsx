'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

// A queue as /system-admin/queues/list reports it. `reachable: false` means the
// queue itself answered with an error (Redis down, wrong connection) — reported
// per queue so one bad connection cannot blank the page.
type QueueSummary = {
  name: string
  label: string
  description: string
  counts: Record<string, number>
  isPaused: boolean
  // BullMQ 5 global concurrency. null = unset, so each worker's own setting
  // applies — which is not the same as 0.
  concurrency: number | null
  // Consumers attached right now. Zero means nothing is running this queue —
  // jobs will sit in Waiting forever rather than being slow.
  workerCount: number
  workerNames: string[]
  reachable: boolean
  error: string | null
}

// Queue-level operations, mirroring Bull Board's kebab menu. `reset` is
// obliterate: it is the only irreversible one, so it is separated visually and
// gated behind typing the queue name.
type QueueAction = 'pause' | 'resume' | 'empty' | 'reset' | 'set-concurrency' | 'add-job'

type QueueJob = {
  id: string
  name: string
  data: string
  attemptsMade: number
  timestamp: number | null
  processedOn: number | null
  finishedOn: number | null
  delay: number
  progress: number | null
  failedReason: string | null
  stacktrace: string[]
}

const STATUSES = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'] as const

type Status = (typeof STATUSES)[number]

const STATUS_COLOR: Record<Status, 'default' | 'info' | 'warning' | 'success' | 'error' | 'secondary'> = {
  waiting: 'warning',
  active: 'info',
  delayed: 'secondary',
  completed: 'success',
  failed: 'error',
  paused: 'default'
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

const formatWhen = (ms: number | null) => {
  if (!ms) return '—'
  const d = new Date(ms)

  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { hour12: true })
}

const formatDuration = (from: number | null, to: number | null) => {
  if (!from || !to || to < from) return '—'
  const secs = Math.round((to - from) / 1000)

  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
}

type Toast = { severity: 'success' | 'error' | 'warning'; message: string }

const QueuesView = () => {
  const [queues, setQueues] = useState<QueueSummary[]>([])
  const [queuesLoading, setQueuesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeQueue, setActiveQueue] = useState<string>('mailbox-fetch')
  const [status, setStatus] = useState<Status>('waiting')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(25)

  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [acting, setActing] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // ── Queue-level menu ────────────────────────────────────────────────────
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  // Which action's dialog is open. pause/resume need no dialog and fire
  // straight from the menu.
  const [dialog, setDialog] = useState<null | 'empty' | 'reset' | 'set-concurrency' | 'add-job'>(null)
  const [concurrencyValue, setConcurrencyValue] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [jobName, setJobName] = useState('manual')
  const [jobData, setJobData] = useState('{}')

  const fetchQueues = useCallback(async () => {
    setQueuesLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/queues/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setQueues([])
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      const list: QueueSummary[] = Array.isArray(json?.data?.queues) ? json.data.queues : []

      setQueues(list)

      // Keep the selection valid if the registry ever changes underneath.
      if (list.length > 0 && !list.some(q => q.name === activeQueue)) setActiveQueue(list[0].name)
    } catch (err: any) {
      setQueues([])
      setError(err?.message || 'Failed to load queues')
    } finally {
      setQueuesLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true)

    try {
      const res = await fetch('/api/queues/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: activeQueue, status, start: page * pageSize, size: pageSize })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setJobs([])
        setToast({ severity: 'error', message: json?.displayMessage || json?.message || `Request failed (${res.status})` })

        return
      }

      setJobs(Array.isArray(json?.data?.jobs) ? json.data.jobs : [])
      setCounts(json?.data?.counts ?? {})
    } catch (err: any) {
      setJobs([])
      setToast({ severity: 'error', message: err?.message || 'Failed to load jobs' })
    } finally {
      setJobsLoading(false)
    }
  }, [activeQueue, status, page, pageSize])

  useEffect(() => {
    fetchQueues()
  }, [fetchQueues])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Selection is per queue+status: the same job id can exist in another queue,
  // and acting on a stale selection after switching tabs would be a surprise.
  useEffect(() => {
    setSelected({})
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, status])

  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected])

  const runAction = async (action: 'retry' | 'remove' | 'promote', ids: string[]) => {
    if (ids.length === 0) return

    setActing(true)

    try {
      const res = await fetch('/api/queues/job-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: activeQueue, action, jobIds: ids })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json) {
        setToast({ severity: 'error', message: `Request failed (${res.status})` })

        return
      }

      const failed = json.data?.failed ?? 0

      setToast({
        severity: failed > 0 ? 'warning' : 'success',
        message: json.displayMessage || json.message || 'Done'
      })

      setSelected({})
      fetchJobs()
      fetchQueues()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Action failed' })
    } finally {
      setActing(false)
    }
  }

  const runQueueAction = async (action: QueueAction, extra: Record<string, unknown> = {}) => {
    setActing(true)

    try {
      const res = await fetch('/api/queues/queue-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: activeQueue, action, ...extra })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setToast({ severity: 'error', message: json?.displayMessage || json?.message || `Request failed (${res.status})` })

        return
      }

      setToast({ severity: 'success', message: json.displayMessage || json.message || 'Done' })
      setDialog(null)
      setResetConfirm('')
      fetchQueues()
      fetchJobs()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Action failed' })
    } finally {
      setActing(false)
    }
  }

  const current = queues.find(q => q.name === activeQueue)
  const total = Number(counts[status] ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader
          title='Queues'
          subheader='BullMQ job queues — the same view as Bull Board, behind the Monitor session'
          action={
            <Button
              size='small'
              variant='outlined'
              color='secondary'
              startIcon={<i className='tabler-refresh' />}
              disabled={queuesLoading}
              onClick={() => {
                fetchQueues()
                fetchJobs()
              }}
            >
              Refresh
            </Button>
          }
        />
        <CardContent>
          {error && (
            <Alert severity='error' className='mbe-4'>
              {error}
            </Alert>
          )}
          {queuesLoading ? (
            <div className='flex justify-center py-6'>
              <CircularProgress size={22} />
            </div>
          ) : (
            <div className='flex flex-wrap gap-4'>
              {queues.map(queue => {
                const isActive = queue.name === activeQueue
                const failed = Number(queue.counts?.failed ?? 0)

                return (
                  <div
                    key={queue.name}
                    role='button'
                    tabIndex={0}
                    onClick={() => setActiveQueue(queue.name)}
                    onKeyDown={e => e.key === 'Enter' && setActiveQueue(queue.name)}
                    className={`flex flex-col gap-2 rounded border plb-3 pli-4 cursor-pointer transition-colors min-is-[240px] ${
                      isActive ? 'bg-primaryLight border-primary' : 'hover:bg-actionHover'
                    }`}
                  >
                    <div className='flex items-center gap-2 flex-wrap'>
                      <Typography color='text.primary' className='font-medium'>
                        {queue.label}
                      </Typography>
                      {queue.isPaused && <Chip size='small' variant='tonal' color='warning' label='Paused' />}
                      {!queue.reachable && <Chip size='small' variant='tonal' color='error' label='Unreachable' />}
                      {/* The signal that separates "backed up" from "nothing is
                          running this at all". Without it a correctly-queued job
                          with no consumer looks identical to a stuck one. */}
                      {queue.reachable && queue.workerCount === 0 && (
                        <Tooltip title='No process is consuming this queue — jobs will stay in Waiting until a worker starts'>
                          <Chip size='small' variant='tonal' color='error' label='No workers attached' />
                        </Tooltip>
                      )}
                      {queue.reachable && queue.workerCount > 0 && (
                        <Tooltip title={queue.workerNames.join(', ') || 'Attached workers'}>
                          <Chip
                            size='small'
                            variant='tonal'
                            color='success'
                            label={`${queue.workerCount} worker${queue.workerCount === 1 ? '' : 's'}`}
                          />
                        </Tooltip>
                      )}
                    </div>
                    <Typography variant='caption' color='text.secondary'>
                      {queue.error || queue.description}
                    </Typography>
                    <div className='flex flex-wrap gap-1'>
                      {STATUSES.map(s => {
                        const n = Number(queue.counts?.[s] ?? 0)

                        // Zero counts are dropped except failed, which is worth
                        // seeing as an explicit 0 rather than inferred silence.
                        if (n === 0 && s !== 'failed') return null

                        return (
                          <Chip
                            key={s}
                            size='small'
                            variant='tonal'
                            color={n === 0 ? 'secondary' : STATUS_COLOR[s]}
                            label={`${s} ${n}`}
                          />
                        )
                      })}
                    </div>
                    {/* Named explicitly because it is the case that reads as a
                        bug: jobs queued, nothing consuming them. */}
                    {queue.reachable && queue.workerCount === 0 && Number(queue.counts?.waiting ?? 0) > 0 && (
                      <Typography variant='caption' color='error.main'>
                        {queue.counts.waiting} job(s) waiting with no worker running — start the worker process, or
                        check whether a runtime guard refused to start it
                      </Typography>
                    )}
                    {failed > 0 && isActive && (
                      <Typography variant='caption' color='error.main'>
                        {failed} failed job{failed === 1 ? '' : 's'} — open the Failed tab to retry
                      </Typography>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title={current?.label ?? activeQueue}
          subheader={current?.description}
          action={
            <div className='flex items-center gap-2'>
              {selectedIds.length > 0 && (
                <>
                  {status === 'failed' && (
                    <Button
                      size='small'
                      variant='contained'
                      color='primary'
                      disabled={acting}
                      startIcon={acting ? <CircularProgress size={14} color='inherit' /> : <i className='tabler-refresh' />}
                      onClick={() => runAction('retry', selectedIds)}
                    >
                      Retry ({selectedIds.length})
                    </Button>
                  )}
                  {status === 'delayed' && (
                    <Button
                      size='small'
                      variant='outlined'
                      color='secondary'
                      disabled={acting}
                      startIcon={<i className='tabler-player-track-next' />}
                      onClick={() => runAction('promote', selectedIds)}
                    >
                      Promote ({selectedIds.length})
                    </Button>
                  )}
                  <Button
                    size='small'
                    variant='outlined'
                    color='error'
                    disabled={acting}
                    startIcon={<i className='tabler-trash' />}
                    onClick={() => runAction('remove', selectedIds)}
                  >
                    Remove ({selectedIds.length})
                  </Button>
                </>
              )}
              <CustomTextField
                select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
                className='is-[90px]'
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <MenuItem key={size} value={size}>
                    {size}
                  </MenuItem>
                ))}
              </CustomTextField>
              <Tooltip title='Queue actions'>
                <IconButton onClick={e => setMenuAnchor(e.currentTarget)} aria-label='Queue actions'>
                  <i className='tabler-dots-vertical' />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setJobName('manual')
                    setJobData('{}')
                    setDialog('add-job')
                  }}
                >
                  <i className='tabler-square-plus text-base mie-2' /> Add job
                </MenuItem>
                {/* One entry, not two: a queue is either paused or it is not,
                    and offering the inapplicable one is a dead click. */}
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    runQueueAction(current?.isPaused ? 'resume' : 'pause')
                  }}
                >
                  <i className={`${current?.isPaused ? 'tabler-player-play' : 'tabler-player-pause'} text-base mie-2`} />
                  {current?.isPaused ? 'Resume' : 'Pause'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setConcurrencyValue(current?.concurrency != null ? String(current.concurrency) : '')
                    setDialog('set-concurrency')
                  }}
                >
                  <i className='tabler-adjustments-horizontal text-base mie-2' /> Set concurrency
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setDialog('empty')
                  }}
                >
                  <i className='tabler-trash text-base mie-2' /> Empty
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setResetConfirm('')
                    setDialog('reset')
                  }}
                  className='text-error'
                >
                  <i className='tabler-alert-triangle text-base mie-2' /> Reset queue
                </MenuItem>
              </Menu>
            </div>
          }
        />
        {(current?.isPaused || current?.concurrency != null) && (
          <div className='flex items-center gap-2 flex-wrap pli-6 pbe-3'>
            {current?.isPaused && (
              <Chip
                size='small'
                variant='tonal'
                color='warning'
                label='Paused — workers are not taking new jobs'
              />
            )}
            {current?.concurrency != null && (
              <Chip size='small' variant='tonal' color='info' label={`Global concurrency: ${current.concurrency}`} />
            )}
          </div>
        )}
        <Tabs
          value={status}
          onChange={(_, value) => setStatus(value as Status)}
          variant='scrollable'
          scrollButtons='auto'
          className='border-be'
        >
          {STATUSES.map(s => (
            <Tab key={s} value={s} label={`${s} (${Number(counts[s] ?? 0)})`} className='capitalize' />
          ))}
        </Tabs>
        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th className='is-[60px]'>
                  <Checkbox
                    disabled={jobs.length === 0}
                    checked={jobs.length > 0 && jobs.every(j => selected[j.id])}
                    indeterminate={jobs.some(j => selected[j.id]) && !jobs.every(j => selected[j.id])}
                    onChange={() =>
                      setSelected(prev => {
                        const allOn = jobs.every(j => prev[j.id])
                        const next = { ...prev }

                        for (const job of jobs) {
                          if (allOn) delete next[job.id]
                          else next[job.id] = true
                        }

                        return next
                      })
                    }
                  />
                </th>
                <th className='is-[110px]'>Job</th>
                <th className='is-[160px]'>Name</th>
                <th className='is-[180px]'>Created</th>
                <th className='is-[110px]'>Duration</th>
                <th className='is-[90px] text-center'>Tries</th>
                <th>Payload / error</th>
                <th className='is-[110px] text-center'>Actions</th>
              </tr>
            </thead>
            {jobsLoading ? (
              <tbody>
                <tr>
                  <td colSpan={8} className='text-center'>
                    <div className='flex justify-center py-6'>
                      <CircularProgress size={22} />
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : jobs.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8} className='text-center'>
                    No {status} jobs
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>
                      <Checkbox
                        checked={Boolean(selected[job.id])}
                        onChange={() =>
                          setSelected(prev => {
                            const next = { ...prev }

                            if (next[job.id]) delete next[job.id]
                            else next[job.id] = true

                            return next
                          })
                        }
                      />
                    </td>
                    <td>
                      <Typography variant='body2' color='text.primary' className='font-mono break-all'>
                        {job.id}
                      </Typography>
                    </td>
                    <td>
                      <Typography variant='body2'>{job.name}</Typography>
                    </td>
                    <td>
                      <Typography variant='body2' color='text.secondary' className='whitespace-nowrap'>
                        {formatWhen(job.timestamp)}
                      </Typography>
                    </td>
                    <td>
                      <Typography variant='body2' color='text.secondary'>
                        {formatDuration(job.processedOn, job.finishedOn)}
                      </Typography>
                    </td>
                    <td className='text-center'>
                      <Typography variant='body2' className='tabular-nums'>
                        {job.attemptsMade}
                      </Typography>
                    </td>
                    <td>
                      {job.failedReason ? (
                        <Typography variant='body2' color='error.main' className='break-all'>
                          {job.failedReason}
                        </Typography>
                      ) : (
                        <Typography
                          variant='body2'
                          color='text.secondary'
                          className={expanded[job.id] ? 'break-all font-mono text-xs' : 'truncate font-mono text-xs max-is-[420px]'}
                        >
                          {job.data}
                        </Typography>
                      )}
                      {(job.data?.length > 60 || job.stacktrace.length > 0) && (
                        <Button
                          size='small'
                          color='secondary'
                          onClick={() => setExpanded(prev => ({ ...prev, [job.id]: !prev[job.id] }))}
                        >
                          {expanded[job.id] ? 'Less' : 'More'}
                        </Button>
                      )}
                      {expanded[job.id] && job.stacktrace.length > 0 && (
                        <pre className='bg-actionHover rounded plb-2 pli-3 mbs-2 overflow-auto max-bs-[200px] text-xs whitespace-pre-wrap'>
                          {job.stacktrace.join('\n')}
                        </pre>
                      )}
                    </td>
                    <td className='text-center'>
                      <div className='flex items-center justify-center'>
                        {status === 'failed' && (
                          <Tooltip title='Retry this job'>
                            <span>
                              <IconButton size='small' disabled={acting} onClick={() => runAction('retry', [job.id])}>
                                <i className='tabler-refresh text-base' />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {status === 'delayed' && (
                          <Tooltip title='Run now instead of waiting out the delay'>
                            <span>
                              <IconButton size='small' disabled={acting} onClick={() => runAction('promote', [job.id])}>
                                <i className='tabler-player-track-next text-base' />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        <Tooltip title='Remove this job from the queue'>
                          <span>
                            <IconButton size='small' disabled={acting} onClick={() => runAction('remove', [job.id])}>
                              <i className='tabler-trash text-base' />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <Divider />
        <div className='flex justify-between items-center flex-wrap pli-6 plb-3 gap-2'>
          <Typography color='text.disabled'>
            {total === 0
              ? 'No jobs'
              : `Showing ${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, total)} of ${total}`}
          </Typography>
          <Pagination
            shape='rounded'
            color='primary'
            variant='tonal'
            count={totalPages}
            page={page + 1}
            onChange={(_, p) => setPage(p - 1)}
            showFirstButton
            showLastButton
          />
        </div>
      </Card>

      <Dialog open={Boolean(dialog)} onClose={() => (acting ? null : setDialog(null))} maxWidth='xs' fullWidth>
        <DialogTitle>
          {dialog === 'add-job' && 'Add job'}
          {dialog === 'set-concurrency' && 'Set concurrency'}
          {dialog === 'empty' && 'Empty queue'}
          {dialog === 'reset' && 'Reset queue'}
        </DialogTitle>
        <DialogContent>
          <div className='flex flex-col gap-4 pbs-2'>
            {dialog === 'add-job' && (
              <>
                <Typography variant='body2'>
                  Enqueue a job on <strong>{current?.label}</strong> by hand — useful for replaying a payload copied
                  from the table below.
                </Typography>
                <CustomTextField fullWidth label='Job name' value={jobName} onChange={e => setJobName(e.target.value)} />
                <CustomTextField
                  fullWidth
                  multiline
                  minRows={4}
                  label='Payload (JSON)'
                  value={jobData}
                  onChange={e => setJobData(e.target.value)}
                  placeholder='{ "mailboxId": "..." }'
                />
              </>
            )}

            {dialog === 'set-concurrency' && (
              <>
                <Typography variant='body2'>
                  How many jobs <strong>{current?.label}</strong> may run at once across every worker.
                </Typography>
                <CustomTextField
                  fullWidth
                  type='number'
                  label='Global concurrency'
                  value={concurrencyValue}
                  onChange={e => setConcurrencyValue(e.target.value)}
                  placeholder='e.g. 5'
                />
                <Typography variant='caption' color='text.secondary'>
                  0 clears the global limit and hands control back to each worker&apos;s own concurrency setting.
                  Currently {current?.concurrency != null ? current.concurrency : 'unset'}.
                </Typography>
              </>
            )}

            {dialog === 'empty' && (
              <>
                <Typography variant='body2'>
                  Drop every <strong>waiting</strong> and <strong>delayed</strong> job on {current?.label}. Jobs already
                  running are left to finish.
                </Typography>
                <Alert severity='warning'>
                  {Number(counts.waiting ?? 0) + Number(counts.delayed ?? 0)} job(s) would be dropped. Delayed retries
                  go too — otherwise they refill the queue minutes later.
                </Alert>
              </>
            )}

            {dialog === 'reset' && (
              <>
                <Typography variant='body2'>
                  Remove <strong>{current?.label}</strong> and every job in it, including jobs currently running.
                </Typography>
                <Alert severity='error'>
                  This cannot be undone, and it discards in-flight work for every company on this queue.
                </Alert>
                <CustomTextField
                  fullWidth
                  label={`Type "${activeQueue}" to confirm`}
                  value={resetConfirm}
                  onChange={e => setResetConfirm(e.target.value)}
                />
              </>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button color='secondary' onClick={() => setDialog(null)} disabled={acting}>
            Cancel
          </Button>
          <Button
            variant='contained'
            color={dialog === 'reset' || dialog === 'empty' ? 'error' : 'primary'}
            disabled={
              acting ||
              (dialog === 'reset' && resetConfirm !== activeQueue) ||
              (dialog === 'set-concurrency' && concurrencyValue.trim() === '')
            }
            onClick={() => {
              if (dialog === 'add-job') runQueueAction('add-job', { jobName, jobData })
              else if (dialog === 'set-concurrency') runQueueAction('set-concurrency', { concurrency: Number(concurrencyValue) })
              else if (dialog === 'empty') runQueueAction('empty')
              else if (dialog === 'reset') runQueueAction('reset', { confirm: resetConfirm })
            }}
          >
            {acting ? (
              <CircularProgress size={20} color='inherit' />
            ) : dialog === 'add-job' ? (
              'Add job'
            ) : dialog === 'set-concurrency' ? (
              'Save'
            ) : dialog === 'empty' ? (
              'Empty queue'
            ) : (
              'Reset queue'
            )}
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

export default QueuesView
