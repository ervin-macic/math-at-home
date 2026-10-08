import { useEffect, useState } from 'react'
import { CloseBold, Globe, ShieldCheck } from '@openai/apps-sdk-ui/components/Icon'
import { fmtMinutes, fmtTokens } from './api.js'

// One explicit, previewed public action: what you see here is byte-for-byte
// what your Möbius agent posts from your GitHub account.
export function ShareSheet({ shiftId, loadPreview, onConfirm, busy, onClose }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadPreview(shiftId).then((v) => { if (!cancelled) setView(v) }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [shiftId, loadPreview])
  const pub = view?.public
  return (
    <div className="mh-scrim" role="dialog" aria-modal="true" aria-label="Share publicly" onClick={busy ? undefined : onClose}>
      <div className="mh-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mh-sheet-head">
          <div>
            <div className="mh-chips" style={{ marginTop: 0, marginBottom: 6 }}><span className="mh-pill is-accent"><Globe width={12} height={12} aria-hidden="true" /> Public</span></div>
            <h3 className="mh-sheet-title">Share this shift on the community board</h3>
          </div>
          <button type="button" className="mh-close" onClick={onClose} aria-label="Close" disabled={busy}><CloseBold width={18} height={18} /></button>
        </div>
        {error && <div className="mh-banner is-error"><span>{error}</span></div>}
        {!view && !error && <div className="mh-skeleton" style={{ height: 160 }} />}
        {pub && (
          <>
            <p className="mh-card-text">
              Anyone will be able to see this, permanently. Your Möbius agent posts it as an issue on {view.hub_repo} from <b>your GitHub account</b>, and the hub re-checks it.
            </p>
            {view.redactions > 0 && (
              <div className="mh-banner" style={{ marginTop: 12 }}>
                <ShieldCheck width={17} height={17} aria-hidden="true" />
                <span>{view.redactions} thing{view.redactions === 1 ? '' : 's'} that looked like a credential, email address or local path {view.redactions === 1 ? 'was' : 'were'} removed.</span>
              </div>
            )}
            <div className="mh-block"><h4>Shared</h4>
              <ul className="mh-list" style={{ marginTop: 4 }}>
                <li><span><b>{pub.credit_name || 'Your GitHub name'}</b> as the contributor, with your GitHub login</span></li>
                <li><span>{pub.problem}: “{pub.report.title}”</span></li>
                <li><span>The summary, what was learned and next steps (below)</span></li>
                {pub.certificate && <li><span>The certificate ({(pub.certificate.bytes / 1024).toFixed(1)} KB, {pub.certificate.verdict}) so anyone can check it</span></li>}
                {pub.certificate_omitted && <li><span>Only the certificate's fingerprint: it is too large to attach</span></li>}
                {pub.claim && <li><span>The claim statement and its fingerprint (files stay here)</span></li>}
                <li><span>{fmtMinutes(pub.minutes)} of AI time{pub.tokens ? ` and ${fmtTokens(pub.tokens)} tokens` : ''} donated</span></li>
              </ul>
            </div>
            <div className="mh-block"><h4>Never shared</h4>
              <p className="mh-hint">The chat and its transcript, workspace files and notes, your usage readings, your account and provider details, and any credentials.</p>
            </div>
            <div className="mh-block"><h4>Summary</h4><p>{pub.report.summary}</p></div>
            {pub.report.learned && <div className="mh-block"><h4>Learned</h4><p style={{ whiteSpace: 'pre-wrap' }}>{pub.report.learned}</p></div>}
            <div className="mh-block">
              <button type="button" className="mh-btn mh-btn-ghost" style={{ paddingLeft: 0 }} onClick={() => setShowRaw((v) => !v)}>
                {showRaw ? 'Hide' : 'Show'} the exact text
              </button>
              {showRaw && <pre className="mh-pre">{view.title + '\n\n' + view.body}</pre>}
            </div>
            <div className="mh-sheet-actions mh-actions">
              <button type="button" className="mh-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="mh-btn mh-btn-primary" disabled={busy} onClick={() => onConfirm(view)}>
                {busy ? 'Starting…' : 'Share publicly'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
