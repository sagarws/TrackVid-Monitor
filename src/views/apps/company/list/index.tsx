'use client'

// React Imports
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Snackbar from '@mui/material/Snackbar'
import Pagination from '@mui/material/Pagination'
import Popover from '@mui/material/Popover'
import Divider from '@mui/material/Divider'
import Badge from '@mui/material/Badge'
import Chip from '@mui/material/Chip'

// Third-party Imports
import classnames from 'classnames'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

// One marketplace credential and when it last synced. The master-data jobs
// stamp `masterDataSync` per credential (not per company), so two accounts on
// the same platform can legitimately sit at different dates — that difference
// is the whole point of the expandable panel below.
export type CredentialSync = {
  credentialId: string
  username: string
  isVerified: boolean
  lastSync: string // ISO string, '' when never synced
}

export type PlatformCredentials = {
  key: PlatformKey
  label: string
  accounts: CredentialSync[]
}

export type CompanyRow = {
  userId: string
  companyId: string
  companyName: string
  adminName: string
  adminEmail: string
  adminPhone: string
  // Per-platform rollup shown in the collapsed row: the OLDEST date across that
  // platform's credentials, so a single stale account stays visible instead of
  // being masked by a freshly-synced sibling.
  lastSync: {
    ajio: string
    myntra: string
    snapdeal: string
    meesho: string
  }
  // Full per-credential breakdown, rendered when the row is expanded.
  credentials: PlatformCredentials[]
}

type PlatformKey = keyof CompanyRow['lastSync']

const PLATFORM_LABELS: { key: PlatformKey; label: string }[] = [
  { key: 'ajio', label: 'Ajio' },
  { key: 'myntra', label: 'Myntra' },
  { key: 'snapdeal', label: 'Snapdeal' },
  { key: 'meesho', label: 'Meesho' }
]

const TRACKED_PLATFORMS: PlatformKey[] = ['ajio', 'myntra', 'snapdeal', 'meesho']

// Rows per page. The larger sizes exist so a filtered set (e.g. "not synced
// today") can be reviewed in one screen instead of paged through.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500] as const

const formatPhone = (phone: any): string => {
  if (!phone?.number) return ''
  const code = phone.code ? `+${String(phone.code).replace(/^\+/, '')} ` : ''

  return `${code}${phone.number}`.trim()
}

const toIsoDate = (value: unknown): string => {
  if (!value) return ''
  const parsed = new Date(value as any)

  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

// Build the per-platform credential breakdown from
// company.settings.eCommercePlatformLoginInfo. Platform names are matched
// case-insensitively — the DB holds "AJIO", "myntra", "snapdeal" inconsistently.
const pickCredentials = (loginInfo: any): PlatformCredentials[] => {
  const platforms = Array.isArray(loginInfo) ? loginInfo : []

  return PLATFORM_LABELS.map(({ key, label }) => {
    const entry = platforms.find((p: any) => String(p?.eComPlatform ?? '').toLowerCase() === key)

    const accounts: CredentialSync[] = (Array.isArray(entry?.info) ? entry.info : []).map((acc: any) => ({
      credentialId: String(acc?._id ?? ''),
      username: String(acc?.username ?? '—'),
      isVerified: acc?.is_verified !== false, // undefined = legacy cred, treat as verified
      lastSync: toIsoDate(acc?.masterDataSync)
    }))

    return { key, label, accounts }
  })
}

// Collapsed-row rollup: the OLDEST sync across a platform's credentials, so one
// lagging account is visible without expanding. '' when the platform has no
// credentials, or none of them has ever synced.
const rollUpLastSync = (credentials: PlatformCredentials[]): CompanyRow['lastSync'] => {
  const out = { ajio: '', myntra: '', snapdeal: '', meesho: '' } as CompanyRow['lastSync']

  for (const { key, accounts } of credentials) {
    if (!accounts.length) continue

    // A never-synced account makes the whole platform "—": there is no date
    // that honestly describes "everything is synced since X".
    if (accounts.some(a => !a.lastSync)) continue

    out[key] = accounts.reduce((oldest, a) => (!oldest || a.lastSync < oldest ? a.lastSync : oldest), '')
  }

  return out
}

const mapUserToRow = (u: any): CompanyRow => {
  const credentials = pickCredentials(u?.company?.settings?.eCommercePlatformLoginInfo)

  return {
    userId: String(u?._id ?? ''),
    companyId: String(u?.company?._id ?? ''),
    companyName: String(u?.company?.name ?? '—'),
    adminName: String(u?.name?.fullName || `${u?.name?.firstName ?? ''} ${u?.name?.lastName ?? ''}`.trim() || '—'),
    adminEmail: String(u?.email ?? ''),
    adminPhone: formatPhone(u?.phone),
    lastSync: rollUpLastSync(credentials),
    credentials
  }
}

const formatSyncDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) return '—'

  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short' })
  const year = d.getFullYear()
  const rawHours = d.getHours()
  const ampm = rawHours >= 12 ? 'PM' : 'AM'
  const hours = String(rawHours % 12 || 12).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return `${day} ${month}, ${year}, ${hours}:${minutes} ${ampm}`
}

type FanoutResult = {
  platform: PlatformKey
  ok: boolean
  status: number
  message?: string
}

type SyncResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    companyIds: string[]
    platforms: PlatformKey[]
    results: FanoutResult[]
  }
}

type ListResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    users: any[]
    metadata?: { total?: number; totalPage?: number; page?: number; limit?: number }
  }
}

type Toast = { severity: 'success' | 'error' | 'warning'; message: string }

type Props = {
  impersonateBaseUrl: string
}

// A checkbox row that visibly changes state when ticked. Plain MUI checkboxes
// on a dark surface read as near-identical whether on or off at a glance; the
// tinted, bordered row is what makes an active filter obvious without having to
// look at the box itself.
const FilterCheck = ({
  label,
  checked,
  onChange,
  dense
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  dense?: boolean
}) => (
  <FormControlLabel
    label={label}
    className={classnames('is-full mli-0 rounded border transition-colors', {
      'bg-primaryLight border-primary': checked,
      'border-transparent hover:bg-actionHover': !checked,
      'plb-0.5': dense,
      'plb-1': !dense
    })}
    control={
      <Checkbox size='small' checked={checked} onChange={e => onChange(e.target.checked)} />
    }
    slotProps={{
      typography: {
        variant: 'body2',
        color: checked ? 'text.primary' : 'text.secondary',
        className: checked ? 'font-medium' : ''
      }
    }}
  />
)

// Expanded row content: every marketplace credential for the company with its
// own last-sync timestamp. Grouped by platform; platforms with no credentials
// are shown as empty rather than hidden, so ops can tell "not configured" apart
// from "configured but never synced".
const CredentialSyncPanel = ({
  credentials,
  companyId,
  inFlight,
  onSyncCredential
}: {
  credentials: PlatformCredentials[]
  companyId: string
  inFlight: Set<string>
  onSyncCredential: (companyId: string, platform: PlatformKey, credentialId: string) => void
}) => (
  // A real table rather than stacked flex rows: the account and its timestamp
  // belong in aligned columns, otherwise they drift to opposite edges of a wide
  // viewport and stop reading as a pair. Platform is a rowSpan cell so each
  // marketplace reads as one block.
  <div className='bg-actionHover plb-4 pli-6 border-bs'>
    <div className='overflow-x-auto rounded border'>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className='is-[160px]'>Platform</th>
            <th>Account</th>
            <th className='is-[120px]'>Status</th>
            <th className='is-[200px]'>Last sync</th>
            <th className='is-[80px] text-center'>Sync</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map(({ key, label, accounts }) => {
            if (accounts.length === 0) {
              return (
                <tr key={key}>
                  <td>
                    <Typography variant='body2' color='text.primary' className='font-medium'>
                      {label}
                    </Typography>
                  </td>
                  <td colSpan={4}>
                    <Typography variant='body2' color='text.disabled'>
                      No accounts configured
                    </Typography>
                  </td>
                </tr>
              )
            }

            const syncedCount = accounts.filter(a => a.lastSync).length

            return accounts.map((acc, i) => {
              const busy = inFlight.has(`${companyId}:${key}:${acc.credentialId}`)

              return (
                <tr key={acc.credentialId || `${key}-${acc.username}`}>
                  {i === 0 && (
                    <td rowSpan={accounts.length} className='align-top'>
                      <Typography variant='body2' color='text.primary' className='font-medium'>
                        {label}
                      </Typography>
                      <Typography
                        variant='caption'
                        color={syncedCount === accounts.length ? 'success.main' : 'text.secondary'}
                      >
                        {syncedCount} of {accounts.length} synced
                      </Typography>
                    </td>
                  )}
                  <td>
                    <Typography variant='body2' color='text.primary' className='break-all'>
                      {acc.username}
                    </Typography>
                  </td>
                  <td>
                    {acc.isVerified ? (
                      <Chip size='small' variant='tonal' color='success' label='Verified' />
                    ) : (
                      // An unverified credential is skipped by the sync jobs
                      // entirely, which is usually why its date never advances.
                      <Tooltip title='Credential marked unverified — the sync jobs skip it until it is re-verified'>
                        <Chip size='small' variant='tonal' color='warning' label='Unverified' />
                      </Tooltip>
                    )}
                  </td>
                  <td>
                    <Typography
                      variant='body2'
                      color={acc.lastSync ? 'text.secondary' : 'text.disabled'}
                      className='whitespace-nowrap tabular-nums'
                    >
                      {acc.lastSync ? formatSyncDate(acc.lastSync) : 'Never synced'}
                    </Typography>
                  </td>
                  <td className='text-center'>
                    <Tooltip
                      title={
                        acc.credentialId
                          ? `Sync only ${acc.username}`
                          : 'Credential has no id — cannot sync individually'
                      }
                    >
                      <span>
                        <IconButton
                          size='small'
                          disabled={busy || !acc.credentialId || !companyId}
                          onClick={() => onSyncCredential(companyId, key, acc.credentialId)}
                        >
                          {busy ? <CircularProgress size={14} /> : <i className='tabler-refresh text-base' />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  </div>
)

const columnHelper = createColumnHelper<CompanyRow>()

const CompanyList = ({ impersonateBaseUrl }: Props) => {
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [inFlight, setInFlight] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPlatforms, setDialogPlatforms] = useState<Record<PlatformKey, boolean>>({
    ajio: true,
    myntra: false,
    snapdeal: false,
    meesho: false
  })
  const [dialogSubmitting, setDialogSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  // ── Credential filters (server-side) ────────────────────────────────────
  // Matched in the DB, not on the current page: credentials are spread across
  // ~600 companies, so filtering a single page client-side would miss almost
  // every match and make the counts lie.
  const [filterPlatforms, setFilterPlatforms] = useState<Record<PlatformKey, boolean>>({
    ajio: false,
    myntra: false,
    snapdeal: false,
    meesho: false
  })
  const [filterNoCredentials, setFilterNoCredentials] = useState(false)
  // Yes/No are independent checkboxes; both (or neither) ticked means "don't care".
  const [filterVerifiedYes, setFilterVerifiedYes] = useState(false)
  const [filterVerifiedNo, setFilterVerifiedNo] = useState(false)
  const [filterSyncedYes, setFilterSyncedYes] = useState(false)
  const [filterSyncedNo, setFilterSyncedNo] = useState(false)
  const [filterUsingMdYes, setFilterUsingMdYes] = useState(false)
  const [filterUsingMdNo, setFilterUsingMdNo] = useState(false)
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null)

  const selectedPlatforms = useMemo(
    () => (Object.keys(filterPlatforms) as PlatformKey[]).filter(k => filterPlatforms[k]),
    [filterPlatforms]
  )

  // Both or neither ticked collapses to undefined — an unanswerable filter.
  const credentialVerified = useMemo<'yes' | 'no' | undefined>(() => {
    if (filterVerifiedYes === filterVerifiedNo) return undefined

    return filterVerifiedYes ? 'yes' : 'no'
  }, [filterVerifiedYes, filterVerifiedNo])

  const masterDataSynced = useMemo<'yes' | 'no' | undefined>(() => {
    if (filterSyncedYes === filterSyncedNo) return undefined

    return filterSyncedYes ? 'yes' : 'no'
  }, [filterSyncedYes, filterSyncedNo])

  const isUsingMasterData = useMemo<'yes' | 'no' | undefined>(() => {
    if (filterUsingMdYes === filterUsingMdNo) return undefined

    return filterUsingMdYes ? 'yes' : 'no'
  }, [filterUsingMdYes, filterUsingMdNo])

  const activeFilterCount =
    selectedPlatforms.length +
    (filterNoCredentials ? 1 : 0) +
    (credentialVerified ? 1 : 0) +
    (masterDataSynced ? 1 : 0) +
    (isUsingMasterData ? 1 : 0)

  const clearFilters = useCallback(() => {
    setFilterPlatforms({ ajio: false, myntra: false, snapdeal: false, meesho: false })
    setFilterNoCredentials(false)
    setFilterVerifiedYes(false)
    setFilterVerifiedNo(false)
    setFilterSyncedYes(false)
    setFilterSyncedNo(false)
    setFilterUsingMdYes(false)
    setFilterUsingMdNo(false)
    setPage(0)
  }, [])

  // Which company rows have their per-credential sync panel open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpanded = useCallback((companyId: string) => {
    setExpanded(prev => ({ ...prev, [companyId]: !prev[companyId] }))
  }, [])

  // Debounce search input so we don't spam the API on every keystroke, and
  // reset to page 1 whenever the term changes so the user sees results from
  // the top of the new match set.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 400)

    return () => clearTimeout(t)
  }, [search])

  const reqIdRef = useRef(0)

  const fetchRows = useCallback(async () => {
    const reqId = ++reqIdRef.current

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/company/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: page + 1,
          limit: pageSize,
          search: debouncedSearch,
          // Omitted when unset so the BE skips the $match entirely.
          ...(selectedPlatforms.length ? { platforms: selectedPlatforms } : {}),
          ...(filterNoCredentials ? { noPlatformCredentials: true } : {}),
          ...(credentialVerified ? { credentialVerified } : {}),
          ...(masterDataSynced ? { masterDataSynced } : {}),
          ...(isUsingMasterData ? { isUsingMasterData } : {})
        })
      })

      const json = (await res.json().catch(() => null)) as ListResponse | null

      // A newer request has already fired — drop this stale response.
      if (reqId !== reqIdRef.current) return

      if (!res.ok || !json?.isSuccess) {
        const message = json?.displayMessage || json?.message || `Request failed (${res.status})`

        setRows([])
        setTotal(0)
        setError(message)

        return
      }

      const users = Array.isArray(json?.data?.users) ? json.data!.users : []

      setRows(users.map(mapUserToRow))
      setTotal(Number(json?.data?.metadata?.total ?? users.length))
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return
      setRows([])
      setTotal(0)
      setError(err?.message || 'Failed to fetch companies')
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    selectedPlatforms,
    filterNoCredentials,
    credentialVerified,
    masterDataSynced,
    isUsingMasterData
  ])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const selectedCompanyIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  )

  const pageIdsAllSelected = useMemo(
    () => rows.length > 0 && rows.every(r => selected[r.companyId]),
    [rows, selected]
  )

  const pageIdsSomeSelected = useMemo(
    () => rows.some(r => selected[r.companyId]),
    [rows, selected]
  )

  const toggleAllOnPage = () => {
    setSelected(prev => {
      const next = { ...prev }

      if (pageIdsAllSelected) {
        for (const r of rows) delete next[r.companyId]
      } else {
        for (const r of rows) if (r.companyId) next[r.companyId] = true
      }

      return next
    })
  }

  const toggleRow = (companyId: string) => {
    if (!companyId) return
    setSelected(prev => {
      const next = { ...prev }

      if (next[companyId]) delete next[companyId]
      else next[companyId] = true

      return next
    })
  }

  const openImpersonate = (userId: string) => {
    if (!userId) return
    window.open(`${impersonateBaseUrl}/${userId}`, '_blank', 'noopener,noreferrer')
  }

  const summarizeFanout = (data: SyncResponse['data']): Toast => {
    if (!data) return { severity: 'error', message: 'No response from server.' }

    const ok = data.results.filter(r => r.ok).map(r => r.platform)
    const failed = data.results.filter(r => !r.ok)
    const parts: string[] = []

    if (ok.length) parts.push(`Started: ${ok.join(', ')}`)
    if (failed.length) parts.push(`Failed: ${failed.map(f => `${f.platform} (${f.message || f.status})`).join('; ')}`)

    return {
      severity: failed.length === 0 ? 'success' : ok.length > 0 ? 'warning' : 'error',
      message: parts.join(' • ') || 'Sync request submitted.'
    }
  }

  const callTrigger = useCallback(
    async (companyIds: string[], platforms: PlatformKey[], credentialIds?: string[]) => {
      // Hit the Monitor's own Next API route, which reads the SystemAdmin
      // access token from the NextAuth session server-side and forwards to
      // TrackVid-BE. Keeps the raw JWT out of the browser.
      const res = await fetch('/api/company/trigger-master-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds,
          platforms,
          // Omitted for company/bulk syncs so the runner keeps its existing
          // "every login of this company" behaviour.
          ...(credentialIds?.length ? { credentialIds } : {})
        })
      })

      const json = (await res.json().catch(() => null)) as SyncResponse | null

      return { res, json }
    },
    []
  )

  const runSyncForRowPlatform = async (row: CompanyRow, platform: PlatformKey) => {
    if (!row.companyId) return
    const key = `${row.companyId}:${platform}`

    setInFlight(prev => {
      const next = new Set(prev)

      next.add(key)

      return next
    })

    try {
      const { json } = await callTrigger([row.companyId], [platform])

      setToast(summarizeFanout(json?.data))
      fetchRows()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Sync request failed' })
    } finally {
      setInFlight(prev => {
        const next = new Set(prev)

        next.delete(key)

        return next
      })
    }
  }

  // Sync ONE credential. Same endpoint as the per-platform button, plus a
  // credentialIds narrowing so the runner touches only this login instead of
  // every account the company holds on that platform.
  const runSyncForCredential = useCallback(
    async (companyId: string, platform: PlatformKey, credentialId: string) => {
      if (!companyId || !credentialId) return
      const key = `${companyId}:${platform}:${credentialId}`

      setInFlight(prev => {
        const next = new Set(prev)

        next.add(key)

        return next
      })

      try {
        const { json } = await callTrigger([companyId], [platform], [credentialId])

        setToast(summarizeFanout(json?.data))
        fetchRows()
      } catch (err: any) {
        setToast({ severity: 'error', message: err?.message || 'Sync request failed' })
      } finally {
        setInFlight(prev => {
          const next = new Set(prev)

          next.delete(key)

          return next
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callTrigger, fetchRows]
  )

  const submitBulkSync = async () => {
    const platforms = (Object.keys(dialogPlatforms) as PlatformKey[]).filter(k => dialogPlatforms[k])

    if (selectedCompanyIds.length === 0 || platforms.length === 0) {
      setToast({ severity: 'warning', message: 'Select at least one company and one platform.' })

      return
    }

    setDialogSubmitting(true)

    try {
      const { json } = await callTrigger(selectedCompanyIds, platforms)

      setToast(summarizeFanout(json?.data))
      setDialogOpen(false)
      fetchRows()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Sync request failed' })
    } finally {
      setDialogSubmitting(false)
    }
  }

  const columns = useMemo<ColumnDef<CompanyRow, any>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={pageIdsAllSelected}
            indeterminate={!pageIdsAllSelected && pageIdsSomeSelected}
            onChange={toggleAllOnPage}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            disabled={!row.original.companyId}
            checked={Boolean(selected[row.original.companyId])}
            onChange={() => toggleRow(row.original.companyId)}
          />
        ),
        enableSorting: false
      },
      {
        id: 'expander',
        header: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const isOpen = Boolean(expanded[row.original.companyId])
          const count = row.original.credentials.reduce((n, p) => n + p.accounts.length, 0)

          return (
            <Tooltip title={count ? (isOpen ? 'Hide accounts' : `Show ${count} account${count > 1 ? 's' : ''}`) : 'No accounts'}>
              <span>
                <IconButton
                  size='small'
                  disabled={!count}
                  aria-label={isOpen ? 'Collapse accounts' : 'Expand accounts'}
                  aria-expanded={isOpen}
                  onClick={() => toggleExpanded(row.original.companyId)}
                >
                  <i
                    className={classnames('text-base transition-transform', {
                      'tabler-chevron-right': true,
                      'rotate-90': isOpen
                    })}
                  />
                </IconButton>
              </span>
            </Tooltip>
          )
        }
      },
      columnHelper.accessor('companyName', {
        header: 'Company',
        cell: ({ row }) => (
          <Typography color='text.primary' className='font-medium'>
            {row.original.companyName}
          </Typography>
        )
      }),
      columnHelper.accessor('adminName', {
        header: 'Admin',
        cell: ({ row }) => <Typography>{row.original.adminName}</Typography>
      }),
      columnHelper.accessor('adminEmail', {
        header: 'Email',
        cell: ({ row }) => <Typography>{row.original.adminEmail}</Typography>
      }),
      columnHelper.accessor('adminPhone', {
        header: 'Phone',
        cell: ({ row }) => <Typography>{row.original.adminPhone || '—'}</Typography>
      }),
      {
        id: 'lastSync',
        header: 'Last Sync',
        enableSorting: false,
        cell: ({ row }) => (
          <div className='flex flex-col gap-0.5'>
            {row.original.credentials.map(({ key, label, accounts }) => {
              const busy = inFlight.has(`${row.original.companyId}:${key}`)
              const synced = accounts.filter(a => a.lastSync).length
              const rollup = row.original.lastSync[key]

              return (
                <div key={key} className='flex items-center gap-1 whitespace-nowrap'>
                  <Typography variant='body2'>
                    <span className='font-medium'>{label}:</span> {formatSyncDate(rollup)}
                  </Typography>
                  {/* Only meaningful once a platform has more than one account —
                      that is exactly when the single rollup date hides detail. */}
                  {accounts.length > 1 && (
                    <Tooltip title={`${synced} of ${accounts.length} accounts synced — expand for details`}>
                      <Typography variant='caption' color='text.secondary' className='tabular-nums'>
                        ({synced}/{accounts.length})
                      </Typography>
                    </Tooltip>
                  )}
                  <Tooltip title={`Sync ${label} for this company`}>
                    <span>
                      <IconButton
                        size='small'
                        disabled={busy || !row.original.companyId}
                        onClick={() => runSyncForRowPlatform(row.original, key)}
                      >
                        {busy ? <CircularProgress size={14} /> : <i className='tabler-refresh text-base' />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              )
            })}
          </div>
        )
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) => (
          <div className='flex items-center'>
            <Tooltip title='Open in TrackVid'>
              <span>
                <IconButton
                  disabled={!row.original.userId}
                  onClick={() => openImpersonate(row.original.userId)}
                >
                  <i className='tabler-eye text-textSecondary' />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `expanded` must stay here — the expander cell renders the chevron's
    // rotated state, so without it the arrow never flips on open/close.
    [impersonateBaseUrl, selected, inFlight, pageIdsAllSelected, pageIdsSomeSelected, rows, expanded, toggleExpanded]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min((page + 1) * pageSize, total)

  return (
    <Card>
      <CardHeader title='Companies' />
      {error && (
        <div className='px-6 pb-4'>
          <Alert severity='error'>{error}</Alert>
        </div>
      )}
      <div className='flex justify-between flex-col items-start md:flex-row md:items-center p-6 border-bs gap-4'>
        <CustomTextField
          select
          value={pageSize}
          onChange={e => {
            setPageSize(Number(e.target.value))
            setPage(0)
          }}
          className='max-sm:is-full sm:is-[90px]'
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <MenuItem key={size} value={String(size)}>
              {size}
            </MenuItem>
          ))}
        </CustomTextField>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
          {/* Match count for the current search + filters. Sits next to the
              Filter button so the number and the thing that changed it are read
              together — a filtered list is otherwise indistinguishable from an
              empty dataset. Spinner while fetching so a stale count is never
              mistaken for the new result. */}
          <div className='flex items-center gap-1.5 whitespace-nowrap'>
            {loading ? (
              <CircularProgress size={14} />
            ) : (
              <Typography
                variant='body2'
                color={activeFilterCount ? 'primary.main' : 'text.primary'}
                className='font-medium tabular-nums'
              >
                {total.toLocaleString('en-IN')}
              </Typography>
            )}
            <Typography variant='body2' color='text.secondary'>
              {total === 1 ? 'company' : 'companies'}
              {activeFilterCount ? ' found' : ''}
            </Typography>
          </div>
          <Badge
            badgeContent={activeFilterCount}
            color='primary'
            overlap='rectangular'
            invisible={!activeFilterCount}
          >
            <Button
              variant={activeFilterCount ? 'contained' : 'outlined'}
              color='primary'
              startIcon={<i className='tabler-filter' />}
              onClick={e => setFilterAnchor(e.currentTarget)}
              aria-haspopup='true'
              aria-expanded={Boolean(filterAnchor)}
            >
              Filter
            </Button>
          </Badge>
          <Popover
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            onClose={() => setFilterAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            elevation={8}
            slotProps={{
              paper: {
                // Explicit surface + border: on the dark theme the default paper
                // sits too close to the page colour and the table reads straight
                // through the panel.
                className: 'is-[320px] mbs-2 rounded-lg border bg-backgroundPaper overflow-hidden'
              }
            }}
          >
            {/* Header — states what the panel is and how much is active */}
            <div className='flex items-center justify-between gap-2 plb-3 pli-4 border-be bg-actionHover'>
              <div className='flex items-center gap-2'>
                <i className='tabler-filter text-lg text-textPrimary' />
                <Typography variant='subtitle1' color='text.primary' className='font-medium'>
                  Filters
                </Typography>
                {activeFilterCount > 0 && (
                  <Chip size='small' variant='tonal' color='primary' label={`${activeFilterCount} active`} />
                )}
              </div>
              <Button size='small' color='secondary' disabled={!activeFilterCount} onClick={clearFilters}>
                Clear all
              </Button>
            </div>

            <div className='flex flex-col gap-4 plb-4 pli-4 max-bs-[60vh] overflow-y-auto'>
              <div className='flex flex-col gap-1'>
                <Typography variant='overline' color='text.disabled' className='leading-none'>
                  Using master data
                </Typography>
                <Typography variant='caption' color='text.secondary' className='mbe-1'>
                  settings.isUsingMasterData — only these companies are picked up by the sync jobs
                </Typography>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='Yes'
                      checked={filterUsingMdYes}
                      onChange={v => {
                        setFilterUsingMdYes(v)
                        setPage(0)
                      }}
                    />
                  </div>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='No'
                      checked={filterUsingMdNo}
                      onChange={v => {
                        setFilterUsingMdNo(v)
                        setPage(0)
                      }}
                    />
                  </div>
                </div>
              </div>

              <Divider />

              <div className='flex flex-col gap-1'>
                <Typography variant='overline' color='text.disabled' className='leading-none'>
                  Platform
                </Typography>
                <Typography variant='caption' color='text.secondary' className='mbe-1'>
                  Companies holding a credential on any ticked platform
                </Typography>
                <FormGroup>
                  {PLATFORM_LABELS.map(({ key, label }) => (
                    <FilterCheck
                      key={key}
                      label={label}
                      checked={filterPlatforms[key]}
                      onChange={v => {
                        setFilterPlatforms(prev => ({ ...prev, [key]: v }))
                        setPage(0)
                      }}
                    />
                  ))}
                </FormGroup>
              </div>

              <Divider />

              <div className='flex flex-col gap-1'>
                <Typography variant='overline' color='text.disabled' className='leading-none'>
                  Not configured
                </Typography>
                <FilterCheck
                  label='No platform credentials'
                  checked={filterNoCredentials}
                  onChange={v => {
                    setFilterNoCredentials(v)
                    setPage(0)
                  }}
                />
                <Typography variant='caption' color='text.secondary' className='pis-2'>
                  Companies with no marketplace account set up. Combines with the platforms above as OR.
                </Typography>
              </div>

              <Divider />

              <div className='flex flex-col gap-1'>
                <Typography variant='overline' color='text.disabled' className='leading-none'>
                  Verified credential
                </Typography>
                <Typography variant='caption' color='text.secondary' className='mbe-1'>
                  Ticking both (or neither) means no preference
                </Typography>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='Yes'
                      checked={filterVerifiedYes}
                      onChange={v => {
                        setFilterVerifiedYes(v)
                        setPage(0)
                      }}
                    />
                  </div>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='No'
                      checked={filterVerifiedNo}
                      onChange={v => {
                        setFilterVerifiedNo(v)
                        setPage(0)
                      }}
                    />
                  </div>
                </div>
              </div>

              <Divider />

              <div className='flex flex-col gap-1'>
                <Typography variant='overline' color='text.disabled' className='leading-none'>
                  Master data synced today
                </Typography>
                <Typography variant='caption' color='text.secondary' className='mbe-1'>
                  &quot;No&quot; = at least one credential has not synced since midnight (IST)
                </Typography>
                <div className='flex gap-2'>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='Yes'
                      checked={filterSyncedYes}
                      onChange={v => {
                        setFilterSyncedYes(v)
                        setPage(0)
                      }}
                    />
                  </div>
                  <div className='flex-1'>
                    <FilterCheck
                      dense
                      label='No'
                      checked={filterSyncedNo}
                      onChange={v => {
                        setFilterSyncedNo(v)
                        setPage(0)
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className='flex justify-end plb-3 pli-4 border-bs bg-actionHover'>
              <Button size='small' variant='contained' onClick={() => setFilterAnchor(null)}>
                Done
              </Button>
            </div>
          </Popover>
          <Button
            variant='contained'
            color='primary'
            startIcon={<i className='tabler-refresh' />}
            disabled={selectedCompanyIds.length === 0}
            onClick={() => setDialogOpen(true)}
          >
            Master Sync{selectedCompanyIds.length ? ` (${selectedCompanyIds.length})` : ''}
          </Button>
          <CustomTextField
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search company, admin, email, phone'
            className='max-sm:is-full sm:is-[320px]'
          />
        </div>
      </div>
      {/* Applied filters stay visible after the popover closes — otherwise a
          filtered list looks identical to an unfiltered one and a stale filter
          gets mistaken for missing data. Each chip removes just its own term. */}
      {activeFilterCount > 0 && (
        <div className='flex items-center gap-2 flex-wrap pli-6 plb-3 border-bs bg-actionHover'>
          <Typography variant='body2' color='text.secondary'>
            Filtered by:
          </Typography>
          {selectedPlatforms.map(key => (
            <Chip
              key={key}
              size='small'
              variant='tonal'
              color='primary'
              label={PLATFORM_LABELS.find(p => p.key === key)?.label ?? key}
              onDelete={() => {
                setFilterPlatforms(prev => ({ ...prev, [key]: false }))
                setPage(0)
              }}
            />
          ))}
          {filterNoCredentials && (
            <Chip
              size='small'
              variant='tonal'
              color='primary'
              label='No platform credentials'
              onDelete={() => {
                setFilterNoCredentials(false)
                setPage(0)
              }}
            />
          )}
          {credentialVerified && (
            <Chip
              size='small'
              variant='tonal'
              color='primary'
              label={`Verified: ${credentialVerified === 'yes' ? 'Yes' : 'No'}`}
              onDelete={() => {
                setFilterVerifiedYes(false)
                setFilterVerifiedNo(false)
                setPage(0)
              }}
            />
          )}
          {masterDataSynced && (
            <Chip
              size='small'
              variant='tonal'
              color='primary'
              label={`Synced today: ${masterDataSynced === 'yes' ? 'Yes' : 'No'}`}
              onDelete={() => {
                setFilterSyncedYes(false)
                setFilterSyncedNo(false)
                setPage(0)
              }}
            />
          )}
          {isUsingMasterData && (
            <Chip
              size='small'
              variant='tonal'
              color='primary'
              label={`Using master data: ${isUsingMasterData === 'yes' ? 'Yes' : 'No'}`}
              onDelete={() => {
                setFilterUsingMdYes(false)
                setFilterUsingMdNo(false)
                setPage(0)
              }}
            />
          )}
          <Button size='small' color='secondary' onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={classnames({
                          'flex items-center': header.column.getIsSorted(),
                          'cursor-pointer select-none': header.column.getCanSort()
                        })}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <i className='tabler-chevron-up text-xl' />,
                          desc: <i className='tabler-chevron-down text-xl' />
                        }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          {loading ? (
            <tbody>
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                  <div className='flex justify-center py-6'>
                    <CircularProgress size={22} />
                  </div>
                </td>
              </tr>
            </tbody>
          ) : rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                  No companies found
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {table.getRowModel().rows.map(row => {
                const isOpen = Boolean(expanded[row.original.companyId])

                return [
                  <tr key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>,
                  isOpen ? (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={row.getVisibleCells().length} className='p-0 border-bs-0'>
                        <CredentialSyncPanel
                          credentials={row.original.credentials}
                          companyId={row.original.companyId}
                          inFlight={inFlight}
                          onSyncCredential={runSyncForCredential}
                        />
                      </td>
                    </tr>
                  ) : null
                ]
              })}
            </tbody>
          )}
        </table>
      </div>
      <div className='flex justify-between items-center flex-wrap pli-6 border-bs bs-auto plb-[12.5px] gap-2'>
        <Typography color='text.disabled'>
          {`Showing ${rangeStart} to ${rangeEnd} of ${total} entries`}
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

      <Dialog open={dialogOpen} onClose={() => (dialogSubmitting ? null : setDialogOpen(false))} maxWidth='xs' fullWidth>
        <DialogTitle>Master Sync</DialogTitle>
        <DialogContent>
          <Typography variant='body2' className='mbe-4'>
            Select platform(s) to sync for {selectedCompanyIds.length} selected company
            {selectedCompanyIds.length === 1 ? '' : 'ies'}.
          </Typography>
          <FormGroup>
            {PLATFORM_LABELS.map(({ key, label }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={dialogPlatforms[key]}
                    onChange={e => setDialogPlatforms(prev => ({ ...prev, [key]: e.target.checked }))}
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={dialogSubmitting}>
            Cancel
          </Button>
          <Button variant='contained' onClick={submitBulkSync} disabled={dialogSubmitting}>
            {dialogSubmitting ? <CircularProgress size={20} color='inherit' /> : 'Submit'}
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
    </Card>
  )
}

export default CompanyList
