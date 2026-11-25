# docs/ — planning pack for the SWPM term-end demo

Read in this order:

| # | File | What it is | Lines |
|---|---|---|---|
| 1 | `MASTER_PLAN.md` | **Source of truth.** Final plan from the planning council: decision log (D-01…D-44), product, design system, screens, flows, AI design, scoring, data model, analytics, architecture, milestones M0–M8, demo script, deck support, risks. | ~2,650 |
| 2 | `BUILD_PROMPT_STRUCTURE.md` | Skeleton of the prompts: (A) the master prompt for the coding agent, (B) the runtime system prompts for interviewer / planner / grader / coach / progress analyst with JSON schemas, (C) the per-milestone prompt template. Parts are tagged `[DRAFTED]`, `[SKELETON]` or `[TO FILL]`. | ~820 |
| 3 | `00_CONTEXT_BRIEF.md` | One-page brief of the course material that every agent started from. | 70 |
| 4 | `research/01_UI_DESIGN_SYSTEM.md` | Apple HIG / Material 3 research, tokens, components, pattern-borrowing table, anti-slop checklist. | ~820 |
| 5 | `research/02_FLOWS_AND_JOURNEYS.md` | Pain → evidence → flow traceability, persona journeys, 15 flows, edge cases, state machine, demo script, seed data. | ~1,240 |
| 6 | `research/03_FEATURES_AND_ARCHITECTURE.md` | Feature specs, deck feature table, content model + sample questions, rubric, data model, architecture. | ~2,250 |
| 7 | `research/04_AI_INTERVIEW_LANDSCAPE.md` | Competitors, complaint themes, AI interviewer/grader playbook, multi-agent design. Prices and some claims need verifying before the deck. | ~520 |
| — | `source-text/` | Plain-text extracts of the assignment PDFs/PPTX in the parent folder. | — |

Where the research docs disagree with `MASTER_PLAN.md`, the master plan wins.
