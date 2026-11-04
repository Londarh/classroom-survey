/** Shown instead of the app when the Supabase environment variables are not set. */
export default function ConfigMissing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-4 text-center text-slate-900">
      <h1 className="text-2xl font-bold">Setup needed</h1>
      <p className="max-w-md text-slate-600">
        The Supabase connection is not configured. Copy{' '}
        <code className="rounded bg-slate-100 px-1">.env.example</code> to{' '}
        <code className="rounded bg-slate-100 px-1">.env</code>, fill in{' '}
        <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-slate-100 px-1">
          VITE_SUPABASE_ANON_KEY
        </code>
        , then restart the dev server.
      </p>
    </main>
  )
}
