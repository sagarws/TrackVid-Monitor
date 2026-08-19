'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Keeps a search box's value in localStorage so it survives navigation — open a
// company, come back, and the list is still filtered the way you left it.
//
// Deliberately NOT seeded from localStorage in useState: the server renders
// with an empty box, so reading storage during the first render would produce a
// hydration mismatch. The stored value is applied in an effect instead, which
// costs one extra render and is the only version that is correct under SSR.
//
// The write is skipped until that first read has happened, otherwise the empty
// initial value would immediately overwrite what was stored.
const usePersistedSearch = (storageKey: string, initial = ''): [string, (value: string) => void] => {
  const [value, setValue] = useState(initial)
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey)

      if (stored) setValue(stored)
    } catch {
      // Private mode / storage disabled — the box just does not persist.
    }

    hydrated.current = true
  }, [storageKey])

  useEffect(() => {
    if (!hydrated.current) return

    try {
      // An empty search is the absence of one: removing the key keeps stale
      // terms from lingering in storage after the box is cleared.
      if (value) window.localStorage.setItem(storageKey, value)
      else window.localStorage.removeItem(storageKey)
    } catch {
      /* see above */
    }
  }, [storageKey, value])

  return [value, setValue]
}

export default usePersistedSearch
