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

// Hook Imports
import useElementWidth from '@/hooks/useElementWidth'

// Config Imports
import { PLATFORMS } from '@/configs/platforms'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

// One stuck order inside a feed's pending_orders / failed_orders array.
export type VmsOrder = {
  orderId: string
  AWBNumber: string
  orderType: string
  // Resolved by the BE from the matching order row, for the current page only.
  // null when no order matched the AWB (or the lookup was capped) — which is
  // not the same as an order whose platform is blank.
  eCommercePlatform: string | null
}

// A feed carries the two arrays separately; `state` is attached when they are
// merged for display so a single table can show both.
export type VmsFeed = {
  feedId: string
  feedName: string
  pendingOrders: VmsOrder[]
  failedOrders: VmsOrder[]
  totalPendingOrders: number
  totalFailedOrders: number
}

export type VmsCompanyRow = {
  companyId: string
  companyName: string
  feeds: VmsFeed[]
  totalPendingOrders: number
  totalFailedOrders: number
}

type OrderState = 'pending' | 'failed'

// Companies per page. Each row carries every stuck order of every feed it owns,
// so the smaller sizes are the sane default.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

// Panel filter. Kept client-side: the API always returns both arrays, so this
// only decides what is rendered — no refetch, and the company-level counts
// above stay honest either way.
const STATE_FILTERS = [
  { key: 'all', label: 'Pending + Failed' },
  { key: 'pending', label: 'Pending only' },
  { key: 'failed', label: 'Failed only' }
] as const

type StateFilterKey = (typeof STATE_FILTERS)[number]['key']

type VmsResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    CompanyWiseData?: any[]
    metadata?: { total?: number; totalPage?: number; page?: number; limit?: number }
    totalPendingOrders?: number
    totalFailedOrders?: number
  }
}

const mapOrders = (orders: any): VmsOrder[] =>
  (Array.isArray(orders) ? orders : []).map((o: any) => ({
    orderId: String(o?._id ?? ''),
    AWBNumber: String(o?.AWBNumber ?? ''),
    orderType: String(o?.orderType ?? ''),
    eCommercePlatform: o?.eCommercePlatform ? String(o.eCommercePlatform) : null
  }))

// The stored value is free text in mixed casing ("AJIO" / "ajio" / "Ajio"), so
// it is matched case-insensitively against the shared list and rendered with
// that list's label. An unrecognised value is shown as-is rather than dropped.
const platformLabel = (value: string | null) => {
  if (!value) return null

  return PLATFORMS.find(p => p.key === value.trim().toLowerCase())?.label ?? value
}

const mapCompanyToRow = (c: any): VmsCompanyRow => ({
  companyId: String(c?.companyId ?? ''),
  companyName: String(c?.companyName ?? '—'),
  totalPendingOrders: Number(c?.totalPendingOrders ?? 0),
  totalFailedOrders: Number(c?.totalFailedOrders ?? 0),
  feeds: (Array.isArray(c?.feeds) ? c.feeds : []).map((f: any): VmsFeed => ({
    feedId: String(f?.feedId ?? ''),
    feedName: String(f?.feedName ?? '—'),
    pendingOrders: mapOrders(f?.pending_orders),
    failedOrders: mapOrders(f?.failed_orders),
    totalPendingOrders: Number(f?.totalPendingOrders ?? 0),
    totalFailedOrders: Number(f?.totalFailedOrders ?? 0)
  }))
})

// Expanded row content: every stuck order of the company, grouped by feed. Feed
// is a rowSpan cell so each feed reads as one block, and a feed with nothing
// left after the state filter is still listed — "this feed is clean" is
// information, not noise.
//
// `width` is the measured pixel width of the outer table scroller; see
// useElementWidth for why a definite width is required here.
const VmsOrdersPanel = ({
  feeds,
  stateFilter,
  width
}: {
  feeds: VmsFeed[]
  stateFilter: StateFilterKey
  width: number
}) => {
  const feedRows = feeds.map(feed => {
    const orders: { order: VmsOrder; state: OrderState }[] = [
      ...(stateFilter === 'failed' ? [] : feed.pendingOrders.map(order => ({ order, state: 'pending' as const }))),
      ...(stateFilter === 'pending' ? [] : feed.failedOrders.map(order => ({ order, state: 'failed' as const })))
    ]

    return { feed, orders }
  })

  return (
    <div className='bg-actionHover plb-4 pli-6 border-bs'>
      <div
        className='overflow-auto rounded border max-bs-[520px]'
        // pli-6 on the wrapper = 24px of padding either side.
        style={width ? { inlineSize: Math.max(240, width - 48) } : undefined}
      >
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th className='is-[220px]'>Feed</th>
              <th className='is-[60px]'>#</th>
              <th className='is-[220px]'>AWB</th>
              <th className='is-[140px]'>Order type</th>
              <th className='is-[140px]'>Platform</th>
              <th className='is-[120px]'>State</th>
              <th>Order id</th>
            </tr>
          </thead>
          <tbody>
            {feedRows.map(({ feed, orders }) => {
              if (orders.length === 0) {
                return (
                  <tr key={feed.feedId || feed.feedName}>
                    <td>
                      <Typography variant='body2' color='text.primary' className='font-medium'>
                        {feed.feedName}
                      </Typography>
                    </td>
                    <td colSpan={6}>
                      <Typography variant='body2' color='text.disabled'>
                        {stateFilter === 'all'
                          ? 'No stuck orders'
                          : `No ${stateFilter} orders (${feed.totalPendingOrders} pending, ${feed.totalFailedOrders} failed in total)`}
                      </Typography>
                    </td>
                  </tr>
                )
              }

              return orders.map(({ order, state }, i) => (
                <tr key={order.orderId || `${feed.feedId}-${state}-${i}`}>
                  {i === 0 && (
                    <td rowSpan={orders.length} className='align-top'>
                      <Typography variant='body2' color='text.primary' className='font-medium'>
                        {feed.feedName}
                      </Typography>
                      <Typography variant='caption' color='text.secondary'>
                        {feed.totalPendingOrders} pending · {feed.totalFailedOrders} failed
                      </Typography>
                    </td>
                  )}
                  <td>
                    <Typography variant='body2' color='text.disabled' className='tabular-nums'>
                      {i + 1}
                    </Typography>
                  </td>
                  <td>
                    <Typography variant='body2' color='text.primary' className='font-medium break-all'>
                      {order.AWBNumber || '—'}
                    </Typography>
                  </td>
                  <td>
                    <Typography variant='body2'>{order.orderType || '—'}</Typography>
                  </td>
                  <td>
                    {platformLabel(order.eCommercePlatform) ? (
                      <Chip size='small' variant='tonal' color='primary' label={platformLabel(order.eCommercePlatform)} />
                    ) : (
                      <Tooltip title='No order row matched this AWB, so its platform is unknown'>
                        <Typography variant='body2' color='text.disabled'>
                          —
                        </Typography>
                      </Tooltip>
                    )}
                  </td>
                  <td>
                    <Chip
                      size='small'
                      variant='tonal'
                      color={state === 'failed' ? 'error' : 'warning'}
                      label={state === 'failed' ? 'Failed' : 'Pending'}
                    />
                  </td>
                  <td>
                    <Typography variant='body2' color='text.secondary' className='break-all'>
                      {order.orderId || '—'}
                    </Typography>
                  </td>
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const columnHelper = createColumnHelper<VmsCompanyRow>()

const PendingVmsList = () => {
  const [rows, setRows] = useState<VmsCompanyRow[]>([])
  const [total, setTotal] = useState(0)
  // Global pending/failed totals the API reports across every company, not just
  // the current page — the number worth watching day to day.
  const [globalPending, setGlobalPending] = useState(0)
  const [globalFailed, setGlobalFailed] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [scrollerRef, scrollerWidth] = useElementWidth<HTMLDivElement>()

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
      const res = await fetch('/api/vms/pending-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: page + 1, limit: pageSize, search: debouncedSearch })
      })

      const json = (await res.json().catch(() => null)) as VmsResponse | null

      // A newer request has already fired — drop this stale response.
      if (reqId !== reqIdRef.current) return

      if (!res.ok || !json?.isSuccess) {
        const message = json?.displayMessage || json?.message || `Request failed (${res.status})`

        setRows([])
        setTotal(0)
        setError(message)

        return
      }

      const companies = Array.isArray(json?.data?.CompanyWiseData) ? json.data!.CompanyWiseData! : []

      setRows(companies.map(mapCompanyToRow))
      setTotal(Number(json?.data?.metadata?.total ?? companies.length))
      setGlobalPending(Number(json?.data?.totalPendingOrders ?? 0))
      setGlobalFailed(Number(json?.data?.totalFailedOrders ?? 0))
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return
      setRows([])
      setTotal(0)
      setError(err?.message || 'Failed to fetch pending orders')
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [page, pageSize, debouncedSearch])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const columns = useMemo<ColumnDef<VmsCompanyRow, any>[]>(
    () => [
      {
        id: 'expander',
        header: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const isOpen = Boolean(expanded[row.original.companyId])
          const count = row.original.feeds.length

          return (
            <Tooltip title={count ? (isOpen ? 'Hide feeds' : `Show ${count} feed${count > 1 ? 's' : ''}`) : 'No feeds'}>
              <span>
                <IconButton
                  size='small'
                  disabled={!count}
                  aria-label={isOpen ? 'Collapse feeds' : 'Expand feeds'}
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
              {row.original.feeds.length} feed{row.original.feeds.length === 1 ? '' : 's'} affected
            </Typography>
          </div>
        )
      }),
      columnHelper.accessor('totalPendingOrders', {
        header: 'Pending',
        cell: ({ row }) =>
          row.original.totalPendingOrders > 0 ? (
            <Chip
              size='small'
              variant='tonal'
              color='warning'
              label={row.original.totalPendingOrders.toLocaleString('en-IN')}
            />
          ) : (
            <Typography variant='body2' color='text.disabled'>
              —
            </Typography>
          )
      }),
      columnHelper.accessor('totalFailedOrders', {
        header: 'Failed',
        cell: ({ row }) =>
          row.original.totalFailedOrders > 0 ? (
            <Chip
              size='small'
              variant='tonal'
              color='error'
              label={row.original.totalFailedOrders.toLocaleString('en-IN')}
            />
          ) : (
            <Typography variant='body2' color='text.disabled'>
              —
            </Typography>
          )
      }),
      {
        id: 'feeds',
        header: 'Feeds',
        enableSorting: false,
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1 max-is-[420px]'>
            {row.original.feeds.map(feed => (
              <Tooltip
                key={feed.feedId || feed.feedName}
                title={`${feed.totalPendingOrders} pending · ${feed.totalFailedOrders} failed`}
              >
                <Chip
                  size='small'
                  variant='tonal'
                  color={feed.totalFailedOrders > 0 ? 'error' : feed.totalPendingOrders > 0 ? 'warning' : 'secondary'}
                  label={`${feed.feedName} · ${feed.totalPendingOrders + feed.totalFailedOrders}`}
                />
              </Tooltip>
            ))}
          </div>
        )
      }
    ],
    [expanded, toggleExpanded]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : page * pageSize + 1
  const rangeEnd = Math.min((page + 1) * pageSize, total)

  const pagePending = useMemo(() => rows.reduce((n, r) => n + r.totalPendingOrders, 0), [rows])
  const pageFailed = useMemo(() => rows.reduce((n, r) => n + r.totalFailedOrders, 0), [rows])

  return (
    <Card>
      <CardHeader
        title='Pending VMS'
        subheader='Companies with pending or failed orders, grouped by company and feed'
      />
      {error && (
        <div className='px-6 pb-4'>
          <Alert severity='error'>{error}</Alert>
        </div>
      )}
      {/* Platform-wide totals, straight from the API. These count every stuck
          order in the system — not the search/page slice below — so they stay
          comparable between visits. */}
      <div className='flex items-center gap-6 flex-wrap pli-6 pbe-6 max-md:pbs-0'>
        <div className='flex items-center gap-2'>
          <Typography variant='h5' color='warning.main' className='tabular-nums'>
            {globalPending.toLocaleString('en-IN')}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            pending orders (all companies)
          </Typography>
        </div>
        <div className='flex items-center gap-2'>
          <Typography variant='h5' color='error.main' className='tabular-nums'>
            {globalFailed.toLocaleString('en-IN')}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            failed orders (all companies)
          </Typography>
        </div>
      </div>
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
            label='Show orders'
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value as StateFilterKey)}
            className='max-sm:is-full sm:is-[200px]'
          >
            {STATE_FILTERS.map(({ key, label }) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </CustomTextField>
        </div>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
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
              {!loading && pagePending + pageFailed > 0
                ? ` • ${(pagePending + pageFailed).toLocaleString('en-IN')} orders on this page`
                : ''}
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
      <div ref={scrollerRef} className='overflow-x-auto'>
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
                  No pending or failed orders found
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
                        <VmsOrdersPanel feeds={row.original.feeds} stateFilter={stateFilter} width={scrollerWidth} />
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

export default PendingVmsList
