import type { SurveyStatus } from '../lib/surveys.ts'

const LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

// Each status has its own colour AND a text label (and active gets a dot), so
// the meaning never depends on colour alone.
const STYLES: Record<SurveyStatus, string> = {
  draft: 'border-slate-400 bg-slate-100 text-slate-800',
  active: 'border-green-700 bg-green-100 text-green-900',
  closed: 'border-amber-700 bg-amber-100 text-amber-900',
  archived: 'border-slate-500 bg-white text-slate-700',
}

export default function StatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium ${STYLES[status]}`}
    >
      {status === 'active' && (
        <span aria-hidden="true" className="size-2 rounded-full bg-green-700" />
      )}
      {LABELS[status]}
    </span>
  )
}
