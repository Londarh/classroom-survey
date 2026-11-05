const SUFFIX = 'Classroom Survey'

/** The browser tab / screen-reader title for each page, from its URL path. */
export function pageTitle(pathname: string): string {
  if (pathname === '/') return SUFFIX
  if (pathname === '/login') return `Instructor Login · ${SUFFIX}`
  if (pathname === '/dashboard') return `Dashboard · ${SUFFIX}`
  if (pathname === '/surveys/new') return `New Survey · ${SUFFIX}`
  if (/^\/surveys\/[^/]+\/edit$/.test(pathname))
    return `Edit Survey · ${SUFFIX}`
  if (/^\/surveys\/[^/]+\/present$/.test(pathname))
    return `Present Survey · ${SUFFIX}`
  if (/^\/surveys\/[^/]+\/results$/.test(pathname))
    return `Survey Results · ${SUFFIX}`
  if (/^\/s\/[^/]+$/.test(pathname)) return SUFFIX
  return `Page not found · ${SUFFIX}`
}
