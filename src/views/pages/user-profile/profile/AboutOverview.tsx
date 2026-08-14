// MUI Imports
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import CardContent from '@mui/material/CardContent'

import type { ProfileUser } from '../index'

type Row = {
  icon: string
  property: string
  value: string
}

const renderList = (list: Row[]) =>
  list.map(item => (
    <div key={item.property} className='flex items-center gap-2'>
      <i className={item.icon} />
      <div className='flex items-center flex-wrap gap-2'>
        <Typography className='font-medium'>{`${item.property}:`}</Typography>
        <Typography className='capitalize'>{item.value}</Typography>
      </div>
    </div>
  ))

const AboutOverview = ({ user }: { user: ProfileUser }) => {
  const about: Row[] = [
    { icon: 'tabler-user', property: 'Full Name', value: user.fullName || '—' },
    { icon: 'tabler-check', property: 'Status', value: 'Active' },
    { icon: 'tabler-mail', property: 'Email', value: user.email || '—' }
  ]

  if (user.role) {
    about.push({ icon: 'tabler-shield-lock', property: 'Role', value: user.role })
  }

  return (
    <Card>
      <CardContent className='flex flex-col gap-6'>
        <div className='flex flex-col gap-4'>
          <Typography className='uppercase' variant='body2' color='text.disabled'>
            About
          </Typography>
          {renderList(about)}
        </div>
      </CardContent>
    </Card>
  )
}

export default AboutOverview
