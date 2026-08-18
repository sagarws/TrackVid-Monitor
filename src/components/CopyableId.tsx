'use client'

// MUI Imports
import Typography from '@mui/material/Typography'

// Component Imports
import CopyButton from '@/components/CopyButton'

type Props = {
  id: string
  // What the id identifies, used in the tooltip ("Copy company id").
  label?: string
  className?: string
}

// A raw ObjectId with a copy button. Shown under the company name on the
// Company list and Pending CMS so an id can be lifted straight into a Mongo
// query or a ticket instead of being retyped from a screenshot.
const CopyableId = ({ id, label = 'id', className = '' }: Props) => {
  if (!id) return null

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Typography variant='caption' color='text.disabled' className='font-mono break-all'>
        {id}
      </Typography>
      <CopyButton value={id} label={label} />
    </div>
  )
}

export default CopyableId
