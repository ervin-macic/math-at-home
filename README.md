# Math@Home

Donate your AI subscription's spare capacity to open mathematics, in the
spirit of [solveathome.org](https://solveathome.org/) and
[givework.dev](https://givework.dev/), built as a Möbius app.

Once you agree, Math@Home runs short background **shifts** on this Möbius
during your quiet hours. Each shift is an ordinary Möbius agent turn on the
subscription you choose (Claude or Codex), working on one of five open
problems. It is time-boxed, has a CPU budget, and checks your usage gauge
before doing anything. Results are machine-checked where possible, stamped
with your credit name and a SHA-256 fingerprint, and scored on a points
board.

## How a shift works

1. **Schedule.** `shift.py` ticks every 30 minutes. It starts a shift only
   when you have consented, donating is on, it is inside your quiet hours,
   today's allowance is not used up, no shift is running, and the last
   capacity check did not ask it to wait.
2. **Capacity gate.** The shift agent reads your provider usage
   (`/api/settings/provider-usage/<provider>`, which app tokens cannot read)
   and passes it to the `math_at_home_begin` tool. The service applies your
   limits: by default the 5-hour window must be under 50% and the weekly
   window under 70%, rising to 90% in the last 24 hours before a weekly
   reset ("use it or lose it"). If there is no room, the shift ends at once
   and the scheduler waits until the blocking window resets.
3. **Donation share.** You choose what share of your weekly allowance
   Math@Home may use (10% by default; "no share limit" means spare capacity
   only). Each shift records the weekly gauge when it begins and, from the
   fresh reading it submits, when it ends; the rise is charged to this week's
   share. Shifts that end without a reading are charged the measured
   per-minute rate. Once the share is used, shifts stop until the weekly
   reset; a shift that starts with less than a full shift left is shortened
   and given a stop line on the gauge. Anything else you use during a shift
   is counted too, so the share errs on the side of donating less.
4. **Brief.** On success, the agent gets the problem, current record, a
   rotating attack lane, earlier results, a persistent per-problem workspace
   with a shared `NOTES.md`, its deadline and its CPU budget.
5. **Submit.** `math_at_home_submit` records an honest report (dead ends
   count) and optionally a **certificate**, which a built-in checker verifies
   immediately, or a **claim**, which waits for an independent review.

The full agent protocol is in `math-at-home.md` (installed as a skill).

## The five problems (checked 7 October 2026)

| # | Problem | Where it stands | Target |
|---|---------|-----------------|--------|
| 1 | Shannon capacity of C₇ | Θ(C₇) ≥ 3.25883262 (Tandon, Aug 2026) | any certified improvement |
| 2 | Square-difference-free sets | exponent ≥ 0.75806770413 (Jones, Sep 2026) | any certified improvement |
| 3 | No-three-in-line | 2n points known for all n ≤ 76 except 75 | n = 75 or n ≥ 77 |
| 4 | Lonely runner conjecture | proven up to 15 runners (Allikvere, Sep 2026) | 16 runners |
| 5 | Hadwiger–Nelson | 5 ≤ χ(ℝ²) ≤ 7 since 2018 | a 6-chromatic unit-distance graph |

Sources and recent progress for each are in `catalog.json` and on each
problem's page in the app.

## Checkers

- `no_three_in_line`: 2n distinct grid points, no three collinear.
- `c7_independent_set`: explicit independent sets in C₇^⊠k for k ≤ 8.
- `square_difference_modulus`: Ruzsa's classical criterion (square-free m,
  no square differences mod m); it reproduces the published 205/12 set.

Anything else is a claim. Claims earn record points only after an independent
confirmation (a link to the review, accepted record or paper).

## Points

| Contribution | Points |
|---|---|
| Shift report | 10 |
| Certificate that passes a checker | 25 |
| Machine-checked side-quest record | 100 × tier |
| Machine-checked record, or confirmed claim | 500 × tier |
| Donated AI time | 1 per 5 minutes |

Ranks: Volunteer, Contributor (100), Researcher (500), Fellow (2,000),
Laureate (10,000).

## Files

- `index.jsx`, `ui/`: the interface (Problems, Donate, Results, Points).
- `catalog.json`: problems, points rules and consent terms, shared by the
  interface and the engine.
- `service.py`: interface routes and the two agent tools.
- `engine/`: consent and settings, the capacity gate, the shift lifecycle,
  points, the checkers, the submission format and scrubber, and the
  community board client.
- `shift.py`: the scheduled tick.
- `math-at-home.md`: the shift protocol for agents.
- `tests/`: `python3 -m unittest discover -s tests -v`.
- `hub/` (project only): the community hub repository, with its workflow,
  scripts, public page and tests.

## Community board

Shifts stay on your Möbius until you share one. **Share publicly…** on a
finished shift shows exactly what will become public, then starts a chat in
which your own Möbius agent posts it, unchanged, as an issue on
[ervin-macic/math-at-home-hub](https://github.com/ervin-macic/math-at-home-hub)
from your own GitHub account. The hub's workflow re-checks any certificate
with the same checkers, scores it, and publishes the board that the
**Community** tab and the [public page](https://ervin-macic.github.io/math-at-home-hub/)
show: top donors over 7 days, 30 days and all time, what people have found,
and the community's best on each problem.

## Credential safety

- Math@Home never reads, stores or sends API keys, provider logins or GitHub
  tokens. Shifts run through your Möbius's own provider connection; the app's
  service and job hold only a short-lived app token used with this Möbius.
- A shared result is built from an allowlist (report title, summary, what was
  learned, next steps, certificate or claim, donated time and tokens) and is
  scrubbed of anything that looks like a credential, email address or local
  path before you see the preview. Chats, transcripts, workspace files, usage
  readings and account details are never included.
- Posting uses your Möbius's GitHub connection inside your own chat; the token
  is never printed or written anywhere.
- The hub treats every submission as untrusted data: it never runs submitted
  code, rejects anything still credential-like and blanks it on GitHub, and
  the public page renders all text as plain text.
- Participants never connect to each other. Everyone reads the same public
  board, which contains only what contributors chose to share.
