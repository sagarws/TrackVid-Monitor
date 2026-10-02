// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import UserProfileHeader from './UserProfileHeader'
import AboutOverview from './profile/AboutOverview'
import BucketFileCard from './profile/BucketFileCard'

export type ProfileUser = {
  fullName: string
  email: string
  role: string
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
      <Grid size={{ xs: 12, md: 7, lg: 8 }}>
        <BucketFileCard />
      </Grid>
    </Grid>
  )
}

export default UserProfile
