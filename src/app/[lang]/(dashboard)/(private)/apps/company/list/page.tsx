// Component Imports
import CompanyList from '@views/apps/company/list'

const CompanyListPage = () => {
  const impersonateBase = `${process.env.NEXT_PUBLIC_TRACKVID_FE_URL || 'http://localhost:3000'}/impersonate`

  return <CompanyList impersonateBaseUrl={impersonateBase} />
}

export default CompanyListPage
