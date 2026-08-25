'use client'

// React Imports
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// MUI Imports
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'

// Component Imports
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import CustomTextField from '@core/components/mui/TextField'

// Hook Imports
import useStarredCompanies from '@/hooks/useStarredCompanies'

// Shared "show me only these companies" filter, used by the Company list and
// the Pending CMS report. Both resolve it server-side (`companyIds` on the
// system-admin endpoints) rather than filtering the page slice: the pages are
// paginated across ~600 companies, so a client-side match would only hide rows
// the API already sent and would make the totals — and the pagination — lie.
//
// The options come from /api/company/search (name + id only) instead of the
// list endpoint, which runs the full company aggregation and is far too
// expensive to fire per keystroke.

export type CompanyOption = { companyId: string; companyName: string }

// Type-ahead page size. Matches the BE default; the message under the list says
// so when the result is cut, since a name missing from the dropdown otherwise
// reads as "that company does not exist".
const OPTION_LIMIT = 20

// Selections survive navigation — open a company, come back, and the filter is
// still applied. Both the id AND the name are stored so the chips can render on
// the next load without a round-trip to resolve the names.
const readStored = (storageKey: string): CompanyOption[] => {
  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((c: any) => c && typeof c.companyId === 'string' && c.companyId)
      .map((c: any) => ({ companyId: c.companyId, companyName: String(c.companyName ?? '') }))
  } catch {
    // Private mode, storage disabled, or a stale/corrupt entry — the filter
    // just starts empty rather than breaking the page.
    return []
  }
}

// Owns the selection, the type-ahead query, and the derived request payload.
// `onChange` fires whenever the applied selection moves, so callers can reset
// to page 1 the way they do for the other filters.
// Whether the "Starred" toggle is on, stored beside the picked companies so the
// scope a page was left in is the scope it comes back in.
const starredOnlyKey = (storageKey: string) => `${storageKey}.starred-only`

export const useCompanyFilter = ({ storageKey, onChange }: { storageKey: string; onChange?: () => void }) => {
  const [selected, setSelectedState] = useState<CompanyOption[]>([])
  // The shared shortlist (see useStarredCompanies) — the same set the star
  // column writes, so starring a row immediately changes what this filter can
  // narrow to.
  const { starredIds, starredCount } = useStarredCompanies()
  const [starredOnly, setStarredOnlyState] = useState(false)
  const [inputValue, setInputValue] = useState('')
  // Controlled so the type-ahead query can be gated on it: without that, every
  // page load fires a company search for a dropdown nobody opened.
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Held in a ref so a caller passing an inline arrow does not re-run the
  // effects below on every render.
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Not seeded in useState: the server renders with an empty selection, so
  // reading storage during the first render is a hydration mismatch. Applied in
  // an effect instead, and the write below is skipped until this has run —
  // otherwise the empty initial value immediately overwrites what was stored.
  const hydrated = useRef(false)

  useEffect(() => {
    const stored = readStored(storageKey)
    let storedStarredOnly = false

    try {
      storedStarredOnly = window.localStorage.getItem(starredOnlyKey(storageKey)) === '1'
    } catch {
      /* see readStored */
    }

    if (stored.length > 0) setSelectedState(stored)
    if (storedStarredOnly) setStarredOnlyState(true)
    if (stored.length > 0 || storedStarredOnly) onChangeRef.current?.()

    hydrated.current = true
  }, [storageKey])

  const setSelected = useCallback(
    (next: CompanyOption[]) => {
      // De-duplicated by id: the same company can arrive twice when a stored
      // chip and a freshly-searched option describe the same row.
      const seen = new Set<string>()
      const unique = next.filter(c => (seen.has(c.companyId) ? false : (seen.add(c.companyId), true)))

      setSelectedState(unique)
      onChangeRef.current?.()

      if (!hydrated.current) return

      try {
        if (unique.length > 0) window.localStorage.setItem(storageKey, JSON.stringify(unique))
        else window.localStorage.removeItem(storageKey)
      } catch {
        /* see readStored */
      }
    },
    [storageKey]
  )

  const setStarredOnly = useCallback(
    (on: boolean) => {
      setStarredOnlyState(on)
      onChangeRef.current?.()

      if (!hydrated.current) return

      try {
        if (on) window.localStorage.setItem(starredOnlyKey(storageKey), '1')
        else window.localStorage.removeItem(starredOnlyKey(storageKey))
      } catch {
        /* see readStored */
      }
    },
    [storageKey]
  )

  // Debounced so typing a name does not fire a query per character, and
  // sequence-guarded so a slow early response cannot overwrite a later one.
  const reqIdRef = useRef(0)

  useEffect(() => {
    const term = inputValue.trim()

    // Nothing typed and the list is closed — there is no list to fill.
    if (!open && !term) return

    const t = setTimeout(async () => {
      const reqId = ++reqIdRef.current

      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/company/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search: term, limit: OPTION_LIMIT })
        })

        const json = await res.json().catch(() => null)

        if (reqId !== reqIdRef.current) return

        if (!res.ok || !json?.isSuccess) {
          setOptions([])
          setTruncated(false)
          setError(json?.displayMessage || json?.message || `Search failed (${res.status})`)

          return
        }

        const list: CompanyOption[] = Array.isArray(json?.data?.companies)
          ? json.data.companies.map((c: any) => ({
              companyId: String(c?.companyId ?? ''),
              companyName: String(c?.companyName ?? '')
            }))
          : []

        setOptions(list.filter(c => c.companyId))
        setTruncated(list.length >= OPTION_LIMIT)
      } catch (err: any) {
        if (reqId !== reqIdRef.current) return
        setOptions([])
        setTruncated(false)
        setError(err?.message || 'Failed to search companies')
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    }, 350)

    return () => clearTimeout(t)
  }, [inputValue, open])

  // Starring a row while the toggle is on changes what the table matches, so
  // the caller has to go back to page 1 the same way it does for every other
  // filter move — otherwise page 3 of the old result set is still on screen.
  const starredKey = starredIds.join('|')

  useEffect(() => {
    if (!hydrated.current || !starredOnly) return

    onChangeRef.current?.()
  }, [starredKey, starredOnly])

  // Picked companies OR starred ones — a union, not an intersection: the star
  // toggle is a shortcut for "and also my shortlist", so turning it on can only
  // widen what a picked set shows, never silently empty it.
  //
  // The toggle is disabled when nothing is starred (see the component), which
  // is what keeps "starred only" from resolving to an empty id list and
  // reading, wrongly, as no filter at all.
  const companyIds = useMemo(() => {
    const picked = selected.map(c => c.companyId)

    if (!starredOnly) return picked

    return Array.from(new Set([...picked, ...starredIds]))
  }, [selected, starredOnly, starredIds])

  // Stable fetch dependency: `companyIds` is a new array reference every render
  // and would re-fire the caller's request in a loop.
  const companyIdsKey = companyIds.join('|')

  return {
    selected,
    setSelected,
    starredOnly,
    setStarredOnly,
    starredCount,
    inputValue,
    setInputValue,
    open,
    setOpen,
    options,
    loading,
    truncated,
    error,
    companyIds,
    companyIdsKey
  }
}

type Props = ReturnType<typeof useCompanyFilter> & {
  label?: string
  placeholder?: string
  className?: string
}

const CompanyFilter = ({
  selected,
  setSelected,
  starredOnly,
  setStarredOnly,
  starredCount,
  inputValue,
  setInputValue,
  open,
  setOpen,
  options,
  loading,
  truncated,
  error,
  label = 'Companies',
  placeholder = 'Search company…',
  className = 'max-sm:is-full sm:is-[320px]'
}: Props) => (
  <div className={`flex items-start gap-2 ${className}`}>
    <CustomAutocomplete
      multiple
      disableCloseOnSelect
      size='small'
      options={options}
      value={selected}
      loading={loading}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      inputValue={inputValue}
      // The options are searched server-side, so the built-in client filter would
      // only re-filter an already-matching list — and would hide rows the BE
      // matched on companyId.
      filterOptions={x => x}
      onInputChange={(_event, value, reason) => {
        // Clearing the box on blur/select would re-query for "" every time a chip
        // is added, and drop the list the user is picking from.
        if (reason === 'reset') return
        setInputValue(value)
      }}
      onChange={(_event, value) => setSelected(value as CompanyOption[])}
      getOptionLabel={option => option.companyName || option.companyId}
      isOptionEqualToValue={(option, value) => option.companyId === value.companyId}
      noOptionsText={error || (loading ? 'Searching…' : 'No companies match')}
      className='is-full'
      renderTags={(value, getTagProps) =>
        value.map((option, index) => {
          const { key, ...rest } = getTagProps({ index })

          return (
            <Chip
              key={key}
              size='small'
              variant='tonal'
              color='primary'
              label={option.companyName || option.companyId}
              {...rest}
            />
          )
        })
      }
      renderOption={(props, option) => {
        const { key, ...rest } = props

        return (
          <ListItem key={key} {...rest} dense>
            <ListItemText
              primary={option.companyName || '(unnamed company)'}
              secondary={option.companyId}
              slotProps={{
                primary: { variant: 'body2' },
                secondary: { variant: 'caption', className: 'font-mono' }
              }}
            />
          </ListItem>
        )
      }}
      renderInput={params => (
        <CustomTextField
          {...params}
          label={label}
          placeholder={selected.length ? '' : placeholder}
          error={Boolean(error)}
          // Plain text, not a <Typography>: FormHelperText already renders a <p>,
          // and nesting one inside it is invalid HTML that React warns about.
          // A non-breaking space reserves the line so adding a chip does not
          // shift the header.
          helperText={
            error
              ? error
              : truncated && inputValue.trim()
                ? `Showing the first ${OPTION_LIMIT} matches — keep typing to narrow`
                : ' '
          }
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }
          }}
        />
      )}
    />
    {/* The starred shortlist as a one-click scope. Rendered next to the picker
        rather than inside it: it is not one more company to choose, it is
        "and also everything I starred". Disabled with nothing starred, so it
        can never resolve to an empty id list and read as no filter at all. */}
    <Tooltip
      title={
        starredCount === 0
          ? 'Star a company from the table first'
          : starredOnly
            ? `Stop scoping to your ${starredCount} starred compan${starredCount === 1 ? 'y' : 'ies'}`
            : `Show only your ${starredCount} starred compan${starredCount === 1 ? 'y' : 'ies'}`
      }
    >
      <span className='mbs-6'>
        <Chip
          size='small'
          variant={starredOnly ? 'filled' : 'tonal'}
          color={starredOnly ? 'warning' : 'secondary'}
          clickable={starredCount > 0}
          disabled={starredCount === 0}
          onClick={() => starredCount > 0 && setStarredOnly(!starredOnly)}
          icon={<i className={starredOnly ? 'tabler-star-filled text-base' : 'tabler-star text-base'} />}
          label={starredCount > 0 ? `Starred (${starredCount})` : 'Starred'}
        />
      </span>
    </Tooltip>
  </div>
)

export default CompanyFilter
