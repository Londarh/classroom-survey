/**
 * Jumps to the first validation problem on the page and focuses it when it is a
 * field. Marks: a field with aria-invalid="true", or any element with a
 * data-problem attribute. The jump is instant, not animated.
 *
 * Call it AFTER React has drawn the error messages, for example from an effect
 * that runs when a "problems were shown" counter changes.
 */
export function scrollToFirstProblem(): void {
  const target = document.querySelector<HTMLElement>(
    '[aria-invalid="true"], [data-problem]',
  )
  if (!target) return
  target.scrollIntoView({ block: 'center' })
  target.focus({ preventScroll: true })
}
