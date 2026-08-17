'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Tracks an element's client width. Used by the expandable report tables (
// Pending CMS / Pending VMS) to give a detail panel a definite pixel width:
// a table cell is sized from its content's max-content width, so without one
// the wide detail table stretches the parent table and pushes its right-hand
// columns off-screen — taking the only horizontal scrollbar with it.
//
// Returns [ref, width]; width is 0 until the first measurement lands.
const useElementWidth = <T extends HTMLElement = HTMLDivElement>(): [React.RefObject<T | null>, number] => {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current

    if (!el || typeof ResizeObserver === 'undefined') return

    const update = () => {
      const next = el.clientWidth

      // Threshold guard: consumers size a *child* of the measured element from
      // this value, so 1px jitter (a scrollbar appearing) must not loop.
      setWidth(prev => (Math.abs(prev - next) > 2 ? next : prev))
    }

    update()

    const ro = new ResizeObserver(update)

    ro.observe(el)

    return () => ro.disconnect()
  }, [])

  return [ref, width]
}

export default useElementWidth
