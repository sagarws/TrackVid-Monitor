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
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'

// Third-party Imports
import classnames from 'classnames'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Hook Imports
import useElementWidth from '@/hooks/useElementWidth'

// Config Imports
import { PLATFORMS } from '@/configs/platforms'
import type { PlatformKey } from '@/configs/platforms'

// Component Imports
import AccountCountFilter, { useAccountFilter } from '@/components/AccountCountFilter'
import CopyableId from '@/components/CopyableId'
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

// Metadata for a Myntra cookie jar harvested by the Chrome extension or the
// automation. The jar's VALUES are deliberately not part of this shape — the BE
// projects names only, because the cookies are live Myntra auth tokens.
export type MyntraSession = {
  savedAt: string | null
  expiresAt: string | null
  ip: string | null
  source: string | null
  // Myntra records whether a Bright Data proxy session minted the jar; Flipkart
  // records whether the fk-csrf-token that signs its API calls is present. Each
  // platform sets only its own flag.
  hasProxySession?: boolean
  hasCsrfToken?: boolean
  cookieNames: string[]
}

// One configured login on the platform being reported on.
export type PlatformCredential = {
  credentialId: string
  username: string
  accountType: string
  vendorCode: string
  isVerified: boolean
  visible: boolean
  myntraSession: MyntraSession | null
  flipkartSession: MyntraSession | null
}

export type PendingCompanyRow = {
  companyId: string
  companyName: string
  // Admin user of the company — what the impersonate link opens. Null when the
  // company has no admin-role user, in which case the link is disabled.
  userId: string
  pendingCount: number
  platformCredCount: number
  credentials: PlatformCredential[]
  claims: PendingClaim[]
}


// Companies per page (each row carries all of its pending claims), so the
// smaller sizes are the useful default — 200 companies is 200 claim lists.
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

const SORT_OPTIONS = [
  { key: 'desc', label: 'Most pending first' },
  { key: 'asc', label: 'Least pending first' }
] as const

type SortKey = (typeof SORT_OPTIONS)[number]['key']

// Mirrors the MAX_IDS guard in runReturnScriptByIds. Checked here too so a
// select-all across a busy marketplace is refused before the round-trip.
const MAX_PROCESS_IDS = 2000

// CMS_SCRIPT_STATUS, in the BE's own casing — /cms/change-script-status
// validates both ends of the flip against this exact set.
const SCRIPT_STATUSES = [
  'Not Started',
  'Queued',
  'Running',
  'Success',
  'Help Center Failed',
  'Failed',
  'Completed'
] as const

// Sentinel for "the field is missing or null", which the BE accepts as
// currentStatus but cannot be expressed as a Select value.
const NO_STATUS = '__no_status__'

// CMS_STATUS — the claim's own lifecycle status, not the runner's. Used by the
// "Clear Account" filter, which rewrites historical rows and so has to say
// exactly which ones.
const CLAIM_STATUSES = [
  'Pending',
  'In Review',
  'Un Attended',
  'In Progress',
  'Customer Replied',
  'Approved',
  'Rejected',
  'Resolved',
  'Awaiting Seller Response',
  'Awaiting Agent Response',
  'Paid',
  'Failed to Proceed'
] as const

// Which field the clear touches, per platform. Mirrors
// USERNAME_FIELD_BY_PLATFORM in the BE controller — shown in the dialog so the
// operator can see what is about to be unset rather than trusting the label.
const ACCOUNT_FIELD_BY_PLATFORM: Record<string, string> = {
  ajio: 'ajio_account_email',
  meesho: 'meesho_account_email',
  snapdeal: 'snapdeal_account_username',
  myntra: 'myntraClaimDetails.username',
  nykaa: 'nykaaClaimDetails.username'
}

const accountFieldFor = (platform: string) => ACCOUNT_FIELD_BY_PLATFORM[platform] || 'otherClaimDetails.username'

// Statuses the BE refuses to re-dispatch (RUNNING / SUCCESS / QUEUED). Such
// claims stay selectable — "Change Status" exists precisely to un-stick them —
// but they are counted separately so the Process button never claims it will
// run something the server is going to skip.
const BLOCKING_STATUSES = new Set(['running', 'success', 'queued'])

const isProcessable = (claim: PendingClaim) =>
  Boolean(claim.claimId) && !BLOCKING_STATUSES.has((claim.scriptProcessingStatus ?? '').trim().toLowerCase())

type PendingResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    companies: any[]
    metadata?: { total?: number; totalPage?: number; page?: number; limit?: number }
  }
}

type RunJob = {
  companyId: string
  companyName?: string
  jobId?: string | number
  jobState?: string
  status?: string
  queuePosition?: number
  totalInQueue?: number
  existing?: boolean
  cmsIds?: string[]
}

type RunSkipped = {
  notFound?: string[]
  alreadyProcessing?: string[]
  drivePending?: string[]
  perCompanyErrors?: { companyId: string; companyName?: string; reason: string; cmsIds: string[] }[]
}

type RunResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: { jobs?: RunJob[]; skipped?: RunSkipped }
}

type StatusChangeResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    matched?: number
    modified?: number
    currentStatus?: string | null
    newStatus?: string
    eCommercePlatform?: string
    companyIds?: string[]
    invalidIds?: string[]
  } | null
}

type ClearAccountResponse = {
  isSuccess: boolean
  displayMessage?: string
  message?: string
  data?: {
    field?: string
    matched?: number
    modified?: number
    dryRun?: boolean
    filter?: { platform?: string; statuses?: string[]; scriptProcessingStatus?: string | null }
  } | null
}

type Toast = { severity: 'success' | 'error' | 'warning' | 'info'; message: string }

// A claim is selected by id; its company is carried along so the confirm dialog
// can still name the companies after a page change, and `processable` so the
// dispatchable count survives too.
type SelectedClaim = { companyId: string; companyName: string; processable: boolean }

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
  credentials: (Array.isArray(c?.platformCredentials) ? c.platformCredentials : []).map(
    (cred: any): PlatformCredential => ({
      credentialId: String(cred?._id ?? ''),
      username: String(cred?.username ?? ''),
      accountType: String(cred?.accountType ?? ''),
      vendorCode: String(cred?.vendorCode ?? ''),
      // Absent on legacy credentials saved before the field existed; those
      // count as verified, matching the automation's own rule.
      isVerified: cred?.is_verified !== false,
      visible: cred?.visible !== false,
      myntraSession: cred?.myntraSession
        ? {
            savedAt: cred.myntraSession.savedAt ?? null,
            expiresAt: cred.myntraSession.expiresAt ?? null,
            ip: cred.myntraSession.ip ?? null,
            source: cred.myntraSession.source ?? null,
            hasProxySession: Boolean(cred.myntraSession.hasProxySession),
            cookieNames: Array.isArray(cred.myntraSession.cookieNames) ? cred.myntraSession.cookieNames : []
          }
        : null,
      flipkartSession: cred?.flipkartSession
        ? {
            savedAt: cred.flipkartSession.savedAt ?? null,
            expiresAt: cred.flipkartSession.expiresAt ?? null,
            ip: cred.flipkartSession.ip ?? null,
            source: cred.flipkartSession.source ?? null,
            hasCsrfToken: Boolean(cred.flipkartSession.hasCsrfToken),
            cookieNames: Array.isArray(cred.flipkartSession.cookieNames) ? cred.flipkartSession.cookieNames : []
          }
        : null
    })
  ),
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

// A jar is only useful until it expires; the automation refuses an expired one,
// so "Expired" here explains a company whose claims never leave Not Started.
const sessionState = (session: MyntraSession | null): { label: string; color: 'success' | 'error' | 'default' } => {
  if (!session) return { label: 'No session', color: 'default' }

  const expiry = session.expiresAt ? new Date(session.expiresAt).getTime() : NaN

  if (Number.isNaN(expiry)) return { label: 'Unknown expiry', color: 'default' }

  return expiry > Date.now() ? { label: 'Active', color: 'success' } : { label: 'Expired', color: 'error' }
}

// ISO instants from the session record, shown in the viewer's own timezone —
// unlike claim `createdAt`, these really are instants.
const formatInstant = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)

  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-IN', { hour12: true })
}

// "in 42m" / "2h ago" — the number ops actually reads off an expiry.
const relativeToNow = (iso: string | null) => {
  if (!iso) return ''
  const ms = new Date(iso).getTime()

  if (Number.isNaN(ms)) return ''

  const diff = ms - Date.now()
  const mins = Math.round(Math.abs(diff) / 60000)
  const text = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`

  return diff >= 0 ? `in ${text}` : `${text} ago`
}

// The company's configured logins on the selected platform. Sits above the
// claims table because "is this account even usable?" is the first question
// asked of a company whose claims are all stuck.
const CredentialsPanel = ({
  credentials,
  platform,
  renewing,
  onViewSession,
  onRenewSession
}: {
  credentials: PlatformCredential[]
  platform: PlatformKey
  // credentialIds with a renewal in flight — the login takes ~30-60s, so the
  // row has to say so for the whole of it.
  renewing: Set<string>
  onViewSession: (credential: PlatformCredential) => void
  onRenewSession: (credential: PlatformCredential) => void
}) => {
  const isMyntra = platform === 'myntra'
  const isFlipkart = platform === 'flipkart'

  // Both platforms cache a session per credential and can renew it on demand;
  // every other platform logs in fresh each run and has nothing to show here.
  const supportsSession = isMyntra || isFlipkart
  const sessionLabel = isFlipkart ? 'Flipkart session' : 'Myntra session'
  const sessionFor = (cred: PlatformCredential) => (isFlipkart ? cred.flipkartSession : cred.myntraSession)

  return (
    <div className='overflow-auto rounded border mbe-4'>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className='is-[280px]'>Account</th>
            <th className='is-[140px]'>Type</th>
            <th className='is-[160px]'>Vendor code</th>
            <th className='is-[140px]'>Verified</th>
            {supportsSession && <th className='is-[280px]'>{sessionLabel}</th>}
            {supportsSession && <th className='is-[90px] text-center'>View</th>}
          </tr>
        </thead>
        <tbody>
          {credentials.length === 0 ? (
            <tr>
              <td colSpan={supportsSession ? 6 : 4}>
                <Typography variant='body2' color='text.disabled'>
                  No accounts configured on this platform — the claims below cannot be dispatched
                </Typography>
              </td>
            </tr>
          ) : (
            credentials.map((cred, i) => {
              const session = sessionFor(cred)
              const state = sessionState(session)
              const busy = renewing.has(cred.credentialId)

              return (
                <tr key={cred.credentialId || `${cred.username}-${i}`}>
                  <td>
                    <Typography variant='body2' color='text.primary' className='font-medium break-all'>
                      {cred.username || '—'}
                    </Typography>
                    {!cred.visible && (
                      <Typography variant='caption' color='text.disabled'>
                        Hidden from the seller UI
                      </Typography>
                    )}
                  </td>
                  <td>
                    <Typography variant='body2'>{cred.accountType || '—'}</Typography>
                  </td>
                  <td>
                    <Typography variant='body2' className='break-all'>
                      {cred.vendorCode || '—'}
                    </Typography>
                  </td>
                  <td>
                    {cred.isVerified ? (
                      <Chip size='small' variant='tonal' color='success' label='Verified' />
                    ) : (
                      <Tooltip title='The automation skips an unverified credential until it is re-verified'>
                        <Chip size='small' variant='tonal' color='warning' label='Unverified' />
                      </Tooltip>
                    )}
                  </td>
                  {supportsSession && (
                    <td>
                      <div className='flex items-center gap-2'>
                        <Tooltip
                          title={
                            session?.expiresAt
                              ? `Expires ${formatInstant(session.expiresAt)} (${relativeToNow(session.expiresAt)})`
                              : 'No cookie jar stored for this account'
                          }
                        >
                          <Chip size='small' variant='tonal' color={state.color} label={state.label} />
                        </Tooltip>
                        <Tooltip
                          title={
                            busy
                              ? isFlipkart
                                ? 'Logging in to Flipkart — the OTP mail can take a couple of minutes'
                                : 'Logging in to Myntra — this takes up to a minute'
                              : `Run a fresh ${isFlipkart ? 'Flipkart' : 'Myntra'} login and store the new session`
                          }
                        >
                          <span>
                            <Button
                              size='small'
                              variant='tonal'
                              color='primary'
                              disabled={busy || !cred.credentialId}
                              startIcon={
                                busy ? <CircularProgress size={14} color='inherit' /> : <i className='tabler-refresh' />
                              }
                              onClick={() => onRenewSession(cred)}
                            >
                              {busy ? 'Renewing' : 'Renew'}
                            </Button>
                          </span>
                        </Tooltip>
                      </div>
                    </td>
                  )}
                  {supportsSession && (
                    <td className='text-center'>
                      <Tooltip title={session ? 'View session details' : 'No session to view'}>
                        <span>
                          <IconButton size='small' disabled={!session} onClick={() => onViewSession(cred)}>
                            <i className='tabler-eye text-base' />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// Expanded row content: every pending claim of the company on the selected
// platform, with the script's own status and error text. The error is the
// column ops actually acts on, so it gets the widest cell and a tooltip with
// the untruncated message.
//
// `width` is the measured pixel width of the outer table scroller. It is set
// explicitly because a table cell is sized from its content's max-content
// width: without it this panel would stretch the *company* table to ~1600px
// and push the Action column off-screen (the outer scrollbar then sits below
// a 500px-tall panel, effectively out of reach). With a definite width the
// panel owns its own horizontal scrollbar and the company table keeps fitting.
const PendingClaimsPanel = ({
  claims,
  credentials,
  platform,
  companyId,
  companyName,
  width,
  selected,
  renewing,
  onToggleClaim,
  onViewSession,
  onRenewSession
}: {
  claims: PendingClaim[]
  credentials: PlatformCredential[]
  platform: PlatformKey
  companyId: string
  companyName: string
  width: number
  selected: Record<string, SelectedClaim>
  renewing: Set<string>
  onToggleClaim: (claim: PendingClaim, companyId: string, companyName: string) => void
  onViewSession: (credential: PlatformCredential) => void
  onRenewSession: (credential: PlatformCredential) => void
}) => (
  <div className='bg-actionHover plb-4 pli-6 border-bs'>
    <div
      // Both tables share the measured width so they scroll as one column of
      // content rather than drifting to different right edges.
      style={width ? { inlineSize: Math.max(240, width - 48) } : undefined}
    >
      <CredentialsPanel
        credentials={credentials}
        platform={platform}
        renewing={renewing}
        onViewSession={onViewSession}
        onRenewSession={onRenewSession}
      />
    </div>
    <div
      className='overflow-auto rounded border max-bs-[520px]'
      // pli-6 on the wrapper = 24px of padding either side.
      style={width ? { inlineSize: Math.max(240, width - 48) } : undefined}
    >
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className='is-[52px]' />
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
          {claims.map((claim, i) => {
            const processable = isProcessable(claim)

            return (
              <tr key={claim.claimId || `${claim.AWBNumber}-${i}`}>
                <td>
                  <Tooltip
                    title={
                      processable
                        ? 'Select this claim'
                        : `${claim.scriptProcessingStatus?.trim() || 'In progress'} — Process skips it; use Change Status to reset it first`
                    }
                  >
                    <span>
                      <Checkbox
                        size='small'
                        disabled={!claim.claimId}
                        checked={Boolean(selected[claim.claimId])}
                        onChange={() => onToggleClaim(claim, companyId, companyName)}
                      />
                    </span>
                  </Tooltip>
                </td>
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
            )
          })}
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
  // Defaults to "Non Zero Account": a company with no credential configured on
  // the platform cannot have its claims dispatched at all, so those rows are
  // noise on first load and are opted into rather than out of.
  const account = useAccountFilter({ initial: ['nonZero'], onChange: () => setPage(0) })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [selected, setSelected] = useState<Record<string, SelectedClaim>>({})
  const [processDialogOpen, setProcessDialogOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [runResult, setRunResult] = useState<RunResponse | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  // Credential whose Myntra session is open in the modal; null = closed.
  const [sessionCredential, setSessionCredential] = useState<PlatformCredential | null>(null)

  // Which stored session the eye-icon dialog is showing. Derived from the
  // selected platform so one dialog serves both Myntra and Flipkart.
  const viewedSession =
    (platform === 'flipkart' ? sessionCredential?.flipkartSession : sessionCredential?.myntraSession) ?? null
  // credentialIds with a renewal in flight.
  const [renewing, setRenewing] = useState<Set<string>>(new Set())

  // ── Bulk script-status change ───────────────────────────────────────────
  // Defaults match the BE's own defaults and the flow this exists for:
  // un-stick claims left "Queued" by a runner that died, so they can be
  // dispatched again.
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusFrom, setStatusFrom] = useState<string>('Queued')
  const [statusTo, setStatusTo] = useState<string>('Not Started')
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [statusResult, setStatusResult] = useState<StatusChangeResponse | null>(null)

  // ── Clear seller account off claims ─────────────────────────────────────
  // Defaults to Pending only: this rewrites historical rows, so the wider
  // statuses have to be chosen deliberately rather than inherited.
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearStatuses, setClearStatuses] = useState<string[]>(['Pending'])
  const [clearScriptStatus, setClearScriptStatus] = useState<string>('')
  const [clearPreview, setClearPreview] = useState<number | null>(null)
  const [clearPreviewing, setClearPreviewing] = useState(false)
  const [clearSubmitting, setClearSubmitting] = useState(false)
  const [clearResult, setClearResult] = useState<ClearAccountResponse | null>(null)

  // Measured width of the table's horizontal scroller, handed to the expanded
  // panel so it scrolls on its own instead of widening the company table.
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
      const res = await fetch('/api/cms/pending-by-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: page + 1,
          limit: pageSize,
          search: debouncedSearch,
          eCommercePlatform: platform,
          sort,
          ...(account.payload ? { accountFilter: account.payload } : {})
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, platform, sort, account.payloadKey])

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

  // ── Selection ───────────────────────────────────────────────────────────
  // Keyed by claimId, because that is what /cms/run-return-script takes. A
  // company checkbox is a shorthand for "all of its processable claims", which
  // keeps one selection model instead of two that can disagree.
  const toggleClaim = useCallback((claim: PendingClaim, companyId: string, companyName: string) => {
    if (!claim.claimId) return
    setSelected(prev => {
      const next = { ...prev }

      if (next[claim.claimId]) delete next[claim.claimId]
      else next[claim.claimId] = { companyId, companyName, processable: isProcessable(claim) }

      return next
    })
  }, [])

  const toggleCompany = useCallback((row: PendingCompanyRow) => {
    const claims = row.claims.filter(c => c.claimId)

    if (!claims.length) return

    setSelected(prev => {
      const next = { ...prev }
      const allOn = claims.every(c => next[c.claimId])

      for (const claim of claims) {
        if (allOn) delete next[claim.claimId]
        else
          next[claim.claimId] = {
            companyId: row.companyId,
            companyName: row.companyName,
            processable: isProcessable(claim)
          }
      }

      return next
    })
  }, [])

  const pageClaims = useMemo(
    () =>
      rows.flatMap(row =>
        row.claims.filter(c => c.claimId).map(claim => ({ claim, companyId: row.companyId, companyName: row.companyName }))
      ),
    [rows]
  )

  const pageAllSelected = useMemo(
    () => pageClaims.length > 0 && pageClaims.every(({ claim }) => selected[claim.claimId]),
    [pageClaims, selected]
  )

  const pageSomeSelected = useMemo(
    () => pageClaims.some(({ claim }) => selected[claim.claimId]),
    [pageClaims, selected]
  )

  const toggleAllOnPage = useCallback(() => {
    setSelected(prev => {
      const next = { ...prev }

      for (const { claim, companyId, companyName } of pageClaims) {
        if (pageAllSelected) delete next[claim.claimId]
        else next[claim.claimId] = { companyId, companyName, processable: isProcessable(claim) }
      }

      return next
    })
  }, [pageClaims, pageAllSelected])

  const selectedIds = useMemo(() => Object.keys(selected), [selected])

  // What Process actually sends: the rest would be skipped server-side.
  const processableSelectedIds = useMemo(() => selectedIds.filter(id => selected[id].processable), [selectedIds, selected])

  const blockedSelectedCount = selectedIds.length - processableSelectedIds.length

  // Distinct companies behind the selected claims. /cms/change-script-status is
  // company-scoped, so this is what it receives.
  const selectedCompanies = useMemo(() => {
    const byId = new Map<string, string>()

    for (const id of selectedIds) {
      const { companyId, companyName } = selected[id]

      if (companyId) byId.set(companyId, companyName)
    }

    return Array.from(byId, ([companyId, companyName]) => ({ companyId, companyName }))
  }, [selectedIds, selected])

  const selectedCompanyNames = useMemo(() => selectedCompanies.map(c => c.companyName), [selectedCompanies])

  // Force a fresh Myntra login for one credential. The request blocks for the
  // whole Selenium login (~30-60s), so the row shows a spinner rather than the
  // page doing anything modal — other companies stay usable meanwhile.
  const renewSession = useCallback(
    async (credential: PlatformCredential) => {
      if (!credential.credentialId) return

      // The credential belongs to whichever company row it was rendered under;
      // find that row rather than threading the id through every callback.
      const owner = rows.find(row => row.credentials.some(c => c.credentialId === credential.credentialId))

      if (!owner?.companyId) {
        setToast({ severity: 'error', message: 'Could not resolve the company for this credential' })

        return
      }

      // The renew endpoint is per-platform: each one drives a different login
      // flow on the automation box, and only these two cache a session at all.
      const renewEndpoint =
        platform === 'flipkart' ? '/api/cms/renew-flipkart-session' : '/api/cms/renew-myntra-session'
      const platformName = platform === 'flipkart' ? 'Flipkart' : 'Myntra'

      setRenewing(prev => new Set(prev).add(credential.credentialId))
      setToast({ severity: 'info', message: `Logging in to ${platformName} as ${credential.username}…` })

      try {
        const res = await fetch(renewEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: owner.companyId, credentialId: credential.credentialId })
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.isSuccess) {
          setToast({
            severity: 'error',
            message: json?.displayMessage || json?.message || `Renewal failed (${res.status})`
          })

          return
        }

        const expiresAt = json.data?.expiresAt

        setToast({
          severity: 'success',
          message: expiresAt
            ? `Session renewed for ${credential.username} — expires ${relativeToNow(expiresAt)}`
            : `Session renewed for ${credential.username}`
        })

        // Refetch rather than patching the row locally: the same jar can be
        // shared by the same seller account under another company, and the
        // reload picks all of those up.
        fetchRows()
      } catch (err: any) {
        setToast({ severity: 'error', message: err?.message || 'Renewal request failed' })
      } finally {
        setRenewing(prev => {
          const next = new Set(prev)

          next.delete(credential.credentialId)

          return next
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, fetchRows]
  )

  const runProcessClaims = async () => {
    if (processableSelectedIds.length === 0) return

    if (processableSelectedIds.length > MAX_PROCESS_IDS) {
      setToast({
        severity: 'warning',
        message: `Select at most ${MAX_PROCESS_IDS} claims per run (${processableSelectedIds.length} selected).`
      })

      return
    }

    setProcessing(true)
    setRunResult(null)

    try {
      const res = await fetch('/api/cms/run-return-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: processableSelectedIds })
      })

      const json = (await res.json().catch(() => null)) as RunResponse | null

      if (!json) {
        setToast({ severity: 'error', message: `Request failed (${res.status})` })

        return
      }

      setRunResult(json)

      const dispatched = json.data?.jobs?.length ?? 0

      if (json.isSuccess && dispatched > 0) {
        // Only clear on a real dispatch: keeping the selection after a failure
        // lets ops retry the same batch without re-ticking every row.
        setSelected({})
        setToast({ severity: 'success', message: json.displayMessage || `Dispatched ${dispatched} job(s)` })
      } else {
        setToast({ severity: 'warning', message: json.displayMessage || json.message || 'No jobs were dispatched' })
      }

      fetchRows()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Process request failed' })
    } finally {
      setProcessing(false)
    }
  }

  const closeProcessDialog = () => {
    if (processing) return
    setProcessDialogOpen(false)
    setRunResult(null)
  }

  const runChangeStatus = async () => {
    if (selectedCompanies.length === 0) return

    setStatusSubmitting(true)
    setStatusResult(null)

    try {
      const res = await fetch('/api/cms/change-script-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds: selectedCompanies.map(c => c.companyId),
          // null is meaningful here — it targets rows whose status field is
          // missing entirely, which is a different set from any named status.
          currentStatus: statusFrom === NO_STATUS ? null : statusFrom,
          newStatus: statusTo,
          eCommercePlatform: platform
        })
      })

      const json = (await res.json().catch(() => null)) as StatusChangeResponse | null

      if (!json) {
        setToast({ severity: 'error', message: `Request failed (${res.status})` })

        return
      }

      setStatusResult(json)

      if (json.isSuccess) {
        const modified = json.data?.modified ?? 0

        setToast({
          severity: modified > 0 ? 'success' : 'warning',
          message:
            modified > 0
              ? `${modified.toLocaleString('en-IN')} claim${modified === 1 ? '' : 's'} set to ${statusTo}`
              : 'No claims matched — nothing was changed'
        })
      } else {
        setToast({ severity: 'error', message: json.displayMessage || json.message || 'Status change failed' })
      }

      // The flip changes what is selectable (a reset row becomes processable),
      // so the list is reloaded even when nothing matched.
      fetchRows()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Status change failed' })
    } finally {
      setStatusSubmitting(false)
    }
  }

  const closeStatusDialog = () => {
    if (statusSubmitting) return
    setStatusDialogOpen(false)
    setStatusResult(null)
  }

  // One call serves both the count preview and the write; `dryRun` decides.
  const callClearAccount = useCallback(
    async (dryRun: boolean) => {
      const res = await fetch('/api/cms/clear-account-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds: selectedCompanies.map(c => c.companyId),
          eCommercePlatform: platform,
          statuses: clearStatuses,
          ...(clearScriptStatus ? { scriptProcessingStatus: clearScriptStatus } : {}),
          dryRun
        })
      })

      const json = (await res.json().catch(() => null)) as ClearAccountResponse | null

      return { res, json }
    },
    [selectedCompanies, platform, clearStatuses, clearScriptStatus]
  )

  // Counts what would be cleared, without changing anything. Re-run whenever
  // the filter moves so the number on the button is always the number the
  // button will act on.
  const previewClearAccount = useCallback(async () => {
    if (selectedCompanies.length === 0 || clearStatuses.length === 0) {
      setClearPreview(0)

      return
    }

    setClearPreviewing(true)

    try {
      const { res, json } = await callClearAccount(true)

      setClearPreview(res.ok && json?.isSuccess ? json.data?.matched ?? 0 : null)
    } catch {
      setClearPreview(null)
    } finally {
      setClearPreviewing(false)
    }
  }, [callClearAccount, selectedCompanies.length, clearStatuses.length])

  useEffect(() => {
    if (!clearDialogOpen || clearResult) return
    previewClearAccount()
  }, [clearDialogOpen, clearResult, previewClearAccount])

  const runClearAccount = async () => {
    if (selectedCompanies.length === 0 || clearStatuses.length === 0) return

    setClearSubmitting(true)

    try {
      const { res, json } = await callClearAccount(false)

      if (!res.ok || !json?.isSuccess) {
        setToast({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Request failed (${res.status})`
        })

        return
      }

      const modified = json.data?.modified ?? 0

      setClearResult(json)
      setToast({
        severity: modified > 0 ? 'success' : 'warning',
        message:
          modified > 0
            ? `Cleared the account on ${modified.toLocaleString('en-IN')} claim(s)`
            : 'No claims carried an account to clear'
      })

      // The Account column in the expanded panel is now stale.
      fetchRows()
    } catch (err: any) {
      setToast({ severity: 'error', message: err?.message || 'Clear request failed' })
    } finally {
      setClearSubmitting(false)
    }
  }

  const closeClearDialog = () => {
    if (clearSubmitting) return
    setClearDialogOpen(false)
    setClearResult(null)
    setClearPreview(null)
  }

  // Total pending claims across the companies on this page — the page-level
  // number the platform filter is actually judged by.
  const pageClaimTotal = useMemo(() => rows.reduce((n, r) => n + r.pendingCount, 0), [rows])

  const columns = useMemo<ColumnDef<PendingCompanyRow, any>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Tooltip title='Select every claim on this page'>
            <span>
              <Checkbox
                disabled={pageClaims.length === 0}
                checked={pageAllSelected}
                indeterminate={!pageAllSelected && pageSomeSelected}
                onChange={toggleAllOnPage}
              />
            </span>
          </Tooltip>
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const claims = row.original.claims.filter(c => c.claimId)
          const selectedCount = claims.filter(c => selected[c.claimId]).length
          const allOn = claims.length > 0 && selectedCount === claims.length

          return (
            <Tooltip
              title={
                claims.length === 0
                  ? 'No claims to select'
                  : `${selectedCount} of ${claims.length} claim${claims.length === 1 ? '' : 's'} selected`
              }
            >
              <span>
                <Checkbox
                  disabled={claims.length === 0}
                  checked={allOn}
                  indeterminate={!allOn && selectedCount > 0}
                  onChange={() => toggleCompany(row.original)}
                />
              </span>
            </Tooltip>
          )
        }
      },
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
            <CopyableId id={row.original.companyId} label='company id' />
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
    [
      expanded,
      toggleExpanded,
      openImpersonate,
      selected,
      toggleCompany,
      toggleAllOnPage,
      pageAllSelected,
      pageSomeSelected,
      pageClaims
    ]
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

  const jobs = runResult?.data?.jobs ?? []
  const skipped = runResult?.data?.skipped

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
              // Expanded panels and the selection belong to the previous
              // platform's claims — carrying either over would act on rows the
              // user can no longer see.
              setExpanded({})
              setSelected({})
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
          <AccountCountFilter {...account} />
        </div>
        <div className='flex items-center gap-3 flex-wrap max-sm:is-full'>
          {/* Company count plus the claim total on this page: a small number of
              companies can still hide thousands of pending claims. */}
          <div className='flex items-center gap-1.5 whitespace-nowrap'>
            {loading ? (
              <CircularProgress size={14} />
            ) : (
              <Typography
                variant='body2'
                color={account.payload ? 'primary.main' : 'text.primary'}
                className='font-medium tabular-nums'
              >
                {total.toLocaleString('en-IN')}
              </Typography>
            )}
            <Typography variant='body2' color='text.secondary'>
              {total === 1 ? 'company' : 'companies'}
              {account.payload ? ' found' : ''}
              {!loading && pageClaimTotal > 0 ? ` • ${pageClaimTotal.toLocaleString('en-IN')} claims on this page` : ''}
            </Typography>
          </div>
          <Tooltip title='Bulk-reset scriptProcessingStatus for the selected companies'>
            <span>
              <Button
                variant='outlined'
                color='secondary'
                startIcon={<i className='tabler-refresh-dot' />}
                disabled={selectedCompanies.length === 0}
                onClick={() => setStatusDialogOpen(true)}
              >
                Change Status{selectedCompanies.length ? ` (${selectedCompanies.length})` : ''}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={`Remove the stored ${platformLabel} account from the selected companies' claims`}>
            <span>
              <Button
                variant='outlined'
                color='error'
                startIcon={<i className='tabler-user-off' />}
                disabled={selectedCompanies.length === 0}
                onClick={() => setClearDialogOpen(true)}
              >
                Clear Account{selectedCompanies.length ? ` (${selectedCompanies.length})` : ''}
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={
              selectedIds.length > 0 && processableSelectedIds.length === 0
                ? 'Every selected claim is queued, running or successful — reset them with Change Status first'
                : 'Run the auto-claim script for the selected claims'
            }
          >
            <span>
              <Button
                variant='contained'
                color='primary'
                startIcon={<i className='tabler-player-play' />}
                disabled={processableSelectedIds.length === 0}
                onClick={() => setProcessDialogOpen(true)}
              >
                Process Claim{processableSelectedIds.length ? ` (${processableSelectedIds.length})` : ''}
              </Button>
            </span>
          </Tooltip>
          <CustomTextField
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search company'
            className='max-sm:is-full sm:is-[280px]'
          />
        </div>
      </div>
      {selectedIds.length > 0 && (
        <div className='flex items-center gap-2 flex-wrap pli-6 plb-3 border-bs bg-actionHover'>
          <Typography variant='body2' color='text.secondary'>
            Selected:
          </Typography>
          <Typography variant='body2' color='primary.main' className='font-medium tabular-nums'>
            {selectedIds.length.toLocaleString('en-IN')} claim{selectedIds.length === 1 ? '' : 's'}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            across {selectedCompanies.length} compan{selectedCompanies.length === 1 ? 'y' : 'ies'}
          </Typography>
          {blockedSelectedCount > 0 && (
            <Chip
              size='small'
              variant='tonal'
              color='warning'
              label={`${blockedSelectedCount} not dispatchable`}
            />
          )}
          <Button size='small' color='secondary' onClick={() => setSelected({})}>
            Clear selection
          </Button>
        </div>
      )}
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
                        <PendingClaimsPanel
                          claims={row.original.claims}
                          credentials={row.original.credentials}
                          platform={platform}
                          companyId={row.original.companyId}
                          companyName={row.original.companyName}
                          width={scrollerWidth}
                          selected={selected}
                          renewing={renewing}
                          onToggleClaim={toggleClaim}
                          onViewSession={setSessionCredential}
                          onRenewSession={renewSession}
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

      <Dialog open={processDialogOpen} onClose={closeProcessDialog} maxWidth='sm' fullWidth>
        <DialogTitle>Process Claim</DialogTitle>
        <DialogContent>
          {runResult ? (
            // Result view. The BE partially succeeds by design (per-company
            // dispatch), so every bucket it reports is shown rather than
            // collapsed into one success/failure line.
            <div className='flex flex-col gap-4'>
              <Alert severity={jobs.length > 0 ? 'success' : 'warning'}>
                <AlertTitle>{runResult.displayMessage || runResult.message || 'Run submitted'}</AlertTitle>
                {jobs.length > 0
                  ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} dispatched.`
                  : 'Nothing was dispatched.'}
              </Alert>
              {jobs.length > 0 && (
                <div className='flex flex-col gap-2'>
                  {jobs.map(job => (
                    <div key={`${job.companyId}-${job.jobId}`} className='flex flex-col gap-0.5 rounded border plb-2 pli-3'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <Typography color='text.primary' className='font-medium'>
                          {job.companyName || job.companyId}
                        </Typography>
                        <Chip
                          size='small'
                          variant='tonal'
                          color={job.existing ? 'info' : job.status === 'queued' ? 'warning' : 'success'}
                          label={job.existing ? 'Already running' : job.status || job.jobState || 'dispatched'}
                        />
                      </div>
                      <Typography variant='caption' color='text.secondary'>
                        {job.cmsIds?.length ?? 0} claim{(job.cmsIds?.length ?? 0) === 1 ? '' : 's'}
                        {job.jobId ? ` • job ${job.jobId}` : ''}
                        {typeof job.queuePosition === 'number'
                          ? ` • queue position ${job.queuePosition}${job.totalInQueue ? ` of ${job.totalInQueue}` : ''}`
                          : ''}
                      </Typography>
                    </div>
                  ))}
                </div>
              )}
              {skipped && (
                <>
                  <Divider />
                  <div className='flex flex-col gap-1'>
                    <Typography variant='overline' color='text.disabled' className='leading-none'>
                      Skipped
                    </Typography>
                    {(skipped.alreadyProcessing?.length ?? 0) > 0 && (
                      <Typography variant='body2' color='text.secondary'>
                        {skipped.alreadyProcessing!.length} already queued, running, successful or ticketed
                      </Typography>
                    )}
                    {(skipped.drivePending?.length ?? 0) > 0 && (
                      <Typography variant='body2' color='text.secondary'>
                        {skipped.drivePending!.length} waiting on Drive conversion — retry once it finishes
                      </Typography>
                    )}
                    {(skipped.notFound?.length ?? 0) > 0 && (
                      <Typography variant='body2' color='text.secondary'>
                        {skipped.notFound!.length} not found or deleted
                      </Typography>
                    )}
                    {skipped.perCompanyErrors?.map(err => (
                      <Typography key={err.companyId} variant='body2' color='error.main'>
                        {err.companyName || err.companyId}: {err.reason} ({err.cmsIds.length} claim
                        {err.cmsIds.length === 1 ? '' : 's'})
                      </Typography>
                    ))}
                    {!skipped.alreadyProcessing?.length &&
                      !skipped.drivePending?.length &&
                      !skipped.notFound?.length &&
                      !skipped.perCompanyErrors?.length && (
                        <Typography variant='body2' color='text.secondary'>
                          Nothing skipped.
                        </Typography>
                      )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className='flex flex-col gap-3'>
              <Typography variant='body2'>
                Run the auto-claim script for <strong>{processableSelectedIds.length.toLocaleString('en-IN')}</strong>{' '}
                selected {platformLabel} claim{processableSelectedIds.length === 1 ? '' : 's'} across{' '}
                <strong>{selectedCompanies.length}</strong> compan
                {selectedCompanies.length === 1 ? 'y' : 'ies'}. One job is dispatched per company.
              </Typography>
              {blockedSelectedCount > 0 && (
                <Typography variant='body2' color='text.secondary'>
                  {blockedSelectedCount} further selected claim{blockedSelectedCount === 1 ? ' is' : 's are'} queued,
                  running or already successful and will not be sent — use <strong>Change Status</strong> to reset
                  {blockedSelectedCount === 1 ? ' it' : ' them'} first.
                </Typography>
              )}
              <div className='flex flex-wrap gap-1'>
                {selectedCompanyNames.slice(0, 8).map(name => (
                  <Chip key={name} size='small' variant='tonal' color='primary' label={name} />
                ))}
                {selectedCompanyNames.length > 8 && (
                  <Chip size='small' variant='tonal' label={`+${selectedCompanyNames.length - 8} more`} />
                )}
              </div>
              {processableSelectedIds.length > MAX_PROCESS_IDS && (
                <Alert severity='warning'>
                  The server accepts at most {MAX_PROCESS_IDS.toLocaleString('en-IN')} claims per run. Reduce the
                  selection before submitting.
                </Alert>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          {runResult ? (
            <Button variant='contained' onClick={closeProcessDialog}>
              Close
            </Button>
          ) : (
            <>
              <Button color='secondary' onClick={closeProcessDialog} disabled={processing}>
                Cancel
              </Button>
              <Button
                variant='contained'
                onClick={runProcessClaims}
                disabled={
                  processing || processableSelectedIds.length === 0 || processableSelectedIds.length > MAX_PROCESS_IDS
                }
              >
                {processing ? <CircularProgress size={20} color='inherit' /> : 'Process'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={clearDialogOpen} onClose={closeClearDialog} maxWidth='sm' fullWidth>
        <DialogTitle>Clear Account</DialogTitle>
        <DialogContent>
          {clearResult ? (
            <div className='flex flex-col gap-3'>
              <Alert severity={(clearResult.data?.modified ?? 0) > 0 ? 'success' : 'info'}>
                <AlertTitle>{clearResult.displayMessage || clearResult.message || 'Done'}</AlertTitle>
                {(clearResult.data?.matched ?? 0).toLocaleString('en-IN')} claim(s) matched,{' '}
                {(clearResult.data?.modified ?? 0).toLocaleString('en-IN')} cleared.
              </Alert>
              <Typography variant='body2' color='text.secondary'>
                Field: <code>{clearResult.data?.field}</code> · statuses:{' '}
                {(clearResult.data?.filter?.statuses ?? []).join(', ')}
              </Typography>
            </div>
          ) : (
            <div className='flex flex-col gap-4'>
              <Typography variant='body2'>
                Remove the stored seller account from <strong>{platformLabel}</strong> claims belonging to{' '}
                <strong>{selectedCompanies.length}</strong> selected compan
                {selectedCompanies.length === 1 ? 'y' : 'ies'}.
              </Typography>
              {/* The field differs per marketplace, so it is named rather than
                  described — "the username" is not one thing in this schema. */}
              <Typography variant='body2' color='text.secondary'>
                Clears <code>{accountFieldFor(platform)}</code> on {platformLabel}.
              </Typography>
              <CustomTextField
                select
                label='Claim status'
                value={clearStatuses}
                onChange={e => setClearStatuses(e.target.value as unknown as string[])}
                disabled={clearSubmitting}
                slotProps={{
                  select: {
                    multiple: true,
                    renderValue: (value: unknown) => (
                      <div className='flex flex-wrap gap-1'>
                        {(value as string[]).map(s => (
                          <Chip key={s} size='small' variant='tonal' color='primary' label={s} />
                        ))}
                      </div>
                    )
                  }
                }}
                className='is-full'
              >
                {CLAIM_STATUSES.map(status => (
                  <MenuItem key={status} value={status}>
                    <Checkbox size='small' checked={clearStatuses.includes(status)} />
                    {status}
                  </MenuItem>
                ))}
              </CustomTextField>
              <CustomTextField
                select
                label='Script status (optional)'
                value={clearScriptStatus}
                onChange={e => setClearScriptStatus(e.target.value)}
                disabled={clearSubmitting}
                className='is-full'
              >
                <MenuItem value=''>Any</MenuItem>
                {SCRIPT_STATUSES.map(status => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </CustomTextField>
              {/* Counted server-side before anything is written: the selection
                  is company-level, so the number of CLAIMS affected is not
                  visible from this page otherwise. */}
              <Alert severity={clearPreview === 0 ? 'info' : 'warning'} icon={clearPreviewing ? false : undefined}>
                {clearPreviewing ? (
                  <span className='flex items-center gap-2'>
                    <CircularProgress size={14} /> Counting matching claims…
                  </span>
                ) : clearPreview === null ? (
                  'Could not count the matching claims — the run will report what it changed.'
                ) : (
                  `${clearPreview.toLocaleString('en-IN')} claim(s) currently carry an account and would be cleared.`
                )}
              </Alert>
              <Typography variant='caption' color='text.secondary'>
                This applies to every matching claim in those companies, not only the rows you ticked. It cannot be
                undone — the previous account is not recorded anywhere.
              </Typography>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          {clearResult ? (
            <Button variant='contained' onClick={closeClearDialog}>
              Close
            </Button>
          ) : (
            <>
              <Button color='secondary' onClick={closeClearDialog} disabled={clearSubmitting}>
                Cancel
              </Button>
              <Button
                variant='contained'
                color='error'
                onClick={runClearAccount}
                disabled={
                  clearSubmitting ||
                  clearPreviewing ||
                  selectedCompanies.length === 0 ||
                  clearStatuses.length === 0 ||
                  clearPreview === 0
                }
              >
                {clearSubmitting ? <CircularProgress size={20} color='inherit' /> : 'Clear account'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={statusDialogOpen} onClose={closeStatusDialog} maxWidth='sm' fullWidth>
        <DialogTitle>Change Script Status</DialogTitle>
        <DialogContent>
          {statusResult ? (
            <div className='flex flex-col gap-3'>
              <Alert severity={statusResult.isSuccess ? ((statusResult.data?.modified ?? 0) > 0 ? 'success' : 'info') : 'error'}>
                <AlertTitle>{statusResult.displayMessage || statusResult.message || 'Status change submitted'}</AlertTitle>
                {statusResult.isSuccess
                  ? `${(statusResult.data?.matched ?? 0).toLocaleString('en-IN')} claim(s) matched, ${(
                      statusResult.data?.modified ?? 0
                    ).toLocaleString('en-IN')} updated.`
                  : 'Nothing was changed.'}
              </Alert>
              {statusResult.isSuccess && (
                <Typography variant='body2' color='text.secondary'>
                  {statusResult.data?.currentStatus === null ? 'No status' : statusResult.data?.currentStatus} →{' '}
                  {statusResult.data?.newStatus} on {statusResult.data?.eCommercePlatform} for{' '}
                  {statusResult.data?.companyIds?.length ?? 0} compan
                  {(statusResult.data?.companyIds?.length ?? 0) === 1 ? 'y' : 'ies'}
                </Typography>
              )}
              {(statusResult.data?.invalidIds?.length ?? 0) > 0 && (
                <Typography variant='body2' color='error.main'>
                  {statusResult.data!.invalidIds!.length} company id(s) were rejected as invalid.
                </Typography>
              )}
            </div>
          ) : (
            <div className='flex flex-col gap-4'>
              <Typography variant='body2'>
                Flip <code>scriptProcessingStatus</code> on the <strong>{platformLabel}</strong> claims of{' '}
                <strong>{selectedCompanies.length}</strong> selected compan
                {selectedCompanies.length === 1 ? 'y' : 'ies'}.
              </Typography>
              <div className='flex gap-4 flex-wrap'>
                <CustomTextField
                  select
                  label='Current status'
                  value={statusFrom}
                  onChange={e => setStatusFrom(e.target.value)}
                  className='min-is-[200px] flex-1'
                >
                  {SCRIPT_STATUSES.map(status => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                  <MenuItem value={NO_STATUS}>No status (empty)</MenuItem>
                </CustomTextField>
                <CustomTextField
                  select
                  label='New status'
                  value={statusTo}
                  onChange={e => setStatusTo(e.target.value)}
                  className='min-is-[200px] flex-1'
                >
                  {SCRIPT_STATUSES.map(status => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </CustomTextField>
              </div>
              {statusTo === 'Not Started' && (
                <Typography variant='body2' color='text.secondary'>
                  Setting <strong>Not Started</strong> also clears <code>scriptProcessingError</code>.
                </Typography>
              )}
              {statusFrom === statusTo && (
                <Alert severity='info'>Current and new status are the same — this run would change nothing.</Alert>
              )}
              {/* The endpoint is company-scoped, not claim-scoped: the ticked
                  rows only decide WHICH COMPANIES are touched. Saying so up
                  front prevents a reset that is far wider than intended. */}
              <Alert severity='warning'>
                This applies to <strong>every</strong> {platformLabel} claim in those companies whose status is{' '}
                {statusFrom === NO_STATUS ? 'empty' : `"${statusFrom}"`} — not only the claims you ticked.
              </Alert>
              <div className='flex flex-wrap gap-1'>
                {selectedCompanyNames.slice(0, 8).map(name => (
                  <Chip key={name} size='small' variant='tonal' color='primary' label={name} />
                ))}
                {selectedCompanyNames.length > 8 && (
                  <Chip size='small' variant='tonal' label={`+${selectedCompanyNames.length - 8} more`} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          {statusResult ? (
            <Button variant='contained' onClick={closeStatusDialog}>
              Close
            </Button>
          ) : (
            <>
              <Button color='secondary' onClick={closeStatusDialog} disabled={statusSubmitting}>
                Cancel
              </Button>
              <Button
                variant='contained'
                onClick={runChangeStatus}
                disabled={statusSubmitting || selectedCompanies.length === 0 || statusFrom === statusTo}
              >
                {statusSubmitting ? <CircularProgress size={20} color='inherit' /> : 'Update Status'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(sessionCredential)} onClose={() => setSessionCredential(null)} maxWidth='sm' fullWidth>
        <DialogTitle>{platform === 'flipkart' ? 'Flipkart' : 'Myntra'} session</DialogTitle>
        <DialogContent>
          {viewedSession ? (
            <div className='flex flex-col gap-3'>
              <div className='flex items-center gap-2 flex-wrap'>
                <Typography color='text.primary' className='font-medium break-all'>
                  {sessionCredential?.username}
                </Typography>
                <Chip
                  size='small'
                  variant='tonal'
                  color={sessionState(viewedSession).color}
                  label={sessionState(viewedSession).label}
                />
                {viewedSession.expiresAt && (
                  <Typography variant='caption' color='text.secondary'>
                    expires {relativeToNow(viewedSession.expiresAt)}
                  </Typography>
                )}
              </div>
              {/* The record as stored, minus the secrets: `jar` holds live auth
                  cookies (and, on Flipkart, an fk-csrf-token that signs every
                  API call), so the API sends names only — `jar` is rendered as
                  `cookieNames` and the csrf token as a boolean. */}
              <pre className='bg-actionHover rounded border plb-3 pli-4 overflow-auto max-bs-[420px] text-xs font-mono whitespace-pre'>
                {JSON.stringify(viewedSession, null, 2)}
              </pre>
              <Typography variant='caption' color='text.secondary'>
                {platform === 'flipkart'
                  ? 'Cookie values never reach this dashboard — `jar` is reported as `cookieNames`, and the fk-csrf-token only as `hasCsrfToken`.'
                  : 'Cookie values are never sent to this dashboard — `jar` is reported as `cookieNames`. `erp.at` and `session` are the two the automation requires.'}
              </Typography>
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            color='secondary'
            startIcon={<i className='tabler-copy' />}
            onClick={() => {
              if (!viewedSession) return
              navigator.clipboard
                ?.writeText(JSON.stringify(viewedSession, null, 2))
                .then(() => setToast({ severity: 'success', message: 'Session JSON copied' }))
                // Clipboard access is denied outside a secure context; say so
                // rather than leaving the button looking broken.
                .catch(() => setToast({ severity: 'error', message: 'Could not copy — clipboard blocked' }))
            }}
          >
            Copy JSON
          </Button>
          <Button variant='contained' onClick={() => setSessionCredential(null)}>
            Close
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

export default PendingCmsList
