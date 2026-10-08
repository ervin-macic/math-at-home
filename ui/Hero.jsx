import { Moon, Play, Settings } from '@openai/apps-sdk-ui/components/Icon'
import { fmtTime } from './api.js'

// Five dots, one per problem, circling the core while donation is on.
const ARMS = [
  { inset: 0, top: -4, dur: '14s', delay: '0s', mix: '100%' },
  { inset: 0, top: -4, dur: '14s', delay: '-7s', mix: '70%' },
  { inset: 13, top: 9, dur: '9s', delay: '-2s', mix: '85%' },
  { inset: 13, top: 9, dur: '9s', delay: '-6.5s', mix: '55%' },
  { inset: 24, top: 20, dur: '6s', delay: '-1s', mix: '40%' },
]

function Orbit() {
  return (
    <div className="mh-orbit" aria-hidden="true">
      <span className="mh-orbit-ring" style={{ inset: 0 }} />
      <span className="mh-orbit-ring" style={{ inset: 13 }} />
      <span className="mh-orbit-ring" style={{ inset: 24 }} />
      {ARMS.map((arm, index) => (
        <span key={index} className="mh-orbit-arm" style={{ '--dur': arm.dur, '--delay': arm.delay }}>
          <span className="mh-orbit-dot" style={{ top: arm.top + arm.inset, '--mix': arm.mix }} />
        </span>
      ))}
      <span className="mh-orbit-core"><Moon width={16} height={16} /></span>
    </div>
  )
}

export function Hero({ preview, state, onSetup, onRunNow, busy }) {
  const settings = state?.settings
  const active = state?.active
  const consented = state?.consent?.current
  const donating = Boolean(settings?.enabled && consented)
  let kicker = 'Donate spare AI time'
  let title = 'Lend your idle AI to open mathematics'
  let text = 'Install it, agree to donate, and your Claude or Codex subscription works on these problems while you sleep — only with capacity you would not have used. Discoveries are credited to you.'
  if (preview) {
    kicker = 'Preview'
    text = 'This is a source preview. Install Math@Home on your Möbius to donate spare capacity, run shifts and earn points.'
  } else if (active) {
    kicker = 'Working now'
    title = `Your AI is on ${active.problem_title}`
    text = active.status === 'running'
      ? `Lane: ${active.lane_title}. This shift wraps up by ${fmtTime(active.deadline_at)}.`
      : 'The shift is checking your spare capacity before it starts.'
  } else if (donating) {
    kicker = 'Donating'
    const hours = `${settings.window_start}–${settings.window_end}`
    title = state.window?.open ? 'Quiet hours: shifts may run now' : `Next quiet hours from ${settings.window_start}`
    const share = state.share
    const cap = share && share.limit < 100
      ? `At most ${share.limit}% of your weekly allowance (${share.donated.toFixed(1)}% used this week), `
      : 'Spare capacity only, '
    text = `${cap}up to ${settings.shifts_per_day} shift${settings.shifts_per_day === 1 ? '' : 's'} a night (${hours}), ${settings.shift_minutes} minutes each.`
    if (state.backoff_until) text += ` Waiting for spare capacity until ${fmtTime(state.backoff_until)}.`
  } else if (consented) {
    kicker = 'Paused'
    title = 'Donation is paused'
    text = 'Your consent is on file. Switch donating back on whenever you like.'
  }
  return (
    <section className={`mh-hero${donating || active ? '' : ' is-idle'}`}>
      <Orbit />
      <div>
        <p className="mh-hero-kicker">{kicker}</p>
        <h2 className="mh-hero-title">{title}</h2>
        <p className="mh-hero-text">{text}</p>
        {!preview && (
          <div className="mh-hero-actions">
            {!consented && (
              <button type="button" className="mh-btn mh-btn-primary" onClick={onSetup}>
                <Settings width={16} height={16} aria-hidden="true" />Set up donation
              </button>
            )}
            {consented && !active && (
              <button type="button" className="mh-btn mh-btn-primary" onClick={() => onRunNow()} disabled={busy}>
                <Play width={16} height={16} aria-hidden="true" />{busy ? 'Starting…' : 'Run a shift now'}
              </button>
            )}
            {consented && (
              <button type="button" className="mh-btn" onClick={onSetup}>Donation settings</button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
