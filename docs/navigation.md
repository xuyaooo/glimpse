# Navigating Glimpse

Two modes. The **child** never sees a menu: the paper, one mouse button and their voice drive everything. **Adults** (teacher, NGO, jury) get a top navigation, reached through "Teacher area" on the start screen.

```
CHILD (full screen, no menus)

  /  Start ──tap a name──▶ /setup  Setup check ──Start writing──▶ /desk  Desk ──Finish──▶ /summary  Summary
  ▲                                                                │  ▲                          │
  │                                                     hold A /   │  │  let go                  │
  │                                                     side button▼  │                          │
  │                                                          Asking a question                   │
  │                                                          (a state of /desk, not a page)      │
  └─────────────────────────────── "I'm done" ◀────────────────────────────────────────────────┤
                                                        "Another round" ──▶ /desk ◀─────────────┘

ADULTS (top navigation: Class · Misconceptions · System and cost · Back to the desk)

  /  ──Teacher area──▶ /teacher  Class overview ──pick a child──▶ /teacher/students/:id  Child detail
                       /teacher/misconceptions   Misconception library
                       /teacher/system           System and cost
```

## Routes

| Route | Screen | Who | Reached from | Goes to |
|---|---|---|---|---|
| `/` | Start: who's at the desk? | child | app open, "I'm done" | Setup (tap a name), Teacher area |
| `/setup` | Setup check: camera, markers, light, button, mic, worksheet, language | child + adult, once per session | Start | Desk ("Start writing"), back to Start |
| `/desk` | Desk: live paper, explanation, spoken hint | child | Setup, "Another round" | Summary ("Finish") |
| `/desk` while asking | Desk: pointing + listening state | child | hold A / side button | back to Desk on release |
| `/summary` | What clicked today, problems done | child | Desk | Desk ("Another round"), Start ("I'm done") |
| `/teacher` | Class overview: written weekly summary, children table, who needs you, common misconceptions | adult | Start ("Teacher area", "Add a child") | Child detail, Library |
| `/teacher/students/:id` | Child detail: skills, misconception timeline, sessions | adult | Class overview (child's name) | breadcrumb back to Class |
| `/teacher/misconceptions` | Misconception library: each bug as code, AI-found ones to approve | adult | top nav, "Open the misconception library" | |
| `/teacher/system` | System and cost: the cascade, cost per hour, latency, every big-model call | adult, jury | top nav | |

Rules:

- `/setup`, `/desk` and `/summary` need a chosen child. Without one they go back to `/`. While developing, add `?student=amara` to open them directly.
- Unknown URLs go to `/`.
- The teacher area keeps "Class" highlighted on a child's page, since that's where it lives.

## Inputs on the Desk

| Input | What it does |
|---|---|
| Lifting the pen and pausing (engine, later) | The line is read and checked automatically |
| Thumb button (`C`, or `Space`) | "Check my line" now |
| Holding the side button (`A`) | Listen while pointing at the paper. Letting go sends the question |
| Pointing with a finger | Chooses what the question is about. The paper highlights it |
| "Did you write 5/8?" Yes / No | Shown when the reader isn't sure, before anything is sent to a big model |
| "Show me the next step" | Steps through the explanation |
| Speaker button | Says the hint again |

The engine decides what the screen shows by sending events (see [protocol.md](protocol.md)); the web app never decides whether an answer is right.
