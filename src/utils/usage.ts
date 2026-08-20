// Credit / order usage as TrackVid reports it on a company's own Accounts page,
// read here through the system-admin endpoints:
//   POST /api/company/usage          → one company: credit, plan, history tree
//   POST /api/company/usage-by-date  → one day, many companies (list columns)
//
// Both the company list and the company detail page render these numbers, so
// the shapes and the formatting live here rather than in either view.

// The figures every level of the rollup carries — a day, a month, a year, and a
// single company's slice of one day all report the same nine numbers.
export type UsageTotals = {
  cms_orders: number
  cms_orders_credits: number
  forward_orders: number
  forward_orders_credits: number
  return_orders: number
  return_orders_credits: number
  total_orders: number
  total_orders_credits: number
  total_effective_amount: number
}

export type UsageDay = UsageTotals & {
  // UTC midnight of the day the orders landed — the BE stores one document per
  // company per day, keyed on exactly that instant.
  date: string
}

export type UsageMonth = UsageTotals & {
  month: number
  monthName: string
  daily: UsageDay[]
}

export type UsageYear = UsageTotals & {
  year: number
  monthly: UsageMonth[]
}

export type CompanyUsage = {
  companyId: string
  companyName: string | null
  // null when the company has no credit document at all — a company that never
  // finished onboarding, which is not the same as a zero balance.
  credit: { used: number; total: number; remaining: number; effectiveVariable: number } | null
  plan: { name: string | null; price: number; credit: number; bonus: number } | null
  history: UsageYear[]
}

export type UsageByDateRow = UsageTotals & { companyId: string }

// A company with no document for the requested day used nothing that day, so
// the row reads as zeros rather than as missing data.
export const EMPTY_USAGE: UsageTotals = {
  cms_orders: 0,
  cms_orders_credits: 0,
  forward_orders: 0,
  forward_orders_credits: 0,
  return_orders: 0,
  return_orders_credits: 0,
  total_orders: 0,
  total_orders_credits: 0,
  total_effective_amount: 0
}

// Order counts are whole; credits are not (a forward order costs 1.25), so they
// keep up to two decimals and drop trailing zeros — 1,008.75 but 210, never
// 210.00.
export const formatQty = (n: unknown) => Number(n ?? 0).toLocaleString('en-IN')

export const formatCredits = (n: unknown) =>
  Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const formatRupees = (n: unknown) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// "YYYY-MM-DD" from the viewer's own calendar, which is what the date picker
// hands back and what the usage endpoints take.
export const toDayKey = (d: Date) => {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${d.getFullYear()}-${month}-${day}`
}

// The stored `date` is UTC midnight, so it is rendered in UTC — reading it in
// IST would show every day as the one before at 05:30.
export const formatUsageDay = (iso: string, opts?: Intl.DateTimeFormatOptions) => {
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) return '—'

  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC', ...opts })
}
