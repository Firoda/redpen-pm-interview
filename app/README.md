# Redpen — PM interview practice

A mock interviewer for PM interviews. Meera asks one question and a few follow-ups that quote what you said. Then you get a 1–5 score on five dimensions and three fixes, each tied to a quote from your answer. The tracker shows which topic to practise next.

Everything runs in the browser. Profile, mocks, scores, uploads and the event log live in IndexedDB. There is no account and no database.

## Run it locally

```bash
cd app
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # 111 unit tests (vitest)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Use Chrome on desktop for voice mode: it needs Web Speech for transcription and speechSynthesis for Meera's voice. Text mode works in any modern browser.

## Deploy on Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Set **Root Directory** to `app`. Vercel detects Vite: build `npm run build`, output `dist`.
3. Optional, for live Claude without users pasting a key: in **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` for Production, then redeploy. `api/claude.ts` is a small same-origin proxy. It only allows the three Redpen models, caps `max_tokens`, and rejects bodies over 200 KB.
4. Open the deployed app → **Settings → Interviewer and grader → Claude**. Either turn on **Use server key** (step 3) or paste your own key. A pasted key stays in this browser's session storage, or local storage if you tick "Remember on this device". It is never exported.

`vercel.json` sends every non-`/api` path to `index.html`, so deep links like `/feedback/…` survive a refresh.

## AI modes

| Mode | Interviewer | Grader | Needs |
|---|---|---|---|
| **Scripted** (default) | Rule-based follow-ups that quote your answer | Offline rubric coach | Nothing; works offline |
| **Claude** | `claude-haiku-5-5`, low effort | Fast: Haiku · Thorough: `claude-sonnet-5-5` · Max: `claude-opus-5-5` | Server key or your own key |

If a Claude call fails mid-mock, that turn falls back to the scripted interviewer or the offline grader, so the mock never stalls. The report says which grader scored it.

## Demo controls

| Shortcut | What it does |
|---|---|
| `⌥D` (or `?demo=1`) | Demo layer: load the *Ishita · week 3* seed or a fresh user, move the app clock (+1 h, +1 day, +7 days), turn on demo mode, show the live event log, set scoring pace, switch AI mode |
| `⌥G` | In a mock with demo mode on, ghost-types the prepared answer for the current turn |
| `N` | New mock from anywhere |
| `Space` | In voice mode, start or stop talking |
| `⌘↵` | Send an answer |
| `Esc` | Leave the mock (resume within 24 h, or discard) |

A suggested 5-minute demo path is in `docs/MASTER_PLAN.md` §12:

1. Load the Ishita seed.
2. Open the unread RCA report.
3. Take the Metrics nudge: "Retry with your fix".
4. Ghost-fill the answers.
5. Show the Fix check card (Metrics 2 → 4).
6. Show Progress and the Metrics panel (North Star: weekly reviewed mocks).

## Where things are

```
src/
  app/          shell, router, theme
  engine/       the only API the UI calls (api.ts) + view selectors
  domain/       pure logic: rubric + offline grader, scoring/EWMA, nudges, metrics
  ai/           InterviewAI interface; scripted/ and live/ (Claude) providers, prompts
  services/     Dexie db, clock, analytics, key store, voice (STT/TTS, mic level)
  features/     screens: onboarding, home, mock, feedback, tracker, library, metrics, settings, demo
  ui/           primitives, charts, the voice Orb
  content/      96 curated questions, demo fixtures, seed data
api/claude.ts   Vercel proxy (server key)
```

The product spec, decision log and research are in `../docs/` (start with `MASTER_PLAN.md`).

## Known limits

- Voice transcription uses Chrome's Web Speech API, which sends audio to Google's speech service. Redpen itself stores no audio.
- Live Claude mode is built against the API contract and falls back cleanly, but it is best checked with a real key before a live demo.
- Scores are a practice signal. The report says so, and suggests confirming with a senior mock before the real interview.
