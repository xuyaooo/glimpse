# Navigating Glimpse

Three pages in the sidebar, plus the camera window.

| Sidebar | Route | Who |
|---|---|---|
| Home | `/` | the child (picks their name the first time) |
| My work | `/work` | the child: past exercises and the reasoning behind each |
| Tutor view | `/dashboard/:student` | tutor, teacher, parent, NGO. "End session" also opens it |
| (Continue / Open camera) | `/scan` | the camera as a whole window |

## Home

```
┌ sidebar ┐                                                  [search] [bell] (A)
│ Home    │ Good evening, Amara! 👋                      Alps, pine forests, Glim
│ My work │ It clicked! Keep going.                       holding a star
│ Tutor   │ ┌ ring: right today │ right in a row │ points ┐ ▂▄▆█
│ view    │ └──────────────────────────────────────────────┘   ┌ Choose a practice ─┐
│         │ ┌ Continue your practice ············ View all → ┐ │ Maths   3 to try  ✓│
│  Alps   │ │ the paper on the desk   Maths                  │ │ Reading           >│
│  + flag │ │                         Adding fractions       │ │ Science           >│
│ Level 2 │ │                         4 lines in 6 min ●●●●  │ └────────────────────┘
│ ▓▓▓░░░  │ │                         [ ▶ Continue ]         │ ┌ Your achievements ─┐
└─────────┘ └────────────────────────────────────────────────┘ │ ★  ▣  ♛  🔒        │
                                                               └────────────────────┘
```

- **Continue** (Start before the first line) opens the camera window. With nobody picked yet it asks who's writing first.
- **Choose a practice**: pick the subject, Maths, Reading or Science. *Continue your practice*, the breadcrumb on My work and the camera window follow it, and the engine is told (`subject`). After a mistake, the current subject shows how many similar exercises are waiting ("3 to try").
- **Your achievements**: First tick, Fixed it (right after a mistake), 3 in a row, Curious (asked a question). Locked ones are grey with a padlock.
- **Level** (sidebar): 10 points per right line, a new level every 50.
- **View all** and the search box go to My work. The bell opens the camera on the next similar exercise.

## The camera window (`/scan`)

- Full screen button; Esc or "Home" goes back.
- **Left, live camera** (the MX Brio, opened by the browser). The line being read lights up; a right line gets a tick, a wrong one an orange circle. The tutor draws next to the paper: an arrow to **pizzas** (pictures) or **chocolate bars** (fraction bars) or a sticky-note worked example, with the current step written underneath. Answers to questions are drawn there too. Below the picture: every line the camera captured.
- **Right, digital**: what the camera saw for the line (a crop of the real handwriting) → what was read, typeset, with how sure the reader is; right or not yet and why; **What's going on** in plain words; the explanation steps in time with the drawing; similar exercises; every line.
- Top bar: pick the camera, **Read when I lift my pencil** (the browser notices the pencil stop moving; on by default with a real engine, off in demo mode), turn the picture upside down, print the sheet, full screen.
- It opens by itself when the reader isn't sure ("Did you write this?") or when the child starts asking.

## My work (`/work`)

- **Past exercises**: every line, newest first, right or not yet, with the reason. Pick one and the whiteboard redraws the reasoning given for it, step by step.
- **Summary / Explanation**: what we learned and key ideas; which teaching style was used and why ("Pictures didn't click yet, so this time: fraction bars"), what works for this child, and *Next step* (the next similar exercise).
- Open camera and End session sit next to the breadcrumb.

## Inputs

| Input | What it does |
|---|---|
| `W`, `C` or `Space`, or "Read my line now" | in the camera window: this line is finished, read it now. On Home or My work: open the camera |
| hold `A`, or "Hold to ask" | point at the paper and ask; letting go sends the question |
| `Esc` or "Home" | leave the camera window |
| avatar (top right) | change who's writing |

The engine detects finished lines (pencil lifted) and questions (finger pointing + speech) by itself; these are the manual fallbacks and drive demo mode.

## Handy URLs

| URL | What it does |
|---|---|
| `/?demo` | demo mode without waiting for an engine |
| `/?demo&student=amara` | skip the name picker |
| `/?demo&student=amara&autoplay` | hands-free: writes a line every few seconds (booth, backup video). Works on `/work` too |
| `/scan?demo&student=amara` | the camera window directly; add `&autoplay` for hands-free, `&paper` for the drawn paper instead of the camera |
| `/worksheet` | the printable A4 sheet: its lines sit where the camera frame expects them |

## Tutor view

Students on the left ("Now" for the child in this session, "Needs you" when a mistake keeps coming back). For the chosen student: a written summary with today's ring and numbers; what they wrote; what teaching works for them; misconceptions (fixed or still working on it); what to practise next; AI usage; questions they asked; sessions.
