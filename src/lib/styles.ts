// Shared Tailwind class strings for buttons and form fields.

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900'

export const primaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-700 ${focus} disabled:cursor-not-allowed disabled:opacity-60`

export const secondaryButton = `inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-5 py-2 font-medium text-slate-900 hover:bg-slate-100 ${focus} disabled:cursor-not-allowed disabled:opacity-60`

export const smallButton = `inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-100 ${focus} disabled:cursor-not-allowed disabled:opacity-40`

export const fieldClass = `mt-1 block w-full min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-base ${focus}`

export const fieldErrorClass = 'mt-1 text-sm text-red-800'

export const dangerButton = `inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-5 py-2 font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-60`
