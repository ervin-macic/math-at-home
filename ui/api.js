// Service client and small formatting helpers shared by the views.

export function isPreview(appId) {
  return !appId || appId === 'project-preview' || typeof window === 'undefined' || !window.mobius
}

export function createApi(appId, token) {
  async function call(path, { method = 'GET', body } = {}) {
    const headers = { Authorization: `Bearer ${token}` }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`/api/apps/${appId}/service/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data = null
    try { data = await res.json() } catch { data = null }
    if (!res.ok) {
      const message = data?.error || data?.detail || `Math@Home could not answer (${res.status}).`
      throw new Error(typeof message === 'string' ? message : 'Request failed.')
    }
    return data
  }
  return { call }
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export function fmtTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : timeFmt.format(date)
}

export function fmtWhen(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const day = same(date, today) ? 'Today' : same(date, yesterday) ? 'Yesterday' : dayFmt.format(date)
  return `${day}, ${timeFmt.format(date)}`
}

export function fmtMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0)
  if (value < 60) return `${value} min`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function fmtTokens(count) {
  const value = Number(count) || 0
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`
  return String(value)
}

export const SHIFT_STATUS = {
  starting: { label: 'Starting', tone: 'accent' },
  running: { label: 'Working', tone: 'accent' },
  done: { label: 'Done', tone: 'good' },
  declined: { label: 'Skipped: no spare capacity', tone: '' },
  failed: { label: "Didn't start", tone: 'bad' },
  abandoned: { label: 'No report', tone: 'bad' },
}

export const VERDICT = {
  logged: { label: 'Report', tone: '' },
  valid: { label: 'Checked', tone: 'good' },
  side_record: { label: 'Side-quest record', tone: 'star' },
  record: { label: 'Record', tone: 'star' },
  invalid: { label: 'Rejected by checker', tone: 'bad' },
  unsupported: { label: 'Needs review', tone: 'accent' },
  pending_review: { label: 'Awaiting review', tone: 'accent' },
  confirmed: { label: 'Confirmed', tone: 'star' },
  refuted: { label: 'Refuted', tone: 'bad' },
}

export function toneClass(tone) {
  return tone ? `mh-pill is-${tone}` : 'mh-pill'
}

export function signal(name, payload) {
  try { window.mobius?.signal?.(name, payload) } catch { /* analytics never breaks the app */ }
}

// Long claimed values (whole sentences) must never stretch a badge; the full
// text lives in the result's detail view and the badge's tooltip.
export function shortValue(value, limit = 24) {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}
