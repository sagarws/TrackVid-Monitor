'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

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
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

// Component Imports
import CompanyScopeSelector, {
  describeScope,
  scopePayload,
  scopeTargetCount,
  useCompanyScope
} from '@/components/CompanyScopeSelector'
import type { CompanyRoster } from '@/components/CompanyScopeSelector'

// One company-level boolean, applied to many companies at once.
//
// The sibling BulkSettingCard drives a platform × automation grid; a setting
// like `cmsTermsAgreed` has no platform dimension at all — it is a single flag
// on the company — so a grid of one cell would be all frame and no content.
//
// Same discipline as that card, though: nothing is written until a value is
// picked (there is no "no change" to send), the scope is per card, and the
// cross-company write is confirmed before it goes out.

type Result = { severity: 'success' | 'error'; message: string }

type Props = {
  title: string
  subheader: string
  /** What the setting does, in the operator's terms. */
  help: string
  /** The two values, named as the operator thinks of them. */
  onLabel: string
  offLabel: string
  /** How many companies are on the `true` side today, or null when unknown. */
  enabledCount: number | null
  /** Noun for the counter chip, e.g. "agreed". */
  countNoun: string
  totalCompanies: number
  roster: CompanyRoster
  /** Proxy route this card writes through. */
  endpoint: string
  /** The setting half of the request body. */
  buildPayload: (value: boolean) => Record<string, unknown>
  /** Fired after a successful write so the caller can refresh the count. */
  onApplied?: () => void
  /** Extra warning shown in the confirm dialog. */
  warning?: string
}

const BulkFlagCard = ({
  title,
  subheader,
  help,
  onLabel,
  offLabel,
  enabledCount,
  countNoun,
  totalCompanies,
  roster,
  endpoint,
  buildPayload,
  onApplied,
  warning
}: Props) => {
  const scope = useCompanyScope()

  // null until the operator picks a side. Defaulting to either one would make
  // the Apply button meaningful before anybody said which way to write.
  const [value, setValue] = useState<boolean | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  // Memoised because `apply` closes over it: a fresh object literal every
  // render would rebuild that callback on every keystroke in the scope search.
  const currentScope = useMemo(
    () => ({ mode: scope.mode, selectedIds: scope.selectedIds }),
    [scope.mode, scope.selectedIds]
  )

  const targetCount = scopeTargetCount(currentScope, totalCompanies)

  // "For Only" with nothing ticked would post an empty `companyIds`, which the
  // endpoint refuses outright — caught here so the operator is told before the
  // round trip rather than by a 400.
  const scopeEmpty = scope.mode === 'only' && scope.selectedIds.length === 0
  const canApply = value !== null && !scopeEmpty && !submitting

  const apply = useCallback(async () => {
    if (value === null) return

    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...scopePayload(currentScope), ...buildPayload(value) })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setResult({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Request failed (${res.status})`
        })

        return
      }

      const matched = Number(json?.data?.matched ?? 0)
      const modified = Number(json?.data?.modified ?? 0)

      setResult({
        severity: 'success',
        // `matched` and `modified` both matter: a company already holding the
        // value is matched but not modified, and "updated 0" on a successful
        // write otherwise reads as a failure.
        message: `Set “${value ? onLabel : offLabel}” on ${matched} compan${matched === 1 ? 'y' : 'ies'} (${modified} changed).`
      })
      setValue(null)
      onApplied?.()
    } catch (err) {
      setResult({ severity: 'error', message: err instanceof Error ? err.message : 'Could not apply the setting' })
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }, [buildPayload, currentScope, endpoint, offLabel, onApplied, onLabel, value])

  return (
    <Card>
      <CardHeader
        title={title}
        subheader={subheader}
        action={
          typeof enabledCount === 'number' && totalCompanies > 0 ? (
            <Chip
              size='small'
              variant='tonal'
              color='primary'
              label={`${enabledCount}/${totalCompanies} ${countNoun}`}
            />
          ) : undefined
        }
      />
      <Divider />
      <CardContent className='flex flex-col gap-5'>
        <Typography variant='body2' color='text.secondary'>
          {help}
        </Typography>

        <CompanyScopeSelector roster={roster} scope={scope} totalCompanies={totalCompanies} disabled={submitting} />

        <Divider />

        <div className='flex flex-wrap items-center gap-4'>
          <Typography variant='body2' color='text.secondary'>
            New value
          </Typography>
          <ToggleButtonGroup
            exclusive
            size='small'
            value={value === null ? null : value ? 'on' : 'off'}
            disabled={submitting}
            // Coloured by what is picked rather than one fixed colour, so the
            // card reads as "this is going on" / "this is going off" at a
            // glance — same idea as the grid card's cells.
            color={value === false ? 'error' : value === true ? 'success' : 'standard'}
            onChange={(_event, next) => {
              // `null` when the active button is re-clicked; treat it as
              // clearing the pick rather than an invalid empty state.
              if (next === null) setValue(null)
              else setValue(next === 'on')
            }}
          >
            <ToggleButton value='on' className='plb-1 pli-4'>
              <i className='tabler-check text-base mie-2' />
              {onLabel}
            </ToggleButton>
            <ToggleButton value='off' className='plb-1 pli-4'>
              <i className='tabler-x text-base mie-2' />
              {offLabel}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        {result && <Alert severity={result.severity}>{result.message}</Alert>}

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Typography variant='body2' color='text.secondary'>
            {value === null
              ? `Pick ${onLabel} or ${offLabel}.`
              : scopeEmpty
                ? 'Tick at least one company, or switch to Except.'
                : `${value ? onLabel : offLabel} → ${describeScope(currentScope, totalCompanies)}`}
          </Typography>
          <Button
            variant='contained'
            disabled={!canApply}
            startIcon={
              submitting ? <CircularProgress size={16} color='inherit' /> : <i className='tabler-device-floppy' />
            }
            onClick={() => setConfirmOpen(true)}
          >
            Apply to {targetCount} compan{targetCount === 1 ? 'y' : 'ies'}
          </Button>
        </div>
      </CardContent>

      {/* Confirmed rather than applied straight away: this is a cross-company
          write with no undo, and the scope it lands on is not visible from the
          button alone. */}
      <Dialog open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Apply “{title}” in bulk?</DialogTitle>
        <DialogContent className='flex flex-col gap-4'>
          <Alert severity={scope.mode === 'except' ? 'warning' : 'info'}>
            {describeScope(currentScope, totalCompanies)} — about {targetCount} compan
            {targetCount === 1 ? 'y' : 'ies'} will be written.
          </Alert>

          {warning && <Alert severity='warning'>{warning}</Alert>}

          <Typography variant='body2' color='text.secondary'>
            Every company in scope is set to{' '}
            <Typography
              component='span'
              color={value ? 'success.main' : 'error.main'}
              className='font-medium'
            >
              {value ? onLabel : offLabel}
            </Typography>
            . Nothing else on those companies is touched.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color='secondary' disabled={submitting} onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant='contained'
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color='inherit' /> : undefined}
            onClick={() => void apply()}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default BulkFlagCard
