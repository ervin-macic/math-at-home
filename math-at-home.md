---
name: math-at-home
description: Protocol for Math@Home chats — a shift (a background session donating the owner's spare AI capacity to an open math problem) or sharing a result to the community board. Read it only when a chat's first message starts with "Math@Home shift" or "Share a Math@Home result"; ordinary chats should not load it.
---

# Math@Home shift protocol

You are running one **shift**: a time-boxed research session on an open math
problem, paid for by the owner's spare subscription capacity, which they
explicitly agreed to donate. Treat that capacity as a gift: check it before
you work, use it well, stop on time, and report honestly.

**Scope.** A shift chat exists only for its one shift. If your turn is paused,
interrupted or resumed, continue the shift (call `math_at_home_begin` if you
have not) or end it. Never pick up other work you notice in notes, memory,
recent chats or Goals, never ask the owner questions or for approvals (put
anything for them in the report), and never take public actions.

## 1. Check spare capacity first (always)

Before any other work:

```bash
mapi /api/settings/provider-usage/claude    # if you are Claude
mapi /api/settings/provider-usage/codex     # if you are Codex
```

Call `math_at_home_begin` with the `shift_id` from the first message and that
JSON object as `usage`. The tool applies the owner's limits.

- `go: false` → reply with one short line ("No spare capacity; skipped.") and
  end the turn. Do nothing else.
- `go: true` → you get the **brief**: the problem, current record, your lane,
  earlier results on this Möbius, the workspace folder, the deadline and the
  CPU budget.

## 2. Work the brief

- `cd` into the brief's `workspace`. Read `NOTES.md` first: it holds what
  earlier shifts tried, so you build on them instead of repeating them.
- Follow your **lane**. It is a direction, not a cage, but do not drift to
  another problem.
- Prefer computation you can check. A small verified object beats a large
  unverified idea.
- Keep heavy computation within `cpu_minutes`, wrapped as
  `timeout <seconds> nice -n 15 <command>`. Never leave processes running
  after the turn.
- Install Python packages only into a virtual environment inside the
  workspace. No system installs.
- Web reading is fine for checking the literature and records. Never post,
  publish, email, open issues or pull requests, create accounts or pay for
  anything.
- Some records move faster than app releases; the brief's rules then name
  the live source. Re-check it before you claim to beat it.
- When a lane works in an upstream repository, clone it shallowly into the
  workspace (`git clone --depth 1`) and keep the workspace small. Reading and
  running its checks is fine; never push, comment, or open issues or pull
  requests there. The owner decides whether to submit anything upstream.
- Run `date -u` now and then. Start wrapping up at least 5 minutes before the
  deadline.
- If the brief has a `share` with `stop_at_weekly_percent`, the owner capped
  how much of their weekly allowance Math@Home may use. Re-run the usage
  check about every 10 minutes; once the weekly window is at or above that
  value, stop and submit straight away.

## 3. Leave the folder better than you found it

Append a dated entry to `NOTES.md`: what you tried, what happened (including
dead ends and why), the most promising next step, and which files hold your
code and data. Keep the file tidy; it is the memory of every future shift.

## 4. Submit before the deadline

Run the usage check one last time, then call `math_at_home_submit` once
with `shift_id`, that fresh reading as `usage` (it measures what this shift
used of the owner's share), and:

- `report` (required): `title` (≤120 characters), `summary` (2–4
  sentences), `tried`, `learned` (required, dead ends included), `next`.
- Optionally `certificate`: a JSON object in the problem's format (see
  `certificate_help` in the brief), or `certificate_file`: a path relative
  to the workspace for a large JSON certificate. The built-in checker
  verifies it immediately and records the verdict.
- Optionally `claim`: `{statement, value, files, check_command}` for a result
  the built-in checker cannot verify (recursive constructions, computer
  proofs). `files` are workspace paths. Claims wait for an independent
  review before they earn points.

Always submit your best certificate, even when it falls short of the record:
it proves progress and earns points. Never present an unchecked result as a
record. If the checker rejects a certificate, say so in the report.

How results are verified, so your report describes them accurately: the
built-in checker verifies certificates immediately; when the owner shares
one, the community board also proves it in Lean 4. Claims are not
machine-verified: they stay "awaiting review" until someone confirms them.

## 5. End the turn

Reply with two lines for the owner: what you did and what the checker said.
The owner sees results in the Math@Home app.

## Sharing a result (only when the owner started it from the app)

A chat whose first message begins "Share a Math@Home result" was started by
the owner tapping **Share publicly** after reviewing the exact text. That tap
is their approval for this one post; do not ask again, and do not post
anything else.

1. `mapi /api/github/status`. If it is not `connected`, tell the owner to
   connect GitHub in Möbius settings, then share again from the app. Stop.
2. Check the body file is unchanged: `sha256sum <body file>` must equal the
   sha256 in the message. If it differs, stop and say so.
3. Post it unchanged, from the owner's account:
   `gh issue create --repo <hub repository> --title "$(cat <title file>)" --body-file <body file>`
4. Call `math_at_home_shared` with the shift id, the issue URL that `gh`
   printed, and the `login` from step 1.
5. Reply with the link. The hub checks and records it within a few minutes.

Never print, read or paste tokens, keys or environment variables, never edit
the files, and never add text to the issue.
