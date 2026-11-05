import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { publicSurveyUrl } from '../lib/publicUrl.ts'
import { useConfirmFocus } from '../lib/useConfirmFocus.ts'
import {
  SurveyActionError,
  closeSurvey,
  getPresentSnapshot,
} from '../lib/surveys.ts'
import type { PresentSnapshot } from '../lib/surveys.ts'
import { dangerButton, primaryButton, secondaryButton } from '../lib/styles.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** How often the response count refreshes on its own. */
const REFRESH_MS = 5000

type LoadState = 'loading' | 'ready' | 'error'

function PageMessage({
  children,
  role,
}: {
  children: ReactNode
  role?: 'status' | 'alert'
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 text-center text-slate-900">
      <div role={role} className="space-y-4">
        {children}
      </div>
      <Link to="/dashboard" className={secondaryButton}>
        Back to dashboard
      </Link>
    </main>
  )
}

/**
 * The page shown on the projector: the survey title, a big QR code, the link
 * written out, and how many students have answered.
 */
/**
 * Two different survey ids can reach this page without it being unmounted
 * (browser back/forward, an edited URL), and React would keep the previous
 * survey's data on screen. Keying the view by id starts it fresh each time.
 */
export default function SurveyPresent() {
  const { id } = useParams()
  return <SurveyPresentView key={id ?? 'none'} id={id} />
}

function SurveyPresentView({ id }: { id: string | undefined }) {
  const validId = id !== undefined && UUID_PATTERN.test(id)

  const [loadState, setLoadState] = useState<LoadState>(
    validId ? 'loading' : 'ready',
  )
  const [reloadKey, setReloadKey] = useState(0)
  const [snapshot, setSnapshot] = useState<PresentSnapshot | null>(
    validId ? null : { survey: null, responseCount: 0 },
  )
  const [refreshFailed, setRefreshFailed] = useState(false)

  const [qrImage, setQrImage] = useState<string | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const controlsRef = useRef<HTMLDivElement>(null)
  useConfirmFocus(confirmingClose, controlsRef)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const survey = snapshot?.survey ?? null
  const slug = survey?.status === 'active' ? survey.public_slug : null
  const surveyUrl = slug ? publicSurveyUrl(slug) : null

  // Load once, then refresh the count (and status) every few seconds.
  useEffect(() => {
    if (!validId) return
    let active = true

    function refresh(initial: boolean) {
      getPresentSnapshot(id!)
        .then((result) => {
          if (!active) return
          setSnapshot(result)
          setRefreshFailed(false)
          if (initial) setLoadState('ready')
        })
        .catch((error) => {
          console.error('Could not load present page data', error)
          if (!active) return
          if (initial) setLoadState('error')
          else setRefreshFailed(true) // keep showing the last known count
        })
    }

    refresh(true)
    const timer = window.setInterval(() => refresh(false), REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [id, validId, reloadKey])

  // Draw the QR code (as a large PNG, used both on screen and for download).
  useEffect(() => {
    if (!surveyUrl) return
    let active = true
    QRCode.toDataURL(surveyUrl, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setQrImage(dataUrl)
      })
      .catch((error) => console.error('Could not draw the QR code', error))
    return () => {
      active = false
    }
  }, [surveyUrl])

  function retryLoad() {
    setLoadState('loading')
    setReloadKey((key) => key + 1)
  }

  function downloadQr() {
    if (!qrImage || !slug) return
    const link = document.createElement('a')
    link.href = qrImage
    link.download = `survey-${slug}-qr.png`
    link.click()
  }

  async function handleClose() {
    if (!id) return
    setClosing(true)
    setCloseError(null)
    try {
      await closeSurvey(id)
      setConfirmingClose(false)
      // Show the closed state straight away; the next refresh confirms it.
      setSnapshot((current) =>
        current?.survey
          ? {
              ...current,
              survey: { ...current.survey, status: 'closed' },
            }
          : current,
      )
    } catch (error) {
      setCloseError(
        error instanceof SurveyActionError
          ? error.message
          : "We couldn't close the survey. Try again.",
      )
    } finally {
      setClosing(false)
    }
  }

  if (loadState === 'loading') {
    return (
      <PageMessage role="status">
        <p className="text-xl text-slate-600">Loading survey...</p>
      </PageMessage>
    )
  }
  if (loadState === 'error') {
    return (
      <PageMessage role="alert">
        <p className="text-xl">
          We couldn&apos;t load this survey. Check your connection and try
          again.
        </p>
        <button type="button" onClick={retryLoad} className={secondaryButton}>
          Try again
        </button>
      </PageMessage>
    )
  }
  if (!survey) {
    return (
      <PageMessage>
        <p className="text-xl">Survey not found.</p>
      </PageMessage>
    )
  }

  if (survey.status === 'closed') {
    return (
      <PageMessage role="status">
        <h1 className="text-4xl font-bold">{survey.title}</h1>
        <p className="text-2xl text-slate-700">This survey is closed.</p>
        <p className="text-3xl font-semibold">
          Responses: {snapshot?.responseCount ?? 0}
        </p>
        <Link to={`/surveys/${survey.id}/results`} className={primaryButton}>
          View Results
        </Link>
      </PageMessage>
    )
  }

  if (survey.status !== 'active' || !slug) {
    return (
      <PageMessage role="alert">
        <h1 className="text-3xl font-bold">{survey.title}</h1>
        <p className="text-xl text-slate-700">
          Only an active survey can be presented. Activate it from the dashboard
          first.
        </p>
      </PageMessage>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between gap-6 bg-white px-4 py-6 text-center text-slate-900">
      <h1 className="max-w-5xl text-4xl font-bold sm:text-6xl">
        {survey.title}
      </h1>

      <div className="flex flex-col items-center gap-6">
        {qrImage ? (
          <img
            src={qrImage}
            alt={`QR code that opens ${surveyUrl}`}
            className="aspect-square"
            style={{ width: 'min(55vh, 90vw)' }}
          />
        ) : (
          <div
            role="status"
            className="flex aspect-square items-center justify-center text-slate-600"
            style={{ width: 'min(55vh, 90vw)' }}
          >
            Drawing QR code...
          </div>
        )}

        <p className="max-w-full break-all text-3xl font-semibold sm:text-5xl">
          {surveyUrl}
        </p>

        <div>
          <p
            className="text-4xl font-bold sm:text-6xl"
            aria-live="polite"
            aria-atomic="true"
          >
            Responses: {snapshot?.responseCount ?? 0}
          </p>
          {refreshFailed && (
            <p className="mt-1 text-sm text-slate-600">
              Couldn&apos;t refresh the count. Trying again...
            </p>
          )}
        </div>
      </div>

      <div ref={controlsRef} className="w-full max-w-3xl space-y-3">
        {closeError && (
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900"
          >
            {closeError}
          </p>
        )}

        {confirmingClose ? (
          <div
            role="alertdialog"
            aria-label="Close this survey?"
            className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3"
          >
            <p className="text-red-900">
              Close this survey? Students will no longer be able to submit.
            </p>
            <button
              type="button"
              disabled={closing}
              data-confirm-cancel
              onClick={() => setConfirmingClose(false)}
              className={secondaryButton}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={closing}
              onClick={handleClose}
              className={dangerButton}
            >
              {closing ? 'Closing...' : 'Close Survey'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/surveys/${survey.id}/results`}
              className={secondaryButton}
            >
              View Results
            </Link>
            <button
              type="button"
              disabled={!qrImage}
              onClick={downloadQr}
              className={secondaryButton}
            >
              Download QR
            </button>
            <button
              type="button"
              data-confirm-trigger
              onClick={() => {
                setCloseError(null)
                setConfirmingClose(true)
              }}
              className={secondaryButton}
            >
              Close Survey
            </button>
          </div>
        )}

        <p>
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center text-sm text-slate-600 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Back to dashboard
          </Link>
        </p>
      </div>
    </main>
  )
}
