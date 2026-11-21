# Glimpse

A webcam tutor that watches a child write maths on paper, shows on screen what it read, checks it, and when it's wrong, teaches it visually in the way that works for that child and hands over a similar exercise.

LauzHack 2026, for the Logitech, AXA, IMC and Scholé challenges. Spec: [docs/spec.md](docs/spec.md) (v2).

## How it's used

Three pages and the camera window ([docs/navigation.md](docs/navigation.md)):

- **Home** `/`: the greeting over the Alps; today's numbers (right today, right in a row, points); *Continue your practice*, whose **Continue** button opens the camera; on the right **Choose a practice** (Maths, Reading, Science) and *Your achievements*. The sidebar shows the child's level.
- **Camera window** `/scan`: the live webcam on the left with the teaching drawn straight onto it (pizzas, chocolate bars, ticks and circles on the paper), and on the right the digital side (the camera's crop of each line, what was read, why it's right or not, and *What's going on* in plain words). Print the matching sheet from `/worksheet`. The child can point at the paper and ask at any time.
- **My work** `/work`: *Past exercises* and, next to them, the **whiteboard** that redraws the reasoning given for the selected one, with *Summary / Explanation* tabs and the next similar exercise.
- **Tutor view** `/dashboard/:student`: a summary per student. What they wrote, what went wrong and whether it got fixed, which teaching style works for them, what to practise next, the questions they asked, AI cost.

## What's in the repo

| Folder | What | Status |
|---|---|---|
| `web/` | the pages. Vue 3, Tailwind CSS v4, Vite (Node.js), TypeScript, KaTeX | built; runs on a scripted demo engine |
| `docs/` | spec, navigation, [what the web app expects from the engine](docs/protocol.md) | |
| `engine/` | v1 Python prototype (fractions checker, misconception library) | **old protocol**: don't run it alongside the web app until it's updated to `docs/protocol.md` |

## Run the web app

Needs Node 20 or 22 (Vite 6 warns on Node 21 but works).

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

With no engine running, the app switches to **demo mode** after 1.5 s (or straight away with `/?demo`). Pick Amara (the demo script is maths; Reading and Science can be picked but the demo tutor only answers maths), then:

- Press **Start** / **Continue** to open the camera window. There, `W`, `C` or `Space` (or "Read my line now"): the child lifts the pencil and the next line appears.
- Hold `A` (or "Hold to ask"): the child points at the paper and asks.
- Or open `/?demo&student=amara&autoplay` and watch it play by itself.

The demo script: 1/5 + 2/5 = 3/5 is right. 3/4 + 1/2 = 4/6 is wrong (adds the tops and the bottoms), taught with pictures, three similar exercises. 2/5 + 1/3 = 3/8 is wrong again, so the next explanation switches to fraction bars. 1/2 + 1/3 = 5/6 is right: it clicked. 2/3 + 1/6 = 5/6 is read with low confidence, so the child confirms it. Hold `A` any time to ask "pourquoi c'est faux ?". Then "End session" opens Amara's dashboard.

When an engine speaking `docs/protocol.md` runs on port 8000, Vite proxies `/ws`, `/api` and `/video.mjpg` to it and the app uses it instead.

## Design

Follows the team's reference images (`home.jpg` for Home, `design.jpg` for the rest): a sunny Swiss study desk. Tokens live in `web/src/style.css`:

- Sky background with drifting clouds, Alps and pine forests behind the greeting on Home, a deep-blue sidebar ending in mountains with a Swiss flag and the child's level, white cards. Glim, the lens mascot, blinks and waves.
- Lagoon teal `#0F7F76` for actions, navy `#18294A` text, sunflower for stars and sticky notes. Right and not-yet always come with an icon and a word, never colour alone.
- Nunito for the interface. Two handwritings with two jobs: Caveat is the tutor's blue marker on the whiteboard, Kalam is the child's pencil in what the camera sees. KaTeX typesets what the reader read.
- Motion: cards rise in on load; the scan beam sweeps over the line being read; read lines type themselves in; verdicts pop, with confetti for a right answer; the whiteboard draws its explanation stroke by stroke; numbers count up. All of it switches off with reduced motion.

An earlier eight-screen draft lives in Claude Design (https://claude.ai/artifact/3M5dJHT4xMTW8FvAHYqx3f, private until shared); the code no longer follows it.
