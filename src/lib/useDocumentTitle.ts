import { useEffect } from 'react'

/** Keeps the browser tab title (also read out by screen readers) up to date. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
