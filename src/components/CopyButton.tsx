'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

type Props = {
  value: string
  // What is being copied, used in the tooltip ("Copy password").
  label?: string
  size?: 'small' | 'medium'
}

// Icon-only copy button with local feedback: the icon and tooltip flip to a
// green check for 1.5s. Feedback stays on the button rather than firing a
// page-level toast because these sit inside table rows, where a snackbar would
// cover the row that was just clicked.
const CopyButton = ({ value, label = 'value', size = 'small' }: Props) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The row can unmount while the reset is pending (page change, refetch).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  if (!value) return null

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
      .writeText(value)
      .then(() => flash('copied'))
      .catch(() => flash('failed'))
  }

  return (
    <Tooltip title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Clipboard blocked' : `Copy ${label}`}>
      <IconButton size={size} className='p-1' onClick={copy} aria-label={`Copy ${label}`}>
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
  )
}

export default CopyButton
