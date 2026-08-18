'use client'

// React Imports
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// MUI Imports
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormGroup from '@mui/material/FormGroup'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Component Imports
import FilterCheck from '@/components/FilterCheck'
import CustomTextField from '@core/components/mui/TextField'

// Shared "how many marketplace accounts is this company running?" filter, used
// by the Company list and the Pending CMS report. Both resolve it server-side
// (`accountFilter` on the system-admin endpoints): the credential counts live
// in company.settings, not in the page slice, so filtering here would only hide
// rows the API already sent and make the totals lie.
export const ACCOUNT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'zero', label: 'Zero Account' },
  { key: 'nonZero', label: 'Non Zero Account' },
  { key: 'number', label: 'Number' }
] as const

export type AccountFilterKey = (typeof ACCOUNT_FILTERS)[number]['key']

export type AccountFilterPayload = { zero: boolean; nonZero: boolean; numbers: number[] }

// "All" is the absence of a filter, so it cannot coexist with a bucket: picking
// a bucket drops it, and picking it drops everything else. An empty selection
// falls back to 'all' rather than an unlabelled no-op field.
export const normalizeAccountFilters = (
  picked: AccountFilterKey[],
  previous: AccountFilterKey[]
): AccountFilterKey[] => {
  if (picked.length === 0) return ['all']

  const addedAll = picked.includes('all') && !previous.includes('all')

  if (addedAll) return ['all']

  const withoutAll = picked.filter(key => key !== 'all')

  return withoutAll.length > 0 ? withoutAll : ['all']
}

// Comma / space separated so several exact counts can be asked for at once
// ("0, 2, 5"). Negatives and junk are dropped rather than sent — the BE
// discards them anyway, and a rejected entry that still narrowed the result
// would be indistinguishable from a genuine empty match.
export const parseAccountNumbers = (raw: string): number[] =>
  Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(part => Number.parseInt(part, 10))
        .filter(n => Number.isFinite(n) && n >= 0)
    )
  )

// Owns the filter state and derives the request payload. `onChange` fires
// whenever the applied filter moves, so callers can reset to page 1.
export const useAccountFilter = ({
  initial = ['all'],
  onChange
}: {
  initial?: AccountFilterKey[]
  onChange?: () => void
} = {}) => {
  const [filters, setFiltersState] = useState<AccountFilterKey[]>(initial)
  const [numbersText, setNumbersText] = useState('')
  const [debouncedNumbers, setDebouncedNumbers] = useState('')

  // Held in a ref so a caller passing an inline arrow does not restart the
  // debounce timer on every render.
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Debounced so typing "12" does not fire a query for "1" on the way.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedNumbers(numbersText.trim())
      onChangeRef.current?.()
    }, 400)

    return () => clearTimeout(t)
  }, [numbersText])

  const setFilters = useCallback((picked: AccountFilterKey[]) => {
    setFiltersState(prev => normalizeAccountFilters(picked, prev))
    onChangeRef.current?.()
  }, [])

  // Exact counts only matter while "Number" is ticked; leaving them out
  // otherwise means unticking it takes effect immediately without clearing the
  // box the user typed into.
  const parsedNumbers = useMemo(
    () => (filters.includes('number') ? parseAccountNumbers(debouncedNumbers) : []),
    [filters, debouncedNumbers]
  )

  // null when "All" is picked (or the selection says nothing), so the caller
  // omits `accountFilter` entirely and the BE skips its $match.
  const payload = useMemo<AccountFilterPayload | null>(() => {
    if (filters.includes('all') || filters.length === 0) return null

    const next = {
      zero: filters.includes('zero'),
      nonZero: filters.includes('nonZero'),
      numbers: parsedNumbers
    }

    return next.zero || next.nonZero || next.numbers.length > 0 ? next : null
  }, [filters, parsedNumbers])

  // Stable fetch dependency: the payload object is a new reference every
  // render and would re-fire the request in a loop.
  const payloadKey = payload ? JSON.stringify(payload) : ''

  return { filters, setFilters, numbersText, setNumbersText, debouncedNumbers, parsedNumbers, payload, payloadKey }
}

type Props = {
  filters: AccountFilterKey[]
  setFilters: (picked: AccountFilterKey[]) => void
  numbersText: string
  setNumbersText: (value: string) => void
  debouncedNumbers: string
  parsedNumbers: number[]
  // 'select' is a standalone toolbar control (Pending CMS); 'checkbox' renders
  // as a section of a filter popover (Company list), matching the rows around
  // it rather than dropping a second dropdown into a list of checkboxes.
  variant?: 'select' | 'checkbox'
  className?: string
}

// Ticking a bucket in the checkbox variant goes through the same normaliser as
// the select, so "All" stays exclusive in both.
const toggleKey = (filters: AccountFilterKey[], key: AccountFilterKey, on: boolean): AccountFilterKey[] =>
  on ? [...filters, key] : filters.filter(k => k !== key)

// The exact-count box. Shared by both variants — only rendered once "Number"
// is ticked, since an always-visible box that does nothing most of the time
// reads as a broken filter.
const NumbersInput = ({
  numbersText,
  setNumbersText,
  debouncedNumbers,
  parsedNumbers,
  className
}: Pick<Props, 'numbersText' | 'setNumbersText' | 'debouncedNumbers' | 'parsedNumbers'> & { className: string }) => (
  <CustomTextField
    label='Account count'
    value={numbersText}
    onChange={e => setNumbersText(e.target.value)}
    placeholder='e.g. 2 or 0, 2, 5'
    helperText={debouncedNumbers && parsedNumbers.length === 0 ? 'Enter whole numbers, e.g. 2 or 0, 2, 5' : ' '}
    error={Boolean(debouncedNumbers) && parsedNumbers.length === 0}
    className={className}
  />
)

const AccountCountFilter = ({
  filters,
  setFilters,
  numbersText,
  setNumbersText,
  debouncedNumbers,
  parsedNumbers,
  variant = 'select',
  className = 'max-sm:is-full sm:is-[240px]'
}: Props) => {
  if (variant === 'checkbox') {
    return (
      <div className='flex flex-col gap-1'>
        <Typography variant='overline' color='text.disabled' className='leading-none'>
          Accounts
        </Typography>
        <Typography variant='caption' color='text.secondary' className='mbe-1'>
          How many marketplace logins the company has configured. Ticked buckets combine as OR.
        </Typography>
        <FormGroup>
          {ACCOUNT_FILTERS.map(({ key, label }) => (
            <FilterCheck
              key={key}
              label={label}
              checked={filters.includes(key)}
              onChange={on => setFilters(toggleKey(filters, key, on))}
            />
          ))}
        </FormGroup>
        {filters.includes('number') && (
          <div className='mbs-2'>
            <NumbersInput
              numbersText={numbersText}
              setNumbersText={setNumbersText}
              debouncedNumbers={debouncedNumbers}
              parsedNumbers={parsedNumbers}
              className='is-full'
            />
          </div>
        )}
      </div>
    )
  }

  return (
  <>
    <CustomTextField
      select
      label='Accounts'
      value={filters}
      onChange={e => setFilters(e.target.value as unknown as AccountFilterKey[])}
      slotProps={{
        select: {
          multiple: true,
          // Chips rather than the default comma-joined string: with "Number" in
          // play the value list is the only place the active buckets are shown.
          renderValue: (value: unknown) => {
            const picked = value as AccountFilterKey[]

            if (!picked.length) return 'All'

            return (
              <div className='flex flex-wrap gap-1'>
                {picked.map(key => (
                  <Chip
                    key={key}
                    size='small'
                    variant='tonal'
                    color={key === 'all' ? 'secondary' : 'primary'}
                    label={ACCOUNT_FILTERS.find(a => a.key === key)?.label ?? key}
                  />
                ))}
              </div>
            )
          }
        }
      }}
      className={className}
    >
      {ACCOUNT_FILTERS.map(({ key, label }) => (
        <MenuItem key={key} value={key}>
          <Checkbox size='small' checked={filters.includes(key)} />
          {label}
        </MenuItem>
      ))}
    </CustomTextField>
      {filters.includes('number') && (
        <NumbersInput
          numbersText={numbersText}
          setNumbersText={setNumbersText}
          debouncedNumbers={debouncedNumbers}
          parsedNumbers={parsedNumbers}
          className='max-sm:is-full sm:is-[180px]'
        />
      )}
    </>
  )
}

export default AccountCountFilter
