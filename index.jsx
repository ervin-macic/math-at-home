import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Atom, InfoCircle, Warning } from '@openai/apps-sdk-ui/components/Icon'
import CATALOG from './catalog.json'
import { CSS } from './ui/theme.js'
import { createApi, isChosen, isPreview, signal, toggleChoice } from './ui/api.js'
import { Hero } from './ui/Hero.jsx'
import { ProblemList, ProblemSheet } from './ui/Problems.jsx'
import { DonatePanel } from './ui/Donate.jsx'
import { ResultsPanel, ShiftSheet } from './ui/Results.jsx'
import { PointsPanel } from './ui/Points.jsx'
import { CommunityPanel } from './ui/Community.jsx'
import { ShareSheet } from './ui/Share.jsx'

const TABS = [
  { id: 'problems', label: 'Problems' },
  { id: 'donate', label: 'Donate' },
  { id: 'results', label: 'Results' },
  { id: 'points', label: 'Points' },
  { id: 'community', label: 'Community' },
]
const PROBLEMS = [...CATALOG.problems].sort((a, b) => a.rank - b.rank)
const PROBLEM_IDS = PROBLEMS.map((p) => p.id)
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const COUNT = COUNT_WORDS[PROBLEMS.length] || String(PROBLEMS.length)

export default function App({ appId, token }) {
  const preview = isPreview(appId)
  const api = useMemo(() => (preview ? null : createApi(appId, token)), [preview, appId, token])
  const [tab, setTab] = useState('problems')
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [openProblem, setOpenProblem] = useState(null)
  const [openShift, setOpenShift] = useState(null)
  const [shareShift, setShareShift] = useState(null)
  const [community, setCommunity] = useState(null)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [liveRecords, setLiveRecords] = useState({})
  const readySent = useRef(false)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const next = await api.call('state')
      setState(next)
      setError('')
      if (!readySent.current) {
        readySent.current = true
        signal('app_ready', { item_count: next.shifts.length })
      }
    } catch (e) {
      setError(e.message)
      signal('error', { message: e.message, source: 'state' })
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (preview) {
      if (!readySent.current) { readySent.current = true; signal('app_ready', { item_count: 0 }) }
      return undefined
    }
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 20000)
    return () => window.clearInterval(timer)
  }, [preview, refresh])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const act = useCallback(async (path, body, success) => {
    if (!api) return null
    setBusy(true)
    try {
      const result = await api.call(path, { method: 'POST', body })
      setState(result.state || result)
      if (success) setToast(typeof success === 'function' ? success(result) : success)
      return result
    } catch (e) {
      setToast(e.message)
      signal('error', { message: e.message, source: path })
      return null
    } finally {
      setBusy(false)
    }
  }, [api])

  const runNow = useCallback(async (problemId) => {
    const result = await act('shift/start', problemId ? { problem_id: problemId } : {}, (r) => (
      r.result?.started ? 'Shift started. It checks your spare capacity first.' : (r.result?.reason || 'The shift did not start.')
    ))
    if (result?.result?.started) {
      signal('item_created', { type: 'shift' })
      setOpenProblem(null)
      setTab('results')
    }
  }, [act])

  const loadDetail = useCallback((id) => api.call(`contribution?id=${encodeURIComponent(id)}`), [api])

  // Records that move faster than app releases (the multiplication κ race) are
  // read live by the service; the catalog's record stays as the fallback.
  useEffect(() => {
    if (!api) return undefined
    let cancelled = false
    const load = async () => {
      try {
        const result = await api.call('records')
        if (!cancelled && result?.records) setLiveRecords(result.records)
      } catch (e) {
        signal('error', { message: e.message, source: 'records' })
      }
    }
    load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 15 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [api])
  const problems = useMemo(
    () => PROBLEMS.map((p) => (liveRecords[p.id] ? { ...p, record: liveRecords[p.id] } : p)),
    [liveRecords],
  )

  const loadCommunity = useCallback(async () => {
    if (!api) return
    setCommunityLoading(true)
    try {
      setCommunity(await api.call('community'))
    } catch (e) {
      setCommunity((current) => current || { board: null, error: e.message })
      signal('error', { message: e.message, source: 'community' })
    } finally {
      setCommunityLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (tab !== 'community' || !api) return undefined
    loadCommunity()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadCommunity()
    }, 60000)
    return () => window.clearInterval(timer)
  }, [tab, api, loadCommunity])

  const loadPreview = useCallback((id) => api.call(`share/preview?shift_id=${encodeURIComponent(id)}`), [api])

  const confirmShare = useCallback(async (view) => {
    setBusy(true)
    try {
      const prepared = await api.call('share/prepare', { method: 'POST', body: { shift_id: view.shift_id, sha256: view.sha256 } })
      const { chatId } = await window.mobius.chat.start({ title: prepared.title, draft: prepared.draft, scope: prepared.scope })
      signal('item_created', { type: 'share' })
      setShareShift(null)
      setOpenShift(null)
      setToast('Your Möbius agent is posting it from your GitHub account.')
      window.parent.postMessage({ type: 'moebius:open-chat', chatId }, '*')
      refresh()
    } catch (e) {
      setToast(e.message)
      signal('error', { message: e.message, source: 'share' })
    } finally {
      setBusy(false)
    }
  }, [api, refresh])

  const settle = useCallback(async (verb, body) => {
    await act(`contribution/${verb}`, body, verb === 'confirm' ? 'Claim confirmed. Points added.' : 'Claim marked refuted.')
    refresh()
  }, [act, refresh])

  const consented = Boolean(state?.consent?.current)
  const active = state?.active
  const subtitle = preview
    ? `Preview · ${COUNT.toLowerCase()} open problems`
    : !state ? 'Loading…'
      : active ? `Working on ${active.problem_short}`
        : state.settings.enabled && consented ? `Donating · ${state.totals.points.toLocaleString()} points`
          : consented ? 'Paused' : 'Not donating yet'
  const shift = openShift && state ? state.shifts.find((s) => s.id === openShift) : null
  const shiftItems = shift ? state.contributions.filter((c) => c.shift_id === shift.id) : []
  const problem = openProblem ? problems.find((p) => p.id === openProblem) : null
  const chosen = consented && state?.settings ? state.settings.problems : null
  const choice = problem && chosen ? {
    included: isChosen(chosen, problem.id),
    canRemove: toggleChoice(chosen, PROBLEM_IDS, problem.id) !== null,
    onToggle: () => {
      const next = toggleChoice(chosen, PROBLEM_IDS, problem.id)
      if (next) act('settings', { problems: next }, isChosen(chosen, problem.id) ? 'Left out of your donations.' : 'Added to your donations.')
    },
  } : null

  return (
    <div className="mh-root">
      <style>{CSS}</style>
      <header className="mh-header">
        <div className="mh-brand">
          <span className="mh-mark" aria-hidden="true"><Atom width={19} height={19} /></span>
          <div className="mh-brand-text">
            <h1 className="mh-title">Math@Home</h1>
            <span className="mh-subtitle">{subtitle}</span>
          </div>
        </div>
        <nav className="mh-tabs" role="tablist" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`mh-tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === 'results' && active ? <span className="mh-tab-dot" aria-label="A shift is running" /> : null}
            </button>
          ))}
        </nav>
      </header>
      <main className="mh-scroll">
        <div className="mh-page">
          {error && (
            <div className="mh-banner is-error" role="alert">
              <Warning width={17} height={17} aria-hidden="true" />
              <span style={{ flex: 1 }}>{error}</span>
              <button type="button" className="mh-btn" onClick={refresh}>Retry</button>
            </div>
          )}
          {tab === 'problems' && (
            <>
              <Hero preview={preview} state={state} busy={busy} onSetup={() => setTab('donate')} onRunNow={() => runNow()} />
              <div className="mh-section-head">
                <h2 className="mh-section-title">{COUNT} open problems, easiest first</h2>
                <span className="mh-section-note">Checked {CATALOG.as_of}{problems.some((p) => p.record.live) ? ' · live records hourly' : ''}</span>
              </div>
              {loading && !state ? <div className="mh-skeleton" /> : (
                <ProblemList problems={problems} tiers={CATALOG.tiers} stats={state?.problems} chosen={chosen} onOpen={setOpenProblem} />
              )}
              <div className="mh-banner">
                <InfoCircle width={17} height={17} aria-hidden="true" />
                <span>Every shift is time-boxed and checks your spare capacity first. Certificates are verified by built-in checkers; other claims wait for independent review before they earn record points.</span>
              </div>
            </>
          )}
          {tab === 'donate' && (
            <DonatePanel
              state={state}
              preview={preview}
              busy={busy}
              problems={{ list: problems, consentTerms: CATALOG.consent }}
              onAgree={(body) => act('consent', body, 'Thank you. Donation is on.')}
              onSave={(patch) => act('settings', patch, 'Saved.')}
              onWithdraw={() => act('consent/withdraw', {}, 'Consent withdrawn. Nothing more will run.')}
              onRunNow={() => runNow()}
              onOpenProblem={setOpenProblem}
            />
          )}
          {tab === 'results' && (
            <ResultsPanel state={state} preview={preview} onOpenShift={setOpenShift} onGoDonate={() => setTab('donate')} />
          )}
          {tab === 'points' && (
            <PointsPanel state={state} preview={preview} rules={CATALOG.points} problems={problems} />
          )}
          {tab === 'community' && (
            <CommunityPanel data={community} loading={communityLoading} preview={preview} problems={problems} onRetry={loadCommunity} />
          )}
        </div>
      </main>
      {problem && (
        <ProblemSheet
          problem={problem}
          tiers={CATALOG.tiers}
          stats={state?.problems}
          canRun={!preview && consented && !active}
          busy={busy}
          choice={choice}
          onRun={runNow}
          onClose={() => setOpenProblem(null)}
        />
      )}
      {shift && (
        <ShiftSheet
          shift={shift}
          contributions={shiftItems}
          loadDetail={loadDetail}
          onSettle={settle}
          onShare={setShareShift}
          busy={busy}
          onClose={() => setOpenShift(null)}
        />
      )}
      {shareShift && (
        <ShareSheet shiftId={shareShift} loadPreview={loadPreview} onConfirm={confirmShare} busy={busy} onClose={() => setShareShift(null)} />
      )}
      {toast && <div className="mh-toast" role="status">{toast}</div>}
    </div>
  )
}
