# Build rules for every agent (read fully before writing code)

App: **Redpen**, an AI PM mock-interview companion. Vite + React 19 + TypeScript + Tailwind v4 + Dexie (IndexedDB) + Zustand + React Router 7 + Radix + lucide-react + zod 4. Frontend only; deployed later as a static site on Vercel (one optional Vercel function at `app/api/claude.ts`).

Spec: `../docs/MASTER_PLAN.md` is the source of truth (read your sections). Deep detail: `../docs/research/*.md`. Prompt drafts: `../docs/BUILD_PROMPT_STRUCTURE.md`.

## Already built (do not rewrite; extend only if your ownership says so)
- `src/styles/tokens.css`, `src/styles/index.css`: design tokens mapped to Tailwind (`bg-surface`, `bg-canvas`, `bg-subtle`, `text-primary/secondary/tertiary`, `text-accent`, `bg-accent-fill`, `border-border`, `bg-score-3-tint`, `text-title-1`, `text-reading`, `text-label`, `shadow-1/2/3`, `rounded-lg` (12px) …) plus CSS motion utilities (`animate-rise`, `animate-pop`, `animate-bar`, `stagger`, `skeleton`, `quote`, `reading`).
- `src/ui/*`: Button, IconButton, Kbd, Card, Chip, Tag, Input, Textarea, Label, Segmented, Banner, EmptyState, Skeleton, SectionHeader, Page, Divider, ScorePill, ScoreBar, ScoreDots, Dialog, Sheet, toast/Toaster, cx. Import from `@/ui`.
- `src/domain/types.ts`: ALL shared types. Add new types in your own files; only the ENGINE agent may edit `types.ts`, and only additively.
- `src/services/db/db.ts` (Dexie schema, getSettings/updateSettings), `src/services/clock.ts` (`Clock.now()` — never call `Date.now()` elsewhere), `src/services/id.ts` (`newId()`), `src/services/analytics.ts` (`Analytics.track(name, props, {mockId})`).
- `src/engine/api.ts` + `src/engine/selectors.ts`: the facade screens call. Signatures are a contract.
- `src/ai/types.ts`: `InterviewAI`, `RawGrade`, `LLMError`.
- `src/app/*`: router, AppShell (sidebar), RootLayout, theme. Routes in `src/routes/*` are placeholders to replace.

## File ownership (only write inside your area; create new files freely there)
| Agent | Owns |
|---|---|
| CONTENT | `src/content/**` (questions JSON, fixtures, seed data, sample answers) |
| ENGINE | `src/domain/**` (except types.ts is additive-only), `src/engine/**`, `src/ai/scripted/**`, `src/ai/resilient.ts`, `src/ai/index.ts`, `src/services/extract/**`, `src/services/db/**` (repositories, seed loader), `tests/**` |
| LIVE_AI | `src/ai/live/**`, `src/ai/prompts/**`, `src/services/keyStore.ts`, `api/claude.ts` (Vercel function) |
| VOICE | `src/services/voice/**`, `src/features/voice/**` (Orb, VoiceStage, mic check), `src/ui/Orb.tsx` |
| MOCK_UI | `src/routes/practice/**`, `src/routes/mock/**`, `src/routes/feedback/**`, `src/features/mock/**`, `src/features/feedback/**` |
| APP_UI | `src/routes/welcome|home|progress|library|settings|metrics/**`, `src/features/onboarding|home|tracker|library|settings|metrics|demo/**`, `src/ui/charts/**`, `src/app/AppShell.tsx` (polish only) |

Need something from another area? Code against the contract; if the contract is missing something, add a clearly marked `// CONTRACT-REQUEST:` comment in your own file and use a local fallback. Never edit `package.json` (all deps are installed: react, react-router-dom, dexie, dexie-react-hooks, zustand, zod, lucide-react, @radix-ui/react-{dialog,tooltip,popover,switch,toast}, @anthropic-ai/sdk, pdfjs-dist, mammoth, ulid; dev: vitest, fake-indexeddb).

## Design rules (non-negotiable — the user explicitly does not want "AI slop")
- Tokens only. No hex in components, no `bg-blue-500`-style classes, no gradients, no purple, no emoji, no exclamation marks, no glassmorphism/backdrop blur, no drop-shadow-heavy cards, no coloured left-stripe cards.
- One primary button per screen. Proximity before boxes; don't wrap everything in cards.
- Type roles: `text-title-1` page titles, `text-title-3` card titles, `text-body`, `text-reading` for transcript/fixes, `quote` class (serif italic) ONLY for quoting the candidate's own words, `text-label`/`text-footnote`/`text-caption` for small text. Numbers use tabular figures (default).
- Motion: CSS only, 100–400ms, `ease-standard`/`ease-enter`. Route content uses `animate-rise`; lists may use `stagger`; score bars `animate-bar` on first reveal. No count-up numbers, no scroll-triggered reveals, no confetti. Respect reduced motion (handled globally).
- Copy: direct, calm, coach-like. Sentence case. No hype words ("supercharge", "unlock", "magic"). The interviewer is Meera, a senior PM; she never praises or teaches during a mock.
- Every screen needs: empty, loading (skeleton, not spinner), error and populated states.
- Recording viewport: 1440×900 Chrome, light theme. Must also be clean at 1280×800.

## Engineering rules
- Path alias `@/` → `src/`. Strict TS; `npx tsc --noEmit` must pass for your files before you finish.
- `domain/` is pure: no React, no Dexie, no `Date.now()`, no window.
- Screens read with `useLiveQuery` (dexie-react-hooks) via `engine/selectors.ts` or direct table reads; all writes go through `engine/api.ts`.
- Never block the demo on the network: scripted AI must always work with no key.
- Do not run `npm run dev` on port 5173 (the integrator uses it). If you need a server, use `npx vite --port <5200-5299>` and kill it when done.
- Finish with a short report: files written, what works, what is stubbed, any CONTRACT-REQUESTs.
