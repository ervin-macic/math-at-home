import { useEffect, useMemo, useState } from 'react'
import { CheckCircleFilled, InfoCircle, Play, ShieldCheck } from '@openai/apps-sdk-ui/components/Icon'
import { fmtWhen, isChosen, toggleChoice } from './api.js'

const SHARES = [5, 10, 15, 20, 25, 33, 50, 100]
const MINUTES = [15, 20, 30, 45, 60, 90, 120]
const CPU = [0, 5, 15, 30, 60, 120]
const SHORT = [25, 40, 50, 60, 75, 90]
const WEEKLY = [40, 50, 60, 70, 80, 90]
const BOOST = [80, 85, 90, 95]

function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="mh-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <span className="mh-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span>{value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  )
}

function Choice({ value, options, onChange, label, suffix = '' }) {
  return (
    <select className="mh-select" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((option) => <option key={option} value={option}>{option}{suffix}</option>)}
    </select>
  )
}

export function ConsentCard({ terms, preview, busy, onAgree }) {
  const [name, setName] = useState('')
  return (
    <section className="mh-card">
      <h3 className="mh-card-title">Before your AI does any work</h3>
      <p className="mh-card-text">Math@Home only runs with your explicit agreement. Here is exactly what you agree to:</p>
      <ul className="mh-list">
        {terms.points.map((point) => (
          <li key={point}><ShieldCheck width={17} height={17} aria-hidden="true" /><span>{point}</span></li>
        ))}
      </ul>
      <div className="mh-field" style={{ marginTop: 16 }}>
        <label className="mh-label" htmlFor="mh-credit">Credit name</label>
        <input
          id="mh-credit"
          className="mh-input"
          value={name}
          maxLength={60}
          placeholder="How discoveries should credit you"
          onChange={(e) => setName(e.target.value)}
          disabled={preview}
        />
        <span className="mh-hint">Leave it empty to stay anonymous; you can change it later.</span>
      </div>
      <div className="mh-actions">
        <button
          type="button"
          className="mh-btn mh-btn-primary"
          disabled={preview || busy}
          onClick={() => onAgree({ version: terms.version, credit_name: name.trim(), timezone: deviceZone() })}
        >
          <CheckCircleFilled width={16} height={16} aria-hidden="true" />
          {preview ? 'Install Math@Home to agree' : busy ? 'Saving…' : 'I agree, start donating'}
        </button>
      </div>
      <p className="mh-hint" style={{ marginTop: 10 }}>
        Defaults: at most 10% of your weekly allowance, up to 2 shifts a night between 01:00 and 07:00, 30 minutes each, and only while your 5-hour window is under 50% and your weekly window under 70%.
      </p>
    </section>
  )
}

function ShareMeter({ share }) {
  if (!share) return null
  if (share.limit >= 100) {
    return <p className="mh-hint">No share limit: shifts may use any spare capacity within the limits below.</p>
  }
  const pct = Math.min(100, Math.round((share.donated / share.limit) * 100))
  return (
    <div className="mh-mini-bar" style={{ marginTop: 10 }}>
      <span>This week: {share.donated.toFixed(1)}% of {share.limit}% donated</span>
      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{share.resets_at ? `resets ${fmtWhen(share.resets_at)}` : 'nothing yet this week'}</b>
      <div className="mh-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function CapacityNote({ capacity }) {
  if (!capacity) {
    return <p className="mh-hint">No capacity check yet. Each shift checks your usage before it starts.</p>
  }
  return (
    <div className="mh-stack">
      <p className="mh-hint">Last check {fmtWhen(capacity.at)}: {capacity.ok ? 'spare capacity, the shift went ahead.' : capacity.reason}</p>
      <div className="mh-chips">
        {(capacity.windows || []).map((w) => (
          <span key={w.id || w.label} className={w.used_percent > w.limit ? 'mh-pill is-bad' : 'mh-pill is-good'}>
            {w.label}: {Math.round(w.used_percent)}% of limit {w.limit}%{w.boosted ? ' (use-it-or-lose-it)' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

export function DonatePanel({ state, problems, preview, busy, onAgree, onSave, onWithdraw, onRunNow, onOpenProblem }) {
  const settings = state?.settings
  const consented = state?.consent?.current
  const [draft, setDraft] = useState(settings || null)
  useEffect(() => { setDraft(settings || null) }, [settings])
  const dirty = useMemo(() => {
    if (!settings || !draft) return false
    return JSON.stringify(settings) !== JSON.stringify(draft)
  }, [settings, draft])

  if (preview || !state) {
    return <ConsentCard terms={state?.consent?.terms || problems.consentTerms} preview={preview} busy={busy} onAgree={onAgree} />
  }
  if (!consented) {
    return <ConsentCard terms={state.consent.terms} preview={false} busy={busy} onAgree={onAgree} />
  }
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))
  const allIds = problems.list.map((p) => p.id)
  const toggleProblem = (id) => {
    const next = toggleChoice(draft.problems, allIds, id)
    if (next) set('problems')(next)
  }
  const zone = deviceZone()
  return (
    <div className="mh-stack" style={{ gap: 14 }}>
      <section className="mh-card">
        <div className="mh-row">
          <div className="mh-row-text">
            <div className="mh-label">Donate spare capacity</div>
            <div className="mh-hint">{settings.enabled ? 'On. Shifts run in your quiet hours.' : 'Paused. No scheduled shifts will start.'}</div>
          </div>
          <Switch checked={settings.enabled} label="Donate spare capacity" disabled={busy} onChange={(value) => onSave({ enabled: value })} />
        </div>
        <div className="mh-actions" style={{ marginTop: 6 }}>
          <button type="button" className="mh-btn" disabled={busy || Boolean(state.active)} onClick={() => onRunNow()}>
            <Play width={16} height={16} aria-hidden="true" />{state.active ? 'A shift is running' : 'Run one shift now'}
          </button>
        </div>
        <p className="mh-hint" style={{ marginTop: 8 }}>Run now ignores quiet hours but still checks your spare capacity first.</p>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title">How much to donate</h3>
        <div className="mh-field" style={{ marginTop: 10, maxWidth: 340 }}>
          <label className="mh-label" htmlFor="mh-share">Share of your weekly allowance</label>
          <select id="mh-share" className="mh-select" value={draft.share_percent} onChange={(e) => set('share_percent')(Number(e.target.value))}>
            {SHARES.map((value) => (
              <option key={value} value={value}>{value === 100 ? 'No share limit (spare capacity only)' : `Up to ${value}% a week`}</option>
            ))}
          </select>
        </div>
        <p className="mh-hint" style={{ marginTop: 8 }}>
          Math@Home reads your weekly usage gauge when each shift starts and ends, and stops for the week once its share is used. Anything else you use during a shift counts toward the share, so it errs on the side of donating less.
        </p>
        <ShareMeter share={state.share} />
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title">When and how long</h3>
        <div className="mh-grid2" style={{ marginTop: 10 }}>
          <div className="mh-field">
            <label className="mh-label" htmlFor="mh-from">Quiet hours from</label>
            <input id="mh-from" type="time" className="mh-input" value={draft.window_start} onChange={(e) => set('window_start')(e.target.value)} />
          </div>
          <div className="mh-field">
            <label className="mh-label" htmlFor="mh-to">until</label>
            <input id="mh-to" type="time" className="mh-input" value={draft.window_end} onChange={(e) => set('window_end')(e.target.value)} />
          </div>
        </div>
        <p className="mh-hint" style={{ marginTop: 6 }}>
          Time zone: {draft.timezone}
          {draft.timezone !== zone && (
            <> · <button type="button" className="mh-btn mh-btn-ghost" style={{ minHeight: 32, padding: '2px 6px' }} onClick={() => set('timezone')(zone)}>Use {zone}</button></>
          )}
        </p>
        <div className="mh-row" style={{ marginTop: 6 }}>
          <div className="mh-row-text"><div className="mh-label">Shifts per day</div><div className="mh-hint">Scheduled shifts only.</div></div>
          <Stepper value={draft.shifts_per_day} min={1} max={12} label="shifts per day" onChange={set('shifts_per_day')} />
        </div>
        <div className="mh-grid2" style={{ marginTop: 4 }}>
          <div className="mh-field">
            <span className="mh-label">Length of a shift</span>
            <Choice value={draft.shift_minutes} options={MINUTES} suffix=" minutes" label="Length of a shift" onChange={set('shift_minutes')} />
          </div>
          <div className="mh-field">
            <span className="mh-label">Computer time per shift</span>
            <Choice value={draft.cpu_minutes} options={CPU} suffix=" CPU-minutes" label="Computer time per shift" onChange={set('cpu_minutes')} />
          </div>
        </div>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title">Only spare capacity</h3>
        <p className="mh-card-text">Each shift reads your usage gauge first and stops straight away if you are above these limits.</p>
        <div className="mh-grid2" style={{ marginTop: 12 }}>
          <div className="mh-field">
            <span className="mh-label">5-hour window under</span>
            <Choice value={draft.five_hour_max} options={SHORT} suffix="%" label="5-hour window limit" onChange={set('five_hour_max')} />
          </div>
          <div className="mh-field">
            <span className="mh-label">Weekly window under</span>
            <Choice value={draft.weekly_max} options={WEEKLY} suffix="%" label="Weekly window limit" onChange={set('weekly_max')} />
          </div>
        </div>
        <div className="mh-row" style={{ marginTop: 10 }}>
          <div className="mh-row-text">
            <div className="mh-label">Use it or lose it</div>
            <div className="mh-hint">In the last {draft.boost_hours} hours before your weekly reset, allow up to {draft.boost_weekly_max}%: that capacity would expire unused anyway.</div>
          </div>
          <Switch checked={draft.boost} label="Use it or lose it" onChange={set('boost')} />
        </div>
        {draft.boost && (
          <div className="mh-field" style={{ maxWidth: 260 }}>
            <span className="mh-label">Final-day weekly limit</span>
            <Choice value={draft.boost_weekly_max} options={BOOST} suffix="%" label="Final-day weekly limit" onChange={set('boost_weekly_max')} />
          </div>
        )}
        <div style={{ marginTop: 12 }}><CapacityNote capacity={state.capacity} /></div>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title">Which AI and which problems</h3>
        <div className="mh-field" style={{ marginTop: 10 }}>
          <label className="mh-label" htmlFor="mh-provider">Subscription to donate</label>
          <select id="mh-provider" className="mh-select" value={draft.provider} onChange={(e) => set('provider')(e.target.value)}>
            <option value="auto">My background-agent choice in Möbius settings</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </div>
        <div className="mh-field" style={{ marginTop: 14 }}>
          <span className="mh-label">Problems</span>
          <span className="mh-hint">Choose where your AI's time goes. Each problem says why it matters; open one to read more.</span>
          <div className="mh-checks mh-choices">
            {problems.list.map((p) => (
              <div key={p.id} className="mh-choice">
                <label className="mh-check">
                  <input type="checkbox" checked={isChosen(draft.problems, p.id)} onChange={() => toggleProblem(p.id)} />
                  <span className="mh-choice-text">
                    <span className="mh-choice-title">#{p.rank} {p.title}</span>
                    {p.significance?.summary && <span className="mh-choice-why">{p.significance.summary}</span>}
                  </span>
                </label>
                {onOpenProblem && (
                  <button type="button" className="mh-btn mh-btn-ghost mh-choice-more" onClick={() => onOpenProblem(p.id)}>
                    Why it matters
                  </button>
                )}
              </div>
            ))}
          </div>
          <span className="mh-hint">Shifts rotate through the ticked problems, least-recently worked first.</span>
        </div>
        <div className="mh-field" style={{ marginTop: 14 }}>
          <label className="mh-label" htmlFor="mh-credit-edit">Credit name</label>
          <input id="mh-credit-edit" className="mh-input" maxLength={60} value={draft.credit_name} placeholder="Anonymous contributor" onChange={(e) => set('credit_name')(e.target.value)} />
        </div>
      </section>

      {dirty && (
        <div className="mh-banner" role="status">
          <InfoCircle width={17} height={17} aria-hidden="true" />
          <span style={{ flex: 1 }}>You have unsaved changes.</span>
          <button type="button" className="mh-btn" onClick={() => setDraft(settings)} disabled={busy}>Discard</button>
          <button type="button" className="mh-btn mh-btn-primary" disabled={busy} onClick={() => {
            const patch = {}
            for (const key of Object.keys(draft)) if (JSON.stringify(draft[key]) !== JSON.stringify(settings[key])) patch[key] = draft[key]
            onSave(patch)
          }}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      <section className="mh-card">
        <h3 className="mh-card-title">Withdraw consent</h3>
        <p className="mh-card-text">Stops all scheduled shifts and removes your agreement. Your results and points stay here.</p>
        <div className="mh-actions"><button type="button" className="mh-btn mh-btn-danger" disabled={busy} onClick={onWithdraw}>Withdraw consent</button></div>
        <p className="mh-hint" style={{ marginTop: 8 }}>Agreed {fmtWhen(state.consent.record?.at)} (terms version {state.consent.record?.version}).</p>
      </section>
    </div>
  )
}
