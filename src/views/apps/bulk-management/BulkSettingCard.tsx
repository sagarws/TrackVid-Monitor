'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

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
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import type { ToggleButtonProps } from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CompanyScopeSelector, { describeScope, scopePayload, scopeTargetCount, useCompanyScope } from '@/components/CompanyScopeSelector'
import type { CompanyRoster } from '@/components/CompanyScopeSelector'

// One setting, applied to many companies at once.
//
// The per-company card (views/apps/company/view/AutomationRoutingCard) can use a
// plain switch because there is exactly one stored value to reflect. Here the
// selected companies each hold their own value, so a switch would have to
// pretend they agree. Every cell is therefore three-state and starts at "no
// change":
//
//   —   leave whatever each company already has
//   On  write true
//   Off write false
//
// Only the cells moved off "no change" are sent, so this screen can never
// overwrite a pair the operator did not look at — the same partial-write
// discipline the endpoint is built around.

export type CellIntent = 'on' | 'off'

/** `{ <platform>: { <column>: 'on' | 'off' } }`. A missing key is "no change". */
export type Intents = Record<string, Record<string, CellIntent>>

export type BulkColumn = { key: string; label: string }

type Props = {
  title: string
  subheader: string
  /** What the setting does, in the operator's terms. */
  help: string
  platforms: string[]
  columns: BulkColumn[]
  /** Whether this platform actually has this automation — no cell if it does not. */
  supports: (platform: string, column: string) => boolean
  /** How many companies have it on today, or null when unknown. */
  enabledCount?: (platform: string, column: string) => number | null
  totalCompanies: number
  roster: CompanyRoster
  /** The setting half of the request body, built from the moved cells. */
  buildPayload: (intents: Intents) => Record<string, unknown>
  /** Fired after a successful write so the caller can refresh the counts. */
  onApplied?: () => void
  /** Extra warning shown in the confirm dialog for the riskier settings. */
  warning?: string
}

type Result = { severity: 'success' | 'error'; message: string }

const INTENT_OPTIONS: { value: CellIntent | 'skip'; icon: string; title: string }[] = [
  { value: 'skip', icon: 'tabler-minus', title: 'No change' },
  { value: 'on', icon: 'tabler-check', title: 'Turn on' },
  { value: 'off', icon: 'tabler-x', title: 'Turn off' }
]

/**
 * A ToggleButton that carries a tooltip.
 *
 * The Tooltip cannot be the group's direct child: ToggleButtonGroup clones
 * whatever it finds there to inject `selected`, `value`, `onChange` and
 * `disabled`, and Tooltip does not forward those to the button inside it — the
 * buttons would render but nothing would ever toggle. Spreading the injected
 * props onto the ToggleButton here is what keeps the group wired up.
 */
const TooltipToggleButton = ({ title, ...props }: ToggleButtonProps & { title: string }) => (
  <Tooltip title={title}>
    <ToggleButton {...props} />
  </Tooltip>
)

/** The three-state cell. Kept tiny so a full grid of them stays readable. */
const IntentToggle = ({
  value,
  disabled,
  onChange
}: {
  value: CellIntent | undefined
  disabled?: boolean
  onChange: (next: CellIntent | undefined) => void
}) => (
  <ToggleButtonGroup
    exclusive
    size='small'
    value={value ?? 'skip'}
    disabled={disabled}
    // Coloured by what is picked rather than one fixed colour: at a glance the
    // grid should read as "these go on, these go off", and green-for-everything
    // loses exactly that.
    color={value === 'off' ? 'error' : value === 'on' ? 'success' : 'standard'}
    onChange={(_event, next) => {
      // `null` when the active button is re-clicked; treat it as "back to no
      // change" rather than an invalid empty state.
      if (next === null || next === 'skip') onChange(undefined)
      else onChange(next as CellIntent)
    }}
  >
    {INTENT_OPTIONS.map(option => (
      <TooltipToggleButton key={option.value} value={option.value} title={option.title} className='plb-1 pli-2'>
        <i className={`${option.icon} text-base`} />
      </TooltipToggleButton>
    ))}
  </ToggleButtonGroup>
)

const BulkSettingCard = ({
  title,
  subheader,
  help,
  platforms,
  columns,
  supports,
  enabledCount,
  totalCompanies,
  roster,
  buildPayload,
  onApplied,
  warning
}: Props) => {
  const scope = useCompanyScope()
  const [intents, setIntents] = useState<Intents>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const setIntent = useCallback((platform: string, column: string, next: CellIntent | undefined) => {
    setIntents(current => {
      const row = { ...(current[platform] ?? {}) }

      if (next) row[column] = next
      else delete row[column]

      const updated = { ...current }

      // Empty rows are pruned so `changes` below can count keys without having
      // to look past a row that no longer holds anything.
      if (Object.keys(row).length === 0) delete updated[platform]
      else updated[platform] = row

      return updated
    })
  }, [])

  /** Set a whole column at once — the common case is "all platforms, on". */
  const setColumn = useCallback(
    (column: string, next: CellIntent | undefined) => {
      setIntents(current => {
        const updated: Intents = { ...current }

        for (const platform of platforms) {
          if (!supports(platform, column)) continue

          const row = { ...(updated[platform] ?? {}) }

          if (next) row[column] = next
          else delete row[column]

          if (Object.keys(row).length === 0) delete updated[platform]
          else updated[platform] = row
        }

        return updated
      })
    },
    [platforms, supports]
  )

  const changes = useMemo(
    () =>
      Object.entries(intents).flatMap(([platform, row]) =>
        Object.entries(row).map(([column, intent]) => ({ platform, column, intent }))
      ),
    [intents]
  )

  const columnIntent = useCallback(
    (column: string): CellIntent | undefined => {
      const cells = platforms.filter(platform => supports(platform, column))

      if (cells.length === 0) return undefined

      const first = intents[cells[0]!]?.[column]

      if (!first) return undefined

      return cells.every(platform => intents[platform]?.[column] === first) ? first : undefined
    },
    [intents, platforms, supports]
  )

  // Memoised because `apply` closes over it: a fresh object literal every render
  // would rebuild that callback on every keystroke in the scope search box.
  const currentScope = useMemo(
    () => ({ mode: scope.mode, selectedIds: scope.selectedIds }),
    [scope.mode, scope.selectedIds]
  )

  const targetCount = scopeTargetCount(currentScope, totalCompanies)

  // "For Only" with nothing ticked would post an empty `companyIds`, which the
  // endpoint reads as "every company" — the one way this screen could do the
  // opposite of what the operator asked, so it is blocked rather than confirmed.
  const scopeEmpty = scope.mode === 'only' && scope.selectedIds.length === 0
  const canApply = changes.length > 0 && !scopeEmpty && !submitting

  const reset = useCallback(() => {
    setIntents({})
    setResult(null)
  }, [])

  const apply = useCallback(async () => {
    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch('/api/company/automation-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...scopePayload(currentScope),
          ...buildPayload(intents)
        })
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
        message: `Applied ${changes.length} setting${changes.length === 1 ? '' : 's'} to ${matched} compan${matched === 1 ? 'y' : 'ies'} (${modified} changed).`
      })
      setIntents({})
      onApplied?.()
    } catch (err) {
      setResult({ severity: 'error', message: err instanceof Error ? err.message : 'Could not apply settings' })
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }, [buildPayload, changes.length, currentScope, intents, onApplied])

  return (
    <Card>
      <CardHeader
        title={title}
        subheader={subheader}
        action={
          changes.length > 0 ? (
            <Button size='small' color='secondary' disabled={submitting} onClick={reset}>
              Reset
            </Button>
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

        <div className='overflow-x-auto'>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Platform</TableCell>
                {columns.map(column => (
                  <TableCell key={column.key} align='center'>
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Whole-column shortcut. A bulk screen's most common act is "all
                  platforms, on" and doing it a cell at a time invites missing
                  one. */}
              <TableRow className='bg-actionHover'>
                <TableCell>
                  <Typography variant='body2' color='text.secondary'>
                    All platforms
                  </Typography>
                </TableCell>
                {columns.map(column => (
                  <TableCell key={column.key} align='center'>
                    <IntentToggle
                      value={columnIntent(column.key)}
                      disabled={submitting}
                      onChange={next => setColumn(column.key, next)}
                    />
                  </TableCell>
                ))}
              </TableRow>

              {platforms.map(platform => (
                <TableRow key={platform}>
                  <TableCell className='capitalize'>{platform}</TableCell>
                  {columns.map(column => {
                    if (!supports(platform, column.key)) {
                      return (
                        // No automation of this type on this platform, so there
                        // is nothing a setting here could control.
                        <TableCell key={column.key} align='center'>
                          <Typography component='span' color='text.disabled'>
                            —
                          </Typography>
                        </TableCell>
                      )
                    }

                    const count = enabledCount?.(platform, column.key)

                    return (
                      <TableCell key={column.key} align='center'>
                        <div className='flex flex-col items-center gap-1'>
                          <IntentToggle
                            value={intents[platform]?.[column.key]}
                            disabled={submitting}
                            onChange={next => setIntent(platform, column.key, next)}
                          />
                          {typeof count === 'number' && totalCompanies > 0 && (
                            <Tooltip title={`On for ${count} of ${totalCompanies} companies today`}>
                              <Typography variant='caption' color='text.secondary'>
                                {count}/{totalCompanies} on
                              </Typography>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {result && <Alert severity={result.severity}>{result.message}</Alert>}

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Typography variant='body2' color='text.secondary'>
            {changes.length === 0
              ? 'Pick On or Off on at least one cell.'
              : scopeEmpty
                ? 'Tick at least one company, or switch to Except.'
                : `${changes.length} setting${changes.length === 1 ? '' : 's'} → ${describeScope(currentScope, totalCompanies)}`}
          </Typography>
          <Button
            variant='contained'
            disabled={!canApply}
            startIcon={submitting ? <CircularProgress size={16} color='inherit' /> : <i className='tabler-device-floppy' />}
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
            These settings change how automations behave on the next run. Everything not listed here is left as it is.
          </Typography>

          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Platform</TableCell>
                <TableCell>Setting</TableCell>
                <TableCell align='right'>New value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {changes.map(change => (
                <TableRow key={`${change.platform}:${change.column}`}>
                  <TableCell className='capitalize'>{change.platform}</TableCell>
                  <TableCell>{columns.find(c => c.key === change.column)?.label ?? change.column}</TableCell>
                  <TableCell align='right'>
                    <Typography
                      component='span'
                      color={change.intent === 'on' ? 'success.main' : 'error.main'}
                      className='font-medium'
                    >
                      {change.intent === 'on' ? 'On' : 'Off'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

export default BulkSettingCard
