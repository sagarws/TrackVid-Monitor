'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Type Imports
import type { CompanyOption } from '@/components/CompanyFilter'

// "Which companies does this bulk write land on?" — the scope picker used by
// every card on the Bulk Management screen.
//
// Deliberately NOT CompanyFilter. That one narrows a table you are looking at,
// so an empty selection safely means "show everything". Here an empty selection
// in the wrong mode means "write to every company in the system", so this
// component is built around the opposite default: nothing is targeted until the
// operator says so, and the widest scopes announce themselves.
//
// Two modes, matching the two things ops actually asks for:
//
//   For Only — write to exactly the ticked companies.
//   Except   — write to every company EXCEPT the ticked ones.
//
// They map to `companyIds` / `excludeCompanyIds` on
// POST /system-admin/setting/companies/automation-routing, which resolves the
// scope server-side. Resolving "all but these" in the browser would mean posting
// a 600-id array built from a roster that may already be stale.

export type ScopeMode = 'only' | 'except'

export type CompanyScope = {
  mode: ScopeMode
  selectedIds: string[]
}

// The roster is the whole company list, not a type-ahead page: "Except" is only
// honest if the operator can see every company they are NOT excluding. The BE
// caps /company/search at this, and `truncated` below says so out loud when the
// cap is hit, because a silently-cut roster turns "except these two" into
// "except two of the ones you meant".
const ROSTER_LIMIT = 1000

/**
 * Every company, id + name, fetched once.
 *
 * Lifted out of the selector so a screen with several cards shares one fetch —
 * three cards each pulling 600 companies on mount is three copies of the same
 * list and three chances for them to disagree.
 */
export const useCompanyRoster = () => {
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/company/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ search: '', limit: ROSTER_LIMIT })
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setCompanies([])
        setError(json?.displayMessage || json?.message || `Could not load companies (${res.status})`)

        return
      }

      const list: CompanyOption[] = Array.isArray(json?.data?.companies)
        ? json.data.companies
            .map((c: any) => ({
              companyId: String(c?.companyId ?? ''),
              companyName: String(c?.companyName ?? '')
            }))
            .filter((c: CompanyOption) => c.companyId)
        : []

      setCompanies(list)
      setTruncated(list.length >= ROSTER_LIMIT)
    } catch (err) {
      setCompanies([])
      setError(err instanceof Error ? err.message : 'Could not load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { companies, loading, truncated, error, reload: load }
}

export type CompanyRoster = ReturnType<typeof useCompanyRoster>

/**
 * One card's scope. Per-card rather than per-screen on purpose: an operator
 * routinely turns desktop execution on for three pilot companies while flipping
 * the API flow for everyone else, and a single shared scope would force those to
 * be two separate visits.
 */
export const useCompanyScope = () => {
  const [mode, setMode] = useState<ScopeMode>('only')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const toggleId = useCallback((companyId: string) => {
    setSelectedIds(current =>
      current.includes(companyId) ? current.filter(id => id !== companyId) : [...current, companyId]
    )
  }, [])

  const clear = useCallback(() => setSelectedIds([]), [])

  return { mode, setMode, selectedIds, setSelectedIds, toggleId, clear, search, setSearch }
}

export type CompanyScopeState = ReturnType<typeof useCompanyScope>

/** The `companyIds` / `excludeCompanyIds` half of a bulk write's body. */
export const scopePayload = (scope: CompanyScope): { companyIds?: string[]; excludeCompanyIds?: string[] } =>
  scope.mode === 'only' ? { companyIds: scope.selectedIds } : { excludeCompanyIds: scope.selectedIds }

/**
 * How many companies a scope lands on.
 *
 * An estimate for "Except" — it assumes every excluded id is a live company, so
 * an id for a deleted one would make this one too low. The write itself reports
 * the real `matched` count back, which is what the result message shows.
 */
export const scopeTargetCount = (scope: CompanyScope, totalCompanies: number): number =>
  scope.mode === 'only' ? scope.selectedIds.length : Math.max(totalCompanies - scope.selectedIds.length, 0)

/** Plain-English scope, for the confirm dialog and the button's helper line. */
export const describeScope = (scope: CompanyScope, totalCompanies: number): string => {
  const n = scope.selectedIds.length

  if (scope.mode === 'only') {
    if (n === 0) return 'No companies selected'

    return `${n} selected compan${n === 1 ? 'y' : 'ies'}`
  }

  if (n === 0) return `Every company${totalCompanies ? ` (${totalCompanies})` : ''}`

  return `Every company except ${n} (${scopeTargetCount(scope, totalCompanies)} of ${totalCompanies})`
}

type Props = {
  roster: CompanyRoster
  scope: CompanyScopeState
  totalCompanies: number
  disabled?: boolean
}

const CompanyScopeSelector = ({ roster, scope, totalCompanies, disabled }: Props) => {
  const { companies, loading, truncated, error, reload } = roster
  const { mode, setMode, selectedIds, setSelectedIds, toggleId, clear, search, setSearch } = scope

  // Membership tests run once per rendered row, so the array would be O(n²)
  // across a 600-company roster on every keystroke.
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return companies

    // Id as well as name: pasting a companyId out of a log line is how ops
    // moves between this screen and everything else.
    return companies.filter(
      c => c.companyName.toLowerCase().includes(term) || c.companyId.toLowerCase().includes(term)
    )
  }, [companies, search])

  // "Select all" acts on what is on screen, not the whole roster — with a
  // search applied, an operator ticking it means the matches they can see.
  const shownSelectedCount = useMemo(
    () => filtered.reduce((count, c) => (selectedSet.has(c.companyId) ? count + 1 : count), 0),
    [filtered, selectedSet]
  )

  const allShownSelected = filtered.length > 0 && shownSelectedCount === filtered.length

  const toggleAllShown = useCallback(() => {
    const shownIds = filtered.map(c => c.companyId)

    setSelectedIds(current => {
      if (allShownSelected) {
        const drop = new Set(shownIds)

        return current.filter(id => !drop.has(id))
      }

      return Array.from(new Set([...current, ...shownIds]))
    })
  }, [allShownSelected, filtered, setSelectedIds])

  // A company that was ticked and then filtered out of the roster (renamed,
  // deleted) still counts toward the scope, so it is surfaced rather than
  // leaving the count and the visible ticks disagreeing.
  const unknownSelectedCount = useMemo(() => {
    if (companies.length === 0) return 0

    const known = new Set(companies.map(c => c.companyId))

    return selectedIds.filter(id => !known.has(id)).length
  }, [companies, selectedIds])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <ToggleButtonGroup
          exclusive
          size='small'
          color='primary'
          value={mode}
          disabled={disabled}
          onChange={(_event, value) => {
            // `null` when the active button is clicked again — a mode is not
            // optional, so that click is a no-op rather than an empty scope.
            if (value) setMode(value as ScopeMode)
          }}
        >
          <ToggleButton value='only'>
            <i className='tabler-target-arrow text-base mie-2' />
            For Only
          </ToggleButton>
          <ToggleButton value='except'>
            <i className='tabler-ban text-base mie-2' />
            Except
          </ToggleButton>
        </ToggleButtonGroup>

        <div className='flex items-center gap-2'>
          <Chip
            size='small'
            variant='tonal'
            color={mode === 'only' ? 'primary' : 'warning'}
            label={describeScope({ mode, selectedIds }, totalCompanies)}
          />
          {selectedIds.length > 0 && (
            <Button size='small' color='secondary' disabled={disabled} onClick={clear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Typography variant='body2' color='text.secondary'>
        {mode === 'only'
          ? 'The settings below are written to the ticked companies only.'
          : 'The settings below are written to every company except the ticked ones.'}
      </Typography>

      <CustomTextField
        size='small'
        fullWidth
        value={search}
        disabled={disabled}
        onChange={e => setSearch(e.target.value)}
        placeholder='Search company name or id…'
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <i className='tabler-search' />
              </InputAdornment>
            )
          }
        }}
      />

      {error && (
        <Alert
          severity='error'
          action={
            <Button size='small' color='inherit' onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {truncated && (
        <Alert severity='warning'>
          Only the first {ROSTER_LIMIT} companies were loaded, so this list is not the full roster. Check the scope
          before applying.
        </Alert>
      )}

      {unknownSelectedCount > 0 && (
        <Alert severity='info'>
          {unknownSelectedCount} selected compan{unknownSelectedCount === 1 ? 'y is' : 'ies are'} not in the list below
          (renamed or removed) but still count toward the scope.
        </Alert>
      )}

      <div className='border rounded overflow-auto' style={{ maxHeight: 260 }}>
        {loading ? (
          <div className='flex justify-center p-4'>
            <CircularProgress size={22} />
          </div>
        ) : filtered.length === 0 ? (
          <Typography color='text.disabled' className='p-4'>
            {companies.length === 0 ? 'No companies loaded.' : 'No companies match that search.'}
          </Typography>
        ) : (
          <>
            {/* Opaque, not `bg-actionHover`: that maps to `--mui-palette-action-hover`,
                which is a translucent rgba — a sticky header painted with it lets the
                rows scrolling underneath show straight through the text. */}
            <div className='flex items-center justify-between gap-2 plb-1 pli-3 border-be bg-backgroundPaper sticky top-0 z-10'>
              <FormControlLabel
                label={
                  <Typography variant='body2'>
                    Select all {search.trim() ? `${filtered.length} matching` : `${filtered.length}`}
                  </Typography>
                }
                control={
                  <Checkbox
                    size='small'
                    disabled={disabled}
                    checked={allShownSelected}
                    indeterminate={shownSelectedCount > 0 && !allShownSelected}
                    onChange={toggleAllShown}
                  />
                }
              />
              <Typography variant='caption' color='text.secondary'>
                {selectedIds.length} ticked
              </Typography>
            </div>
            {filtered.map(company => (
              <div key={company.companyId} className='flex items-center gap-2 pli-3'>
                <Checkbox
                  size='small'
                  disabled={disabled}
                  checked={selectedSet.has(company.companyId)}
                  onChange={() => toggleId(company.companyId)}
                />
                <div className='flex flex-col min-is-0'>
                  <Typography variant='body2' className='truncate'>
                    {company.companyName || '(unnamed company)'}
                  </Typography>
                  <Typography variant='caption' color='text.secondary' className='font-mono'>
                    {company.companyId}
                  </Typography>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default CompanyScopeSelector
