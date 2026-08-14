// Third-party Imports
import { getServerSession } from 'next-auth'

// Lib Imports
import { authOptions } from '@/libs/auth'

// Component Imports
import CompanyList from '@views/apps/company/list'
import type { CompanyRow } from '@views/apps/company/list'

const formatPhone = (phone: any): string => {
  if (!phone?.number) return ''
  const code = phone.code ? `+${String(phone.code).replace(/^\+/, '')} ` : ''

  return `${code}${phone.number}`.trim()
}

const fetchCompanies = async (accessToken?: string): Promise<{ rows: CompanyRow[]; error?: string }> => {
  const apiBase = process.env.TRACKVID_API_URL

  if (!apiBase) {
    return { rows: [], error: 'TRACKVID_API_URL is not configured' }
  }

  if (!accessToken) {
    return { rows: [], error: 'Missing access token — please sign in again.' }
  }

  try {
    const res = await fetch(`${apiBase}/system-admin/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ page: 1, limit: 200 }),
      cache: 'no-store'
    })

    const json = await res.json().catch(() => null)

    if (!res.ok || !json?.isSuccess) {
      const message = json?.displayMessage || json?.message || `Request failed (${res.status})`

      return { rows: [], error: message }
    }

    const raw = Array.isArray(json?.data?.users) ? json.data.users : []

    const rows: CompanyRow[] = raw.map((u: any) => ({
      userId: String(u?._id ?? ''),
      companyId: String(u?.company?._id ?? ''),
      companyName: String(u?.company?.name ?? '—'),
      adminName: String(u?.name?.fullName || `${u?.name?.firstName ?? ''} ${u?.name?.lastName ?? ''}`.trim() || '—'),
      adminEmail: String(u?.email ?? ''),
      adminPhone: formatPhone(u?.phone)
    }))

    return { rows }
  } catch (err: any) {
    return { rows: [], error: err?.message || 'Failed to fetch companies' }
  }
}

const CompanyListPage = async () => {
  const session = await getServerSession(authOptions)
  const { rows, error } = await fetchCompanies(session?.accessToken)

  const impersonateBase = `${process.env.NEXT_PUBLIC_TRACKVID_FE_URL || 'http://localhost:3000'}/impersonate`

  return <CompanyList rows={rows} error={error} impersonateBaseUrl={impersonateBase} />
}

export default CompanyListPage
