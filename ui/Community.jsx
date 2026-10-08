import { useState } from 'react'
import { ExternalLink, Sparkles, StarFilled, Users } from '@openai/apps-sdk-ui/components/Icon'
import { VERDICT, fmtMinutes, fmtWhen, toneClass } from './api.js'

const WINDOWS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
]

function Verdict({ verdict, value }) {
  const info = VERDICT[verdict] || (verdict === 'report' ? { label: 'Report', tone: '' } : { label: verdict, tone: '' })
  return <span className={toneClass(info.tone)}>{info.label}{value ? ` · ${value}` : ''}</span>
}

function Who({ login, name, me }) {
  return (
    <span>
      {name ? <span style={{ fontWeight: 680, color: 'var(--mh-text)' }}>{name} </span> : null}
      <span className="mh-hint" style={{ fontSize: 12.5 }}>@{login}</span>
      {me ? <span className="mh-pill is-accent" style={{ marginLeft: 6 }}>You</span> : null}
    </span>
  )
}

export function CommunityPanel({ data, loading, preview, problems, onRetry }) {
  const [windowKey, setWindowKey] = useState('all')
  const site = data?.site_url
  if (preview) {
    return (
      <div className="mh-empty">
        <div className="mh-empty-mark"><Users width={26} height={26} /></div>
        <div className="mh-empty-title">The community board</div>
        <p>Everyone who shares results appears here: top donors, what they found, and the community's best on each problem.</p>
      </div>
    )
  }
  if (loading && !data) return <div className="mh-skeleton" />
  const board = data?.board
  if (!board) {
    return (
      <div className="mh-empty">
        <div className="mh-empty-mark"><Users width={26} height={26} /></div>
        <div className="mh-empty-title">{data?.error || 'The community board is not available'}</div>
        <p>Your own results keep counting here on your Möbius. The board appears as soon as it can be reached.</p>
        <div className="mh-actions"><button type="button" className="mh-btn" onClick={onRetry}>Try again</button></div>
      </div>
    )
  }
  const me = (data.me?.login || '').toLowerCase()
  const donors = [...board.contributors]
    .filter((p) => windowKey === 'all' || p.points[windowKey] > 0)
    .sort((a, b) => b.points[windowKey] - a.points[windowKey] || b.minutes[windowKey] - a.minutes[windowKey])
    .slice(0, 20)
  const t = board.totals
  const shortName = (id) => problems.find((p) => p.id === id)?.short || id
  return (
    <div className="mh-stack" style={{ gap: 14 }}>
      {data.stale && data.error && <div className="mh-banner"><span>{data.error} Showing the last copy from {fmtWhen(data.fetched_at)}.</span></div>}
      <div className="mh-section-head" style={{ marginTop: 0 }}>
        <h2 className="mh-section-title">Community board</h2>
        {site && (
          <a className="mh-btn mh-btn-ghost" style={{ minHeight: 36 }} href={site} target="_blank" rel="noreferrer noopener">
            Public page <ExternalLink width={14} height={14} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="mh-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <div className="mh-stat"><div className="mh-stat-num">{t.contributors}</div><div className="mh-stat-label">contributors</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{t.shifts}</div><div className="mh-stat-label">shifts shared</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{fmtMinutes(t.minutes)}</div><div className="mh-stat-label">AI time donated</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{t.verified}</div><div className="mh-stat-label">checked results</div></div>
        <div className="mh-stat"><div className="mh-stat-num">{t.discoveries}</div><div className="mh-stat-label">discoveries</div></div>
      </div>

      <section className="mh-card">
        <div className="mh-section-head" style={{ marginTop: 0, marginBottom: 8 }}>
          <h3 className="mh-card-title" style={{ margin: 0 }}>Top donors</h3>
          <div className="mh-tabs" role="group" aria-label="Period" style={{ width: 'auto' }}>
            {WINDOWS.map((w) => (
              <button key={w.id} type="button" aria-pressed={windowKey === w.id}
                className={`mh-tab${windowKey === w.id ? ' is-active' : ''}`} style={{ minHeight: 34, flex: 'none' }}
                onClick={() => setWindowKey(w.id)}>{w.label}</button>
            ))}
          </div>
        </div>
        {donors.length ? (
          <table className="mh-table">
            <tbody>
              {donors.map((p, i) => (
                <tr key={p.login}>
                  <td style={{ width: 34 }}><span className="mh-pill" style={i === 0 ? { background: 'var(--mh-accent)', color: 'var(--mh-accent-fg)', borderColor: 'var(--mh-accent)' } : null}>{i + 1}</span></td>
                  <td style={{ textAlign: 'left', fontWeight: 400 }}>
                    <Who login={p.login} name={p.name} me={me && p.login.toLowerCase() === me} />
                    <div className="mh-hint" style={{ fontSize: 12 }}>{fmtMinutes(p.minutes[windowKey])} donated · {p.shifts} shift{p.shifts === 1 ? '' : 's'} · {p.verified} checked{p.discoveries ? ` · ${p.discoveries} discover${p.discoveries === 1 ? 'y' : 'ies'}` : ''}</div>
                  </td>
                  <td>{p.points[windowKey].toLocaleString()} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="mh-hint">No donors in this period yet.</p>}
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title"><Sparkles width={16} height={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />What people have found</h3>
        {board.findings.length ? (
          <div className="mh-stack" style={{ marginTop: 10 }}>
            {board.findings.slice(0, 15).map((f) => (
              <div key={`${f.login}-${f.when}-${f.title}`} className="mh-lane">
                <div className="mh-chips" style={{ marginTop: 0 }}><Verdict verdict={f.verdict} value={f.value} /><span className="mh-pill">{shortName(f.problem_id)}</span></div>
                <b style={{ marginTop: 6 }}>{f.title}</b>
                <span>{f.summary}</span>
                <div className="mh-hint" style={{ marginTop: 6, fontSize: 12.5 }}>
                  <Who login={f.login} name={f.name} me={me && f.login.toLowerCase() === me} /> · {fmtWhen(f.when)} · +{f.points} pts
                  {typeof f.issue_url === 'string' && f.issue_url.startsWith('https://github.com/') && (
                    <> · <a href={f.issue_url} target="_blank" rel="noreferrer noopener">details</a></>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mh-hint" style={{ marginTop: 6 }}>Nothing found yet. Checked certificates and claims appear here as people share them.</p>}
      </section>

      <section className="mh-card">
        <h3 className="mh-card-title"><StarFilled width={16} height={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />Community best on each problem</h3>
        <div className="mh-stack" style={{ marginTop: 10, gap: 10 }}>
          {board.problems.map((p) => (
            <div key={p.id} className="mh-mini-bar">
              <span>#{p.rank} {p.short}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{p.best ? p.best.value : '—'}</b>
              <span className="mh-hint" style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                {p.shifts} shift{p.shifts === 1 ? '' : 's'} by {p.contributors} contributor{p.contributors === 1 ? '' : 's'} · record {p.record.value}
              </span>
            </div>
          ))}
        </div>
      </section>
      <p className="mh-hint">Results appear here when their contributors share them. Updated {fmtWhen(board.generated_at)}.</p>
    </div>
  )
}
