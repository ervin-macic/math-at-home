import { BookOpen, Check, ChevronRight, CloseBold, ExternalLink, Play, Plus } from '@openai/apps-sdk-ui/components/Icon'
import { fmtWhen, isChosen, recordWho } from './api.js'

const TIER_MIX = { 1: '18%', 2: '34%', 3: '52%', 4: '72%', 5: '100%' }

function tierStyle(tier) {
  const strong = tier >= 4
  return {
    '--tier-mix': TIER_MIX[tier] || '30%',
    '--tier-fg': strong ? 'var(--mh-accent-fg)' : 'var(--mh-text)',
  }
}

export function TierDots({ tier }) {
  return (
    <span className="mh-dots" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`mh-dot${n <= tier ? ' is-on' : ''}`} />)}
    </span>
  )
}

function bestLine(stats) {
  if (!stats) return null
  const parts = []
  if (stats.shifts) parts.push(`${stats.shifts} shift${stats.shifts === 1 ? '' : 's'}`)
  if (stats.best) parts.push(`your best ${stats.best.value}`)
  return parts.length ? parts.join(' · ') : null
}

function LivePill({ record }) {
  if (!record?.live) return null
  return record.live.stale
    ? <span className="mh-pill" title="The upstream record could not be reached just now; this is the last copy read.">Last known</span>
    : <span className="mh-pill is-good" title="Read live from the upstream record">Live</span>
}

// `chosen` is the donor's problem list ([] = every problem), or null when
// they have not agreed to donate yet.
export function ProblemList({ problems, tiers, stats, chosen, onOpen }) {
  return (
    <div className="mh-ladder">
      {problems.map((problem) => {
        const mine = bestLine(stats?.[problem.id])
        const left = chosen && !isChosen(chosen, problem.id)
        return (
          <button
            key={problem.id}
            type="button"
            className="mh-problem"
            style={tierStyle(problem.tier)}
            onClick={() => onOpen(problem.id)}
          >
            <span className="mh-rung">
              <span className="mh-rung-num">{problem.rank}</span>
              <TierDots tier={problem.tier} />
            </span>
            <span className="mh-problem-main">
              <span className="mh-problem-top">
                <span className="mh-problem-title">{problem.title}</span>
                <span className="mh-pill is-accent">{tiers[String(problem.tier)]}</span>
              </span>
              <span className="mh-problem-area" style={{ display: 'block' }}>{problem.area}</span>
              <span className="mh-problem-hook" style={{ display: 'block' }}>{problem.hook}</span>
              {problem.significance?.summary && (
                <span className="mh-problem-why"><b>Why it matters:</b> {problem.significance.summary}</span>
              )}
              <span className="mh-record">
                <span>{problem.record.label}</span>
                <span className="mh-record-value">{problem.record.value}</span>
                <span>{recordWho(problem.record)}</span>
                <LivePill record={problem.record} />
                {mine && <span className="mh-pill">{mine}</span>}
                {left && <span className="mh-pill">Not in your donations</span>}
              </span>
            </span>
            <ChevronRight className="mh-chev" width={20} height={20} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

function LiveSource({ live }) {
  const links = [
    live.source_url && { href: live.source_url, label: 'record file' },
    live.pr_url && { href: live.pr_url, label: 'pull request' },
    live.tracker && { href: live.tracker, label: 'live dashboard' },
  ].filter(Boolean)
  return (
    <p className="mh-hint mh-live-note">
      {live.stale ? 'Last read' : 'Read live'} from the upstream record {fmtWhen(live.fetched_at)}
      {live.stale ? ' (it could not be reached just now)' : ''}.{' '}
      {links.map((link, i) => (
        <span key={link.href}>
          {i ? ' · ' : ''}
          <a href={link.href} target="_blank" rel="noreferrer noopener">{link.label}</a>
        </span>
      ))}
    </p>
  )
}

// `choice` is null when the donor cannot choose yet (preview, or no consent),
// otherwise { included, canRemove, onToggle }.
export function ProblemSheet({ problem, tiers, stats, canRun, busy, choice, onRun, onClose }) {
  if (!problem) return null
  const mine = stats?.[problem.id]
  const record = problem.record
  const who = recordWho(record)
  return (
    <div className="mh-scrim" role="dialog" aria-modal="true" aria-label={problem.title} onClick={onClose}>
      <div className="mh-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="mh-sheet-head">
          <div>
            <div className="mh-problem-top" style={{ marginBottom: 6 }}>
              <span className="mh-pill is-accent">#{problem.rank} · {tiers[String(problem.tier)]}</span>
              <TierDots tier={problem.tier} />
            </div>
            <h3 className="mh-sheet-title">{problem.title}</h3>
            <div className="mh-problem-area">{problem.area}</div>
          </div>
          <button type="button" className="mh-close" onClick={onClose} aria-label="Close">
            <CloseBold width={18} height={18} />
          </button>
        </div>

        <div className="mh-block"><p>{problem.statement}</p></div>
        {problem.significance && (
          <div className="mh-block mh-why">
            <h4>Why it matters</h4>
            {problem.significance.paragraphs.map((text) => <p key={text.slice(0, 48)}>{text}</p>)}
          </div>
        )}
        <div className="mh-block">
          <h4>Where it stands</h4>
          <div className="mh-known">{problem.known}</div>
          <p className="mh-hint" style={{ marginTop: 6 }}>
            {record.label}: {record.value}{who ? ` — ${who}` : ''}. {record.note}
          </p>
          {record.live && <LiveSource live={record.live} />}
        </div>
        <div className="mh-block"><h4>The target</h4><p>{problem.target}</p></div>
        <div className="mh-block"><h4>What counts as a discovery</h4><p>{problem.discovery}</p></div>
        <div className="mh-block"><h4>Side quest</h4><p>{problem.side_quest}</p></div>
        <div className="mh-block"><h4>Why it sits here on the ladder</h4><p>{problem.why_tier}</p></div>
        <div className="mh-block">
          <h4>Recent progress</h4>
          <ul className="mh-timeline">
            {problem.recent.map((item) => (
              <li key={item.date + item.text}><time>{item.date}</time><span>{item.text}</span></li>
            ))}
          </ul>
        </div>
        <div className="mh-block">
          <h4>How shifts attack it</h4>
          <div className="mh-lanes">
            {problem.lanes.map((lane) => (
              <div key={lane.id} className="mh-lane"><b>{lane.title}</b><span>{lane.brief}</span></div>
            ))}
          </div>
        </div>
        <div className="mh-block"><h4>Getting credit</h4><p>{problem.credit}</p></div>
        {problem.reading?.length ? (
          <div className="mh-block">
            <h4>Read more</h4>
            <div className="mh-links">
              {problem.reading.map((item) => (
                <a key={item.url} href={item.url} target="_blank" rel="noreferrer noopener">
                  <BookOpen width={14} height={14} aria-hidden="true" />{item.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mh-block">
          <h4>Sources</h4>
          <div className="mh-links">
            {problem.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink width={14} height={14} aria-hidden="true" />{source.label}
              </a>
            ))}
          </div>
        </div>
        {mine?.shifts ? (
          <div className="mh-block">
            <h4>On this Möbius</h4>
            <p>{mine.shifts} shift{mine.shifts === 1 ? '' : 's'} · {mine.results} result{mine.results === 1 ? '' : 's'}{mine.best ? ` · best checked value ${mine.best.value}` : ''}</p>
          </div>
        ) : null}
        <div className="mh-actions">
          {choice ? (
            <button
              type="button"
              className={`mh-btn${choice.included ? ' is-chosen' : ''}`}
              aria-pressed={choice.included}
              disabled={busy || (choice.included && !choice.canRemove)}
              title={choice.included && !choice.canRemove ? 'Your donations need at least one problem.' : undefined}
              onClick={choice.onToggle}
            >
              {choice.included
                ? <><Check width={16} height={16} aria-hidden="true" />In your donations</>
                : <><Plus width={16} height={16} aria-hidden="true" />Add to my donations</>}
            </button>
          ) : null}
          {canRun ? (
            <button type="button" className="mh-btn mh-btn-primary" disabled={busy} onClick={() => onRun(problem.id)}>
              <Play width={16} height={16} aria-hidden="true" />{busy ? 'Starting…' : 'Run a shift on this now'}
            </button>
          ) : null}
          <button type="button" className="mh-btn" onClick={onClose}>Close</button>
        </div>
        {choice ? (
          <p className="mh-hint" style={{ marginTop: 8 }}>
            {choice.included
              ? 'Your shifts include this problem. Tap again to leave it out.'
              : 'Your shifts skip this problem. Add it to donate time to it too.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
