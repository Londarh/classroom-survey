// The address students open after scanning the QR code: <base>/s/<slug>.
//
// The base is this site's own address. To test with a phone while developing
// (where "localhost" would not work), set VITE_PUBLIC_BASE_URL in .env, for
// example http://192.168.1.20:5173, and restart the dev server.

export function publicBaseUrl(): string {
  const override = import.meta.env.VITE_PUBLIC_BASE_URL?.trim()
  if (override) {
    if (/^https?:\/\//i.test(override)) return override.replace(/\/+$/, '')
    console.warn(
      'VITE_PUBLIC_BASE_URL must start with http:// or https://; ignoring it.',
    )
  }
  return window.location.origin
}

export function publicSurveyUrl(slug: string): string {
  return `${publicBaseUrl()}/s/${slug}`
}
