import { useEffect, useRef, useState } from 'react'
import { CloseBold, Flask, Globe, History, Moon, Sparkles, Terminal } from '@openai/apps-sdk-ui/components/Icon'
import { SHIFT_STATUS, VERDICT, fmtMinutes, fmtTokens, fmtWhen, shortValue, toneClass } from './api.js'

function StatusPill({ status }) {
  const info = SHIFT_STATUS[status] || { label: status, tone: '' }
  return <span className={toneClass(info.tone)}>{info.label}</span>
}

function VerdictPill({ verdict, value }) {
  const info = VERDICT[verdict] || { label: verdict, tone: '' }
  const shown = value && verdict !== 'logged' ? shortValue(value) : ''
  return (
    <span className={toneClass(info.tone)} title={value && verdict !== 'logged' ? String(value) : undefined}>
      {info.label}{shown ? ` · ${shown}` : ''}
    </span>
  )
}

export function ResultsPanel({ state, preview, onOpenShift, onGoDonate }) {
  if (preview || !state) {
    return (
      <div className="mh-empty">
        <div className="mh-empty-mark"><History width={26} height={26} /></div>
        <div className="mh-empty-title">Shifts appear here</div>
        <p>Each shift leaves a report, and sometimes a certificate the checker can verify. Install Math@Home to start.</p>
      </div>
    )
  }
  const byShift = {}
  for (const item of state.contributions) {
    if (!item.shift_id) continue
    ;(byShift[item.shift_id] ||= []).push(item)
  }
  if (!state.shifts.length) {
    return (
      <div className="mh-empty">
        <div className="mh-empty-mark"><Moon width={26} height={26} /></div>
        <div className="mh-empty-title">No shifts yet</div>
        <p>{state.consent.current ? 'Your first shift starts in your next quiet hours, or run one now from the Donate tab.' : 'Agree to donate and your AI will start working here overnight.'}</p>
        <div className="mh-actions"><button type="button" className="mh-btn mh-btn-primary" onClick={onGoDonate}>{state.consent.current ? 'Open donation settings' : 'Set up donation'}</button></div>
      </div>
    )
  }
  return (
    <div className="mh-stack">
      <HowVerified />
      {state.shifts.map((shift) => {
        const items = byShift[shift.id] || []
        const report = items.find((item) => item.kind === 'report')
        const live = shift.status === 'running' || shift.status === 'starting'
        const tokens = shift.tokens?.total_tokens
        return (
          <button key={shift.id} type="button" className="mh-shift" onClick={() => onOpenShift(shift.id)}>
            <span className={`mh-shift-icon${live ? ' is-live' : ''}`}>
              {live ? <Sparkles width={18} height={18} /> : items.some((i) => i.kind !== 'report') ? <Flask width={18} height={18} /> : <Terminal width={18} height={18} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="mh-shift-title" style={{ display: 'block' }}>{report ? report.title : `${shift.problem_title}`}</span>
              <span className="mh-shift-sub" style={{ display: 'block' }}>
                {shift.problem_short} · {shift.lane_title} · {fmtWhen(shift.created_at)}
                {shift.minutes ? ` · ${fmtMinutes(shift.minutes)}` : ''}{tokens ? ` · ${fmtTokens(tokens)} tokens` : ''}
              </span>
              <span className="mh-chips">
                <StatusPill status={shift.status} />
                {shift.share_status === 'recorded' && <span className="mh-pill is-accent">On the board</span>}
                {shift.hub_lean?.status === 'verified' && <span className="mh-pill is-good" title="Proved in Lean 4 on the community board">Lean ✓</span>}
                {(shift.share_status === 'posted' || shift.share_status === 'prepared') && <span className="mh-pill">Sharing</span>}
                {items.filter((i) => i.kind !== 'report').map((i) => <VerdictPill key={i.id} verdict={i.verdict} value={i.value || i.claimed_value} />)}
                {items.reduce((sum, i) => sum + (i.points || 0), 0) > 0 && (
                  <span className="mh-pill is-accent">+{items.reduce((sum, i) => sum + (i.points || 0), 0)} pts</span>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Transcript({ chatId }) {
  const mountRef = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !window.mobius?.chat) return undefined
    let handle
    let disposed = false
    window.mobius.chat({ mount, chatId, picker: false })
      .then((h) => { if (disposed) h.destroy(); else handle = h })
      .catch((e) => setError(e?.message || 'The transcript could not open.'))
    return () => { disposed = true; handle?.destroy() }
  }, [chatId])
  if (error) return <p className="mh-hint">{error}</p>
  return <div ref={mountRef} className="mh-transcript" />
}

const STEP_MARK = { passed: '✓', failed: '✗', pending: '…', not_run: '–', 'n/a': '–' }

function Verification({ v }) {
  return (
    <div className="mh-verify">
      <div className="mh-verify-head">{v.headline}</div>
      <ul className="mh-verify-steps">
        {v.steps.map((step) => (
          <li key={step.name} className={`is-${step.status.replace('/', '')}`}>
            <span className="mh-verify-mark" aria-hidden="true">{STEP_MARK[step.status] || '–'}</span>
            <span><b>{step.name}.</b> {step.text}</span>
          </li>
        ))}
      </ul>
      {v.statement && <p className="mh-hint">What is checked: {v.statement}. {v.consequence}</p>}
    </div>
  )
}

export function HowVerified() {
  return (
    <details className="mh-card mh-how">
      <summary>How results are verified</summary>
      <ul className="mh-list">
        <li><span><b>Certificates</b> (a grid configuration, a set of words, a residue set) are checked instantly by the built-in checker with exact arithmetic, here and again on the community board.</span></li>
        <li><span><b>Lean 4.</b> When you share a certificate, the board restates it as a Lean theorem and proves it: "kernel" means Lean's kernel computed the proof; a "compiled check" also trusts Lean's compiler. Lean checks the certificate's defining property; a bound that rests on a classical theorem is cited, not formalized. This Möbius does not run Lean itself.</span></li>
        <li><span><b>Claims</b> (proof sketches, experiments) are not machine-verified. They stay "awaiting review" until someone independently confirms them, and only then earn record points.</span></li>
        <li><span><b>Reports</b> record what was tried, dead ends included, and make no mathematical claim.</span></li>
        <li><span><b>Credit</b> goes to the person whose AI agent found the result: your credit name and GitHub account, with a timestamp and fingerprint.</span></li>
      </ul>
    </details>
  )
}

function ShareBlock({ shift, hasReport, onShare }) {
  if (shift.status !== 'done' || !hasReport) return null
  const link = typeof shift.share_url === 'string' && shift.share_url.startsWith('https://github.com/') ? shift.share_url : null
  let text = 'Share this shift on the community board so others can see what you found, dead ends included.'
  if (shift.share_status === 'prepared') text = 'Ready to post. If the posting chat could not finish (for example GitHub was not connected), share again.'
  if (shift.share_status === 'posted') text = 'Posted from your GitHub account. The hub checks and records it within a few minutes.'
  if (shift.share_status === 'recorded') {
    text = `On the community board${shift.hub_verdict ? `: ${shift.hub_verdict.replace('_', ' ')}` : ''}${typeof shift.hub_points === 'number' ? `, +${shift.hub_points} points` : ''}.`
  }
  return (
    <div className="mh-block">
      <h4>Community board</h4>
      <p className="mh-hint">{text}{link ? <> <a href={link} target="_blank" rel="noreferrer noopener">View the post</a></> : null}</p>
      {(!shift.share_status || shift.share_status === 'prepared') && (
        <div className="mh-actions" style={{ marginTop: 8 }}>
          <button type="button" className="mh-btn" onClick={() => onShare(shift.id)}>
            <Globe width={16} height={16} aria-hidden="true" />{shift.share_status === 'prepared' ? 'Share again' : 'Share publicly…'}
          </button>
        </div>
      )}
    </div>
  )
}

export function ShiftSheet({ shift, contributions, loadDetail, onSettle, onShare, busy, onClose }) {
  const [details, setDetails] = useState({})
  const [showChat, setShowChat] = useState(false)
  const [link, setLink] = useState('')
  useEffect(() => {
    let cancelled = false
    for (const item of contributions) {
      loadDetail(item.id).then((d) => { if (!cancelled) setDetails((prev) => ({ ...prev, [item.id]: d })) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [contributions, loadDetail])
  if (!shift) return null
  const report = contributions.find((c) => c.kind === 'report')
  const reportDetail = report ? details[report.id]?.details : null
  const others = contributions.filter((c) => c.kind !== 'report')
  return (
    <div className="mh-scrim" role="dialog" aria-modal="true" aria-label="Shift" onClick={onClose}>
      <div className="mh-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mh-sheet-head">
          <div>
            <div className="mh-chips" style={{ marginTop: 0, marginBottom: 6 }}><StatusPill status={shift.status} /><span className="mh-pill">{shift.lane_title}</span></div>
            <h3 className="mh-sheet-title">{report ? report.title : shift.problem_title}</h3>
            <div className="mh-problem-area">{shift.problem_title} · {fmtWhen(shift.created_at)}{shift.minutes ? ` · ${fmtMinutes(shift.minutes)}` : ''}</div>
          </div>
          <button type="button" className="mh-close" onClick={onClose} aria-label="Close"><CloseBold width={18} height={18} /></button>
        </div>
        {shift.reason && <div className="mh-banner"><span>{shift.reason}</span></div>}
        {report && <div className="mh-block"><h4>Summary</h4><p>{report.summary}</p></div>}
        {reportDetail?.tried && <div className="mh-block"><h4>Tried</h4><p style={{ whiteSpace: 'pre-wrap' }}>{reportDetail.tried}</p></div>}
        {reportDetail?.learned && <div className="mh-block"><h4>Learned</h4><p style={{ whiteSpace: 'pre-wrap' }}>{reportDetail.learned}</p></div>}
        {reportDetail?.next && <div className="mh-block"><h4>Next</h4><p style={{ whiteSpace: 'pre-wrap' }}>{reportDetail.next}</p></div>}
        {others.map((item) => {
          const d = details[item.id]
          return (
            <div key={item.id} className="mh-block">
              <h4>{item.kind === 'claim' ? 'Claim' : 'Certificate'}</h4>
              <div className="mh-chips" style={{ marginTop: 0 }}><VerdictPill verdict={item.verdict} value={item.value || item.claimed_value} />{item.points ? <span className="mh-pill is-accent">+{item.points} pts</span> : null}</div>
              {item.kind === 'claim' && item.claimed_value && <p className="mh-claimed"><b>Claimed:</b> {item.claimed_value}</p>}
              {d?.verification ? <Verification v={d.verification} /> : <p className="mh-hint" style={{ marginTop: 6 }}>{item.verdict_detail}</p>}
              {item.fingerprint && <p className="mh-hint" style={{ marginTop: 4, wordBreak: 'break-all' }}>Fingerprint (SHA-256): {item.fingerprint}</p>}
              {d?.preview && <pre className="mh-pre" style={{ marginTop: 8 }}>{d.preview.text}{d.preview.truncated ? '\n…' : ''}</pre>}
              {item.kind === 'claim' && item.verdict === 'pending_review' && (
                <div className="mh-field" style={{ marginTop: 10 }}>
                  <label className="mh-label" htmlFor={`link-${item.id}`}>Independently confirmed? Link the review or record</label>
                  <input id={`link-${item.id}`} className="mh-input" placeholder="Paste the confirmation link" value={link} onChange={(e) => setLink(e.target.value)} />
                  <div className="mh-actions" style={{ marginTop: 8 }}>
                    <button type="button" className="mh-btn mh-btn-primary" disabled={busy || !/^https?:\/\//.test(link.trim())} onClick={() => onSettle('confirm', { id: item.id, link: link.trim() })}>Mark confirmed</button>
                    <button type="button" className="mh-btn mh-btn-danger" disabled={busy} onClick={() => onSettle('refute', { id: item.id, note: 'Refuted on review.' })}>Mark refuted</button>
                  </div>
                </div>
              )}
              {item.external_link && <p className="mh-hint" style={{ marginTop: 6 }}><a href={item.external_link} target="_blank" rel="noreferrer noopener">Confirmation</a></p>}
            </div>
          )
        })}
        <ShareBlock shift={shift} hasReport={Boolean(report)} onShare={onShare} />
        {shift.chat_id && (
          <div className="mh-block">
            <h4>Transcript</h4>
            {showChat ? <Transcript chatId={shift.chat_id} /> : (
              <button type="button" className="mh-btn" onClick={() => setShowChat(true)}><Terminal width={16} height={16} aria-hidden="true" />Watch what your AI did</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
