# Testing

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | 220+ unit tests: maths, the 36 animations (reading and science too), review suggestions, OCR text cleaning, paper detection, gestures, the server's routes and error handling, Laya's service rules | nothing running |
| `npm run sweep` | every animation on 52 edge cases (fractions over 1, one-sided limits, negative areas…): builds, numbers, captions | nothing running |
| `npm run e2e` | the whole pipeline on real photos (`test/fixtures/`): reading, verdicts and hints, the topic, the animation before the steps, pointing + question, exact fraction checking, age-adapted animations, the summary and its exercises to practise, the database, Practise again and "I did it", the dashboard, all 36 animations through Laya, and a Science session reading the paper | `npm run dev` running |
| `npm run e2e:failures` | what the student sees when a model, Laya or the network fails: friendly messages, no stuck screens | starts its own engine |
| `cd web && npx vue-tsc --noEmit` | the app's types | |
| `npm run build` | the production build | |
| `decide/.venv/bin/python decide/eval.py` | Laya on exercises it never saw (55/57) and edge cases | Laya installed |
| `decide/.venv/bin/python models/laya/train_head.py` | the trained Laya head vs the example vote | Laya installed |

`ENGINE=https://your-app.vercel.app npm run e2e` runs the pipeline test against another engine.

## By hand

At http://localhost:5173, pick a child, then open the camera:

1. Write `3x + 5 = 20` and lift your pencil: what was read, a hint, then the balance animation offered on the camera. Play it, pause it, then press *Watch it big*.
2. Point at an exercise and hold still. Ask out loud, "how do I solve this?": the answer is spoken and the solution opens.
3. Type a question in the box under the camera and press *Send*.
4. Settings (the gear):
   - set the age to 6 and write `3 + 4 =`: objects to count;
   - set it to 15: grown-up graphs;
   - turn the voice off.
5. *Finish*: the summary with stars and "To practise next time", then *Practise in My work*. Show an answer, watch how it's solved, and mark one "I did it".
6. *Animations* in the sidebar: play every animation.

Demo without an engine: http://localhost:5173/?demo. Press `W` to write the next line of the scripted session.
