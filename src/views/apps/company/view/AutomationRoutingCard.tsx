'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

/**
 * Automation routing for one company.
 *
 * Two independent decisions per platform/automation pair:
 *
 *   Desktop execution — run it in the Trackvid-CMS desktop app instead of on
 *                       the server. Off by default; a company opts in once an
 *                       operator actually has the app installed.
 *   API-based flow    — use the platform's direct-API flow rather than the
 *                       browser-driven one. On by default.
 *
 * Plus one per-platform flag, which is not a pair and so gets its own section:
 *
 *   Auto-login        — re-capture a session by scripted login instead of
 *                       asking the operator to sign in by hand. On by default.
 *
 * The grid is built from `platformAutomations` in the response, not from a
 * literal here, so a cell only exists where the automation does — four
 * platforms have no master import and only AJIO has ticket download, and a
 * switch wired to nothing is worse than no switch.
 */

const FIELDS = ['desktopExecution', 'apiBasedAutomation'] as const

type Field = (typeof FIELDS)[number]

type RoutingMap = Record<string, Record<string, boolean>>

const FIELD_META: Record<Field, { title: string; help: string }> = {
  desktopExecution: {
    title: 'Run in the desktop app',
    help: 'Claims are pushed to the operator’s Trackvid-CMS app instead of running on the server.'
  },
  apiBasedAutomation: {
    title: 'Use the direct-API flow',
    help: 'Talks to the platform’s APIs rather than driving its web UI.'
  }
}

const AUTOMATION_LABELS: Record<string, string> = {
  claim: 'Claims',
  masterImport: 'Master import',
  ticketDownload: 'Tickets'
}

/** Every automation any platform has, in a stable column order. */
const columnsFor = (platformAutomations: Record<string, string[]>): string[] => {
  const seen: string[] = []

  for (const list of Object.values(platformAutomations)) {
    for (const automation of list) if (!seen.includes(automation)) seen.push(automation)
  }

  return seen
}

const AutomationRoutingCard = ({ companyId }: { companyId: string }) => {
  const [maps, setMaps] = useState<Record<Field, RoutingMap>>({
    desktopExecution: {},
    apiBasedAutomation: {}
  })

  // Flat `{ <platform>: boolean }` — one flag for the whole platform, because a
  // session is captured once and every automation on it reuses that session.
  const [autoLogin, setAutoLogin] = useState<Record<string, boolean>>({})

  const [platformAutomations, setPlatformAutomations] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keyed `${field}:${platform}:${automation}` so one in-flight toggle never
  // freezes the rest of the grid.
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/company/automation-routing?companyId=${encodeURIComponent(companyId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)

        return
      }

      setMaps({
        desktopExecution: (json?.data?.desktopExecution ?? {}) as RoutingMap,
        apiBasedAutomation: (json?.data?.apiBasedAutomation ?? {}) as RoutingMap
      })
      setAutoLogin((json?.data?.isAutoLoginOnActiveSession ?? {}) as Record<string, boolean>)
      setPlatformAutomations((json?.data?.platformAutomations ?? {}) as Record<string, string[]>)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load automation routing')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (field: Field, platform: string, automation: string, next: boolean) => {
      const key = `${field}:${platform}:${automation}`

      if (busy.has(key)) return

      const previous = maps[field]?.[platform]?.[automation] === true

      // Optimistic: the switch answers immediately and rolls back on failure.
      setBusy(current => new Set(current).add(key))
      setMaps(current => ({
        ...current,
        [field]: {
          ...current[field],
          [platform]: { ...(current[field]?.[platform] ?? {}), [automation]: next }
        }
      }))

      try {
        const res = await fetch('/api/company/automation-routing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            companyIds: [companyId],
            // Only the one pair — a partial map, so flipping one switch never
            // rewrites the rest.
            [field]: { [platform]: { [automation]: next } }
          })
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.isSuccess) {
          setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)
          setMaps(current => ({
            ...current,
            [field]: {
              ...current[field],
              [platform]: { ...(current[field]?.[platform] ?? {}), [automation]: previous }
            }
          }))
        } else {
          setError(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save')
        setMaps(current => ({
          ...current,
          [field]: {
            ...current[field],
            [platform]: { ...(current[field]?.[platform] ?? {}), [automation]: previous }
          }
        }))
      } finally {
        setBusy(current => {
          const next = new Set(current)

          next.delete(key)

          return next
        })
      }
    },
    [busy, companyId, maps]
  )

  const toggleAutoLogin = useCallback(
    async (platform: string, next: boolean) => {
      const key = `isAutoLoginOnActiveSession:${platform}`

      if (busy.has(key)) return

      const previous = autoLogin[platform] === true

      setBusy(current => new Set(current).add(key))
      setAutoLogin(current => ({ ...current, [platform]: next }))

      try {
        const res = await fetch('/api/company/automation-routing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            companyIds: [companyId],
            isAutoLoginOnActiveSession: { [platform]: next }
          })
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.isSuccess) {
          setError(json?.displayMessage || json?.message || `Request failed (${res.status})`)
          setAutoLogin(current => ({ ...current, [platform]: previous }))
        } else {
          setError(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save')
        setAutoLogin(current => ({ ...current, [platform]: previous }))
      } finally {
        setBusy(current => {
          const next = new Set(current)

          next.delete(key)

          return next
        })
      }
    },
    [autoLogin, busy, companyId]
  )

  const platforms = useMemo(() => Object.keys(platformAutomations), [platformAutomations])
  const columns = useMemo(() => columnsFor(platformAutomations), [platformAutomations])

  return (
    <Card>
      <CardHeader
        title='Automation Routing'
        subheader='Where each automation runs, and which flow it uses'
        action={
          <Button
            size='small'
            variant='outlined'
            color='secondary'
            startIcon={<i className='tabler-refresh' />}
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />
      <Divider />
      <CardContent>
        {error && (
          <Alert severity='error' className='mbe-4'>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className='flex justify-center py-6'>
            <CircularProgress size={22} />
          </div>
        ) : platforms.length === 0 ? (
          <Typography color='text.disabled'>No automation platforms configured on the server.</Typography>
        ) : (
          <>
            {FIELDS.map(field => (
            <div key={field} className='mbe-6'>
              <Typography color='text.primary' className='font-medium'>
                {FIELD_META[field].title}
              </Typography>
              <Typography variant='body2' color='text.secondary' className='mbe-2'>
                {FIELD_META[field].help}
              </Typography>

              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Platform</TableCell>
                    {columns.map(automation => (
                      <TableCell key={automation} align='center'>
                        {AUTOMATION_LABELS[automation] ?? automation}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {platforms.map(platform => (
                    <TableRow key={platform}>
                      <TableCell className='capitalize'>{platform}</TableCell>
                      {columns.map(automation => {
                        const exists = (platformAutomations[platform] ?? []).includes(automation)
                        const key = `${field}:${platform}:${automation}`

                        return (
                          <TableCell key={automation} align='center'>
                            {exists ? (
                              busy.has(key) ? (
                                <CircularProgress size={14} />
                              ) : (
                                <Switch
                                  size='small'
                                  checked={maps[field]?.[platform]?.[automation] === true}
                                  onChange={e => void toggle(field, platform, automation, e.target.checked)}
                                />
                              )
                            ) : (
                              // No automation of this type on this platform, so
                              // there is nothing a switch here could control.
                              <Typography component='span' color='text.disabled'>
                                —
                              </Typography>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            ))}

            {/* Not a platform/automation pair, so it gets a section of its own
                rather than a fourth column that would be identical down every
                row of the grids above. */}
            <div>
              <Typography color='text.primary' className='font-medium'>
                Auto-login on re-capture
              </Typography>
              <Typography variant='body2' color='text.secondary' className='mbe-2'>
                Sign in to the marketplace by script when a session is re-captured, instead of asking the operator to
                type the password. Falls back to the manual sign-in window when no usable credential is stored.
              </Typography>

              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>Platform</TableCell>
                    <TableCell align='center'>Auto-login</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {platforms.map(platform => {
                    const key = `isAutoLoginOnActiveSession:${platform}`

                    return (
                      <TableRow key={platform}>
                        <TableCell className='capitalize'>{platform}</TableCell>
                        <TableCell align='center'>
                          {busy.has(key) ? (
                            <CircularProgress size={14} />
                          ) : (
                            <Switch
                              size='small'
                              checked={autoLogin[platform] === true}
                              onChange={e => void toggleAutoLogin(platform, e.target.checked)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default AutomationRoutingCard
