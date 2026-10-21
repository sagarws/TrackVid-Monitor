'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

// Component Imports
import CompanyScopeSelector, {
  describeScope,
  scopePayload,
  scopeTargetCount,
  useCompanyScope
} from '@/components/CompanyScopeSelector'
import type { CompanyRoster } from '@/components/CompanyScopeSelector'

// One ACTION run against many companies' mailboxes — "fetch now", "set the
// last sync time" — rather than a stored setting.
//
// BulkFlagCard is for a value a company holds; this is for something done to
// it, so there is no On/Off pick, just whatever inputs the action needs
// (`children`) and a confirmed Run. Same scope selector and confirm discipline.

type Result = { severity: 'success' | 'error'; message: string }

type Props = {
  title: string
  subheader: string
  /** What the action does, in the operator's terms. */
  help: string
  /** Button text, e.g. "Run fetch". */
  actionLabel: string
  actionIcon: string
  totalCompanies: number
  roster: CompanyRoster
  /** Proxy route this card posts to. */
  endpoint: string
  /** The action's inputs, rendered between the scope and the Run button. */
  children?: ReactNode
  /** The action half of the body, or null while the inputs are incomplete. */
  buildPayload: () => Record<string, unknown> | null
  /** What to tell the operator when the inputs are incomplete. */
  incompleteHint?: string
  /** Success line from the response; defaults to its displayMessage. */
  describeResult?: (json: any) => string
  /** Extra warning shown in the confirm dialog. */
  warning?: string
  onApplied?: () => void
}

const BulkActionCard = ({
  title,
  subheader,
  help,
  actionLabel,
  actionIcon,
  totalCompanies,
  roster,
  endpoint,
  children,
  buildPayload,
  incompleteHint,
  describeResult,
  warning,
  onApplied
}: Props) => {
  const scope = useCompanyScope()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const currentScope = useMemo(
    () => ({ mode: scope.mode, selectedIds: scope.selectedIds }),
    [scope.mode, scope.selectedIds]
  )

  const targetCount = scopeTargetCount(currentScope, totalCompanies)
  const payload = buildPayload()

  // "For Only" with nothing ticked would post an empty `companyIds`, which the
  // endpoint refuses — caught here so the operator is told before the round trip.
  const scopeEmpty = scope.mode === 'only' && scope.selectedIds.length === 0
  const canRun = payload !== null && !scopeEmpty && !submitting

  const run = useCallback(async () => {
    if (payload === null) return

    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...scopePayload(currentScope), ...payload })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setResult({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Request failed (${res.status})`
        })

        return
      }

      setResult({
        severity: 'success',
        message: describeResult ? describeResult(json) : json?.displayMessage || 'Done'
      })
      onApplied?.()
    } catch (err) {
      setResult({ severity: 'error', message: err instanceof Error ? err.message : 'Request failed' })
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }, [currentScope, describeResult, endpoint, onApplied, payload])

  return (
    <Card>
      <CardHeader title={title} subheader={subheader} />
      <Divider />
      <CardContent className='flex flex-col gap-5'>
        <Typography variant='body2' color='text.secondary'>
          {help}
        </Typography>

        <CompanyScopeSelector roster={roster} scope={scope} totalCompanies={totalCompanies} disabled={submitting} />

        {children && (
          <>
            <Divider />
            {children}
          </>
        )}

        {result && <Alert severity={result.severity}>{result.message}</Alert>}

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Typography variant='body2' color='text.secondary'>
            {payload === null
              ? incompleteHint
              : scopeEmpty
                ? 'Tick at least one company, or switch to Except.'
                : describeScope(currentScope, totalCompanies)}
          </Typography>
          <Button
            variant='contained'
            disabled={!canRun}
            startIcon={submitting ? <CircularProgress size={16} color='inherit' /> : <i className={actionIcon} />}
            onClick={() => setConfirmOpen(true)}
          >
            {actionLabel} for {targetCount} compan{targetCount === 1 ? 'y' : 'ies'}
          </Button>
        </div>
      </CardContent>

      {/* Confirmed rather than run straight away: it reaches every mailbox of
          every company in scope, and the scope is not visible from the button. */}
      <Dialog open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>{title}?</DialogTitle>
        <DialogContent className='flex flex-col gap-4'>
          <Alert severity={scope.mode === 'except' ? 'warning' : 'info'}>
            {describeScope(currentScope, totalCompanies)} — every mailbox of about {targetCount} compan
            {targetCount === 1 ? 'y' : 'ies'}.
          </Alert>
          {warning && <Alert severity='warning'>{warning}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button color='secondary' disabled={submitting} onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant='contained'
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color='inherit' /> : undefined}
            onClick={() => void run()}
          >
            {actionLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default BulkActionCard
