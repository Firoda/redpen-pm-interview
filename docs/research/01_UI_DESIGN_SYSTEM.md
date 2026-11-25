# 01 — UI Design System: PM Mock Interview Companion

Owner: UI/visual design research · Status: v1, ready for the planning council and the build prompt
Scope: frontend-only browser app (Chrome on localhost), desktop first with an optional phone-frame mode. It is recorded for a 4–5 minute graded walkthrough.
Read with: `docs/00_CONTEXT_BRIEF.md`

> **One-line brief for the build agent:** *Calm, typographic, native-feeling. One accent colour (a quiet blue), warm-neutral grays, system font, hairline borders instead of shadows, numbers set in tabular figures, and a single primary action per screen. It should feel like Apple Notes crossed with Linear, with Stripe-grade data clarity. It should never feel like a SaaS template.*

---

## 0. Key recommendations (TL;DR)

1. **Font: the system stack (SF Pro on the recording Mac), not Inter.** Use `font-variant-numeric: tabular-nums` on every number. One serif (Source Serif 4, self-hosted) is used **only** to quote the candidate's own words in feedback.
2. **Colour: warm-neutral grays plus one accent, `#0A5FD6` (light) / `#5AA2FF` (dark).** No gradients and no purple (hue 240–300° is banned). Colour carries meaning only: interactive, score, nudge, live mic.
3. **Score 1–5 uses an orange → sand → teal diverging scale.** It was checked with Machado colour-blindness simulation: every pair of scores is ≥ ΔE 16 apart under deuteranopia, protanopia and tritanopia. The scale is always paired with the numeral and a bar length, never colour alone. It is not traffic-light red/yellow/green.
4. **Shell: left sidebar, 240 px, collapsible to a 64 px rail.** It has four destinations (Home, Practice, Progress, Library) with Settings pinned at the bottom. A live mock hides the shell completely ("interview room" focus mode).
5. **Depth comes from surface tone and 1 px hairlines (M3 tonal surfaces), not drop shadows.** Shadows appear only on floating layers (popover, sheet, modal, toast).
6. **One primary button per screen** (HIG: "one or two per view"). Everything else is secondary or plain. The Home screen has exactly one "Next up" call to action.
7. **No coaching during the mock** (it is out of scope: "Never… live in-mock coaching"). The mock screen shows the question, the transcript, a turn indicator, an elapsed timer and the follow-up count. Nothing evaluative appears until the end.
8. **The feedback report is the hero screen.** It shows five dimension rows (score pill, bar, one-line reason), then three fixes that quote the user's words, then "Retry with this fix". Generation progress is determinate and staged, never a bare spinner (HIG progress rule).
9. **Stack: Vite + React + TypeScript + Tailwind v4 (CSS-variable tokens), plus Radix primitives via shadcn/ui *re-skinned*, plus Motion, Lucide (1.5 stroke), hand-drawn SVG charts (Recharts only for the trend chart), Zustand with localStorage persistence, and IndexedDB for uploads.**
10. **Motion is short and functional:** 150–250 ms, M3 easing curves, and `prefers-reduced-motion` honoured everywhere. The voice orb is the only element that moves on its own.

---

## 1. What the research says (distilled, with numbers)

### 1.1 Apple Human Interface Guidelines: what we take

| Topic | HIG fact (source) | What we do on the web |
|---|---|---|
| Principles | Clarity, deference, depth. Content first; controls recede. "Separate controls from content." [Layout] | Chrome is gray and quiet; content is black text on white surfaces. |
| Type scale (macOS) | Large Title 26/32, Title 1 22/26, Title 2 17/22, Title 3 15/20, Headline 13/16 **Bold**, Body 13/16, Callout 12/15, Subheadline 11/14, Footnote 10/13 [Typography] | macOS sizes are too small for a recorded browser demo. We scale them by about 1.15 (web body 15 px). |
| Type scale (iOS default "Large") | Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 Semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16, Caption 2 11/13 [Typography] | Phone-frame mode uses these exactly. Desktop reading text (transcript, feedback reasons) uses body 17/26. |
| Minimum sizes | iOS default 17 pt, min 11 pt; macOS default 13 pt, min 10 pt [Typography] | Our floor is **12 px**; nothing interactive goes below 13 px. |
| Weights | "Avoid Ultralight, Thin, and Light"; prefer Regular, Medium, Semibold, Bold. "Minimize the number of typefaces." [Typography] | Weights 400 / 500 / 600 only. 700 only for the big score numeral. |
| Leading | Loose leading for long passages; tight leading only for 1–2 lines, "never for three or more lines" [Typography] | Reading text uses a ratio of 1.5–1.55; headings 1.15–1.25. |
| Hit targets | 44×44 pt minimum (60×60 visionOS) [Buttons] | Pointer targets are ≥ 32 px high (desktop) with a ≥ 24×24 px hit area (WCAG 2.5.8). Phone frame uses ≥ 44 px. |
| Buttons | Prominent style for the most likely action, "one or two per view". Choose the preferred option "by style, not size". Labels "start with a verb", title case. Never make a destructive action primary. Show a spinner *in* the button for delayed actions ("Checkout" → "Checking out…") [Buttons] | One filled accent button per view. Same-size secondary buttons. In-button loading state. We use **sentence case** (the web/Google convention; calmer), but always verb-first. |
| Colour | Don't reuse a colour for different meanings; don't rely on colour alone; supply light, dark and increased-contrast variants [Color] | The accent is used only for interactive elements. Score hues never appear on buttons. Every score has a numeral. |
| System colours (light/dark) | Blue 0,136,255 / 0,145,255; Green 52,199,89 / 48,209,88; Orange 255,141,40; Red 255,56,60 [Color] | Too saturated for long sessions. We use deeper, desaturated cousins (accent `#0A5FD6`). The red family is reserved for the live mic and destructive actions. |
| Motion | "Add motion purposefully"; "avoid adding motion to UI interactions that occur frequently"; "brevity and precision"; "let people cancel motion"; "make motion optional" [Motion] | Frequent interactions (tab switches, row hovers) get ≤ 100 ms or no motion. Only orb and page transitions animate. |
| Sheets | For a simple task tied to context; one sheet at a time, never stacked; Cancel leading, Done trailing; confirm before discarding changes; medium/large detents on iPhone [Sheets] | Upload review, rate feedback and the end-mock confirm are sheets or dialogs. Never two at once. |
| Progress | Prefer determinate; "report progress accurately" (no 90 % in 5 s then a long tail); "keep the indicator moving"; avoid vague labels like "loading"; allow cancel [Progress indicators] | Feedback generation shows three named stages with real progress. Skeletons are used for layout, a spinner only inside a button. |
| Layout | Order by importance, top-leading; group with negative space before boxes; progressive disclosure; keep functionality constant across size classes [Layout] | Whitespace groups first, hairlines second, cards last. Evidence quotes are collapsed by default. |

### 1.2 Material Design 3: what we take

| Topic | M3 fact | What we do |
|---|---|---|
| Type scale | Display 57/64, 45/52, 36/44 · Headline 32/40, 28/36, 24/32 · Title 22/28, 16/24 (Medium), 14/20 (Medium) · Body 16/24, 14/20, 12/16 · Label 14/20, 12/16, 11/16 (Medium) [m3 typography; MDC-Android Typography.md] | Borrow the *role names* idea (display / title / body / label) and the 4 px line-height grid. All our line heights are multiples of 2 and most are multiples of 4. |
| Colour roles | Primary tone 40 (light) / 80 (dark); container 90 / 30; surface 98 / 6; surface-container lowest→highest = white, 96, 94, 92, 90 (light) and 4, 10, 12, 17, 22 (dark); outline NV50/60; outline-variant NV80/30 [MDC-Android Color.md] | Our surfaces follow the same logic: a darker canvas, a lighter surface, and tonal steps for nesting. In dark mode, elevation means a **lighter** surface, not a shadow. |
| Elevation | Levels 0–5 = 0, 1, 3, 6, 8, 12 dp; depth now mostly by tonal overlay [m3 elevation] | We use 4 levels: flat (0), raised (1, hairline only), floating (popover), modal. |
| Shape scale | None 0, XS 4, S 8, M 12, L 16, XL 28, Full [m3 shape] | Radii 4 / 8 / 12 / 16 / full. **We deliberately skip 28**, which is too bubbly and reads as a template. |
| State layers | Hover 8 %, focus 10 %, pressed 10 %, dragged 16 % overlay of the content colour; disabled content 38 % [Flutter M3 tokens state.json] | Hover is 4 % (light) / 6 % (dark), pressed 8 % / 10 %, quieter than M3 to match Apple's restraint. Disabled is 40 % opacity. |
| Motion tokens | Durations short1–4 = 50/100/150/200 ms, medium1–4 = 250/300/350/400, long1–4 = 450–600, extraLong = 700–1000. Easing: standard `cubic-bezier(0.2,0,0,1)`, standard-decel `(0,0,0,1)`, standard-accel `(0.3,0,1,1)`, emphasized-decel `(0.05,0.7,0.1,1)`, emphasized-accel `(0.3,0,0.8,0.15)`. "Duration should increase as the area/traversal increases." [MDC-Android Motion.md] | We adopt these curves directly (section 3.7). |
| Window classes / navigation | Compact < 600 dp → navigation bar; Medium 600–839 → rail; Expanded ≥ 840 → rail or drawer (M3 Expressive is moving drawer → expanded rail). A rail holds 3–7 destinations [Android adaptive docs; SAP Fiori M3 notes] | ≥ 1200 px: expanded sidebar (240 px). 840–1199: collapsed rail (64 px). < 840 / phone frame: bottom tab bar. |

### 1.3 Other evidence that shaped decisions
- **Stripe's accessible colour system:** build palettes in a perceptual space (CIELAB/OKLCH), give every hue the same lightness ramp, and keep text five or more steps away from its background. We validated every token pair numerically (section 3.1).
- **Linear's 2024 redesign:** themes are generated from three inputs (base, accent, contrast) in LCH. They *limited how much the accent feeds into neutrals* for a calmer look, and made text darker in light mode and lighter in dark mode for readability. We copy all three moves.
- **Mobbin's study of 859 streak designs:** streaks run on loss aversion. Low minimums retain more users (Duolingo's one-lesson bar gave 40 %+ more 7-day streaks). Gaps in dot grids read as "errors". Forgiveness mechanics work. So we use a **weekly** goal ring and no daily-streak flame.
- **ChatGPT Voice (Nov 2025):** voice moved *into* the chat thread with a live transcript; the separate orb screen became optional. So our voice mock keeps the transcript visible beside a small orb.
- **Granola:** AI text is shown in **gray**, the user's own text in **black**, and summaries link back to the transcript. So our feedback quotes the user's words in a distinct style and links each quote to its transcript turn.

---

## 2. Design principles for this product

| # | Principle | Do | Don't |
|---|---|---|---|
| 1 | **Honest, not harsh, not flattering.** The win thesis is honest feedback. | Show the score, the reason and the user's exact words. Write "2 — You listed six features and never chose one." | Don't add confetti, "Great job!" or stars on a 2/5. Don't soften with colour: a 2 still looks like a 2. |
| 2 | **One thing per screen.** Low cognitive load for a tired MBA student at 11 pm. | Give each screen one job and one primary button; disclose detail on demand (expand a row to see evidence). | Don't build dashboards with eight equal-weight cards. Don't show settings, stats and CTAs all at once. |
| 3 | **Content is the interface.** Questions, answers and feedback are text, so typography does the work. | Use a clear type scale, generous line length (60–75 characters) and hairline separators. | Don't put icons in every card header, decorative illustrations, gradient blobs, or glass panels over gradients. |
| 4 | **Calm surfaces, meaningful colour.** | Gray chrome, white content, one blue for "you can click this", and score colours only on scores. | Don't use colour for decoration, multiple accents, purple, or a rainbow of topic colours. |
| 5 | **Remember, visibly.** The product "remembers". | Show the last score and days since practice next to every topic. Show before/after on retries. Show the trend line. | Don't use generic progress ("You're on fire!"). Don't show stats without a "so what" next action. |
| 6 | **The interview room is sacred.** The mock must feel real (8 of 24 raised realism). | Use full-screen focus mode, an interviewer voice, a turn indicator and a quiet timer. | Don't show hints, live scores, sidebars, nudges or toasts during a mock. |
| 7 | **Fast to first question.** The GAME metric is time to first question. | Onboarding is three screens or fewer, ending in a mock. A "Start a mock" shortcut (⌘↵ / `N`) works from anywhere. | Don't use account walls, long profile forms, or tours that describe the UI. |

---

## 3. Design tokens

All tokens are CSS custom properties on `:root` (light) and `[data-theme="dark"]` (plus `@media (prefers-color-scheme: dark)` when theme = system). Tailwind v4 maps them via `@theme`. **The build agent must never hard-code a hex value in a component.**

### 3.1 Colour

#### Neutrals and surfaces

| Token | Light | Dark | Use | Contrast check |
|---|---|---|---|---|
| `--bg-canvas` | `#F5F5F7` | `#0E0E10` | App background behind surfaces, sidebar | — |
| `--bg-surface` | `#FFFFFF` | `#1C1C1E` | Cards, main content panel, inputs | — |
| `--bg-subtle` | `#F2F2F4` | `#26262A` | Wells, segmented-control track, bar track, code/kbd chips | — |
| `--bg-elevated` | `#FFFFFF` | `#232326` | Popovers, dialogs, sheets (dark is lighter = higher) | — |
| `--bg-hover` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | Row/button hover state layer | — |
| `--bg-pressed` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.10)` | Pressed state layer | — |
| `--bg-selected` | `#EAF1FC` | `rgba(90,162,255,.14)` | Selected nav item, selected row, selected chip | — |
| `--border` | `#E5E5EA` | `#2E2E32` | Hairlines, card outlines, input borders (rest) | decorative |
| `--border-strong` | `#D1D1D6` | `#3A3A3F` | Input border on hover, dividers that must be seen | — |
| `--text-primary` | `#1D1D1F` | `#F5F5F7` | Body, titles | 16.8:1 / 15.6:1 on surface |
| `--text-secondary` | `#5E5E66` | `#A1A1A8` | Metadata, descriptions, labels | 6.4:1 / 6.6:1 |
| `--text-tertiary` | `#86868B` | `#7C7C82` | Placeholders, timestamps, disabled-ish hints (≥ 13 px only) | 3.6:1 / 4.1:1, never essential info |
| `--text-disabled` | `#AEAEB2` | `#55555A` | Disabled labels | exempt |

Neutrals are slightly warm-cool balanced (Apple's `#1D1D1F`/`#F5F5F7` family). Do not swap in Tailwind's `slate`/`zinc` defaults; those are a recognisable template tell.

#### Accent (interactive only)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#0A5FD6` | `#5AA2FF` | Links, focus ring, selected indicators, toggles on, chart highlight series |
| `--accent-fill` | `#0A5FD6` | `#2A6FD6` | Primary button background (white text: 5.8:1 light, 4.8:1 dark) |
| `--accent-fill-hover` | `#0852BA` | `#3479E0` | Primary hover |
| `--accent-fill-pressed` | `#07479F` | `#2462C2` | Primary pressed |
| `--accent-subtle` | `#EAF1FC` | `rgba(90,162,255,.14)` | Selected backgrounds, info banners |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | Text on accent fill |
| `--focus-ring` | `#0A5FD6` | `#5AA2FF` | 2 px ring + 2 px offset (5.8:1 / 6.5:1 vs surface) |

Why blue: it is the native "interactive" colour on Apple and Google platforms, so it reduces learning cost. Hue ≈ 215° sits outside the 240–300° "AI purple" band.

#### Semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `--nudge-bg` | `#FFF4E0` | `#2B2418` | Nudge banners ("Metrics not practised in 9 days") |
| `--nudge-border` | `#F3D9A6` | `#4A3B1F` | |
| `--nudge-text` | `#8A5300` | `#F2B84B` | 5.8:1 / 8.6:1 |
| `--danger` | `#C0362C` | `#FF6B5E` | Destructive buttons/text (delete upload, clear data), error text |
| `--danger-subtle` | `#FBEAE8` | `rgba(255,107,94,.14)` | Error banner background |
| `--live` | `#D92D20` | `#FF5A4E` | **Mic is recording** dot only (the universal recording convention) |
| `--positive-text` | `#0F6B5E` | `#7CD3C3` | Positive delta (+1), "Saved", connected. Shares the teal score family on purpose |

There is no generic "success green". A positive outcome uses the same teal as high scores, so green never competes with the score scale.

#### Score scale 1–5 (colour-blind-safe, not a traffic light)

A diverging scale: warm and dark at the bottom, sand (neutral) in the middle, cool and dark at the top. **Lightness is not monotonic by design.** The extremes are dark and the middle is light, so 3 vs 4 differ in lightness and 1 vs 5 differ in hue. This holds up under every colour-vision deficiency.

| Score | Meaning label (shown) | Fill (bars, dots) L / D | Tint bg (pills) L / D | Text on tint L / D | Text contrast |
|---|---|---|---|---|---|
| 1 | Missing | `#C2410C` / `#E8693A` | `#F6E4DD` / `#412A23` | `#9A3412` / `#F59A75` | 5.9 / 6.2 |
| 2 | Weak | `#E39A3B` / `#F0B45A` | `#FBF1E4` / `#423729` | `#83560F` / `#F3C27A` | 5.7 / 7.1 |
| 3 | Mixed | `#C9C3B8` / `#6B675F` | `#F7F7F5` / `#2A2A2A` | `#57534E` / `#C2BDB2` | 7.1 / 7.7 |
| 4 | Strong (hire bar) | `#3A9A8A` / `#4FB8A6` | `#E3F1EF` / `#253836` | `#0F6B5E` / `#7CD3C3` | 5.5 / 7.1 |
| 5 | Exceptional | `#0F5E57` / `#9BE3D4` | `#DDE8E7` / `#33403F` | `#0B4A44` / `#B5EEE2` | 8.1 / 8.4 |

Validation (Machado 2009 simulation, severity 1.0, CIELAB ΔE76; light set): the minimum pairwise ΔE between any two scores is **22 (deuteranopia), 19 (protanopia), 25 (tritanopia)**, and the adjacent-step ΔE under normal vision is 24–56. Dark set: ≥ 16 under all three.

Rules:
- **Always render the numeral** ("2") and, where there is room, the label ("Weak"). Colour is the third cue, not the first (HIG: "Don't rely on color alone").
- Bars encode the score by **length** (score / 5 of the track) as well as colour. The 3 fill (sand) on the track has low contrast (1.5:1); this is acceptable only because the numeral is always present.
- The hire bar is **4**. Charts draw a dashed reference line at 4 labelled "Hire bar". Teal = at or above the bar, warm = below. That is the one thing a viewer needs to see.
- Never use score colours on buttons, nav or illustration.

#### Charts
- `--chart-highlight`: `--accent`. `--chart-muted`: `#C7C7CC` / `#48484D`. `--chart-grid`: `--border`. `--chart-ref` (hire bar): `--text-tertiary`, 1 px dashed 4/4.
- Multi-topic trend charts show **one highlighted series (accent, 2 px) and the other five muted (1.5 px)**. Hover or select promotes a series. Never show six rainbow lines.

### 3.2 Typography

**Recommendation: the system font stack.** Reasoning:
1. The walkthrough is recorded on a Mac in Chrome, where `-apple-system` renders **SF Pro** with optical sizing and Apple's own tracking tables. That is the most "Apple-grade" result possible on the web, at zero cost.
2. No font download, no flash of unstyled text, and it works offline on localhost.
3. **Inter is the most common tell of AI-generated UIs** (it is the default in shadcn, v0 and Lovable starters). Geist is close behind (Vercel/Next defaults). The system font reads "native app", not "template".
4. On Windows it falls back to Segoe UI Variable, which is also a native, high-quality UI face.

```
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-serif: "Source Serif 4", "New York", ui-serif, Georgia, serif;   /* self-host via @fontsource/source-serif-4, weights 400 & 400-italic only */
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
```

- **Serif use is limited to one job:** quoting the candidate's own words inside feedback ("*'I'd build all three and see what sticks'*"). This gives the report an editorial, coach's-red-pen character and visually separates *your words* from *our assessment*, the same idea as Granola's black-vs-gray split. It is used nowhere else.
- **Mono:** keyboard hints (`⌘K`), the API key field and token counts. Never body text.
- **Numerals:** `font-variant-numeric: tabular-nums` on scores, timers, counts, tables and chart axes.
- **Tracking:** SF applies its own optical tracking. Add only negative tracking on large sizes (below). Never letter-space body text. Never use ALL-CAPS eyebrow labels.

#### Type scale (desktop web; px)

| Role | Size / line height | Weight | Tracking | Used for |
|---|---|---|---|---|
| `display` | 40 / 48 | 600 | −0.022em | Onboarding headline, empty-state headline (rare) |
| `score-xl` | 56 / 56 | 700 tabular | −0.03em | Overall score on feedback report ("3.2") |
| `title-1` | 28 / 34 | 600 | −0.018em | Page title (Home, Progress, Library) |
| `title-2` | 22 / 28 | 600 | −0.012em | Section header, question text in setup preview |
| `title-3` | 18 / 24 | 600 | −0.006em | Card title, sheet title, fix title |
| `question` | 20 / 30 | 500 | −0.008em | The interview question in the live mock (reading-optimised) |
| `headline` | 15 / 20 | 600 | 0 | List-row primary text, dimension names |
| `body` | 15 / 22 | 400 | 0 | Default UI text |
| `body-reading` | 17 / 26 | 400 | 0 | Transcript turns, feedback reasons, fixes (long-form) |
| `quote` | 17 / 26 serif italic | 400 | 0 | Candidate's words quoted in feedback |
| `callout` | 14 / 20 | 400 | 0 | Helper text, banner text, table cells |
| `label` | 13 / 18 | 500 | 0 | Buttons (small), chips, tabs, form labels |
| `footnote` | 13 / 18 | 400 | 0 | Metadata ("4 days ago · Text · 14 min") |
| `caption` | 12 / 16 | 500 | +0.01em | Axis labels, kbd hints, badge text. **Floor; nothing smaller** |

Buttons use 15/20 weight 500 (regular size) or 13/18 weight 500 (small). Measure: reading columns are capped at **68ch** (≈ 640–680 px at 17 px).

Phone-frame mode uses the HIG iOS "Large" table verbatim (Body 17/22, Headline 17/22 semibold, Large Title 34/41, and so on).

### 3.3 Spacing (4 px base, 8 px rhythm)

| Token | px | Typical use |
|---|---|---|
| `space-0.5` | 2 | Icon-to-text nudge, focus offset |
| `space-1` | 4 | Chip internal gap, label → input |
| `space-2` | 8 | Inline gaps, icon + label, between pills |
| `space-3` | 12 | Row vertical padding (compact), button horizontal padding (sm) |
| `space-4` | 16 | Card padding (compact), button horizontal padding, list gaps |
| `space-5` | 20 | Card padding (default) |
| `space-6` | 24 | Grid gutter, card padding (feature), between stacked cards |
| `space-8` | 32 | Page side padding (desktop), between sections in a card |
| `space-10` | 40 | Between page sections |
| `space-12` | 48 | Page top padding, header → content |
| `space-16` | 64 | Onboarding vertical rhythm |
| `space-20` | 80 | Empty-state top offset |
| `space-24` | 96 | Hero spacing (onboarding only) |

**Rule: proximity before boxes.** Related items are 4–12 px apart; groups are 24–40 px apart. If whitespace separates the groups, don't add a card.

### 3.4 Radii (deliberately not uniform)

| Token | px | Use |
|---|---|---|
| `radius-xs` | 4 | Kbd chips, tiny badges, bar ends (bars are 4 px tall: fully rounded) |
| `radius-sm` | 6 | Checkboxes, small inputs, segmented-control thumb |
| `radius-md` | 8 | Buttons, inputs, select, menu items, transcript bubbles |
| `radius-lg` | 12 | Cards, panels, dropzone, toasts |
| `radius-xl` | 16 | Dialogs, sheets, popovers over 320 px |
| `radius-phone` | 48 | Phone frame outer (inner screen 40) |
| `radius-full` | 9999 | Pills (score, chips), avatar, orb, toggle |

Nested radii rule: inner radius = outer radius − padding (for example, a 12 px card with 4 px inset has an 8 px inner element).

### 3.5 Elevation and shadows

| Level | Light | Dark | Use |
|---|---|---|---|
| 0 flat | none | none | Content on canvas |
| 1 raised | `0 0 0 1px var(--border)` + `0 1px 2px rgba(0,0,0,.04)` | `0 0 0 1px var(--border)` (no shadow) + surface `#1C1C1E` on canvas `#0E0E10` | Cards, inputs |
| 2 floating | `0 0 0 1px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.08)` | `0 0 0 1px rgba(255,255,255,.08), 0 8px 24px rgba(0,0,0,.5)` | Popover, menu, command palette, tooltip |
| 3 modal | `0 0 0 1px rgba(0,0,0,.06), 0 24px 64px rgba(0,0,0,.18)` | `0 0 0 1px rgba(255,255,255,.08), 0 24px 64px rgba(0,0,0,.6)` | Dialog, sheet, toast |
| Scrim | `rgba(0,0,0,.32)` | `rgba(0,0,0,.56)` | Behind modal/sheet. **No backdrop blur** except the phone-frame bottom tab bar (blur 20 px, `--bg-surface` at 80 %) |

### 3.6 Borders

- Hairline: `1px solid var(--border)`. Do not use 0.5 px; Chrome renders it inconsistently on non-retina displays.
- Input rest: `--border`. Hover: `--border-strong`. Focus: border `--accent` plus the focus ring.
- Dividers inside lists are inset 16 px from the leading edge (the iOS grouped-list convention) and are never full-bleed inside cards.
- Never use a coloured left border as a status stripe on cards (a known AI tell; see section 10).

### 3.7 Motion

| Token | Value | Use |
|---|---|---|
| `dur-instant` | 0 ms | Reduced-motion substitute |
| `dur-fast` | 100 ms | Hover/pressed colour, toggle thumb, checkbox |
| `dur-base` | 150 ms | Tooltip/popover in, chip select, tab indicator |
| `dur-moderate` | 200 ms | Dropdown, expand/collapse row (height), toast in |
| `dur-slow` | 250 ms | Dialog/sheet in, page cross-fade |
| `dur-slower` | 400 ms | Score bar fill on report reveal, ring fill |
| `dur-orb` | 1200–2400 ms loop | Orb breathing (idle 2400, listening reacts to amplitude, speaking 1200) |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default (M3 standard) |
| `ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Things appearing (M3 emphasized-decelerate) |
| `ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Things leaving (M3 emphasized-accelerate); use 0.67× the enter duration |
| `spring-orb` | Motion spring `{stiffness: 260, damping: 26}` | Orb scale reacting to voice amplitude |

- Exits are faster than entrances: a dialog enters in 250 ms and exits in 150 ms.
- Distance: page content slides ≤ 8 px plus a fade. Never slide full panels across the screen on desktop.
- Stagger: at most 30 ms between list items, at most 5 items, and only on the first reveal of the feedback report. Nowhere else.
- `prefers-reduced-motion: reduce`: all transforms become opacity-only at 100 ms; the orb becomes a static ring whose **ring thickness** reflects state; bar fills appear instantly; no stagger.

### 3.8 Z-index layers

| Token | Value | Layer |
|---|---|---|
| `z-base` | 0 | Content |
| `z-sticky` | 10 | Sticky page header, sticky composer |
| `z-nav` | 20 | Sidebar / rail / bottom tab bar |
| `z-dropdown` | 30 | Select menus, popovers |
| `z-overlay` | 40 | Scrim |
| `z-modal` | 50 | Dialog, sheet, command palette |
| `z-toast` | 60 | Toasts |
| `z-tooltip` | 70 | Tooltips |
| `z-demo` | 90 | Demo-mode controls (hidden in recording) |

### 3.9 Breakpoints (aligned with M3 window classes)

| Name | Min width | Navigation | Content |
|---|---|---|---|
| `compact` | 0 | Bottom tab bar (phone frame / small window) | Single column, 16 px gutters |
| `medium` | 600 | Bottom tab bar | Single column, 24 px gutters |
| `expanded` | 840 | Collapsed rail 64 px | 12-col grid, 24 px gutters |
| `large` | 1200 | Expanded sidebar 240 px | 12-col, max content 1040 px |
| `xlarge` | 1600 | Sidebar 240 px | Content stays 1040 px, centred (do not stretch) |

The recording target is a **1440×900 browser viewport** (Chrome at 100 % on a 14"/16" MacBook, or a window sized to it). Design and QA happen there first.

---

## 4. App shell and layout

### 4.1 Desktop shell

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ ◐ Mockly   │  Page title (title-1)                     [secondary] [Primary] │
│            │  one-line description (callout, secondary)                     │
│ ⌂ Home     │  ────────────────────────────────────────────────────────────   │
│ ▷ Practice │                                                                │
│ ↗ Progress │   content (max 1040 px; reading columns 680 px)                │
│ ☰ Library  │                                                                │
│            │                                                                │
│            │                                                                │
│ ───────    │                                                                │
│ ⚙ Settings │                                                                │
│ Ishita · ISB│                                                               │
└────────────┴──────────────────────────────────────────────────────────┘
  240 px, bg-canvas      bg-canvas; content sits directly on canvas or in surface cards
```

- "Mockly" in the sketch is a placeholder name; the team picks the real one.
- **Sidebar, not top nav.** There are four or five destinations and the app is used for long sessions. A sidebar matches Linear, Notion and Apple Notes, and keeps the top of the content area for page context (HIG: primary content top-leading).
- Sidebar specs: width 240 px; item height 32 px; item padding 0 12 px; icon 18 px at 1.5 stroke; label 14/20 weight 500; 2 px gap between items. Selected = `--bg-selected` plus accent icon and text weight 600. No left stripe. The product name or wordmark sits top-left at 15 px weight 600 (plain text plus a simple monochrome glyph, **no gradient logo**). The user chip sits at the bottom.
- Sidebar background = `--bg-canvas`; the main area is also canvas, with content in `--bg-surface` cards. Alternative (more Notes-like): main area = `--bg-surface` with the sidebar on canvas and a 1 px right border. **Pick the second variant.** It is calmer because there is one big white sheet and no card soup.
- Primary global action: a "**Start mock**" button at the top of the sidebar (secondary style, full width, `N` shortcut). On Home, the page's own primary CTA takes precedence.
- **Command palette** (`⌘K`): jump to topic, start a mock on topic X, open the last feedback, toggle theme. Built on `cmdk`, 560 px wide, 12 px radius, level-3 elevation.
- Page header: title-1, plus optional one-line description in callout/secondary, plus right-aligned actions. 48 px top padding and 32 px side padding. The header becomes sticky on scroll with a hairline bottom border, shrinking to title-3 in 48 px height (the iOS large-title collapse behaviour).

### 4.2 Content widths and grid

- 12 columns, 24 px gutter, max 1040 px. Common splits: 8/4 (Home: main + side column), 12 (Progress table), 7/5 (Library list + preview).
- Reading surfaces (feedback report, transcript) use a **single 680 px column**, centred, with an optional 280 px sticky right rail for the score summary at ≥ 1200 px.
- Live mock (focus mode) has no sidebar. Content is centred: question area max 760 px, transcript 680 px, composer 760 px.

### 4.3 Phone-frame mode (for the mobile segment of the demo)

- Toggle with `?frame=phone` or Settings → Demo → "Show phone frame". This renders the same app inside a 390×844 px frame (iPhone 15/16 logical size) centred on a `--bg-canvas` stage. Frame: 12 px bezel `#1D1D1F`, outer radius 55 px, inner radius 47 px, Dynamic Island 126×37 px at top 11 px. The status bar (9:41, signal, battery) is drawn as static SVG.
- Inside the frame, force the `compact` breakpoint: bottom tab bar (height 49 + 34 safe-area = 83 px, blurred surface, 4 tabs, icon 24 px + label 10/12 weight 500), iOS type scale, 44 px minimum targets, and sheets that rise from the bottom with a grabber (36×5 px, radius 2.5) and medium/large detents.
- Use it for one beat of the video: "practise on the bus". Show the Home nudge, then voice mock with the orb, then the report summary. Don't build a separate mobile design system.

---

## 5. Component inventory

States key: **R** rest · **H** hover · **P** pressed · **F** focus-visible · **D** disabled · **L** loading · **S** selected · **E** error.
Global focus style: `outline: 2px solid var(--focus-ring); outline-offset: 2px;` on `:focus-visible` only.

### 5.1 Buttons

| Variant | Height / padding / radius | Rest | Hover | Pressed | Use |
|---|---|---|---|---|---|
| Primary | 36 px (sm 28, lg 44) · 0 16 px (sm 12, lg 20) · 8 px | `--accent-fill`, white text 15/20 weight 500 | `--accent-fill-hover` | `--accent-fill-pressed`, scale .98 (100 ms) | **One per screen**: Start mock, Retry with this fix, See feedback |
| Secondary | same | `--bg-surface`, 1 px `--border-strong`, text primary | `+ --bg-hover` | `+ --bg-pressed` | Alternate actions |
| Plain (ghost) | same | transparent, text primary (or accent for links) | `--bg-hover` | `--bg-pressed` | Toolbar actions, "Cancel" |
| Destructive | same | `--bg-surface`, 1 px `--border-strong`, text `--danger` | `--danger-subtle` bg | darker | Delete upload, Clear data. Never primary-filled except in the final confirm dialog |
| Icon button | 32×32 (sm 28), 8 px radius, icon 18 px | transparent, `--text-secondary` | `--bg-hover`, icon primary | `--bg-pressed` | Must have `aria-label` and a tooltip (500 ms delay) |

- **L**: replace the label with a 16 px spinner plus a progressive verb ("Scoring…"); keep the width fixed; disabled while loading.
- **D**: 40 % opacity, `cursor: not-allowed`, tooltip explains why ("Answer the last follow-up to finish").
- Labels are verb-first, sentence case, at most 3 words: "Start mock", "Retry with this fix", "Upload casebook".
- An optional shortcut hint can sit inside a secondary or plain button on the right: a kbd chip (see 5.20).

### 5.2 Inputs (text, textarea, select)

- Height 36 px; padding 0 12 px; radius 8; bg `--bg-surface`; 1 px `--border`; text 15/22; placeholder `--text-tertiary`.
- H: border `--border-strong`. F: border `--accent` plus focus ring. E: border `--danger`, with helper text 13/18 `--danger` below and an icon. Error text says what to do ("Key should start with `sk-`").
- Label above the field, 13/18 weight 500, 4 px gap; helper text below, 13/18 secondary.
- **Answer composer (textarea, live mock)**: min 3 lines and max 12 lines (it grows), radius 12, padding 12 16, body-reading 17/26. A footer row inside the composer holds the word count (caption, tertiary), a "Switch to voice" plain button and the Send button (primary sm). `⌘↵` sends; `↵` inserts a newline (answers are long). The hint "⌘↵ to send" appears in the footer.
- **API key field**: mono 14 px, `type=password`, reveal icon button, and a "Test" secondary button inline right.

### 5.3 Chips (filter / choice)

- Height 28 px; padding 0 12 px; radius full; label 13/18 weight 500.
- R: `--bg-surface` plus 1 px `--border`, text secondary. H: `--bg-hover`. S: `--bg-selected`, 1 px `--accent` at 40 %, text `--accent`, leading check icon 14 px (swaps in without layout shift: reserve the width).
- Used for topic filters (Library), onboarding "weak topics" multi-select, and case variants ("Change the user / market / constraint").
- **Topic chips are monochrome.** No topic colour coding (six colours equals rainbow noise).

### 5.4 Cards

- Surface `--bg-surface`, radius 12, level-1 elevation (hairline), padding 20 (compact 16, feature 24).
- Header: title-3 plus optional right-aligned plain action ("See all"). **No icon-in-a-tinted-square header** (an AI tell).
- Clickable card: whole card is the target. H adds `--bg-hover` overlay and the border turns `--border-strong`. No lift or shadow on hover. A trailing chevron 16 px tertiary signals navigation.
- **Use cards sparingly.** Home has at most three. Lists use rows, not cards.

### 5.5 List rows (the workhorse)

- Height 56 px (two-line) or 44 px (single). Padding 12 16. Leading slot (20 px icon or score pill), then title (headline 15/20 weight 600) and subtitle (footnote 13/18 secondary), then trailing slot (value, sparkline, chevron).
- Dividers inset 16 px. H: `--bg-hover` with 8 px radius inset 4 px (the Linear/Notes feel).
- Used for: topics, recent mocks, library questions, uploads, settings.

### 5.6 Score pill

- Height 24 px; padding 0 8 px; radius full; caption 12/16 weight 600 tabular.
- Content: "**2** Weak" (numeral weight 700 plus label weight 500), bg = score tint, text = score text colour.
- Compact variant (22×22, numeral only, circle) for tables and sparklines.
- Decimal overall score: one decimal ("3.2"), with colour from the rounded value. Shown large (score-xl) only on the report header.

### 5.7 Score bar

- Track: 4 px tall, radius 2, `--bg-subtle`, width 100 % (min 120 px). Fill: width = score / 5, colour = score fill. A tick at 80 % (score 4 = hire bar) marks the track: 1 px × 8 px, `--text-tertiary`.
- On first reveal the fill animates 0 → value over 400 ms `ease-enter`, staggered 30 ms per row.

### 5.8 Rubric dimension row (feedback report)

```
Structure                                        [2 Weak]  ▬▬▬▬▬▬▬▬░░░░░░░░░░░|░░░░
You jumped to solutions before stating the user or the goal.              ⌄ Evidence
```
- Grid: name (headline, 160 px), reason (body-reading 15/22 on one line, wraps), then pill plus bar (right, 200 px).
- Expand (chevron, 200 ms height) reveals **Evidence**: one or two serif-italic quotes from the transcript, each with a "Jump to answer" link (scrolls the transcript and flashes the turn background `--accent-subtle` for 1.2 s).
- The five dimensions in fixed order: Structure, User focus, Prioritisation, Metrics, Communication. They never reorder by score: consistent positions let users compare across mocks.

### 5.9 Fix card ("3 fixes")

```
1  Pick one segment before listing features
   You said  "I'd build all three and see what sticks."            ← serif italic, secondary bg well
   Instead   Name the segment with the sharpest pain (e.g. first-time sellers), say why,
             then prioritise 2 features against it.
   Dimension: Prioritisation  ·  [Retry with this fix]  (secondary; primary for fix #1)
```
- Numbered 1–3 with a large numeral (title-2, tertiary), not icons. The quote well has `--bg-subtle`, radius 8, padding 12 16, and a 2 px left rule in `--border-strong`. This is the **only** left-rule element, and it is neutral, the classic blockquote mark.
- "Instead" text is body-reading. It **does not write the full answer for the user** (out of scope: "writing answers for the user"); it states the move.

### 5.10 Transcript bubbles

- **Not chat bubbles.** This is an interview transcript, closer to Granola or Otter. Each turn is a block with a speaker label line (caption 12/16 weight 600: "Interviewer" in secondary, "You" in primary, plus a timestamp in tertiary tabular) and text in body-reading 17/26.
- Interviewer turns: no background, text `--text-secondary`-leaning (`#3A3A3F` light / `#D1D1D6` dark), matching Granola's "AI in gray, you in black".
- Your turns: `--bg-subtle` block, radius 12, padding 12 16, full column width (not right-aligned; this is not iMessage).
- Follow-up label: a small caption tag "Follow-up 2" on interviewer turns that are follow-ups. A case variant shows a tag "Variant · constraint changed".
- Voice turns: text streams in word by word (live transcript), with a 2 px accent caret at the end while speaking.

### 5.11 Voice orb and waveform

- **Orb**: 120 px (desktop live mock), 88 px (phone frame), 32 px (inline mini, when the transcript is the focus). A flat filled circle in `--text-primary` at 92 % (light) / `--text-primary` (dark), on a 1 px ring. **No gradient, no glow, no particles.** Apple's Siri orb and ChatGPT's blue orb are the references for behaviour, not for look.
- States:

| State | Visual | Label under orb (callout, secondary) |
|---|---|---|
| Idle / ready | Static, scale 1.0, gentle breathing 0.98↔1.0 over 2.4 s | "Press Space to answer" |
| Interviewer speaking | Orb pulses with TTS amplitude (scale 1.0–1.08); fill `--text-primary` | "Interviewer is speaking" |
| Your turn: listening | Orb **inverts** to a ring (2 px `--accent` stroke, surface fill); an inner circle scales with mic RMS (spring); a red `--live` 8 px dot plus "Recording" appears top-right of the screen | "Listening · Space to finish" |
| Thinking | Ring with a 90° accent arc rotating at 1 rev / 1.2 s | "Thinking…" (if > 1.5 s); if > 5 s: "Still working. Slow connection." |
| Muted / paused | Ring dashed, `--text-tertiary` | "Paused · Space to resume" |
| Error | Ring `--danger`, static | "Mic blocked. Allow microphone in the address bar, or switch to text." plus a button |

- **Waveform** (optional, under the orb while listening): 32 bars, 3 px wide, 3 px gap, radius 1.5, height 4–28 px driven by AnalyserNode, colour `--text-secondary`. It doubles as the mic-check meter on the pre-mock screen.
- Turn-taking is **push-to-talk with Space** (hold or toggle; toggle by default) for reliability in the recorded demo. Auto end-of-speech detection is a later option. A visible key hint is always on screen.

### 5.12 Timer

- Elapsed time, `mm:ss` tabular, callout 14/20 weight 500, `--text-secondary`, top-right of the mock screen. Optional target ("/ 15:00") in tertiary.
- After the target is passed, the text turns `--nudge-text`. **No red, no flashing, no countdown pressure.** (Interviews are about structure, and a ticking red clock is anxiety design.)
- A per-answer mini timer appears only in voice mode, next to "Listening": "0:42".

### 5.13 Toasts

- Bottom-centre (desktop) at 24 px from the bottom; width auto (min 280, max 420); radius 12; level 3; `--bg-elevated`; text callout 14/20; optional single action (plain accent) and close.
- Auto-dismiss after 4 s (8 s with an action); pause on hover; at most one at a time (new replaces old). Enters with fade + 8 px rise over 200 ms; exits 150 ms.
- Copy examples: "Upload added · 18 questions", "Feedback rated. Thanks, it trains the rubric.", "Couldn't reach the model. Using the offline interviewer. [Details]".
- **Never during a live mock.**

### 5.14 Dialogs and sheets

- **Dialog** (centred): width 440 (sm) / 560 (md); radius 16; padding 24; title-3 title; body callout; actions right-aligned, Cancel (plain) left of the primary. Scrim 32 %. Enters with scale .97→1 + fade over 250 ms `ease-enter`. `Esc` closes; focus is trapped; focus returns to the trigger.
- **Side sheet** (desktop): from the right, width 480, full height, radius 16 on the leading corners only, used for upload review and question preview.
- **Bottom sheet** (phone frame): grabber, medium (50 %) and large detents, swipe down to dismiss, and confirm before discarding edits (HIG).
- Never stack: opening a second closes the first.
- **End-mock confirm**: "End mock? 1 follow-up is unanswered. Unfinished mocks aren't scored." Actions: [Keep going] (primary) and [End without feedback] (destructive-plain). The definition of a counted mock is visible here.

### 5.15 Empty states

- Composition (top-offset 80 px, centred, max 400 px wide): a 40 px monochrome line glyph (`--text-tertiary`) or nothing, then title-3 headline, then a one-sentence explanation of *why it's empty* plus *what to do*, then one primary or secondary button.
- Examples:
  - Progress, no mocks: "No scores yet" / "Finish one mock and your first scores land here, by topic and by dimension." / [Start a 10-min mock]
  - Library uploads: "Your casebook, private to you" / "Upload a PDF, DOCX or TXT. We'll pull out the questions; you review them before they're added." / dropzone inline.
- No illustrations of people, no 3D blobs, no emoji.

### 5.16 Skeletons

- `--bg-subtle` blocks matching the real layout (text lines 12 px tall at 60–90 % random widths, radius 4). Shimmer is an **opacity pulse** .6↔1 over 1.2 s, not a moving gradient sweep. Under reduced motion: static.
- Used for: Progress first load (localStorage is instant, so mainly for LLM-driven sections) and the report sections as they stream in.

### 5.17 Nudges and banners

- Inline banner (not a toast, not a modal): full content width, radius 12, padding 12 16, `--nudge-bg` + 1 px `--nudge-border`, 16 px icon (clock or envelope) in `--nudge-text`, then text callout 14/20 primary with the key fact in weight 600, then a trailing action (secondary sm) and a dismiss (icon button).
- Types (from the MVP): **Neglected topic** ("**Metrics** — not practised in 9 days. Last score 2.") [Practise metrics] · **Unread feedback** ("Feedback from Tuesday's RCA mock is unread.") [Open feedback].
- At most **2** on Home; ranked by recency of the problem. Dismiss snoozes for 24 h. A dismissed nudge logs `nudge_acted: false`.
- Info banner variant: `--accent-subtle` bg and accent icon, e.g. "Demo mode: responses are scripted."

### 5.18 Charts, sparklines and the heatmap

- **Sparkline** (topic rows): 80×24 px, last 8 scores, 1.5 px line `--text-secondary`, last point as a 4 px dot in that score's fill colour. A y-domain of 1–5 is fixed (never auto-scaled, which would exaggerate changes). No axes.
- **Trend chart** (Progress, per topic): 100 % × 240 px. X = mock dates (caption), Y = 1–5 with gridlines at each integer (`--chart-grid`, 1 px). Dashed hire-bar line at 4 is labelled "Hire bar". Highlighted topic line 2 px accent with 6 px points, other topics 1.5 px muted. Tooltip: date, score pill, question title. No area fills, no gradients under lines.
- **Dimension heatmap** (topics × 5 dimensions): 36×36 px cells, 4 px gap, radius 6, fill = score tint, numeral centred in score text colour (caption weight 600 tabular). Empty = `--bg-subtle` with "–". Row and column headers in caption secondary. This is the "unknown unknowns" view for Sneha.
- **Before/after** (retry): two short bars per dimension (previous muted, new score colour) with a delta label "+1" in `--positive-text` or "−1" in score-1 text colour; "0" in tertiary.

### 5.19 Progress ring (weekly goal)

- One ring, not three. Diameter 64 px (Home), stroke 6 px, track `--bg-subtle`, progress `--accent`, round caps; starts at 12 o'clock and fills clockwise (HIG). Centre: "2/3" (title-3 tabular). Label: "Reviewed mocks this week". The ring encodes the North Star (a mock counts when finished *and* the feedback is opened).
- Completed: the ring is full and the label becomes "Weekly goal met". There is no confetti; a single 400 ms fill and a one-line toast at most.
- Weekly, not daily: the week resets on Monday. There is no "streak lost" copy anywhere (Mobbin streak study).

### 5.20 Tabs, segmented control, keyboard hints and the dropzone

- **Tabs** (page-level sub-views, e.g. Library: Curated / My uploads): text tabs 14/20 weight 500, 40 px tall, secondary to primary on select, with a 2 px accent underline that slides between tabs over 150 ms. A hairline sits under the tab bar.
- **Segmented control** (mode switch: Text | Voice; time range 2w | 4w | All): 32 px tall; `--bg-subtle` track radius 8 with 2 px padding; the thumb is `--bg-surface` radius 6 with level-1 elevation, label 13/18 weight 500. The thumb slides over 200 ms `ease-standard`. Maximum 3–4 segments, equal width.
- **Kbd hint**: mono 12/16, padding 1 6, radius 4, `--bg-subtle`, 1 px `--border`, text secondary. Keys used: `Space` (talk), `⌘↵` (send), `N` (new mock), `⌘K` (palette), `Esc`, `?` (shortcut sheet).
- **File-upload dropzone**: min-height 160 px, radius 12, 1.5 px dashed `--border-strong`, `--bg-surface`, centred 20 px upload icon plus "Drop a casebook or question list" (headline) plus "PDF, DOCX, TXT or CSV · up to 10 MB · stays in this browser" (footnote) plus [Choose file] secondary. Drag-over: border `--accent` solid, bg `--accent-subtle`. Parsing: a determinate bar plus "Reading page 4 of 22". Done: opens the review sheet ("We found 18 questions. Uncheck any you don't want."). Error: inline danger text with a cause ("This PDF is a scanned image. Try a text PDF or paste questions.").

### 5.21 Feedback rating (trust metric)

- Placed at the bottom of the report, after the fixes, and repeated as a sticky mini-prompt when the user scrolls past the fixes.
- Question: "Was this feedback specific and honest?" with five 40×40 segmented buttons labelled 1 to 5 and end captions "Generic" / "Specific & honest". Optional textarea after selection ("What felt off?" for 1–3).
- Logs `feedback_rated`. After submit, the control collapses to "Rated 4 · Edit".

---

## 6. Screen-by-screen guidance

The demo arc to optimise for (4–5 min): **Onboarding (0:30) → Home (0:20) → Mock setup (0:15) → Live mock, text then voice switch (1:15) → Feedback report (1:00) → Retry with fix plus before/after (0:40) → Progress and nudge (0:30) → Library upload and Settings (0:20).**

### 6.1 Onboarding (3 screens, one question each)

- Layout: no shell; centred 560 px column; 96 px top offset; a step indicator of three 6 px dots (or "1 of 3", caption) top-centre; "Skip" plain at top-right.
- **Screen 1, the promise.** display: "Practise PM interviews. Get scored honestly." Body-reading: "Every mock ends with a 1–5 score on five dimensions and three fixes that quote what you said. Most first mocks land at 2 or 3. That's the point." [Continue]. *Sets the honesty expectation up front; it turns P1 into a promise.*
- **Screen 2, focus.** title-1: "Which topics feel weakest?" Six topic chips (Product design, RCA, Metrics, Guesstimates, Strategy, Tech concepts), multi-select, plus an optional "Interview date" field ("Optional. We'll pace nudges to it."). [Continue]
- **Screen 3, mode and mic.** title-1: "How do you want to answer?" Two large selectable option cards side by side (each 260×140, radius 12): **Voice** ("Closest to the real thing") and **Text** ("Quiet places, quick reps"). Choosing Voice shows an inline mic check (waveform meter plus "Say something…") **before** Chrome's permission prompt, with a pre-permission explanation: "Audio is transcribed in your browser session. Recordings aren't stored." [Start my first mock]. The button goes straight into the mock-setup preview for the weakest selected topic, so time to first question is about 20 s.
- Transitions: cross-fade plus 8 px slide over 250 ms between steps.

### 6.2 Home dashboard

```
Good evening, Ishita                                           Tue 25 Nov
┌─ Next up ───────────────────────────────────────┐  ┌──────────────┐
│ Metrics · Not practised in 9 days · last 2      │  │  ◯ 2/3       │
│ "DAU for Instagram Reels dropped 8% WoW…"       │  │ Reviewed mocks│
│ [Start metrics mock]   Text · ~15 min   Change ▾│  │ this week    │
└─────────────────────────────────────────────────┘  └──────────────┘
[nudge] Feedback from Tuesday's RCA mock is unread.            [Open]
Topics                                                       See progress
 Product design    3.4  ▁▃▅▄   4 days ago
 RCA               2.8  ▂▃▃    2 days ago
 Metrics      ◂ weakest  2.0  ▂▂   9 days ago
 …
Recent mocks
 Swiggy Instamart retention RCA · 3.0 · Tue · feedback read
```
- 8/4 grid. Main column: the **Next up** card (the only primary button on the page), at most two nudges, the topic list (six rows: name, last score pill, sparkline, days since), then the last three recent mocks. Side column: the weekly ring and "This week: 2 mocks · 34 min".
- Greeting: title-1 "Good evening, Ishita", with no emoji, no wave and no "Welcome back!" exclamation. The date is in footnote at the right.
- The "Next up" logic is shown honestly: the subtitle says *why* it was picked ("weakest topic", "unpractised 9 days", or "retry your fix from Tuesday").
- The weakest topic row gets a "Weakest" text tag (nudge colours, caption) and is otherwise identical. No left stripe, no red.

### 6.3 Topic picker / mock setup

- Route `Practice`. Left: the topic list (the same rows as Home, selectable, selected = `--bg-selected`). Right (7/12): the setup panel.
- Setup panel: **Question source** segmented control (Surprise me | Pick | My uploads), then the question preview (title-2, plus source caption "Curated · Asked at Flipkart APM 2024" or "Your upload · ISB casebook p.14"), then a "Shuffle" plain button, then **Mode** segmented (Text | Voice), then **Case variant** chips (optional, off by default), then the estimated duration (footnote) and [Start mock] primary lg.
- **Pre-mock "interview room" screen** (the Headspace start ritual, toned down): full-screen, centred. The question appears in `question` type, then "Take a moment to structure. The interviewer will ask follow-ups." Voice shows the mic meter; both show [I'm ready] (`Space` / `↵`). There is no countdown. This 3–10 s pause makes the switch into "interview mode" feel deliberate, and in the recording it makes the transition legible.

### 6.4 Live mock: text

```
◂ End                     Metrics · Follow-up 1 of 3          ● 06:12 / 15:00   Text|Voice
──────────────────────────────────────────────────────────────────────────────
              DAU for Instagram Reels dropped 8% week over week. Walk me through
              how you'd investigate.                                    (question, sticky, collapses to 1 line on scroll)

              Interviewer · 00:00   (gray text)
              …
              You · 01:10  ┌──────────────────────────────────────────┐
                           │ First I'd clarify the metric definition… │
                           └──────────────────────────────────────────┘
              Interviewer · 04:02 · Follow-up 1
              Suppose the drop is only on Android. What next?

┌────────────────────────────────────────────────────────────────────────┐
│ Type your answer…                                                       │
│                                                     212 words  ⌘↵ Send │
└────────────────────────────────────────────────────────────────────────┘
```
- Focus mode: no sidebar. The top bar is 56 px with a hairline: [End] plain at left; centre "Topic · Follow-up n of N" (callout); right: timer plus the Text|Voice segmented control.
- **Mid-session mode switch** (MVP scope): flipping to Voice keeps the transcript and collapses the composer into the orb row. A toast-free inline line in the transcript notes "Switched to voice · 06:20".
- Interviewer "typing" state: three 6 px dots in `--text-tertiary`, opacity pulse, after 400 ms of latency. If over 5 s, show "Still thinking…" (honest latency; the guardrail is about 5 s).
- When all follow-ups are answered, the top bar's centre changes to "All follow-ups answered" and a primary [Finish & get feedback] appears in the composer footer. This is the counted-mock definition made visible.

### 6.5 Live mock: voice

- Same top bar. The centre stage holds the orb (120 px) at about 38 % of viewport height, the state label below it, and the waveform below that. The **live transcript is shown** in a 680 px column under the orb, scrolling, with the latest two turns visible and earlier ones faded to 60 % (ChatGPT's in-thread voice and transcript lesson).
- A "Recording" pill (`--live` dot plus "Rec", caption) shows top-right while the mic is open, and nowhere else.
- Space toggles talk; `Esc` opens the End dialog. An "Edit transcript" link is available after each of your turns, because speech recognition errors shouldn't be scored as communication errors.
- In demo mode, interviewer speech uses `speechSynthesis` with a chosen calm voice (Samantha/Daniel on macOS). Captions show for every interviewer line.

### 6.6 Feedback report (hero screen)

- Generation state (after Finish): a full-width panel with three determinate stages, each a row with a status glyph (pending circle → spinner → check):
  1. "Reading your answers" (~5 s)
  2. "Scoring five dimensions" (~10–20 s)
  3. "Writing three fixes from your words" (~10–20 s)
  Plus "Usually under a minute." Sections reveal as they complete (streamed): dimension rows first, then fixes. Never show a fake percentage.
- Layout: a 680 px reading column with a 280 px sticky right rail at ≥ 1200 px.
  1. **Header**: caption "Metrics · Instagram Reels DAU drop · 14 min · Text", then `score-xl` "2.6", label "Below the hire bar (4)", and a one-line verdict in body-reading ("Solid hypothesis list; you never prioritised or tied it back to a user.").
  2. **Five dimension rows** (5.8).
  3. **Three fixes** (5.9). Fix 1 carries the page's primary button: [Retry with this fix].
  4. **Transcript** (collapsed accordion "Full transcript · 9 turns"), with each quote linking into it.
  5. **Rate this feedback** (5.21).
  - Right rail: a mini radar of the five dimensions? **No; radar charts are hard to read.** Instead use the five compact pills stacked, "Previous on this topic: 2.0 → 2.6" (delta +0.6, positive text), and [Retry] / [New question] buttons.
- Opening this view logs `feedback_opened`. Scrolling past the fixes counts as "read to the fixes", which is the NSM condition.
- Copy tone: specific and verb-led. Banned: "Great job", "Amazing", "Keep it up", "You've got this".

### 6.7 Retry flow

- [Retry with this fix] opens the same question in focus mode, with a **Focus chip** pinned under the question: "Focus: Pick one segment before listing features" (caption plus accent-subtle bg). This is the only coaching element allowed in a mock, and it is the user's own chosen fix, set before the mock starts, not live coaching.
- The follow-ups may differ (the case variant toggles automatically to keep it honest).
- The report for a retry adds a **Before / After** block at the top: five dimension rows with paired bars (5.18) and deltas, plus a one-liner: "Prioritisation 2 → 4. The fix worked. Structure is unchanged at 3." Logs `question_reattempted`.
- If there is no improvement, say so plainly: "Prioritisation stayed at 2. You named a segment but still listed five features."

### 6.8 Progress tracker

- Page header: "Progress" plus a segmented control (2 weeks | 4 weeks | All).
- Section 1: summary strip (not cards; a single row of 3 stats separated by hairlines): "Reviewed mocks: 9", "Average: 2.9 (+0.4)", "Weakest: Metrics 2.0". Stats use title-2 tabular numbers with footnote labels.
- Section 2: **Topic table**: six rows with topic, mocks, last score, average, trend sparkline, Δ vs the previous period, and last practised. The weakest row is highlighted by its "Weakest" tag and is sorted first by default. Click a row to select it, which updates the trend chart.
- Section 3: **Trend chart** for the selected topic (5.18).
- Section 4: **Dimension heatmap** (topics × dimensions), captioned "Where your points go missing". The lowest cell gets a 2 px `--text-primary` outline and a callout below: "User focus is your lowest dimension across 4 topics."
- Logs `tracker_viewed`.

### 6.9 Question library and uploads

- Tabs: **Curated** | **My uploads**. Filter chips: the six topics plus "Not attempted". A search input (`/` focuses it).
- List rows: question title (headline, 2 lines max), meta (footnote: topic · source · "Attempted 2× · best 3"), and trailing [Practise] plain on hover. Click to open the side-sheet preview with the full prompt, a sample follow-up count and "Start mock".
- My uploads: the dropzone at top (5.20), then the upload list (file name, question count, date, a "Private" lock tag in caption tertiary, and an overflow menu with Rename and Delete; Delete needs confirmation). Copy: "Only you can see uploads. They live in this browser."

### 6.10 Settings and API key

- A single column of 640 px, with grouped sections (iOS grouped-list style: section header caption secondary, rows in one surface card with inset dividers).
- **AI model**: Provider select; API key field (5.2) with helper "Stored only in this browser (localStorage). Never sent anywhere except the provider."; [Test connection] with states *Testing…* → "Connected · 820 ms" (positive text) or "Rejected: check the key" (danger); Speed: segmented "Fast" (default) | "Thorough".
- **Demo**: "Scripted demo mode" toggle (uses canned interviewer and feedback; shows an info banner app-wide when on); "Show phone frame" toggle; "Reset demo data" (secondary).
- **Practice**: weekly goal (stepper 1–7, default 3); nudge after N days (default 7); default mode.
- **Appearance**: Theme segmented (System | Light | Dark).
- **Data**: "Export my data (JSON)" and "Delete all local data" (destructive, with a confirm dialog that requires typing DELETE).

---

## 7. Interaction, motion, accessibility, microcopy

### 7.1 Interaction rules
- Every action responds within 100 ms (a state change, even before data arrives).
- Optimistic writes to local storage; never show a spinner for local operations.
- LLM calls: show a stage label right away. At 5 s add "Still working". At 20 s offer [Use offline interviewer] (scripted fallback). The recorded demo must never hang.
- Keyboard-first: every primary flow can be completed without a mouse. `?` opens a shortcut sheet.
- Undo instead of confirm for reversible actions (dismiss nudge, remove a chip). Confirm only for destructive or lossy actions (delete upload, end an unfinished mock, clear data).
- Hover reveals secondary row actions (Linear pattern), but they are also reachable via focus and the overflow menu.

### 7.2 Motion choreography (what moves, and why)
| Moment | Motion | Duration |
|---|---|---|
| Route change | Content fade + 4 px rise; shell static | 200 ms enter / 120 exit |
| Dialog / sheet | Scale .97→1 + fade / slide from edge | 250 / 150 |
| Row expand | Height + fade of content | 200 |
| Report reveal | Rows stagger 30 ms, bars fill 400 ms | ≤ 600 total |
| Orb | Continuous, amplitude-driven spring | live |
| Weekly ring | Stroke-dashoffset fill once on Home load | 400 |
| Hover / press | Colour only | 100 |
Nothing else animates. No parallax, no scroll-triggered reveals, no number count-up tickers (they delay reading).

### 7.3 Accessibility
- Contrast: body text ≥ 4.5:1 (all text tokens above verified); large text and UI boundaries ≥ 3:1; focus ring ≥ 3:1 against adjacent colours (WCAG 2.4.11/2.4.13).
- Focus: `:focus-visible` ring, 2 px, 2 px offset, on everything interactive; never `outline: none` without a replacement.
- Targets ≥ 24×24 CSS px with spacing (WCAG 2.5.8); primary controls ≥ 36 px tall; phone frame ≥ 44.
- Colour independence: scores always have a numeral; deltas carry a +/− sign; the live mic has a "Rec" text label as well as the red dot.
- Reduced motion: see 3.7. Also honour `prefers-reduced-transparency` (the tab bar blur becomes solid).
- Screen readers: the orb is a `role="status"` live region announcing state changes ("Listening", "Interviewer speaking"). The transcript is an `aria-live="polite"` log. Score pills read "Structure: 2 out of 5, weak". Charts have a visually hidden data table.
- Voice is never the only path: text mode is always one click away, and the mic error state offers "Switch to text".
- Language: `lang="en-IN"`; spelling is British/Indian ("prioritise", "practise" as the verb).

### 7.4 Microcopy (direct, honest, coach-like)
Voice: a senior PM who respects your time. Short sentences. Specific nouns. Numbers over adjectives.

| Situation | Write | Don't write |
|---|---|---|
| Low score | "2 — You listed six features and never chose one." | "Good effort! There's room to grow 🚀" |
| High score | "4 — Clear funnel, and you tied the metric to the user's goal." | "Amazing job!!! You nailed it 🎉" |
| Nudge | "Metrics — not practised in 9 days. Last score 2." | "We miss you! Don't break your streak 🔥" |
| Empty | "No scores yet. Finish one mock and they land here." | "Nothing to see here… yet! ✨" |
| Error | "Couldn't reach the model. Your answer is saved. [Try again] [Use offline interviewer]" | "Oops! Something went wrong." |
| Loading | "Scoring five dimensions" | "Loading…", "AI is thinking ✨" |
| Primary CTA | "Start metrics mock" | "Let's go!", "Get started now" |
| Upload privacy | "Only you can see this. It stays in this browser." | "Your data is 100% secure 🔒" |

Banned words and devices: emoji anywhere in the UI, exclamation marks (except in the user's own content), "AI-powered", "magic", "supercharge", "unlock", "seamless", "journey", "Oops", sparkle icons (✨ / `Sparkles`) for AI.

---

## 8. Implementation stack (frontend only)

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + React 18/19 + TypeScript** | The fastest local dev loop; coding agents produce it reliably; no server needed for `localhost`. |
| Styling | **Tailwind CSS v4** with tokens in CSS variables (`@theme` maps `--color-*`, `--radius-*`, `--font-*`) | Tokens live once in `tokens.css`; Tailwind utilities reference them; dark mode is a token swap, not class duplication. **Forbid arbitrary hex values** in classNames (lint rule or review). |
| Primitives | **Radix UI via shadcn/ui, re-skinned** (Dialog, Popover, DropdownMenu, Tabs, ToggleGroup, Tooltip, Switch, Accordion) | Radix gives correct focus trapping, `Esc`, ARIA and roving tab index; shadcn copies the source in, so every class can be rewritten. **Do not keep shadcn's default look** (zinc palette, `rounded-md` everywhere, `shadow-sm` cards). It is the most recognisable AI-template look. Treat shadcn as accessible scaffolding only. |
| Command palette | `cmdk` | Linear/Raycast-grade palette with little code. |
| Toasts | `sonner`, restyled to 5.13 | Good stacking and pause-on-hover behaviour; restyle fully. |
| Motion | `motion` (Framer Motion) for the orb, sheet and layout transitions; CSS transitions for everything else | Springs for the amplitude-driven orb; `useReducedMotion` built in. |
| Charts | **Hand-written SVG components** for sparkline, score bar, ring, heatmap and before/after; **Recharts** only for the trend chart (or also hand-roll it) | These charts are tiny and stylised. A library's defaults (legends, tooltips, colours) fight the design. Recharts is the safest React option if one is needed, with every default overridden. |
| Icons | **Lucide** at `strokeWidth={1.5}`, sizes 16/18/20 only, in `currentColor` | The closest open-source match to SF Symbols' line weight. SF Symbols cannot be licensed for web use. Use icons only for nav, standard actions and status, never as decoration. (Phosphor "regular" is an equal alternative.) |
| State | **Zustand** + `persist` middleware → localStorage (profile, mocks, scores, settings); **idb-keyval** → IndexedDB for uploaded files and parsed text | Simple, typed, no boilerplate; IndexedDB handles multi-MB casebooks that localStorage (about 5 MB) cannot. |
| Routing | React Router (or TanStack Router) | Deep links for each screen let the recording cut cleanly. |
| Voice | Web Speech API (`webkitSpeechRecognition`, Chrome) for speech-to-text; `speechSynthesis` for the interviewer voice; Web Audio `AnalyserNode` for the meter and orb | Zero backend; works on localhost in Chrome. Later, swap in provider STT/TTS behind the same interface. |
| Parsing uploads | `pdfjs-dist` (PDF), `mammoth` (DOCX), plain text/CSV natively | Client-side only. |
| LLM | A thin `llmClient` interface with a `ScriptedProvider` (demo) and a `CloudProvider` (fetch to the provider with the user's key) | Graceful degradation, and a deterministic recording. |
| Fonts | System stack; `@fontsource/source-serif-4` (400, 400 italic) | One small self-hosted file; no Google Fonts call at runtime. |
| Quality gates | ESLint + `eslint-plugin-jsx-a11y`; Prettier; a `tokens.test.ts` that asserts contrast ratios of token pairs | It keeps the design system honest as the agent generates code. |

---

## 9. Pattern-borrowing table

| Product | Pattern we borrow | Where we use it | What we explicitly *don't* borrow |
|---|---|---|---|
| **Apple Notes / Things 3** | Calm hierarchy: big title, plain list rows, inset hairline dividers, near-zero chrome; restraint ("unrivalled simplicity" per Cultured Code) | Sidebar, topic list, Settings grouped rows, page headers | Skeuomorphic textures |
| **Linear** | Neutral LCH-style grays with the accent's influence limited; 32 px dense nav rows; `⌘K` palette; hover-revealed row actions; keyboard shortcuts with visible hints | Shell, command palette, Library rows, kbd chips | Dark-by-default and indigo accent |
| **Stripe Dashboard** | Data clarity: tabular numbers, one highlighted series with others muted, fixed axes, perceptually balanced colour ramps (Stripe's accessible colour system) | Progress table, trend chart, score palette construction | Dense multi-chart grids |
| **Granola** | AI text in gray, your text in black; summary lines link back to the transcript | Transcript styling; feedback evidence quotes that jump to the turn | Meeting-bot flows |
| **Otter / Superwhisper** | Live transcript streaming under a recording indicator; a minimal recording surface | Voice mock transcript plus "Rec" pill | Speaker-ID clutter, timeline scrubbers |
| **ChatGPT Voice (in-thread, Nov 2025)** | Voice lives *inside* the conversation with a live transcript, and switches in and out without leaving the thread | Text ↔ Voice segmented switch mid-mock, with the transcript preserved | The glowing blue orb aesthetic |
| **Siri / ChatGPT orb** | Orb states mapped to turn-taking: speaking, listening (reacts to your voice), thinking | Voice orb behaviour (5.11) | Gradients, glow, particle effects |
| **Headspace** | A start ritual: a calm pre-session screen with one instruction and a "ready" action | Pre-mock "interview room" screen | Illustrated characters, pastel palette |
| **Apple Fitness rings** | A closed-ring goal that resets each period and gives a fresh start | Weekly "Reviewed mocks" ring (one ring, weekly) | Three concentric rings, daily pressure, celebration animations |
| **Duolingo** (toned down) | Low minimum to count a session; forgiveness | Weekly goal (default 3), snoozable nudges, no "streak lost" | Flames, mascots, guilt notifications, XP |
| **Notion** | Empty states that teach by doing, with one action (templates / checklist instead of a blank page) | Empty Progress / Library / first-run Home with "Start a 10-min mock" | Emoji page icons, cover images |
| **Exponent (Aced) / interview rubrics** | Fixed-dimension rubric scoring, the same dimensions every time for comparability | Five fixed dimension rows in a fixed order | Video-course layout |
| **Yoodli** | Post-session analytics report and a cross-session progress dashboard on a few chosen metrics | Report → Progress continuity; "previous on this topic" delta | Filler-word gamification, video/body language (out of scope) |
| **Intercom / Arc onboarding** | One question per screen; onboarding as a short questionnaire, not a tour | Three-step onboarding | Mandatory account creation (deceptive.design critique of Arc) |
| **Material 3** | Tonal surface elevation, state-layer opacities, motion easing tokens, window-size-class navigation | Tokens (section 3), rail ↔ sidebar ↔ tab bar | FAB, Material ripple, 28 px radii |

---

## 10. Anti-slop checklist

Run this on every screen before calling it done. Each line is a visible tell of AI-generated UI, followed by what to do instead.

| # | Tell | Do instead |
|---|---|---|
| 1 | Purple/indigo/violet gradients (`from-purple-600 to-blue-600`) in heroes, buttons, logos | Solid fills only. One accent (`#0A5FD6`). Hue 240–300° banned. Zero `linear-gradient` in the codebase except the skeleton (and that's an opacity pulse) |
| 2 | Inter (or Geist) as the only face, default weights | System font stack (SF Pro), a tuned type scale with negative tracking on large sizes, and one purposeful serif for quotes |
| 3 | Emoji in headings, cards, buttons, toasts ("🚀 Get started", "✨ AI feedback") | No emoji in UI. Use words and, at most, a 16–20 px line icon |
| 4 | Icon-in-a-pastel-rounded-square at the top of every card | No card header icons. Titles carry meaning; icons appear only where they speed recognition (nav, actions) |
| 5 | Three (or six) identical feature cards in a grid, same padding, same height | Rows and lists; vary size by importance. One hero element per screen (the Next-up card, the score) |
| 6 | Uniform 16 px radius on everything | A radius scale by role: 8 controls, 12 cards, 16 dialogs, full pills |
| 7 | Glassmorphism: `backdrop-blur` panels over colourful blobs | Opaque surfaces. Blur only on the phone-frame tab bar, over plain content |
| 8 | Coloured left-border stripe on cards and alerts | Tinted banner background plus icon plus text, or a "Weakest" text tag |
| 9 | Drop shadows on every card, lifting on hover | Hairline borders; shadows only on floating layers; hover = background tint |
| 10 | Rainbow chart series and multi-colour topic tags | One highlighted series plus muted others; monochrome topic chips |
| 11 | Traffic-light red/yellow/green scores | Orange → sand → teal CVD-validated scale, always with numerals |
| 12 | Big-number "stat cards" with arrows and no meaning ("+12% 📈") | Stats in context: "Average 2.9 (+0.4 vs previous 2 weeks)", plus a next action |
| 13 | Generic hype copy ("Unlock your potential", "AI-powered insights") | Specific, plain copy with numbers ("3 fixes that quote what you said") |
| 14 | "Sparkles" icon / magic-wand to mean AI | No AI iconography. The product *is* the interviewer; call it "Interviewer" |
| 15 | All-caps tracked-out eyebrow labels above every heading | Sentence-case captions only where needed |
| 16 | Everything fades/slides in on scroll with the same timing | Motion only for state change (section 7.2); nothing animates on scroll |
| 17 | Happy-path only: no empty, loading, error or offline states | Every screen ships with empty, loading (staged), error (cause plus action) and offline-fallback states |
| 18 | Dashboard-template layout: KPI row, chart, table, all equal weight | One question per screen: "What should I practise next?" (Home), "How did I do?" (Report), "Am I improving?" (Progress) |
| 19 | Default shadcn look (zinc grays, `rounded-md`, `shadow-sm`, default focus ring) | Re-skinned to our tokens; zero untouched shadcn defaults |
| 20 | Avatar placeholders, fake testimonials, 3D illustrations, stock gradient mesh | Real seeded data (realistic ISB names, real-sounding PM questions); no illustration |
| 21 | Centred everything, with huge hero text on app screens | Leading-aligned content (HIG: top-leading is most important); centred only in onboarding and empty states |
| 22 | Toast spam ("Saved!", "Updated!") | Silent success for local writes; toasts only for things the user can't see happen |

**Squint test:** blur the screenshot. You should see one dark text mass (the content), one blue element (the primary action) and, on report or progress screens, a few warm/teal score marks. If you see more than one blue thing, or any colour that isn't a score, an action or a nudge, remove it.

---

## 11. Sources

Apple Human Interface Guidelines (fetched via the HIG JSON data endpoints):
- Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Color: https://developer.apple.com/design/human-interface-guidelines/color
- Buttons: https://developer.apple.com/design/human-interface-guidelines/buttons
- Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Progress indicators: https://developer.apple.com/design/human-interface-guidelines/progress-indicators

Material Design 3:
- Typography / type scale tokens: https://m3.material.io/styles/typography/type-scale-tokens and https://github.com/material-components/material-components-android/blob/master/docs/theming/Typography.md
- Colour roles and tones: https://github.com/material-components/material-components-android/blob/master/docs/theming/Color.md
- Motion easing and duration tokens: https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- State layer opacities (Flutter M3 token data): https://flutter.googlesource.com/mirrors/flutter/+/HEAD/dev/tools/gen_defaults/data/state.json
- Window size classes and navigation: https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation and https://developer.android.com/reference/kotlin/androidx/compose/material3/windowsizeclass/package-summary
- Shape and elevation scale (secondary confirmations): https://pub.dev/packages/material_design ; M3 Expressive rail change: https://9to5google.com/?p=672452

Products and patterns:
- Linear redesign (LCH, three-variable themes, Inter Display): https://linear.app/now/how-we-redesigned-the-linear-ui
- Stripe accessible colour systems: https://stripe.com/blog/accessible-color-systems
- Granola design (AI text gray, user text black): https://techcrunch.com/2024/05/22/granola-debuts-an-ai-notepad-for-meetings and https://nesslabs.com/granola-featured-tool
- ChatGPT Voice inside chat with a live transcript (Nov 2025): https://techcrunch.com/2025/11/25/chatgpts-voice-mode-is-no-longer-a-separate-interface/ and https://www.macrumors.com/2025/11/26/chatgpt-voice-mode-update-seamless-chat/
- Streak design study (859 designs): https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs ; Duolingo streak: https://blog.duolingo.com/how-duolingo-streak-builds-habit ; Smashing on streaks / Apple rings: https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/
- Headspace design analysis: https://blakecrosley.com/guides/design/headspace
- Things 3 / Cultured Code (restraint, ADA): https://apps.apple.com/us/story/id1462498106
- Notion onboarding and empty states: https://goodux.appcues.com/blog/notions-lightweight-onboarding ; Vercel empty-state guidance: https://vercel.com/design/empty-state ; Atlassian: https://atlassian.design/content/designing-messages/empty-state
- Exponent AI mocks and rubrics: https://www.tryexponent.com/practice/ai-mock-interviews and https://www.tryexponent.com/courses/google-pm-interview/product-sense/product-sense-rubric
- Final Round AI practice interview: https://www.finalroundai.com/en/ai-mock-interview
- Yoodli reports and progress: https://yoodli.ai/use-cases/toastmasters
- Arc onboarding critique: https://deceptive.design/articles/arc-browsers-pushy-account-requirements ; Intercom one-question onboarding: https://supademo.com/content/plg-onboarding-gallery/intercom

Anti-slop:
- https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c
- https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono
- https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list
- https://uxdesign.cc/ai-design-isnt-ugly-it-s-fluent-and-that-s-the-problem-131b2f4eb78c

Accessibility:
- WCAG 2.2 What's new: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- Focus appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance ; https://sarasoueidan.com/blog/focus-indicators/

Fonts:
- Geist (for comparison): https://vercel.com/font ; Source Serif 4 via Fontsource: https://fontsource.org/fonts/source-serif-4

Colour validation method: WCAG 2.x relative-luminance contrast; Machado, Oliveira & Fernandes (2009) CVD simulation matrices at severity 1.0; CIELAB ΔE76. The script was run locally on every token listed in section 3.1.
