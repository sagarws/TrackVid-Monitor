'use client'

// React Imports
import { useCallback, useEffect, useRef, useState } from 'react'

// MUI Imports
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// The "Fetch from" picker on each mailbox row — company list (expanded row)
// and company detail page.
//
// `settings.emailAutomation.mailFetchFolder` is one value per COMPANY, not per
// mailbox: every mailbox the company connects is searched in the same folder.
// So the state lives in `useMailFetchFolder`, called once per company, and the
// picker is a view of it — a company with two mailboxes shows the picker on
// both rows, and changing one changes both, which is the truth.
//
// The options are whatever the server says it accepts (`options` on the GET),
// never a list typed in here; LABELS only prettifies the ones known today.

const LABELS: Record<string, string> = { inbox: 'Inbox', allMail: 'All Mail' }

const ENDPOINT = '/api/company/mail-fetch-folder'

type ToastFn = (toast: { severity: 'success' | 'error'; message: string }) => void

export type MailFetchFolderState = {
  value: string | null
  options: string[]
  error: string | null
  saving: boolean
  save: (next: string) => Promise<void>
}

/** Loads and writes one company's folder. An empty companyId does nothing. */
export const useMailFetchFolder = (companyId: string, onToast?: ToastFn): MailFetchFolderState => {
  const [value, setValue] = useState<string | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Bumped per write so a slow earlier response cannot overwrite a later pick.
  const writeSeq = useRef(0)

  // Read through a ref so a parent passing a fresh arrow each render does not
  // change `save`'s identity.
  const toastRef = useRef(onToast)

  toastRef.current = onToast

  useEffect(() => {
    setValue(null)
    setError(null)

    if (!companyId) return

    const controller = new AbortController()

    const load = async () => {
      try {
        const res = await fetch(`${ENDPOINT}?companyId=${encodeURIComponent(companyId)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.isSuccess) {
          setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

          return
        }

        setValue(String(json.data?.mailFetchFolder ?? ''))
        setOptions(Array.isArray(json.data?.options) ? (json.data.options as string[]) : [])
      } catch (err) {
        // Aborted on unmount / company change — nothing to show.
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Could not load the fetch folder')
      }
    }

    void load()

    return () => controller.abort()
  }, [companyId])

  const save = useCallback(
    async (next: string) => {
      const previous = value
      const seq = ++writeSeq.current

      setValue(next)
      setSaving(true)

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ mailFetchFolder: next, companyIds: [companyId] })
        })

        const json = await res.json().catch(() => null)

        if (seq !== writeSeq.current) return

        if (!res.ok || !json?.isSuccess) {
          // Put the picker back, or it shows a value the server never stored.
          setValue(previous)
          toastRef.current?.({
            severity: 'error',
            message: json?.displayMessage || json?.message || `Request failed (${res.status})`
          })

          return
        }

        toastRef.current?.({ severity: 'success', message: `Mail now fetched from ${LABELS[next] ?? next}` })
      } catch (err) {
        if (seq !== writeSeq.current) return
        setValue(previous)
        toastRef.current?.({
          severity: 'error',
          message: err instanceof Error ? err.message : 'Could not save the fetch folder'
        })
      } finally {
        if (seq === writeSeq.current) setSaving(false)
      }
    },
    [companyId, value]
  )

  return { value, options, error, saving, save }
}

/** The picker itself — a view of `useMailFetchFolder`'s state. */
const MailFetchFolderSelect = ({ state }: { state: MailFetchFolderState }) => {
  const { value, options, error, saving, save } = state

  if (error) {
    return (
      <Typography variant='caption' color='error.main'>
        Fetch from: {error}
      </Typography>
    )
  }

  if (value === null) return <CircularProgress size={16} />

  return (
    // Above, not below: the select's menu opens downward and the tooltip would
    // sit on top of the options.
    <Tooltip
      placement='top'
      title='Company-wide: which folder the AJIO email automation searches, for every mailbox of this company. All Mail also finds mail a Gmail filter archived out of the inbox.'
    >
      <div className='flex items-center gap-2'>
        <CustomTextField
          select
          size='small'
          label='Fetch from'
          value={value}
          disabled={saving}
          onChange={e => void save(e.target.value)}
          sx={{ minInlineSize: 140 }}
        >
          {options.map(option => (
            <MenuItem key={option} value={option}>
              {LABELS[option] ?? option}
            </MenuItem>
          ))}
        </CustomTextField>
        {saving && <CircularProgress size={16} />}
      </div>
    </Tooltip>
  )
}

export default MailFetchFolderSelect
