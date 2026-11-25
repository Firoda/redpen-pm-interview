# Context Brief — PM Mock Interview Companion (SWPM term-end demo)

Shared brief for every research agent and the planning council. Source text lives in `docs/source-text/`.

## 1. What is in this folder

| File | What it is |
|---|---|
| `SWPM_Assignment1_Personas_and_Problem_Hypotheses_Aditya_Firoda.pdf` / `.docx` / `Assignment 1 - ....pdf` | Individual Assignment 1: 5 interviews with working professionals (Jinendra, Dhanush, Vinay, Manraj, Pritish), 3 personas (Rahul, Sneha, Karan), 4 JTBDs, 4 problem hypotheses, full transcripts + affinity map. Text: `docs/source-text/assignment1_personas_hypotheses.txt` |
| `GAME_Framework_Filled.pptx` / `GAME_Framework_v2.pptx/.pdf` | Team assignment: GAME framework (Goal–Action–Metric–Evaluate), North Star Metric, strategy, MVP scope, roadmap, backlog. Text: `docs/source-text/game_framework_nsm_strategy_roadmap.txt` |
| `Final Demo/SWPM Hyd - Term End Product Presentation.pptx` | Empty template for the graded final: 10 sections + a recorded product walkthrough. Text: `docs/source-text/final_demo_template.txt` |

Team: Kartik Vashist, Geetanjan Roy, Aditya Firoda, Ananya Agarwal, Keerthana Gottipati. Course: Software Product Management, ISB Hyderabad, Prof. Chandrashekhar V.

## 2. The product (as defined by the team)

**Personal Interview Practice Companion — an always-available PM mock interviewer.**
For ISB PGP students in placement season. Candidates take **voice or text** mocks drawn from curated PM resources and **their own casebooks** (product design, RCA, metrics, guesstimates, strategy, tech concepts), get **strict, rubric-based feedback at the end of every mock**, and see **scores tracked topic by topic**, with **nudges for neglected topics**.
Positioning: "Unlike general AI, it doesn't praise and forget; unlike peers, it needs no booking." Win thesis: **honest feedback, on demand, that remembers.**

### Personas (team research, 24 candidates)
- **Ishita — the mock-heavy PM aspirant (MVP primary).** Does several mocks a week, 1–2 h/day around classes; wants honest, specific feedback.
- **Rohan — the short-notice multi-tracker (Phase 2).** Interview 2–3 days out, multiple tracks, needs JD/company tailoring.
- **Vikram — working professional switching roles (Later).** Maps to Aditya's individual personas below.

### Personas (Aditya's individual research, working professionals)
- **Rahul** — comfortable long-tenure professional; overwhelmed, drops prep midway; needs a structured plan per round type that fits evenings.
- **Sneha** — function switcher (ops/eng → PM/consulting); unknown unknowns ("missed my radar"), non-expert feedback, "I never knew that I am ready".
- **Karan** — breadth-first generalist; startup processes are a "black box", no story bank, "Chaos".

### Problems (team numbering, frequency out of 24)
- **P1 Honest, role-aware feedback** — 18/24. "AI tools are a bit submissive"; general AI says "yeah, you're doing good".
- **P2 JD/company tailoring** — Rohan, Phase 2.
- **P3 See whether I'm improving / what to fix next** — 12/24; manual error logs; "you give me 10 minutes of feedback, I note four or five lines". Riskiest goal (stated more than shown).
- **P4 Practise whenever I'm free** — 11/24; seniors booked "15 days in advance"; paid case bot has ~1 min voice lag.
- Realism raised by 8/24 (covered by voice).
- Spend seen: ChatGPT Go ~₹400/mo, Claude ~₹25,000/yr, ₹50,000 coaching package.

### GAME goals → metrics
1. Honest feedback → feedback read rate, feedback trust score (% rated 4–5 on "specific and honest"), fix-applied rate (re-attempt within 72 h), fix uplift. Guardrails: AI scores within ±1 of senior mocks; feedback within 2 min.
2. Practise whenever free → mock completion rate, mocks per active user (3+/wk), second-mock rate (≥40% within 7 days = MVP pass), time to first question. Guardrail: voice reply < ~5 s. A mock counts only if all follow-ups answered.
3. See improvement → tracker engagement, nudge conversion (mock within 48 h), weak-topic follow-through, improvement (weakest topic +1 in 14 days), willingness to pay (ask after mock 5).

**North Star: Weekly Reviewed Mocks** = mocks completed (all follow-ups answered) AND feedback opened to the fixes, per week. Inputs: breadth (weekly active candidates), depth (3+/user/wk), frequency (2nd mock in 7 days ≥40%), quality (feedback rated 4–5).

### MVP1 scope (must ship)
1. Topic + mode: 6 PM topics; voice or text, switchable mid-session; 15+ questions per topic.
2. Own uploads: questions or casebooks, private to the user.
3. Full mock: follow-ups that respond to the answer; case variants that change user, market or constraint.
4. Feedback within 2 min: 1–5 score with reason on 5 dimensions (structure, user focus, prioritisation, metrics, communication) + 3 fixes quoting the user's words.
5. Progress tracker: score trend per topic, weakest topic highlighted.
6. Home dashboard: nudge when a topic unpractised 7 days or feedback unread.
7. Feedback rating + event tracking. 8. (Should) One-tap retry of a question with the fix.

Events: `mock_started`, `mock_completed`, `feedback_opened`, `feedback_rated`, `question_reattempted`, `tracker_viewed`, `nudge_sent`, `nudge_acted`.

Out of scope MVP1: case-buddy matching, JD/company tailoring (Phase 2); consulting/GM/finance tracks, payments (Later). Never: video/body-language, resume tools, writing answers for the user, live in-mock coaching, replacing human mocks.

Roadmap: NOW trustworthy PM practice · NEXT prep for this role at this company (JD sets, 2–3 day short-notice plan, buddy matching, calibration panel) · LATER beyond PM/campus, premium tier (full history, unlimited voice).

## 3. Final demo requirements (graded)
- 10-min deck (10 sections: problem, personas, competitors, solution + customer narrative with UI, MVP goals/non-goals, MVP feature table [name · core functionality · telemetry · error cases], roadmap MVP2/MVP3 with release metrics, metrics, pre-mortem, GTM, monetisation) + **4–5 min recorded product walkthrough with voice-over**.
- "No hosted product is required. You can run the product in your localhost… **Don't make it completely stubbed, some features need to work end-to-end.** Focus on the entire customer journey of **onboarding**, parts of product where they get value (**activation**) and any potential **hooks** to bring them back."

## 4. Build constraints from Aditya (this phase)
- **Frontend only**, runs in the browser (Chrome) on localhost; desktop browser first, maybe a phone-frame section. No backend.
- **Local memory**: all state in the browser (localStorage / IndexedDB). Seeded demo data allowed.
- **AI**: a cloud LLM API called from the browser, low-thinking / fast settings — wiring is for a later phase, but the architecture must plan for it (and must degrade gracefully / have a scripted fallback for the recorded demo).
- **Design quality**: must not look like AI-generated slop. Learn from Apple HIG and Material Design 3; borrow good patterns from real products. Clear, calm, low cognitive load — anyone doing PM practice should get it immediately.
- This phase = research + a very detailed plan + the initial structure of the build prompt. No code yet.
