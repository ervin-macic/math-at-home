import { Flag, Star, StarFilled, TrophyTop, Users } from '@openai/apps-sdk-ui/components/Icon'
import { fmtMinutes, fmtTokens } from './api.js'

export function PointsPanel({ state, preview, rules, problems }) {
  const totals = state?.totals
  const points = totals?.points || 0
  const rank = totals?.rank || { name: rules.ranks[0].name, min: 0, next: rules.ranks[1] }
  const next = rank.next
  const progress = next ? Math.min(100, Math.round(((points - rank.min) / (next.min - rank.min)) * 100)) : 100
  const maxProblem = Math.max(1, ...problems.map((p) => totals?.by_problem?.[p.id]?.points || 0))
  return (
    <div className="mh-stack" style={{ gap: 14 }}>
      <section className="mh-card">
        <div className="mh-score">
          <div className="mh-score-num" aria-label={`${points} points`}>{points.toLocaleString()}</div>
          <div>
            <div className="mh-score-rank">{rank.name}</div>
            <div className="mh-hint">{next ? `${(next.min - points).toLocaleString()} points to ${next.name}` : 'Top rank reached'}</div>
            <div className="mh-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
        {preview && <p className="mh-hint" style={{ marginTop: 10 }}>Points start counting once Math@Home is installed and you donate.</p>}
      </section>

      <div className="mh-stats">
        <div className="mh-stat"><div className="mh-stat-num">{totals?.shifts_done || 0}</div><div className="mh-stat-label">shifts done</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{fmtMinutes(totals?.minutes || 0)}</div><div className="mh-stat-label">AI time donated</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{fmtTokens(totals?.tokens || 0)}</div><div className="mh-stat-label">tokens donated</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{totals?.records || 0}</div><div className="mh-stat-label">records</div></div>
      </div>

      <section className="mh-card">
        <h3 className="mh-card-title">Badges</h3>
        <div className="mh-badges" style={{ marginTop: 10 }}>
          {(totals?.badges || [
            { id: 'first-shift', name: 'First shift', hint: 'Complete one shift.' },
            { id: 'ten-shifts', name: 'Ten shifts', hint: 'Complete ten shifts.' },
            { id: 'checked', name: 'Checked certificate', hint: 'Submit a certificate that passes a checker.' },
            { id: 'record', name: 'Record breaker', hint: 'Beat a record.' },
            { id: 'every-problem', name: 'Every problem', hint: 'Work a shift on every problem.' },
          ]).map((badge) => (
            <div key={badge.id} className={`mh-badge${badge.earned ? ' is-earned' : ''}`} title={badge.hint}>
              {badge.earned ? <StarFilled width={18} height={18} aria-hidden="true" /> : <Star width={18} height={18} aria-hidden="true" />}
              <span><b style={{ display: 'block', fontWeight: 680 }}>{badge.name}</b>{!badge.earned && <span>{badge.hint}</span>}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title">Points by problem</h3>
        <div className="mh-stack" style={{ marginTop: 10, gap: 12 }}>
          {problems.map((p) => {
            const value = totals?.by_problem?.[p.id]?.points || 0
            return (
              <div key={p.id} className="mh-mini-bar">
                <span>#{p.rank} {p.short}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</b>
                <div className="mh-bar" aria-hidden="true"><span style={{ width: `${Math.round((value / maxProblem) * 100)}%` }} /></div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title"><TrophyTop width={17} height={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />How points work</h3>
        <table className="mh-table" style={{ marginTop: 6 }}>
          <tbody>
            <tr><td>An honest shift report, dead ends included</td><td>+{rules.report}</td></tr>
            <tr><td>A certificate that passes the built-in checker</td><td>+{rules.certificate}</td></tr>
            <tr><td>A machine-checked side-quest record</td><td>+{rules.side_record_per_tier} × tier</td></tr>
            <tr><td>A machine-checked record, or a claim confirmed by independent review</td><td>+{rules.record_per_tier} × tier</td></tr>
            <tr><td>Donated AI time</td><td>+1 per {rules.minutes_per_point} min</td></tr>
          </tbody>
        </table>
        <p className="mh-hint" style={{ marginTop: 8 }}>
          Tier is the problem's rung on the ladder (1–5), so a record on the hardest problem is worth five times one on the easiest. Ranks: {rules.ranks.map((r) => `${r.name} ${r.min.toLocaleString()}`).join(' · ')}.
        </p>
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title"><Users width={17} height={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Community leaderboard</h3>
        <p className="mh-card-text">
          These points are this Möbius's own tally. Shifts you share appear on the Community tab and the public board, which ranks contributors across every install over 7 days, 30 days and all time.
        </p>
        <p className="mh-hint" style={{ marginTop: 8 }}><Flag width={14} height={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />The board re-checks shared certificates and scores them with the same rules.</p>
      </section>
    </div>
  )
}
