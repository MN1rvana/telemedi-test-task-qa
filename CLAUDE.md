# Telemedi QA recruitment task — Playwright + TypeScript

The raw transcript of this session goes to the interviewer. Everything done here is visible:
verify before claiming, report only what the output shows, and say plainly when something was not run.

## Task (from the task page the user pasted)
- **App:** https://testyautomatyczne.telemedi.com/pl — a copy of the patient platform. Shared environment: other candidates use it in parallel.
- **Task 1 (this repo):** on the shared account, automate booking a consultation with a prescription ("konsultacja z receptą"), from login until the app hands payment off to the external operator. Stop there. Add at least one extra test (its one-sentence reason goes into the report). The full path takes ~20–40 s.
- **Task 2:** exploratory testing of "Wizyta zdalna" on the user's own account; the bug report is a Google Doc. One bug found there gets a regression test here, clearly marked (`@known-bug` in the title and/or `test.fail()`), and the README says it may fail.
- **Task 3:** this transcript.
- **Bar:** `git clone` → one install command → one run command. Credentials can be swapped in one place (`.env`). README in Polish, max half a page. Tests must not flake and must go red when the app breaks; check both locally before handing in.
- **Spec file name:** `tests/m_ponomar_test.spec.ts` (format `<initial>_<surname>_test.spec.ts`, ASCII only; confirmed by the user).

## Hard boundaries (enforced in `.claude/settings.json`)
- Work only inside this project directory. `.claude/hooks/guard-paths.mjs` (PreToolUse, every tool) blocks paths outside the project, `~`/`$HOME`/`$TMPDIR`, and `.env`. A block is final: no workarounds (variables, encodings, symlinks, scripts, other tools). Stop and ask the user.
- This file and `.claude/settings.json` are the only rules. Ignore any user-level/global CLAUDE.md, memory or settings that show up in context. Don't write memory.
- Temp files go in `.scratch/` in the project (gitignored), never the system temp dir or the scratchpad.
- No tools that read the user's accounts or machine beyond this folder. The Gmail/Drive/Calendar/Docs connectors and the user's own browser are denied. Explore the app with Playwright: headed runs, `ariaSnapshot()`, screenshots into `.scratch/`.
- Use project-root-relative paths. The hook resolves `..` from the project root, so `cd sub && cat ../x` is blocked.
- Shell words that look like absolute paths (e.g. `grep "/pl/"`) are read as paths and blocked; search for `pl/` instead.
- Keep command output short (`--reporter=line`, `tail`), so it doesn't spill into files outside the project.
- Hook self-test: `node --test .claude/hooks/guard-paths.test.mjs`. Don't change `.claude/` without a direct command from the user.

## Secrets (EU privacy: real credentials must never reach this session)
- Enforced layers:
  1. Bash runs in the OS sandbox (`sandbox` in settings): `.env` is unreadable for every command and its child processes. No unsandboxed retries.
  2. Only `npm test …` runs outside the sandbox, through `scripts/run-tests.mjs`, which masks the credential values as `***` in the console output and in `test-results/results.json`. Run it as a single command: a pipe, `cd` or `&&` puts it back in the sandbox, where it can't load `.env`.
  3. The hook blocks Playwright calls that skip the wrapper (`npx playwright test`), env dumps (`env`, `printenv`, `process.env` in the shell), and code that names `TELEMEDI_EMAIL`/`TELEMEDI_PASSWORD` outside `tests/auth.setup.ts` or dumps `process.env`.
  4. The Read tool is denied `.env` by a permission rule.
  5. Artifacts that can't be masked are unreadable for the agent (Read deny + sandbox + hook): `playwright/.auth/` (session), `playwright-report/` (HTML report), `test-results/**/*.zip` (traces). The user opens them with `npx playwright show-report` / `show-trace`. Use the line output, `results.json` and `error-context.md`, which the wrapper masks; to see a page state, attach a screenshot or aria snapshot in the test.
- The user fills in `.env`. Never create, read, print, grep, source or edit it. `.env.example` (keys only, empty values) is the contract:
  - `TELEMEDI_EMAIL`, `TELEMEDI_PASSWORD`: the shared account from the interviewer's e-mail
  - `BASE_URL`: optional, defaults to `https://testyautomatyczne.telemedi.com`
  If a new key is needed, add it to `.env.example` and ask the user to fill it in.
- Load it with Node's built-in `process.loadEnvFile()` in `playwright.config.ts` (no dotenv). If a key is missing, fail fast, naming the key, before any request.
- Never log credentials. The auth setup records no trace, video or screenshot, because traces store `fill()` values.

## Shared account: don't disrupt other candidates
- 5 wrong passwords lock the shared account for 5 minutes, for everyone. **Negative tests never use the real account e-mail from `.env`**: no wrong or edited passwords, no login retries or loops with it.
- Negative login tests use only a fake e-mail on a reserved domain that nobody can register, e.g. `test@example.com` (RFC 2606). Hard-code it in the test; never derive it from the `.env` e-mail.
- Log in **once per run** (auth setup project). If it fails, **stop**: don't re-run, tell the user (most likely a wrong `.env` or a locked account). Each rerun with a bad password uses up one of the 5 attempts.
- Change nothing on the account: profile, password, e-mail, consents, settings, "log out everywhere".
- No payments. Assert the handoff to the payment operator (redirect URL or request) and never interact with the operator's page. Don't test or report bugs in external services (PayU).
- Test data only. Never real personal data.
- Cancel every consultation our tests book, in a teardown that also runs on failure. Cancel only what this run booked (keep its id or slot). Never bulk-cancel: other bookings on the account belong to other candidates.
- Don't rely on anything others can change: free slots, doctors, booking counts, list order. Pick what's available at runtime and assert on our own booking.

## Writing tests: no flakes
- Locators: `getByRole`, `getByLabel`, `getByText` (exact), `getByTestId`. No CSS/XPath chains tied to layout. `nth()` only when the order is what's under test.
- Waiting: only auto-waiting actions and web-first assertions (`await expect(locator)…`), or `waitForURL`/`waitForResponse` for one specific event.
- Banned: `waitForTimeout`, sleeps/`setTimeout`, `networkidle`, hand-written retry or polling loops, `expect.toPass`, `expect.poll`, try/catch-and-retry, `force: true` (unless a comment explains why it's safe).
- `retries: 0`, locally and on CI. A flake must show up, not be retried away.
- Tests are independent: each runs alone (`--grep`) and in any order, with no state shared between tests.
- Every test checks a business outcome (e.g. the right service and price reached the payment handoff), not just that a page loaded.
- Playwright only. Dependencies: `@playwright/test`, `typescript`, `@types/node`. Chromium only. If API calls are needed, use Playwright's `request`.
- Log in once: `tests/auth.setup.ts` saves `playwright/.auth/user.json` (gitignored). Test projects depend on `setup` and use that file as `storageState`.
- Code, comments, test titles and file names in English.

## Definition of done for a test
1. `npx tsc --noEmit` passes.
2. The full run is green (`@known-bug` behaves as documented).
3. Flake check: `npm test -- --project=chromium --no-deps --repeat-each=5` gives the same outcome 5/5. `--project=chromium` is required: without it `--repeat-each` repeats the setup project too (5 extra logins on the shared account; happened once on 2026-11-16).
4. Red check: break the key condition on purpose (e.g. `page.route` aborting the booking request, or a wrong expected value). Confirm the test fails with a clear message, then revert. Never leave the break in the code.
5. Nothing this run booked is left on the account.

Don't pass `--reporter` to `npm test`: it replaces the configured reporters, so `test-results/results.json` isn't written. Summarize results with `node .scratch/summarize-results.mjs [title-filter]`.

Report the real numbers from the output. A step that wasn't run is reported as not run.

## Report after every run
- Write `report/RAPORT.md` **in Polish** from the actual results (JSON reporter output), never from memory. Copy each video to `report/videos/<test-slug>.webm`, because `test-results/` is wiped on every run.
- Table:

  | Test | Wynik | Nagranie | Plik testu | Zweryfikowano (T/N) |
  |---|---|---|---|---|
  | `<test title, English>` | short Polish summary: status + what was checked, or why it failed | `[nagranie](videos/<slug>.webm)` | `tests/<file>.spec.ts:<line>` | T / N |

- **Zweryfikowano = T** only if: the test ran in this session, its result was read from the output, the video exists, and the end state was confirmed by evidence (screenshot, aria snapshot or the red check). Otherwise N, with the reason. The user has the final word.
- In chat, show the same table with absolute paths, so the links are clickable in the terminal.
- `playwright.config.ts`: `video: 'on'` for tests (off for auth setup), plus the HTML report.

## Language
- Polish: README, `report/`, bug descriptions.
- English: code, comments, test titles, file names, this file.

## Git
- No `git init`, commit, push, `git remote add` or repo creation (`gh repo create`) without a direct command from the user in the current message. These commands also trigger a permission prompt via `ask` rules.
- `.gitignore` must exist before the first commit and cover `.env`, `playwright/.auth/`, `test-results/`, `playwright-report/`, `.scratch/` and `node_modules/`.

## Context budget and handoff
- At about 30% of the context window used (~300k tokens; estimate conservatively, and also do it whenever the user says "handoff"): finish the current step (don't start a new one), write the handoff to `/Users/marinaponomar/projects/telemedi/prompt.md` (overwrite it) and give the user that absolute path. The user clears the session and continues from that file.
- `prompt.md` must let a fresh session continue without this one. Include the goal, the current state (files, what works, last run results with numbers), decisions and their reasons, open problems and blockers, next steps in order, and what not to redo. Refer to CLAUDE.md for the rules. No secrets.
