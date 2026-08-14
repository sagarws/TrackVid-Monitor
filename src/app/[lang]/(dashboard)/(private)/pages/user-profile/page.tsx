// Third-party Imports
import { getServerSession } from 'next-auth'

// Lib Imports
import { authOptions } from '@/libs/auth'

// Component Imports
import UserProfile from '@views/pages/user-profile'

const ProfilePage = async () => {
  const session = await getServerSession(authOptions)
  const user = session?.user

  return (
    <UserProfile
      user={{
        fullName: user?.name || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'User',
        email: user?.email || '',
        phone: user?.phone || '',
        companyId: user?.companyId || '',
        profileImg: user?.image || '/images/avatars/1.png'
      }}
    />
  )
}

export default ProfilePage
