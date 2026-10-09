export const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: var(--bg, #0d0d0d); }
#root { height: 100%; }
.mh-root {
  /* App tokens: the live Möbius theme when present, its default values otherwise
     (the source preview has no theme). */
  --mh-bg: var(--bg, #0d0d0d);
  --mh-surface: var(--surface, #171717);
  --mh-surface-2: var(--surface-2, #212121);
  --mh-border: var(--border, #2a2a2a);
  --mh-text: var(--text, #ececec);
  --mh-muted: var(--muted, #a8a8a8);
  --mh-accent: var(--accent, #8b6cf7);
  --mh-accent-fg: var(--accent-fg, #ffffff);
  --mh-font: var(--font, 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif);
  --mh-mono: var(--mono, 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace);
  --mh-good: var(--green, #10b981);
  --mh-bad: var(--danger, #f87171);
  --mh-soft: color-mix(in srgb, var(--mh-accent) 12%, transparent);
  --mh-line: color-mix(in srgb, var(--mh-accent) 32%, var(--mh-border));
  position: relative; display: flex; flex-direction: column;
  height: 100%; min-height: 100dvh; width: 100%; overflow: hidden;
  background: var(--mh-bg); color: var(--mh-text); font-family: var(--mh-font);
  -webkit-font-smoothing: antialiased;
}
.mh-header {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 12px 16px; flex-wrap: wrap; min-height: 56px;
  padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top));
  background: var(--mh-surface); border-bottom: 1px solid var(--mh-border);
}
.mh-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.mh-mark {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: var(--mh-soft); color: var(--mh-accent);
}
.mh-brand-text { min-width: 0; line-height: 1.15; }
.mh-title { margin: 0; font-size: 18px; font-weight: 760; letter-spacing: -0.02em; }
.mh-subtitle {
  display: block; margin-top: 2px; font-size: 12px; font-weight: 500; color: var(--mh-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mh-tabs {
  display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px;
  background: var(--mh-surface-2); box-shadow: inset 0 0 0 1px var(--mh-border);
  max-width: 100%; overflow-x: auto;
}
.mh-tab {
  position: relative; min-height: 40px; padding: 6px 14px; border: 0; border-radius: 9px;
  background: transparent; color: var(--mh-muted); font: inherit; font-size: 13.5px; font-weight: 650;
  cursor: pointer; white-space: nowrap; transition: background .15s, color .15s;
}
.mh-tab:hover { color: var(--mh-text); }
.mh-tab.is-active { background: var(--mh-bg); color: var(--mh-text); box-shadow: 0 1px 3px rgba(0,0,0,.16); }
.mh-tab:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-tab-dot {
  position: absolute; top: 7px; right: 6px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--mh-accent); box-shadow: 0 0 0 2px var(--mh-surface);
}
.mh-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 16px 16px 48px; }
.mh-page { width: 100%; max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.mh-banner {
  display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--mh-line); background: var(--mh-soft); font-size: 13.5px; line-height: 1.45;
}
.mh-banner.is-error { border-color: color-mix(in srgb, var(--mh-bad) 45%, var(--mh-border)); background: color-mix(in srgb, var(--mh-bad) 9%, var(--mh-surface)); }
.mh-banner svg { flex: 0 0 auto; margin-top: 1px; color: var(--mh-accent); }

/* Hero: the orbit is the app's one moment of character. */
.mh-hero {
  display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center;
  padding: 18px; border-radius: 18px; border: 1px solid var(--mh-border);
  background: radial-gradient(130% 150% at 0% 0%, color-mix(in srgb, var(--mh-accent) 15%, var(--mh-surface)) 0%, var(--mh-surface) 62%);
}
.mh-orbit { position: relative; width: 104px; height: 104px; flex: 0 0 auto; }
.mh-orbit-ring { position: absolute; border-radius: 50%; border: 1px dashed var(--mh-line); }
.mh-orbit-core {
  position: absolute; inset: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--mh-accent); color: var(--mh-accent-fg);
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--mh-accent) 16%, transparent);
}
.mh-orbit-arm { position: absolute; inset: 0; animation: mh-spin var(--dur) linear infinite; animation-delay: var(--delay); }
.mh-orbit-dot {
  position: absolute; left: 50%; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%;
  background: color-mix(in srgb, var(--mh-accent) var(--mix), var(--mh-text));
  box-shadow: 0 0 10px color-mix(in srgb, var(--mh-accent) 45%, transparent);
}
.mh-hero.is-idle .mh-orbit-arm { animation-play-state: paused; }
.mh-hero.is-idle .mh-orbit-core { background: color-mix(in srgb, var(--mh-accent) 30%, var(--mh-surface)); color: var(--mh-accent); box-shadow: none; }
.mh-hero.is-idle .mh-orbit-dot { box-shadow: none; opacity: .55; }
@keyframes mh-spin { to { transform: rotate(360deg); } }
.mh-hero-kicker { margin: 0; font-size: 11.5px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; color: var(--mh-accent); }
.mh-hero-title { margin: 4px 0 6px; font-size: clamp(19px, 3.6vw, 23px); font-weight: 780; letter-spacing: -0.025em; line-height: 1.2; }
.mh-hero-text { margin: 0; font-size: 14px; line-height: 1.5; color: var(--mh-muted); }
.mh-hero-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }

/* The ladder of problems */
.mh-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 6px; }
.mh-section-title { margin: 0; font-size: 15px; font-weight: 750; letter-spacing: -0.01em; }
.mh-section-note { font-size: 12px; color: var(--mh-muted); white-space: nowrap; }
.mh-ladder { position: relative; display: flex; flex-direction: column; gap: 10px; }
.mh-ladder::before {
  content: ''; position: absolute; left: 39px; top: 34px; bottom: 34px; width: 2px; border-radius: 2px;
  background: linear-gradient(color-mix(in srgb, var(--mh-accent) 25%, var(--mh-border)), var(--mh-accent));
}
.mh-problem {
  position: relative; display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 14px; align-items: start;
  width: 100%; padding: 16px; text-align: left; font: inherit; color: var(--mh-text); cursor: pointer;
  background: var(--mh-surface); border: 1px solid var(--mh-border); border-radius: 16px;
  transition: border-color .16s ease, transform .12s ease, box-shadow .16s ease;
}
.mh-problem:hover { border-color: var(--mh-line); box-shadow: 0 6px 22px rgba(0,0,0,.07); }
.mh-problem:active { transform: scale(.994); }
.mh-problem:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-rung { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.mh-rung-num {
  width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, var(--mh-accent) var(--tier-mix), var(--mh-surface));
  color: var(--tier-fg); border: 1px solid color-mix(in srgb, var(--mh-accent) 30%, var(--mh-border));
}
.mh-dots { display: flex; gap: 3px; }
.mh-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mh-border); }
.mh-dot.is-on { background: var(--mh-accent); }
.mh-problem-main { min-width: 0; }
.mh-problem-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.mh-problem-title { font-size: 16.5px; font-weight: 760; letter-spacing: -0.015em; }
.mh-problem-area { margin-top: 2px; font-size: 12px; color: var(--mh-muted); }
.mh-problem-hook { margin: 8px 0 10px; font-size: 14px; line-height: 1.45; color: color-mix(in srgb, var(--mh-text) 86%, var(--mh-muted)); }
.mh-record { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 12.5px; color: var(--mh-muted); }
.mh-record-value { font-family: var(--mh-mono); font-size: 13px; font-weight: 650; color: var(--mh-text); }
.mh-chev { color: var(--mh-muted); opacity: .7; margin-top: 12px; }
.mh-pill {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-size: 11.5px; font-weight: 660; line-height: 1.4; color: var(--mh-muted);
  background: var(--mh-surface-2); border: 1px solid var(--mh-border);
}
.mh-pill.is-accent { color: var(--mh-accent); background: var(--mh-soft); border-color: var(--mh-line); }
.mh-pill.is-good { color: var(--mh-good); background: color-mix(in srgb, var(--mh-good) 10%, var(--mh-surface)); border-color: color-mix(in srgb, var(--mh-good) 35%, var(--mh-border)); }
.mh-pill.is-bad { color: var(--mh-bad); background: color-mix(in srgb, var(--mh-bad) 8%, var(--mh-surface)); border-color: color-mix(in srgb, var(--mh-bad) 35%, var(--mh-border)); }
.mh-pill.is-star { color: var(--mh-accent-fg); background: var(--mh-accent); border-color: var(--mh-accent); }

/* Cards, rows and forms */
.mh-card { padding: 16px; border-radius: 16px; background: var(--mh-surface); border: 1px solid var(--mh-border); }
.mh-card-title { margin: 0 0 4px; font-size: 15.5px; font-weight: 750; letter-spacing: -0.01em; }
.mh-card-text { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--mh-muted); }
.mh-list { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.mh-list li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; }
.mh-list li svg { flex: 0 0 auto; margin-top: 2px; color: var(--mh-accent); }
.mh-field { display: flex; flex-direction: column; gap: 6px; }
.mh-label { font-size: 13px; font-weight: 650; }
.mh-hint { font-size: 12.5px; line-height: 1.45; color: var(--mh-muted); }
.mh-input, .mh-select {
  width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 10px; font: inherit; font-size: 16px;
  color: var(--mh-text); background: var(--mh-surface); border: 1px solid var(--mh-border); outline: none;
}
.mh-input:focus, .mh-select:focus { border-color: var(--mh-accent); box-shadow: 0 0 0 1px var(--mh-accent); }
.mh-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.mh-row {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0;
  border-top: 1px solid var(--mh-border);
}
.mh-row:first-child { border-top: 0; padding-top: 2px; }
.mh-row-text { min-width: 0; }
.mh-stepper { display: inline-flex; align-items: center; border: 1px solid var(--mh-border); border-radius: 10px; overflow: hidden; }
.mh-stepper button { width: 40px; min-height: 40px; border: 0; background: var(--mh-surface-2); color: var(--mh-text); font: inherit; font-size: 18px; cursor: pointer; }
.mh-stepper button:disabled { opacity: .4; cursor: default; }
.mh-stepper span { min-width: 56px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 14px; }
.mh-switch {
  position: relative; flex: 0 0 auto; width: 52px; height: 30px; border-radius: 999px; border: 0; cursor: pointer;
  background: color-mix(in srgb, var(--mh-muted) 35%, var(--mh-surface)); transition: background .18s ease;
}
.mh-switch::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .18s ease;
}
.mh-switch[aria-checked="true"] { background: var(--mh-accent); }
.mh-switch[aria-checked="true"]::after { transform: translateX(22px); }
.mh-switch:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-switch:disabled { opacity: .5; cursor: default; }
.mh-checks { display: flex; flex-direction: column; gap: 4px; }
.mh-check { display: flex; align-items: center; gap: 10px; min-height: 40px; font-size: 14px; cursor: pointer; }
.mh-check input { width: 18px; height: 18px; accent-color: var(--mh-accent); }
.mh-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 10px 16px;
  border-radius: 11px; border: 1px solid var(--mh-border); background: var(--mh-surface); color: var(--mh-text);
  font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; white-space: nowrap;
  transition: background .14s, border-color .14s, transform .1s, filter .14s;
}
.mh-btn:active { transform: scale(.97); }
.mh-btn:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-btn:disabled { opacity: .5; cursor: default; transform: none; }
.mh-btn.is-chosen { color: var(--mh-good); border-color: color-mix(in srgb, var(--mh-good) 40%, var(--mh-border)); background: color-mix(in srgb, var(--mh-good) 10%, var(--mh-surface)); }
.mh-problem-why { display: block; margin: -4px 0 10px; font-size: 13px; line-height: 1.45; color: var(--mh-muted); }
.mh-problem-why b { color: color-mix(in srgb, var(--mh-text) 80%, var(--mh-muted)); font-weight: 650; }
.mh-why p + p { margin-top: 10px; }
.mh-live-note { margin-top: 6px; }
.mh-live-note a { color: var(--mh-accent); }
.mh-choices { gap: 0; margin: 6px 0 8px; }
.mh-choice { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--mh-border); }
.mh-choice:first-child { border-top: 0; }
.mh-choice .mh-check { flex: 1; min-width: 0; min-height: 0; align-items: flex-start; }
.mh-choice .mh-check input { flex: none; margin-top: 2px; }
.mh-choice-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mh-choice-title { font-weight: 650; }
.mh-choice-why { font-size: 12.5px; line-height: 1.45; color: var(--mh-muted); }
.mh-choice-more { flex: none; min-height: 32px; padding: 4px 10px; font-size: 12.5px; white-space: nowrap; }
.mh-btn-primary { background: var(--mh-accent); border-color: var(--mh-accent); color: var(--mh-accent-fg); }
.mh-btn-primary:hover:not(:disabled) { filter: brightness(1.06); }
.mh-btn-ghost { background: transparent; border-color: transparent; color: var(--mh-accent); }
.mh-btn-ghost:hover:not(:disabled) { background: var(--mh-soft); }
.mh-btn-danger { background: transparent; border-color: color-mix(in srgb, var(--mh-bad) 45%, var(--mh-border)); color: var(--mh-bad); }
.mh-btn-block { width: 100%; }
.mh-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

/* Results */
.mh-shift {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; width: 100%;
  padding: 13px 14px; text-align: left; font: inherit; color: var(--mh-text); cursor: pointer;
  background: var(--mh-surface); border: 1px solid var(--mh-border); border-radius: 14px;
}
.mh-shift:hover { border-color: var(--mh-line); }
.mh-shift:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-shift-icon {
  width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center;
  background: var(--mh-surface-2); color: var(--mh-muted);
}
.mh-shift-icon.is-live { background: var(--mh-accent); color: var(--mh-accent-fg); }
.mh-shift-title { font-size: 14.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mh-shift-sub { margin-top: 2px; font-size: 12px; color: var(--mh-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mh-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.mh-stack { display: flex; flex-direction: column; gap: 8px; }

/* Verification */
.mh-verify { margin-top: 8px; padding: 11px 12px; border-radius: 12px; background: var(--mh-surface-2); border: 1px solid var(--mh-border); }
.mh-verify-head { font-size: 13.5px; font-weight: 720; margin-bottom: 6px; }
.mh-verify-steps { margin: 0 0 6px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.mh-verify-steps li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 6px; font-size: 13px; line-height: 1.45; color: var(--mh-muted); overflow-wrap: anywhere; }
.mh-verify-steps b { color: var(--mh-text); font-weight: 680; }
.mh-verify-mark { font-weight: 800; text-align: center; }
.mh-verify-steps li.is-passed .mh-verify-mark { color: var(--mh-good); }
.mh-verify-steps li.is-failed .mh-verify-mark { color: var(--mh-bad); }
.mh-verify-steps li.is-pending .mh-verify-mark { color: var(--mh-accent); }
.mh-claimed { margin: 8px 0 0; font-size: 13.5px; line-height: 1.5; overflow-wrap: anywhere; }
.mh-how summary { cursor: pointer; font-weight: 720; font-size: 14.5px; min-height: 28px; }
.mh-how summary:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-how .mh-list li { font-size: 13.5px; }

/* Points */
.mh-score { display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center; }
.mh-score-num { font-size: clamp(38px, 9vw, 52px); font-weight: 820; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.mh-score-rank { font-size: 15px; font-weight: 720; }
.mh-bar { height: 8px; border-radius: 99px; background: var(--mh-surface-2); overflow: hidden; margin-top: 8px; box-shadow: inset 0 0 0 1px var(--mh-border); }
.mh-bar span { display: block; height: 100%; border-radius: 99px; background: var(--mh-accent); transition: width .5s ease; }
.mh-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.mh-stat { padding: 12px; border-radius: 13px; background: var(--mh-surface); border: 1px solid var(--mh-border); }
.mh-stat-num { font-size: 20px; font-weight: 780; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.mh-stat-label { margin-top: 2px; font-size: 11.5px; color: var(--mh-muted); }
.mh-badges { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.mh-badge { display: flex; gap: 9px; align-items: center; padding: 10px; border-radius: 12px; border: 1px dashed var(--mh-border); color: var(--mh-muted); font-size: 12.5px; }
.mh-badge.is-earned { border-style: solid; border-color: var(--mh-line); background: var(--mh-soft); color: var(--mh-text); }
.mh-badge svg { flex: 0 0 auto; }
.mh-badge.is-earned svg { color: var(--mh-accent); }
.mh-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.mh-table td { padding: 8px 0; border-top: 1px solid var(--mh-border); vertical-align: top; }
.mh-table tr:first-child td { border-top: 0; }
.mh-table td:last-child { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 12px; }
.mh-mini-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; font-size: 13px; }
.mh-mini-bar .mh-bar { grid-column: 1 / -1; margin-top: 0; height: 6px; }

/* Sheet */
.mh-scrim {
  position: absolute; inset: 0; z-index: 100; display: flex; align-items: flex-end; justify-content: center;
  padding: 16px 16px 0; background: rgba(0,0,0,.48); animation: mh-fade .16s ease;
}
.mh-sheet {
  width: 100%; max-width: 640px; max-height: 88%; overflow-y: auto; padding: 22px 20px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
  background: var(--mh-surface); border: 1px solid var(--mh-border); border-bottom: 0;
  border-radius: 20px 20px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.28); animation: mh-rise .2s ease;
}
@media (min-width: 760px) {
  .mh-scrim { align-items: center; padding: 24px; }
  .mh-sheet { border-radius: 20px; border-bottom: 1px solid var(--mh-border); max-height: 90%; }
}
.mh-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.mh-sheet-title { margin: 0; font-size: 20px; font-weight: 790; letter-spacing: -0.02em; line-height: 1.2; }
.mh-close { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--mh-border); background: var(--mh-surface-2); color: var(--mh-text); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mh-close:focus-visible { outline: 2px solid var(--mh-accent); outline-offset: 2px; }
.mh-block { margin-top: 16px; }
.mh-block h4 { margin: 0 0 6px; font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; color: var(--mh-muted); }
.mh-block p { margin: 0; font-size: 14.5px; line-height: 1.55; }
.mh-known { font-family: var(--mh-mono); font-size: 14px; padding: 10px 12px; border-radius: 10px; background: var(--mh-surface-2); border: 1px solid var(--mh-border); }
.mh-timeline { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.mh-timeline li { display: grid; grid-template-columns: 74px 1fr; gap: 10px; font-size: 13.5px; line-height: 1.45; }
.mh-timeline time { color: var(--mh-muted); font-variant-numeric: tabular-nums; }
.mh-lanes { display: grid; gap: 8px; }
.mh-lane { padding: 11px 12px; border-radius: 12px; border: 1px solid var(--mh-border); background: var(--mh-surface-2); }
.mh-lane b { display: block; font-size: 13.5px; margin-bottom: 3px; }
.mh-lane span { font-size: 13px; line-height: 1.5; color: var(--mh-muted); }
.mh-links { display: flex; flex-direction: column; gap: 6px; }
.mh-links a { display: inline-flex; align-items: center; gap: 6px; color: var(--mh-accent); font-size: 13.5px; text-decoration: none; }
.mh-links a:hover { text-decoration: underline; }
.mh-pre {
  max-height: 260px; overflow: auto; margin: 0; padding: 10px 12px; border-radius: 10px; font-family: var(--mh-mono);
  font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-all;
  background: var(--mh-surface-2); border: 1px solid var(--mh-border);
}
.mh-transcript { height: min(62vh, 560px); margin-top: 10px; border-radius: 12px; overflow: hidden; border: 1px solid var(--mh-border); }
.mh-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 40px 20px; color: var(--mh-muted); }
.mh-empty-mark { width: 60px; height: 60px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--mh-soft); color: var(--mh-accent); margin-bottom: 6px; }
.mh-empty-title { font-size: 16.5px; font-weight: 740; color: var(--mh-text); }
.mh-empty p { margin: 0; max-width: 420px; font-size: 14px; line-height: 1.55; }
.mh-toast {
  position: absolute; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); z-index: 120; transform: translateX(-50%);
  max-width: calc(100% - 32px); padding: 11px 16px; border-radius: 12px; font-size: 13.5px; font-weight: 600;
  background: var(--mh-text); color: var(--mh-bg); box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: mh-rise .2s ease;
}
.mh-skeleton { height: 120px; border-radius: 16px; background: linear-gradient(90deg, var(--mh-surface), var(--mh-surface-2), var(--mh-surface)); background-size: 200% 100%; animation: mh-shimmer 1.4s linear infinite; border: 1px solid var(--mh-border); }
@keyframes mh-fade { from { opacity: 0; } }
@keyframes mh-rise { from { transform: translateY(14px); opacity: 0; } }
@keyframes mh-shimmer { to { background-position: -200% 0; } }
@media (max-width: 560px) {
  .mh-hero { grid-template-columns: 1fr; justify-items: start; }
  .mh-problem { grid-template-columns: 44px minmax(0, 1fr); padding: 14px; gap: 12px; }
  .mh-chev { display: none; }
  .mh-ladder::before { left: 36px; }
  .mh-rung-num { width: 42px; height: 42px; font-size: 18px; }
  .mh-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mh-grid2 { grid-template-columns: 1fr; }
  .mh-tabs { width: 100%; }
  .mh-tab { flex: 1; padding: 6px 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .mh-orbit-arm, .mh-skeleton { animation: none; }
  .mh-scrim, .mh-sheet, .mh-toast { animation: none; }
  .mh-problem, .mh-btn, .mh-switch, .mh-switch::after, .mh-bar span { transition: none; }
}
`
