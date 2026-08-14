// MUI Imports
import Card from '@mui/material/Card'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

import type { ProfileUser } from './index'

const UserProfileHeader = ({ user }: { user: ProfileUser }) => {
  const coverImg = '/images/pages/profile-banner.png'

  return (
    <Card>
      <CardMedia image={coverImg} className='bs-[250px]' />
      <CardContent className='flex gap-5 justify-center flex-col items-center md:items-end md:flex-row !pt-0 md:justify-start'>
        <div className='flex rounded-bs-md mbs-[-40px] border-[5px] mis-[-5px] border-be-0 border-backgroundPaper bg-backgroundPaper'>
          <img height={120} width={120} src={user.profileImg} className='rounded' alt='Profile' />
        </div>
        <div className='flex is-full justify-start self-end flex-col items-center gap-6 sm-gap-0 sm:flex-row sm:justify-between sm:items-end'>
          <div className='flex flex-col items-center sm:items-start gap-2'>
            <Typography variant='h4'>{user.fullName}</Typography>
            <div className='flex flex-wrap gap-6 justify-center sm:justify-normal'>
              {user.email && (
                <div className='flex items-center gap-2'>
                  <i className='tabler-mail' />
                  <Typography className='font-medium'>{user.email}</Typography>
                </div>
              )}
              {user.role && (
                <div className='flex items-center gap-2'>
                  <i className='tabler-shield-lock' />
                  <Typography className='font-medium capitalize'>{user.role}</Typography>
                </div>
              )}
            </div>
          </div>
          <Button variant='contained' className='flex gap-2'>
            <i className='tabler-user-check !text-base' />
            <span>Connected</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default UserProfileHeader
