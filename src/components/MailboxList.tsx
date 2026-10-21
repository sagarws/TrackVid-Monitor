'use client'

// MUI Imports
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CopyButton from '@/components/CopyButton'

// One mailbox as /system-admin/company/mailboxes-summary reports it — the
// subset of the detail page's Mailbox a list row needs.
export type MailboxSummary = {
  id: string
  email: string
  displayName: string
  provider: string
  authType?: string
  status: string
  lastSyncedAt: string | null
}

// The providers the backend's Mailbox schema allows. Keys must match its enum
// exactly — the company list sends them back as a filter.
export const MAILBOX_PROVIDERS: { key: string; label: string }[] = [
  { key: 'google', label: 'Gmail' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'zoho', label: 'Zoho' },
  { key: 'other', label: 'Other (IMAP)' }
]

export const mailboxProviderLabel = (provider: string) =>
  MAILBOX_PROVIDERS.find(p => p.key === (provider || '').toLowerCase())?.label || provider || 'Unknown'

export const mailboxStatusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
  const s = (status || '').toLowerCase()

  if (s === 'connected') return 'success'
  if (s === 'token_expired') return 'warning'
  if (s === 'error') return 'error'

  return 'default'
}

export const mailboxStatusLabel = (status: string) => {
  const s = (status || '').toLowerCase()

  if (s === 'connected') return 'Connected'
  if (s === 'token_expired') return 'Token expired'
  if (s === 'error') return 'Error'

  return status || 'Unknown'
}

// "40 minutes ago" — the only form of a sync time anyone reads at a glance.
export const relativeTime = (iso: string | null) => {
  if (!iso) return 'never'
  const ms = new Date(iso).getTime()

  if (Number.isNaN(ms)) return 'unknown'

  const mins = Math.round((Date.now() - ms) / 60000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`

  return `${Math.floor(mins / 1440)}d ago`
}

// Read-only list of a company's mailboxes: name, status, auth type, then
// "address · provider · synced X ago". Used by the company list's expanded row;
// the detail page renders the same header line with its own action buttons.
const MailboxList = ({ mailboxes }: { mailboxes: MailboxSummary[] }) => (
  <div className='flex flex-col gap-2'>
    {mailboxes.map(mailbox => (
      <div key={mailbox.id} className='flex items-start gap-3 rounded border plb-2 pli-3 bg-backgroundPaper'>
        <i className='tabler-mail text-xl text-primary mbs-1' />
        <div className='flex flex-col gap-0.5 min-is-0'>
          <MailboxHeadline mailbox={mailbox} />
          <MailboxMeta mailbox={mailbox} />
        </div>
      </div>
    ))}
  </div>
)

export const MailboxHeadline = ({ mailbox }: { mailbox: MailboxSummary }) => (
  <div className='flex items-center gap-2 flex-wrap'>
    <Typography color='text.primary' className='font-medium break-all'>
      {mailbox.displayName}
    </Typography>
    <Chip
      size='small'
      variant='tonal'
      color={mailboxStatusColor(mailbox.status)}
      label={mailboxStatusLabel(mailbox.status)}
    />
    {mailbox.authType && (
      <Chip size='small' variant='outlined' color='info' label={mailbox.authType.toUpperCase()} />
    )}
  </div>
)

export const MailboxMeta = ({ mailbox }: { mailbox: MailboxSummary }) => (
  <div className='flex items-center gap-1 flex-wrap'>
    <Typography variant='caption' color='text.secondary' className='break-all'>
      {mailbox.email}
    </Typography>
    <CopyButton value={mailbox.email} label='mailbox address' />
    <Typography variant='caption' color='text.secondary'>
      · {mailboxProviderLabel(mailbox.provider)} ·
    </Typography>
    <Tooltip
      title={
        mailbox.lastSyncedAt
          ? new Date(mailbox.lastSyncedAt).toLocaleString('en-IN')
          : 'This mailbox has never completed a sync'
      }
    >
      <Typography variant='caption' color='text.secondary'>
        Synced {relativeTime(mailbox.lastSyncedAt)}
      </Typography>
    </Tooltip>
  </div>
)

export default MailboxList
