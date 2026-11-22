# Practise again

After every finished session, Glimpse suggests **3 to 5 exercises** to practise. They're like the ones done that day, and the ones that went wrong come first. They appear:
- at the end of the session, under "To practise next time" in the summary;
- in **My work → Practise again**, kept for every session, newest first.

## What is suggested, in this order

| Label | What | Why |
|---|---|---|
| **Try it again** | an exercise that went wrong or wasn't finished, without the student's answer | redo it calmly; the tutor's note on the mistake is shown ("Last time you added the tops and the bottoms…") |
| **New numbers** | the same exercise with new numbers (`3/4 + 1/8` → `2/3 + 1/6`) | the same idea, without remembering the answer |
| **A bit harder** | bigger numbers, same idea | when things went right |
| **Glim's idea** | an exercise the tutor model proposed in the summary | only kept when the code can work out its answer |

Each card has:
- **Show the answer**, hidden until the student has tried;
- **Watch how**, which plays the full-screen animation step by step;
- **I did it**, saved with the session, with an "x of y done" bar.

## Answers are worked out by code

Every answer shown comes from the animation library (`sceneFor` in `server/engine/scenes.js`), never from a language model. New numbers are chosen so the exercise stays the same kind and stays as "nice" as the original:
- a whole-number answer stays whole;
- no "≈", remainder or ∞ appears that wasn't there before;
- a fraction stays proper or improper, and a bottom that was a multiple of another stays one;
- no give-away answers (0 or 1, or rolling an 8 with a die).

Lines the camera misread ("Decision ①②", "t × 9") and plain results ("x = 42") are never suggested. The same session always gets the same suggestions (seeded by the session id).

## Code

| What | Where |
|---|---|
| Choosing the exercises, new numbers, checking answers | `server/engine/review.js` (`suggestReview`, `variantOf`, `questionOf`), tests in `test/review.test.js` |
| Made at the end of a session (with the tutor's ideas) | `server/engine/session.js` → `summarize` |
| `GET /api/review?student=`, `POST /api/review/done` | `server/app.js`. Sessions finished before this existed get suggestions on first view, made from their saved lines. When the suggestions improve (`REVIEW_VERSION`), they're made again unless one was already done. |
| The section in My work, the preview in the summary | `web/src/components/ReviewSection.vue`, `web/src/components/SummaryDialog.vue`, `web/src/lib/useWork.ts` |
