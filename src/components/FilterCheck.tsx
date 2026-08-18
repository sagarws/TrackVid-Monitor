'use client'

// MUI Imports
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

// Third-party Imports
import classnames from 'classnames'

// A checkbox row that visibly changes state when ticked. Plain MUI checkboxes
// on a dark surface read as near-identical whether on or off at a glance; the
// tinted, bordered row is what makes an active filter obvious without having to
// look at the box itself. Shared by the Company list filter popover and the
// account-count filter rendered inside it.
const FilterCheck = ({
  label,
  checked,
  onChange,
  dense
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  dense?: boolean
}) => (
  <FormControlLabel
    label={label}
    className={classnames('is-full mli-0 rounded border transition-colors', {
      'bg-primaryLight border-primary': checked,
      'border-transparent hover:bg-actionHover': !checked,
      'plb-0.5': dense,
      'plb-1': !dense
    })}
    control={<Checkbox size='small' checked={checked} onChange={e => onChange(e.target.checked)} />}
    slotProps={{
      typography: {
        variant: 'body2',
        color: checked ? 'text.primary' : 'text.secondary',
        className: checked ? 'font-medium' : ''
      }
    }}
  />
)

export default FilterCheck
