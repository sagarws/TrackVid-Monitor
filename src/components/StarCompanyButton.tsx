'use client'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

// Hook Imports
import useStarredCompanies from '@/hooks/useStarredCompanies'

// The star in the first column of the company tables. Reads and writes the
// shared shortlist directly (see useStarredCompanies) so the row does not have
// to thread the whole store down through the column definitions — every
// instance re-renders together because they subscribe to the same store.
const StarCompanyButton = ({ companyId }: { companyId: string }) => {
  const { isStarred, toggle } = useStarredCompanies()

  const starred = isStarred(companyId)

  return (
    <Tooltip title={!companyId ? 'No company id' : starred ? 'Remove from starred' : 'Star this company'}>
      <span>
        <IconButton
          size='small'
          disabled={!companyId}
          // Colour, not just a different glyph: at this size the filled and
          // outlined stars are hard to tell apart in a scanned column.
          color={starred ? 'warning' : 'default'}
          aria-label={starred ? 'Remove from starred' : 'Star this company'}
          aria-pressed={starred}
          onClick={event => {
            // The row itself is clickable in places — starring must not also
            // open the company.
            event.stopPropagation()
            toggle(companyId)
          }}
        >
          <i className={starred ? 'tabler-star-filled text-xl' : 'tabler-star text-xl'} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

export default StarCompanyButton
