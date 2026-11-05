import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Keyboard users need focus to follow an inline confirmation. When the
 * confirmation opens, the button that opened it disappears, which would leave
 * focus on nothing; this moves focus to the confirmation's Cancel button (the
 * safe choice). When it closes again, focus goes back to the button that
 * opened it, if that button is still there.
 *
 * Mark the Cancel button with `data-confirm-cancel` and the opening button with
 * `data-confirm-trigger`, inside the element that `containerRef` points to.
 */
export function useConfirmFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  triggerSelector = '[data-confirm-trigger]',
) {
  const wasOpen = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (open) {
      container?.querySelector<HTMLElement>('[data-confirm-cancel]')?.focus()
    } else if (wasOpen.current) {
      container?.querySelector<HTMLElement>(triggerSelector)?.focus()
    }
    wasOpen.current = open
  }, [open, containerRef, triggerSelector])
}
