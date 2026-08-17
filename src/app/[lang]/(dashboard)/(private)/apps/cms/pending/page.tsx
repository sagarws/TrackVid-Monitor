// Component Imports
import PendingCmsList from '@views/apps/cms/pending'

const PendingCmsPage = () => {
  const impersonateBase = `${process.env.NEXT_PUBLIC_TRACKVID_FE_URL || 'http://localhost:3000'}/impersonate`

  return <PendingCmsList impersonateBaseUrl={impersonateBase} />
}

export default PendingCmsPage
