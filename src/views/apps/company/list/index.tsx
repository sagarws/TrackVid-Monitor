'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

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
import TablePagination from '@mui/material/TablePagination'
import Snackbar from '@mui/material/Snackbar'
import Chip from '@mui/material/Chip'

// Third-party Imports
import classnames from 'classnames'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import TablePaginationComponent from '@components/TablePaginationComponent'

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

type Toast = { severity: 'success' | 'error' | 'warning'; message: string }

type Props = {
  rows: CompanyRow[]
  impersonateBaseUrl: string
  error?: string
}

const columnHelper = createColumnHelper<CompanyRow>()

const CompanyList = ({ rows, impersonateBaseUrl, error }: Props) => {
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<CompanyRow[]>([])
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

  const filterOptions = useMemo(() => {
    const seen = new Set<string>()

    return rows.filter(r => {
      if (!r.companyId || seen.has(r.companyId)) return false
      seen.add(r.companyId)

      return true
    })
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pickedIds = new Set(companyFilter.map(c => c.companyId))

    return rows.filter(r => {
      if (pickedIds.size > 0 && !pickedIds.has(r.companyId)) return false
      if (q && !r.companyName.toLowerCase().includes(q)) return false

      return true
    })
  }, [rows, search, companyFilter])

  const selectedCompanyIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  )

  const filteredIdsAllSelected = useMemo(
    () => filteredRows.length > 0 && filteredRows.every(r => selected[r.companyId]),
    [filteredRows, selected]
  )

  const filteredIdsSomeSelected = useMemo(
    () => filteredRows.some(r => selected[r.companyId]),
    [filteredRows, selected]
  )

  const toggleAllFiltered = () => {
    setSelected(prev => {
      const next = { ...prev }

      if (filteredIdsAllSelected) {
        for (const r of filteredRows) delete next[r.companyId]
      } else {
        for (const r of filteredRows) if (r.companyId) next[r.companyId] = true
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
            checked={filteredIdsAllSelected}
            indeterminate={!filteredIdsAllSelected && filteredIdsSomeSelected}
            onChange={toggleAllFiltered}
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
    [impersonateBaseUrl, selected, inFlight, filteredIdsAllSelected, filteredIdsSomeSelected, filteredRows]
  )

  const table = useReactTable({
    data: filteredRows,
    columns,
    initialState: { pagination: { pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  })

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
          value={table.getState().pagination.pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          className='max-sm:is-full sm:is-[70px]'
        >
          <MenuItem value='10'>10</MenuItem>
          <MenuItem value='25'>25</MenuItem>
          <MenuItem value='50'>50</MenuItem>
        </CustomTextField>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
          <CustomAutocomplete
            multiple
            size='small'
            value={companyFilter}
            onChange={(_, value) => setCompanyFilter(value as CompanyRow[])}
            options={filterOptions}
            getOptionLabel={option => option.companyName || ''}
            isOptionEqualToValue={(option, value) => option.companyId === value.companyId}
            renderInput={params => <CustomTextField {...params} placeholder='Filter companies' />}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index })

                return <Chip key={key} label={option.companyName} size='small' {...tagProps} />
              })
            }
            className='max-sm:is-full sm:is-[320px]'
          />
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
            placeholder='Search by company name'
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
          {table.getFilteredRowModel().rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className='text-center'>
                  No companies found
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {table
                .getRowModel()
                .rows.slice(0, table.getState().pagination.pageSize)
                .map(row => (
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
      <TablePagination
        component={() => <TablePaginationComponent table={table as any} />}
        count={table.getFilteredRowModel().rows.length}
        rowsPerPage={table.getState().pagination.pageSize}
        page={table.getState().pagination.pageIndex}
        onPageChange={(_, page) => table.setPageIndex(page)}
      />

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
