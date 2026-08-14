// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import UserProfileHeader from './UserProfileHeader'
import AboutOverview from './profile/AboutOverview'

export type ProfileUser = {
  fullName: string
  email: string
  phone: string
  companyId: string
  profileImg: string
}

const UserProfile = ({ user }: { user: ProfileUser }) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <UserProfileHeader user={user} />
      </Grid>
      <Grid size={{ xs: 12, md: 5, lg: 4 }}>
        <AboutOverview user={user} />
      </Grid>
    </Grid>
  )
}

export default UserProfile
