// Component Imports
import CompanyView from '@views/apps/company/view'

const CompanyViewPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  const impersonateBase = `${process.env.NEXT_PUBLIC_TRACKVID_FE_URL || 'http://localhost:3000'}/impersonate`

  return <CompanyView companyId={id} impersonateBaseUrl={impersonateBase} />
}

export default CompanyViewPage
