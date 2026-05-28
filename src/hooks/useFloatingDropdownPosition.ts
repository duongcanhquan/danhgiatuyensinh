import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type FloatingDropdownOpts = {
  maxHeight?: number
  gap?: number
}

export type FloatingDropdownPlacement = {
  style: CSSProperties
  placeAbove: boolean
}

/** Vị trí menu cố định (portal) — tránh bị cắt bởi `overflow` của modal/tab. */
export function useFloatingDropdownPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts: FloatingDropdownOpts = {},
): FloatingDropdownPlacement {
  const maxHeightCap = opts.maxHeight ?? 320
  const gap = opts.gap ?? 4
  const [placement, setPlacement] = useState<FloatingDropdownPlacement>({
    style: { display: 'none' },
    placeAbove: false,
  })

  useLayoutEffect(() => {
    if (!open) {
      setPlacement({ style: { display: 'none' }, placeAbove: false })
      return
    }

    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - gap
      const spaceAbove = rect.top - gap
      const placeAbove = spaceBelow < 160 && spaceAbove > spaceBelow
      const available = placeAbove ? spaceAbove : spaceBelow
      const maxHeight = Math.max(120, Math.min(maxHeightCap, available))

      setPlacement({
        placeAbove,
        style: {
          position: 'fixed',
          left: Math.max(8, rect.left),
          width: Math.min(rect.width, window.innerWidth - 16),
          maxHeight,
          zIndex: 10000,
          ...(placeAbove
            ? { bottom: window.innerHeight - rect.top + gap }
            : { top: rect.bottom + gap }),
        },
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, maxHeightCap, gap])

  return placement
}
