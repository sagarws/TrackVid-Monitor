'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import TablePagination from '@mui/material/TablePagination'

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
}

type Props = {
  rows: CompanyRow[]
  impersonateBaseUrl: string
  error?: string
}

const columnHelper = createColumnHelper<CompanyRow>()

const CompanyList = ({ rows, impersonateBaseUrl, error }: Props) => {
  const [search, setSearch] = useState('')

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return rows

    return rows.filter(r => r.companyName.toLowerCase().includes(q))
  }, [rows, search])

  const openImpersonate = (userId: string) => {
    if (!userId) return
    window.open(`${impersonateBaseUrl}/${userId}`, '_blank', 'noopener,noreferrer')
  }

  const columns = useMemo<ColumnDef<CompanyRow, any>[]>(
    () => [
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
    [impersonateBaseUrl]
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
        <CustomTextField
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder='Search by company name'
          className='max-sm:is-full sm:is-[280px]'
        />
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
    </Card>
  )
}

export default CompanyList
