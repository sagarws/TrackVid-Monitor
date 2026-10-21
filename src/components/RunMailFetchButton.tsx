'use client'

// React Imports
import { useCallback, useRef, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'

// "Run mail fetch" for ONE company — the BE's Email polling cron cycle
// (POST /system-admin/mailbox/run-polling-cycle) narrowed to this company's
// mailboxes. The bulk version is Bulk Management → Email Automation.
//
// Company-level, like the fetch folder: the state lives in `useRunMailFetch`,
// called once per company, so a company with two mailbox rows shows one
// spinner on both rather than two independent buttons.

type ToastFn = (toast: { severity: 'success' | 'error' | 'warning'; message: string }) => void

export type RunMailFetchState = { running: boolean; run: () => Promise<void> }

export const useRunMailFetch = (companyId: string, onToast?: ToastFn): RunMailFetchState => {
  const [running, setRunning] = useState(false)

  // Read through a ref so a parent passing a fresh arrow each render does not
  // change `run`'s identity.
  const toastRef = useRef(onToast)

  toastRef.current = onToast

  const run = useCallback(async () => {
    if (!companyId) return

    setRunning(true)

    try {
      const res = await fetch('/api/company/mailbox-polling-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ companyIds: [companyId] })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        toastRef.current?.({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Request failed (${res.status})`
        })

        return
      }

      const d = json?.data ?? {}

      // 0 queued is a normal outcome — the mailbox was fetched in the last few
      // minutes with nothing pending — so it is a warning that says why, not an
      // error.
      toastRef.current?.(
        Number(d.enqueued ?? 0) > 0
          ? { severity: 'success', message: `${d.enqueued} of ${d.total} mailbox(es) queued for fetch` }
          : {
              severity: 'warning',
              message:
                Number(d.total ?? 0) === 0
                  ? 'No connected mailbox for this company'
                  : `Nothing queued — ${d.total} mailbox(es) not due yet. Use Restart job to force one.`
            }
      )
    } catch (err) {
      toastRef.current?.({ severity: 'error', message: err instanceof Error ? err.message : 'Could not run the fetch' })
    } finally {
      setRunning(false)
    }
  }, [companyId])

  return { running, run }
}

const RunMailFetchButton = ({ state }: { state: RunMailFetchState }) => (
  <Tooltip
    placement='top'
    title='Run the mail polling cycle now for this company — queues a fetch (and auto-reply) for each connected mailbox that is due'
  >
    <span>
      <Button
        size='small'
        variant='tonal'
        color='primary'
        disabled={state.running}
        startIcon={state.running ? <CircularProgress size={14} color='inherit' /> : <i className='tabler-mail-down' />}
        onClick={() => void state.run()}
      >
        Run fetch
      </Button>
    </span>
  </Tooltip>
)

export default RunMailFetchButton
