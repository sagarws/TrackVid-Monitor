'use client'

// React Imports
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Chip from '@mui/material/Chip'

// Third-party Imports
import classnames from 'classnames'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

// One Pending CMS claim, exactly as system-admin/cms/pending-by-company emits
// it. `createdAt` arrives pre-formatted in IST ("YYYY-MM-DD HH:mm:ss") — it is
// NOT an ISO instant, so it is displayed as-is rather than re-parsed into the
// browser's timezone, which would silently shift every row by the local offset.
export type PendingClaim = {
  claimId: string
  typeOfReason: string
  userId: string
  AWBNumber: string
  subOrderNumber: string
  forwardAWB: string
  username: string
  createdAt: string
  scriptProcessingStatus: string | null
  scriptProcessingError: string | null
  processCount: number
}

export type PendingCompanyRow = {
  companyId: string
  companyName: string
  // Admin user of the company — what the impersonate link opens. Null when the
  // company has no admin-role user, in which case the link is disabled.
  userId: string
  pendingCount: number
  platformCredCount: number
  claims: PendingClaim[]
}

// The report is per-platform: the BE lower-cases whatever is sent and matches
// the stored casing variants, so plain lowercase keys are safe here.
const PLATFORMS = [
  { key: 'myntra', label: 'Myntra' },
  { key: 'ajio', label: 'Ajio' },
  { key: 'snapdeal', label: 'Snapdeal' },
  { key: 'meesho', label: 'Meesho' }
] as const

type PlatformKey = (typeof PLATFORMS)[number]['key']

// Companies per page (each row carries all of its pending claims), so the
// smaller sizes are the useful default — 200 companies is 200 claim lists.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

const SORT_OPTIONS = [
  { key: 'desc', label: 'Most pending first' },
  { key: 'asc', label: 'Least pending first' }
] as const

type SortKey = (typeof SORT_OPTIONS)[number]['key']

type PendingResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    companies: any[]
    metadata?: { total?: number; totalPage?: number; page?: number; limit?: number }
  }
}

type Props = {
  impersonateBaseUrl: string
}

// Script status is free text from the runner, so it is normalised for colour
// rather than matched exactly — new statuses fall back to a neutral chip
// instead of disappearing.
const statusColor = (status: string | null): 'default' | 'success' | 'error' | 'warning' | 'info' => {
  const s = (status ?? '').toLowerCase()

  if (!s) return 'default'
  if (s.includes('fail') || s.includes('error')) return 'error'
  if (s.includes('complete') || s.includes('success') || s.includes('done')) return 'success'
  if (s.includes('progress') || s.includes('running') || s.includes('process')) return 'info'
  if (s.includes('not started') || s.includes('pending') || s.includes('queue')) return 'warning'

  return 'default'
}

const mapCompanyToRow = (c: any): PendingCompanyRow => ({
  companyId: String(c?.companyId ?? ''),
  companyName: String(c?.companyName ?? '—'),
  userId: c?.userId ? String(c.userId) : '',
  pendingCount: Number(c?.pendingCount ?? 0),
  platformCredCount: Number(c?.platformCredCount ?? 0),
  claims: (Array.isArray(c?.pendingClaims) ? c.pendingClaims : []).map((claim: any): PendingClaim => ({
    claimId: String(claim?.claimId ?? ''),
    typeOfReason: String(claim?.typeOfReason ?? ''),
    userId: String(claim?.userId ?? ''),
    AWBNumber: String(claim?.AWBNumber ?? ''),
    subOrderNumber: String(claim?.subOrderNumber ?? ''),
    forwardAWB: String(claim?.forwardAWB ?? ''),
    username: String(claim?.username ?? ''),
    createdAt: String(claim?.createdAt ?? ''),
    scriptProcessingStatus: claim?.scriptProcessingStatus ?? null,
    scriptProcessingError: claim?.scriptProcessingError ?? null,
    processCount: Number(claim?.processCount ?? 0)
  }))
})

// Collapsed-row summary: how many of the company's pending claims sit in each
// script status. Ops reads this to tell "nothing has run yet" apart from "the
// script ran and left these behind" without expanding every company.
const summarizeStatuses = (claims: PendingClaim[]) => {
  const counts = new Map<string, number>()

  for (const claim of claims) {
    const label = claim.scriptProcessingStatus?.trim() || 'No status'

    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

// Expanded row content: every pending claim of the company on the selected
// platform, with the script's own status and error text. The error is the
// column ops actually acts on, so it gets the widest cell and a tooltip with
// the untruncated message.
const PendingClaimsPanel = ({ claims }: { claims: PendingClaim[] }) => (
  <div className='bg-actionHover plb-4 pli-6 border-bs'>
    <div className='overflow-auto rounded border max-bs-[520px]'>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className='is-[60px]'>#</th>
            <th className='is-[170px]'>AWB</th>
            <th className='is-[170px]'>Forward AWB</th>
            <th className='is-[140px]'>Sub-order</th>
            <th className='is-[200px]'>Reason</th>
            <th className='is-[200px]'>Account</th>
            <th className='is-[170px]'>Created</th>
            <th className='is-[80px] text-center'>Tries</th>
            <th className='is-[140px]'>Status</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim, i) => (
            <tr key={claim.claimId || `${claim.AWBNumber}-${i}`}>
              <td>
                <Typography variant='body2' color='text.disabled' className='tabular-nums'>
                  {i + 1}
                </Typography>
              </td>
              <td>
                <Typography variant='body2' color='text.primary' className='font-medium break-all'>
                  {claim.AWBNumber || '—'}
                </Typography>
              </td>
              <td>
                <Typography variant='body2' className='break-all'>
                  {claim.forwardAWB || '—'}
                </Typography>
              </td>
              <td>
                <Typography variant='body2' className='break-all'>
                  {claim.subOrderNumber || '—'}
                </Typography>
              </td>
              <td>
                <Typography variant='body2'>{claim.typeOfReason || '—'}</Typography>
              </td>
              <td>
                <Typography variant='body2' className='break-all'>
                  {claim.username || '—'}
                </Typography>
              </td>
              <td>
                <Typography variant='body2' color='text.secondary' className='whitespace-nowrap tabular-nums'>
                  {claim.createdAt || '—'}
                </Typography>
              </td>
              <td className='text-center'>
                <Typography variant='body2' className='tabular-nums'>
                  {claim.processCount}
                </Typography>
              </td>
              <td>
                <Chip
                  size='small'
                  variant='tonal'
                  color={statusColor(claim.scriptProcessingStatus)}
                  label={claim.scriptProcessingStatus?.trim() || 'No status'}
                />
              </td>
              <td>
                {claim.scriptProcessingError ? (
                  <Tooltip title={claim.scriptProcessingError}>
                    <Typography variant='body2' color='error.main' className='min-is-[220px]'>
                      {claim.scriptProcessingError}
                    </Typography>
                  </Tooltip>
                ) : (
                  <Typography variant='body2' color='text.disabled'>
                    —
                  </Typography>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const columnHelper = createColumnHelper<PendingCompanyRow>()

const PendingCmsList = ({ impersonateBaseUrl }: Props) => {
  const [rows, setRows] = useState<PendingCompanyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [platform, setPlatform] = useState<PlatformKey>('myntra')
  const [sort, setSort] = useState<SortKey>('desc')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpanded = useCallback((companyId: string) => {
    setExpanded(prev => ({ ...prev, [companyId]: !prev[companyId] }))
  }, [])

  // Debounce the search box so a company name isn't re-queried per keystroke,
  // and reset to page 1 so results are read from the top of the new match set.
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
      const res = await fetch('/api/cms/pending-by-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: page + 1,
          limit: pageSize,
          search: debouncedSearch,
          eCommercePlatform: platform,
          sort
        })
      })

      const json = (await res.json().catch(() => null)) as PendingResponse | null

      // A newer request has already fired — drop this stale response.
      if (reqId !== reqIdRef.current) return

      if (!res.ok || !json?.isSuccess) {
        const message = json?.displayMessage || json?.message || `Request failed (${res.status})`

        setRows([])
        setTotal(0)
        setError(message)

        return
      }

      const companies = Array.isArray(json?.data?.companies) ? json.data!.companies : []

      setRows(companies.map(mapCompanyToRow))
      setTotal(Number(json?.data?.metadata?.total ?? companies.length))
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return
      setRows([])
      setTotal(0)
      setError(err?.message || 'Failed to fetch pending claims')
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, platform, sort])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const openImpersonate = useCallback(
    (userId: string) => {
      if (!userId) return
      window.open(`${impersonateBaseUrl}/${userId}`, '_blank', 'noopener,noreferrer')
    },
    [impersonateBaseUrl]
  )

  // Total pending claims across the companies on this page — the page-level
  // number the platform filter is actually judged by.
  const pageClaimTotal = useMemo(() => rows.reduce((n, r) => n + r.pendingCount, 0), [rows])

  const columns = useMemo<ColumnDef<PendingCompanyRow, any>[]>(
    () => [
      {
        id: 'expander',
        header: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const isOpen = Boolean(expanded[row.original.companyId])
          const count = row.original.claims.length

          return (
            <Tooltip title={count ? (isOpen ? 'Hide claims' : `Show ${count} claim${count > 1 ? 's' : ''}`) : 'No claims'}>
              <span>
                <IconButton
                  size='small'
                  disabled={!count}
                  aria-label={isOpen ? 'Collapse claims' : 'Expand claims'}
                  aria-expanded={isOpen}
                  onClick={() => toggleExpanded(row.original.companyId)}
                >
                  <i
                    className={classnames('tabler-chevron-right text-base transition-transform', {
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
          <div className='flex flex-col'>
            <Typography color='text.primary' className='font-medium'>
              {row.original.companyName}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {row.original.platformCredCount} account{row.original.platformCredCount === 1 ? '' : 's'} configured
            </Typography>
          </div>
        )
      }),
      columnHelper.accessor('pendingCount', {
        header: 'Pending',
        cell: ({ row }) => (
          <Chip size='small' variant='tonal' color='primary' label={row.original.pendingCount.toLocaleString('en-IN')} />
        )
      }),
      {
        id: 'scriptStatus',
        header: 'Script Status',
        enableSorting: false,
        cell: ({ row }) => {
          const summary = summarizeStatuses(row.original.claims)

          if (!summary.length) {
            return (
              <Typography variant='body2' color='text.disabled'>
                —
              </Typography>
            )
          }

          return (
            <div className='flex flex-wrap gap-1'>
              {summary.map(([status, count]) => (
                <Chip
                  key={status}
                  size='small'
                  variant='tonal'
                  color={statusColor(status === 'No status' ? null : status)}
                  label={`${status} · ${count}`}
                />
              ))}
            </div>
          )
        }
      },
      {
        id: 'scriptError',
        header: 'Latest Error',
        enableSorting: false,
        cell: ({ row }) => {
          // The newest error is the one worth surfacing collapsed: claims come
          // back oldest-first, so the last one carrying an error is the most
          // recent failure. The count tells whether it is the whole story.
          const withError = row.original.claims.filter(c => c.scriptProcessingError)
          const latest = withError[withError.length - 1]

          if (!latest?.scriptProcessingError) {
            return (
              <Typography variant='body2' color='text.disabled'>
                —
              </Typography>
            )
          }

          return (
            <Tooltip title={latest.scriptProcessingError}>
              <div className='flex flex-col max-is-[320px]'>
                <Typography variant='body2' color='error.main' className='truncate'>
                  {latest.scriptProcessingError}
                </Typography>
                {withError.length > 1 && (
                  <Typography variant='caption' color='text.secondary'>
                    +{withError.length - 1} more claim{withError.length - 1 === 1 ? '' : 's'} with errors
                  </Typography>
                )}
              </div>
            </Tooltip>
          )
        }
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) => (
          <div className='flex items-center'>
            <Tooltip title={row.original.userId ? 'Open in TrackVid' : 'No admin user for this company'}>
              <span>
                <IconButton disabled={!row.original.userId} onClick={() => openImpersonate(row.original.userId)}>
                  <i className='tabler-external-link text-textSecondary' />
                </IconButton>
              </span>
            </Tooltip>
          </div>
        )
      }
    ],
    [expanded, toggleExpanded, openImpersonate]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min((page + 1) * pageSize, total)
  const platformLabel = PLATFORMS.find(p => p.key === platform)?.label ?? platform

  return (
    <Card>
      <CardHeader
        title='Pending CMS'
        subheader={`Companies with pending ${platformLabel} claims, grouped by company`}
      />
      {error && (
        <div className='px-6 pb-4'>
          <Alert severity='error'>{error}</Alert>
        </div>
      )}
      <div className='flex justify-between flex-col items-start md:flex-row md:items-center p-6 border-bs gap-4'>
        <div className='flex items-center gap-4 flex-wrap max-sm:is-full'>
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
          <CustomTextField
            select
            label='Platform'
            value={platform}
            onChange={e => {
              setPlatform(e.target.value as PlatformKey)
              setPage(0)
              // Expanded panels belong to the previous platform's claims —
              // keeping them open would re-open unrelated rows by companyId.
              setExpanded({})
            }}
            className='max-sm:is-full sm:is-[160px]'
          >
            {PLATFORMS.map(({ key, label }) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            select
            label='Sort'
            value={sort}
            onChange={e => {
              setSort(e.target.value as SortKey)
              setPage(0)
            }}
            className='max-sm:is-full sm:is-[200px]'
          >
            {SORT_OPTIONS.map(({ key, label }) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </CustomTextField>
        </div>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
          {/* Company count plus the claim total on this page: a small number of
              companies can still hide thousands of pending claims. */}
          <div className='flex items-center gap-1.5 whitespace-nowrap'>
            {loading ? (
              <CircularProgress size={14} />
            ) : (
              <Typography variant='body2' color='text.primary' className='font-medium tabular-nums'>
                {total.toLocaleString('en-IN')}
              </Typography>
            )}
            <Typography variant='body2' color='text.secondary'>
              {total === 1 ? 'company' : 'companies'}
              {!loading && pageClaimTotal > 0 ? ` • ${pageClaimTotal.toLocaleString('en-IN')} claims on this page` : ''}
            </Typography>
          </div>
          <CustomTextField
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search company'
            className='max-sm:is-full sm:is-[280px]'
          />
        </div>
      </div>
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                  No pending claims found
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
                        <PendingClaimsPanel claims={row.original.claims} />
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
        <Typography color='text.disabled'>{`Showing ${rangeStart} to ${rangeEnd} of ${total} entries`}</Typography>
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
  )
}

export default PendingCmsList
