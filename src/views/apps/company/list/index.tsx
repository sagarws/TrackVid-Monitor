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

export type CompanyRow = {
  userId: string
  companyId: string
  companyName: string
  adminName: string
  adminEmail: string
  adminPhone: string
  lastSync: {
    ajio: string
    myntra: string
    snapdeal: string
  }
}

type PlatformKey = keyof CompanyRow['lastSync']

const PLATFORM_LABELS: { key: PlatformKey; label: string }[] = [
  { key: 'ajio', label: 'Ajio' },
  { key: 'myntra', label: 'Myntra' },
  { key: 'snapdeal', label: 'Snapdeal' }
]

const TRACKED_PLATFORMS: PlatformKey[] = ['ajio', 'myntra', 'snapdeal']

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

const pickLastSync = (raw: any): CompanyRow['lastSync'] => {
  const out = { ajio: '', myntra: '', snapdeal: '' } as CompanyRow['lastSync']

  if (!raw || typeof raw !== 'object') return out
  for (const platform of TRACKED_PLATFORMS) out[platform] = toIsoDate(raw?.[platform])

  return out
}

const mapUserToRow = (u: any): CompanyRow => ({
  userId: String(u?._id ?? ''),
  companyId: String(u?.company?._id ?? ''),
  companyName: String(u?.company?.name ?? '—'),
  adminName: String(u?.name?.fullName || `${u?.name?.firstName ?? ''} ${u?.name?.lastName ?? ''}`.trim() || '—'),
  adminEmail: String(u?.email ?? ''),
  adminPhone: formatPhone(u?.phone),
  lastSync: pickLastSync(u?.company?.masterDataSync)
})

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
    snapdeal: false
  })
  const [dialogSubmitting, setDialogSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

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
        body: JSON.stringify({ page: page + 1, limit: pageSize, search: debouncedSearch })
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
  }, [page, pageSize, debouncedSearch])

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

  const callTrigger = useCallback(async (companyIds: string[], platforms: PlatformKey[]) => {
    // Hit the Monitor's own Next API route, which reads the SystemAdmin
    // access token from the NextAuth session server-side and forwards to
    // TrackVid-BE. Keeps the raw JWT out of the browser.
    const res = await fetch('/api/company/trigger-master-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds, platforms })
    })

    const json = (await res.json().catch(() => null)) as SyncResponse | null

    return { res, json }
  }, [])

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
            {PLATFORM_LABELS.map(({ key, label }) => {
              const busy = inFlight.has(`${row.original.companyId}:${key}`)

              return (
                <div key={key} className='flex items-center gap-1 whitespace-nowrap'>
                  <Typography variant='body2'>
                    <span className='font-medium'>{label}:</span> {formatSyncDate(row.original.lastSync[key])}
                  </Typography>
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
    [impersonateBaseUrl, selected, inFlight, pageIdsAllSelected, pageIdsSomeSelected, rows]
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
          className='max-sm:is-full sm:is-[70px]'
        >
          <MenuItem value='10'>10</MenuItem>
          <MenuItem value='25'>25</MenuItem>
          <MenuItem value='50'>50</MenuItem>
        </CustomTextField>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
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
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
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
