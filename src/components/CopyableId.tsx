'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

type Props = {
  id: string
  // What the id identifies, used in the tooltip ("Copy company id").
  label?: string
  className?: string
}

// A raw ObjectId with a copy button. Shown under the company name on the
// Company list and Pending CMS so an id can be lifted straight into a Mongo
// query or a ticket instead of being retyped from a screenshot.
//
// Feedback is local to the button (icon + tooltip flip to "Copied") rather than
// a page-level toast: these sit inside table rows, and a snackbar firing from a
// row action would cover the row that was just clicked.
const CopyableId = ({ id, label = 'id', className = '' }: Props) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The row can unmount while the reset is pending (page change, refetch).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  if (!id) return null

  const flash = (next: 'copied' | 'failed') => {
    setState(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setState('idle'), 1500)
  }

  const copy = () => {
    // Clipboard access is denied outside a secure context; say so on the button
    // rather than silently doing nothing.
    if (!navigator.clipboard?.writeText) {
      flash('failed')

      return
    }

    navigator.clipboard
      .writeText(id)
      .then(() => flash('copied'))
      .catch(() => flash('failed'))
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Typography variant='caption' color='text.disabled' className='font-mono break-all'>
        {id}
      </Typography>
      <Tooltip title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Clipboard blocked' : `Copy ${label}`}>
        <IconButton size='small' className='p-1' onClick={copy} aria-label={`Copy ${label}`}>
          <i
            className={
              state === 'copied'
                ? 'tabler-check text-sm text-success'
                : state === 'failed'
                  ? 'tabler-x text-sm text-error'
                  : 'tabler-copy text-sm'
            }
          />
        </IconButton>
      </Tooltip>
    </div>
  )
}

export default CopyableId
