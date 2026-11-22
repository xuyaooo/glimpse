# The animations

Glimpse explains an exercise with one of **36 animations**: 25 for maths (from counting apples to limits, integrals and probability trees), 5 for reading (syllables, sounds, spelling, plurals, sentences) and 6 for science (units, speed, floating and sinking, circuits, states of matter, food chains). Every animation is played as a short video, step by step. Each step has a caption that Glim reads out, the maths line under it, and controls to pause and to go to the next or previous step. The video can be watched on the camera card or full screen next to the written solution. The **Animations** page (`/animations`) lists them all with examples to try.

## How one is chosen

1. **Laya decides which kind.** The decision model (`decide/`, see [models/README.md](../models/README.md)) reads the exercise, e.g. "this is a definite integral", in about 50 ms.
2. **The rules read the numbers.** `server/engine/scenes.js` parses the exercise with a safe expression parser (no `eval`): the numbers, the operation, the bounds. If Laya's kind and the parsed exercise disagree, the rules decide, within compatible kinds (e.g. counting, number line or columns for an addition).
3. **Code computes everything.** Every number in an animation is computed in code: exact fractions, the roots, numeric integration checked twice, limits from both sides. The tutor model never writes an animation's numbers. When the tutor's answer and the animation's disagree, the animation is dropped and the written solution stays.
4. **Nothing fits:** no animation. The written step-by-step solution is shown alone.

On Vercel there is no Laya: the rules decide alone.

## The look follows the age

Each kind has a level, from primary school to high school. With the student's age (Settings → Age), `skinFor` picks one of three looks:
- **kid**: objects to count, pizzas, cookies, frogs on a number line;
- **junior**: bars and grids;
- **grown**: clean graphs and diagrams.

Up to 9 years old, everything that can be is drawn for kids. From 13 it's grown. In between it depends on the kind. High-school kinds are always grown.

## Every animation, with what it supports

### Primary school

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 🍎 **Counting** `count` | Adding and subtracting | Adding and taking away small numbers, with things to count. | `3 + 4 =`, `9 - 5 =`, `0 + 6 =` | kid / kid / kid / grown |
| 🐸 **Number line** `number_line` | Adding and subtracting | Adding and subtracting with jumps on a number line (tens, then ones). | `27 + 15 =`, `83 - 38 =`, `3 - 8 =` | kid / kid / kid / grown |
| 🧮 **In columns** `columns` | Adding and subtracting | Big numbers in columns: carrying and borrowing, explained. | `345 + 278 =`, `602 - 348 =`, `1000 - 1 =` | kid / kid / kid / grown |
| 🍪 **Equal groups** `groups` | Multiplication | Times tables as equal groups (plates of cookies, or a dot array). | `4 \times 6 =`, `6 x 7 = 42`, `12 \times 12 =` | kid / kid / kid / grown |
| 🟦 **Area model** `area_model` | Multiplication | Big multiplications as a rectangle split into tens and ones. | `68 \times 74 =`, `125 \times 12 =`, `7 \times 34 =` | kid / kid / junior / grown |
| 🍬 **Sharing out** `sharing` | Division | Division as sharing out, with what is left over. | `24 \div 6 =`, `13 \div 4 =`, `144 \div 12 =` | kid / kid / kid / grown |
| 🍕 **Fractions** `fractions` | Fractions | Adding and subtracting fractions: same-size pieces first. Works over 1 too. | `\frac{1}{2} + \frac{1}{3} =`, `\frac{5}{4} + \frac{1}{2} =`, `\frac{3}{2} + \frac{3}{2} =` | kid / kid / junior / grown |
| 🔢 **The pairing trick** `pairs` | Number patterns | The pairing trick for 1 + 2 + … + n. | `1 + 2 + ... + 100 =`, `1 + 2 + ... + 10 =` | kid / kid / junior / grown |

### Middle school

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 💯 **Percentages** `percent` | Percentages | A percentage of an amount, on a 100-square grid. | `20\% of 50`, `75\% of 120`, `150\% of 40` | kid / kid / junior / grown |
| 🪜 **Order of operations** `order_ops` | Order of operations | Several operations: brackets, powers, × ÷, then + −, step by step. | `3 + 4 \times 2 =`, `(5 + 3) \times 2 - 4 =`, `2^3 + 1 =` | kid / kid / junior / grown |
| 🚀 **Powers** `powers` | Powers and logarithms | Powers as repeated multiplication; logarithms count them. | `2^5 =`, `5^0 =`, `\log_2 32` | kid / kid / junior / grown |
| 📊 **The mean** `mean` | Averages | The mean: towers shared out until they are level (negatives too). | `mean of 3, 5, 7, 9`, `mean of -2, 4, 7` | kid / kid / junior / grown |
| ⚖️ **The balance** `balance` | Equations | Linear equations on a balance: do the same to both sides. | `3x + 5 = 20`, `2x - 7 = 5x + 2`, `-x + 4 = 10` | kid / kid / junior / grown |
| ↔️ **Inequality** `inequality` | Inequalities | Inequalities: solved like an equation, then a ray on the number line. | `2x + 3 > 7`, `-3x \ge 9`, `5x - 4 \le 11` | kid / kid / junior / grown |
| 📐 **Pythagoras** `pythagoras` | Pythagoras | Pythagoras with real squares on the three sides. | `3^2 + 4^2 = c^2`, `5^2 + b^2 = 13^2`, `1^2 + 1^2 = c^2` | kid / kid / junior / grown |

### High school

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 🌈 **The parabola** `quadratic` | Quadratic equations | Quadratic equations: the parabola, the discriminant, the roots. | `x^2 - 5x + 6 = 0`, `x^2 - 4x + 4 = 0`, `x^2 + 1 = 0` | grown / grown / grown / grown |
| ✖️ **Two lines** `system` | Simultaneous equations | Two equations: two lines, and where they cross. | `2x + y = 5, x - y = 1`, `3x + 2y = 12, x - y = -1` | grown / grown / grown / grown |
| 📉 **The graph** `graph` | Functions and graphs | Graphs of functions, where they cross the axes. | `y = x^2 - 4`, `y = 2x + 1`, `y = 1/x` | grown / grown / grown / grown |
| ⭕ **The unit circle** `trig` | Trigonometry | Sine, cosine and tangent on the unit circle (exact values). | `\sin 30^\circ`, `\cos 225^\circ`, `\tan 90^\circ` | grown / grown / grown / grown |
| 🎯 **The limit** `limit` | Limits | Limits: closer and closer from both sides, holes, infinity, one side. | `\lim_{x \to 1} \frac{x^2 - 1}{x - 1}`, `\lim_{x \to 0} \frac{\sin x}{x}`, `\lim_{x \to 0^+} \ln x`, `\lim_{x \to 0} \frac{1}{x}` | grown / grown / grown / grown |
| ⛷️ **The tangent** `derivative` | Derivatives | Derivatives: the tangent line, its slope, and the slope curve. | `f(x) = x^3, f'(2) =`, `f(x) = x^2, f'(3) =` | grown / grown / grown / grown |
| 📈 **Area under the curve** `area` | Integrals | Definite integrals as the area under the curve. | `\int_0^1 \frac{1}{1+x} dx`, `\int_0^4 x^2 dx`, `\int_{\pi}^{2\pi} \sin x dx` | grown / grown / grown / grown |

### Probability

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 🎲 **Chance** `chance` | Probability | Chance: every outcome drawn, the good ones lit up. | `P(rolling a 6) with a die`, `sum of 7 with two dice`, `two coins: P(two heads)`, `bag with 3 red and 5 blue balls, P(red)` | kid / kid / junior / grown |
| 🧩 **Choosing** `combinations` | Probability | Choosing r out of n, and factorials. | `\binom{5}{2}`, `\binom{4}{2}`, `5! =` | kid / kid / junior / grown |
| 🌳 **Tree diagram** `tree` | Probability | Two independent events on a tree diagram. | `P(A) = 0.5, P(B) = 0.3, P(A and B) independent` | kid / kid / junior / grown |

### Reading

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 👏 **Clap the syllables** `syllables` | Syllables | Clap the beats of a word: one vowel sound, one syllable. | `How many syllables in elephant?`, `Split butterfly into syllables`, `clap the word rabbit` | kid / kid / kid / grown |
| 🔤 **Sound buttons** `phonics` | Phonics | Sound buttons: the letters that make one sound together (sh, igh, a…e), then blend. | `sound out ship`, `How many sounds in night?`, `phonics: cake` | kid / kid / kid / grown |
| ✏️ **Spelling, letter by letter** `spelling` | Spelling | A misspelled word compared letter by letter with the right one, then in beats. | `becaus -> because`, `freind should be friend`, `Spell beautiful` | kid / kid / kid / grown |
| 🦊 **Plurals** `plural` | Plurals | One, two: -s, -es, -ies, -ves, and the special words. | `plural of fox`, `plural of baby`, `plural of child`, `plural of knife` | kid / kid / kid / grown |
| 📝 **Fix the sentence** `sentence` | Sentences and punctuation | Capital letters, I, a or an, and the right mark at the end. | `Punctuate: i have a apple`, `correct the sentence: where is my book`, `fix: the the cat is big` | kid / kid / junior / grown |

### Science

| Animation | Topic | What it shows | Examples | Look by age (6 / 9 / 12 / 15) |
|---|---|---|---|---|
| 📏 **The unit ladder** `units` | Units and conversions | Converting units on a ladder: down is ×, up is ÷. | `Convert 3.5 km to m`, `2500 g in kg`, `45 min = ? h`, `3 L to mL` | kid / kid / junior / grown |
| 🚗 **Speed, distance, time** `speed` | Speed, distance and time | Speed, distance and time: the triangle, then the car on the road. | `A car drives 120 km in 2 hours. What is its speed?`, `How long does it take to drive 150 km at 60 km/h?`, `How far do you go in 3 h at 80 km/h?` | kid / kid / junior / grown |
| ⛵ **Float or sink** `density` | Floating and sinking | Density = mass ÷ volume, then into the water: float or sink. | `A block has a mass of 200 g and a volume of 250 cm3. Does it float?`, `Density of 500 g in 400 mL, float or sink?` | kid / kid / junior / grown |
| 💡 **The circuit** `circuit` | Electric circuits | V = I × R in a circuit, resistors in series or in parallel, current flowing. | `A 9 V battery and a 3 ohm resistor: what is the current?`, `Resistors of 2 ohms and 4 ohms in series with 12 V. Current?`, `6 V across two 6 ohm resistors in parallel, current?` | kid / kid / junior / grown |
| 🧊 **Solid, liquid, gas** `states` | States of matter | Solid, liquid or gas at a temperature: the thermometer and the particles. | `Water at 120 °C: solid, liquid or gas?`, `ice at -5 °C`, `What state is iron at 1600°C?` | kid / kid / junior / grown |
| 🐇 **Food chain** `food_chain` | Food chains | Who eats whom: the energy from the producer to the top predator. | `grass -> rabbit -> fox`, `food chain: sun → grass → grasshopper → frog → snake → hawk`, `Owls eat mice and mice eat seeds` | kid / kid / kid / grown |

These examples are only a sample: the parsers accept the same exercise written many ways. That includes LaTeX from the OCR (`\frac{3}{4}`), plain text (`3/4`), `x` or `×` between numbers for times, `S` read for an integral sign, and words around the maths ("the mean of 3, 5 and 7").

## Where the code is

| What | File |
|---|---|
| Parsing, building, computing every animation | `server/engine/scenes.js` (`detectScene`, `buildScene`, `sceneFor`, `skinFor`); Reading and Science in `server/engine/domains.js` |
| Choosing (Laya + rules) and sending it with the solution | `server/engine/session.js` (`decideScene`, `sendSteps`) |
| Drawing each kind | `web/src/components/scenes/*Scene.vue`, picked by `SceneStage.vue` |
| The video card and the full-screen player | `web/src/components/scenes/SceneVideo.vue`, `ScenePlayer.vue`, `web/src/lib/player.ts` |
| Names, icons, topics, the catalogue above | `web/src/lib/sceneKinds.ts` |
| Tests: every kind on edge cases | `npm run sweep`, `test/scenes.test.js`, `test/qa-scenes-*.test.js` |

To add a kind: a builder in `scenes.js` (and a rule in `detectScene`), a `*Scene.vue`, an entry in `sceneKinds.ts` and in `SceneStage.vue`'s map, examples for Laya in `decide/examples.py`, and cases in the sweep.
