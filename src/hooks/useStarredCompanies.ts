'use client'

// React Imports
import { useCallback, useSyncExternalStore } from 'react'

// The companies a system admin has starred, kept in localStorage as a plain
// array of companyIds and shared by every page that shows companies (Company
// list, Pending CMS). Starring is a personal shortlist — the handful of
// accounts someone is actually working today — so it deliberately never leaves
// the browser: no API call, no per-user row in the DB.
//
// A module-level store rather than per-component state, because two places on
// the same page read it (the star column and the company filter's "Starred"
// toggle) and both have to move the moment a star is clicked. useSyncExternalStore
// also gives the correct SSR story for free: the server snapshot is empty, so
// the first client render matches the server and the real list arrives on the
// next one instead of tripping a hydration mismatch.
const STORAGE_KEY = 'trackvid-monitor.starred-companies'

// Stable identity for the server/empty snapshot. Returning a fresh [] would
// make useSyncExternalStore see a new value on every render and loop.
const EMPTY: string[] = []

const listeners = new Set<() => void>()

// getSnapshot must return the SAME reference until the data actually changes,
// so the parsed array is cached against the raw string it came from.
let cachedRaw: string | null = null
let cachedIds: string[] = EMPTY

const parse = (raw: string | null): string[] => {
  if (!raw) return EMPTY

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return EMPTY

    return parsed.filter((id: any): id is string => typeof id === 'string' && Boolean(id))
  } catch {
    // Corrupt entry — treat it as "nothing starred" rather than breaking every
    // page that reads it.
    return EMPTY
  }
}

const readStorage = (): string[] => {
  let raw: string | null = null

  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private mode / storage disabled: stars just don't persist.
    return EMPTY
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedIds = parse(raw)
  }

  return cachedIds
}

const emit = () => listeners.forEach(listener => listener())

const subscribe = (listener: () => void) => {
  listeners.add(listener)

  // Fires for writes from OTHER tabs, which is where a second Monitor window
  // starring a company would land.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) emit()
  }

  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

const write = (ids: string[]) => {
  try {
    if (ids.length > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    // An empty shortlist is the absence of one — removing the key keeps a stale
    // "[]" from lingering.
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* see readStorage */
  }

  // Notify in-page readers regardless of whether the write landed: the star
  // column has to reflect the click even when storage is unavailable.
  cachedRaw = ids.length > 0 ? JSON.stringify(ids) : null
  cachedIds = ids.length > 0 ? ids : EMPTY
  emit()
}

const useStarredCompanies = () => {
  const starredIds = useSyncExternalStore(subscribe, readStorage, () => EMPTY)

  const isStarred = useCallback((companyId: string) => starredIds.includes(companyId), [starredIds])

  const toggle = useCallback(
    (companyId: string) => {
      if (!companyId) return

      write(starredIds.includes(companyId) ? starredIds.filter(id => id !== companyId) : [...starredIds, companyId])
    },
    [starredIds]
  )

  const clear = useCallback(() => write([]), [])

  return { starredIds, isStarred, toggle, clear, starredCount: starredIds.length }
}

export default useStarredCompanies
