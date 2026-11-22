# Labelled examples for the Reading and Science animations (server/engine/domains.js), the way
# they reach the decision model: a child's line read by the OCR, a question, or a task.
import random

READING_KINDS = ["syllables", "phonics", "spelling", "plural", "sentence"]
SCIENCE_KINDS = ["units", "speed", "density", "circuit", "states", "food_chain"]

WORDS = [
    "elephant", "butterfly", "rabbit", "tiger", "computer", "banana", "dinosaur", "kangaroo", "umbrella", "family", "animal", "pencil",
    "garden", "window", "monkey", "basket", "hamster", "children", "pocket", "table", "little", "apple", "crocodile", "caterpillar",
    "helicopter", "watermelon", "strawberry", "yesterday", "happy", "playing", "jumping", "wanted", "mystery", "bicycle", "spaghetti",
]
SOUND_WORDS = ["ship", "chip", "shop", "fish", "night", "light", "cake", "bike", "home", "cube", "chair", "boat", "rain", "tree", "moon", "duck", "king", "queen", "thumb", "phone", "whale", "frog", "sheep", "train", "coat", "bright", "church", "thick"]
MISSPELT = [
    ("becaus", "because"), ("freind", "friend"), ("wierd", "weird"), ("recieve", "receive"), ("beautifull", "beautiful"), ("tommorow", "tomorrow"),
    ("necesary", "necessary"), ("wensday", "wednesday"), ("seperate", "separate"), ("definately", "definitely"), ("libary", "library"),
    ("suprise", "surprise"), ("doller", "dollar"), ("thier", "their"), ("whent", "went"), ("sed", "said"), ("wos", "was"), ("becuase", "because"),
    ("frend", "friend"), ("skool", "school"), ("peeple", "people"), ("littel", "little"), ("wether", "weather"), ("lite", "light"),
]
PLURAL_WORDS = ["baby", "fox", "box", "bus", "church", "dish", "knife", "leaf", "wolf", "child", "mouse", "tooth", "foot", "sheep", "fish", "potato", "tomato", "city", "story", "lady", "day", "toy", "key", "glass", "watch", "piano", "hero", "man", "woman", "goose"]
SENTENCES = [
    "the cat sat on the mat", "i like to play football", "where is my red pencil", "she has a apple", "we went to the park on monday",
    "my dog is called max", "can you help me", "it was a sunny day", "tom and i went to school", "where do you live", "he ate an banana",
    "the the bird sang", "my sister likes to read books", "do you like ice cream", "they played in the garden", "i saw an elephant at the zoo",
    "how old are you", "the sun is hot", "we have a test today", "is it raining outside",
]
SUBSTANCES = [("water", (-20, 140)), ("iron", (20, 3000)), ("gold", (20, 3000)), ("ethanol", (-120, 100)), ("oxygen", (-230, 0)), ("ice", (-30, 30)), ("mercury", (-50, 400)), ("chocolate", (10, 60)), ("salt", (20, 1500)), ("wax", (20, 100))]
CHAINS = [
    ["grass", "rabbit", "fox"], ["leaves", "caterpillar", "bird", "hawk"], ["seeds", "mouse", "owl"], ["algae", "fish", "seal", "shark"],
    ["grass", "zebra", "lion"], ["plants", "grasshopper", "frog", "snake", "eagle"], ["acorns", "squirrel", "fox"], ["phytoplankton", "krill", "whale"],
    ["lettuce", "snail", "hedgehog"], ["nectar", "bee", "bird"], ["grass", "cow", "human"], ["seaweed", "sea urchin", "sea otter"],
]
UNIT_PAIRS = [("km", "m"), ("m", "cm"), ("cm", "mm"), ("m", "km"), ("cm", "m"), ("kg", "g"), ("g", "kg"), ("t", "kg"), ("L", "mL"), ("mL", "L"), ("cL", "mL"), ("h", "min"), ("min", "s"), ("min", "h"), ("s", "min"), ("day", "h")]
UNIT_WORDS = {"km": "kilometres", "m": "metres", "cm": "centimetres", "mm": "millimetres", "kg": "kilograms", "g": "grams", "t": "tonnes", "L": "litres", "mL": "millilitres", "cL": "centilitres", "h": "hours", "min": "minutes", "s": "seconds", "day": "days"}


def generate_domains(rnd=None, per_kind=40):
    rnd = rnd or random.Random(11)
    out = []

    def add(kind, *texts):
        for t in texts:
            out.append((t, kind))

    for _ in range(per_kind):
        w = rnd.choice(WORDS)
        add("syllables", f"How many syllables in {w}?", f"Split {w} into syllables", f"clap the word {w}", f"syllables: {w}", f"{'-'.join([w[:2], w[2:]])}? count the beats in {w}")
        s = rnd.choice(SOUND_WORDS)
        add("phonics", f"sound out {s}", f"How many sounds in {s}?", f"phonics: {s}", f"sound buttons for {s}", f"what sounds can you hear in {s}")
        bad, good = rnd.choice(MISSPELT)
        add("spelling", f"{bad} -> {good}", f"{bad} should be {good}", f"spell {good}", f"How do you spell {good}?", f"spelling: {good}", f"{bad}")
        p = rnd.choice(PLURAL_WORDS)
        add("plural", f"plural of {p}", f"one {p}, two ...", f"make {p} plural", f"{p} -> plural", f"What is the plural of {p}?")
        sen = rnd.choice(SENTENCES)
        add("sentence", f"Punctuate: {sen}", f"correct the sentence: {sen}", sen, f"Add capital letters and full stops: {sen}", f"fix: {sen}")

        a, b = rnd.choice(UNIT_PAIRS)
        v = rnd.choice([rnd.randint(1, 99), round(rnd.uniform(0.5, 20), 1), rnd.randint(100, 9000)])
        add("units", f"Convert {v} {a} to {b}", f"{v} {a} = ? {b}", f"How many {UNIT_WORDS[b]} in {v} {UNIT_WORDS[a]}?", f"{v} {a} in {b}", f"Change {v} {UNIT_WORDS[a]} into {UNIT_WORDS[b]}")
        d, t = rnd.randint(2, 60) * 10, rnd.randint(1, 6)
        add("speed", f"A car drives {d} km in {t} hours. What is its speed?", f"How long does it take to travel {d} km at {rnd.randint(4, 12) * 10} km/h?",
            f"A cyclist rides at {rnd.randint(10, 30)} km/h for {t} hours. How far?", f"A runner covers {rnd.randint(1, 8) * 100} m in {rnd.randint(10, 90)} s. Speed?", f"speed = distance / time: {d} km, {t} h")
        m, vol = rnd.randint(5, 900), rnd.randint(5, 900)
        add("density", f"A block has a mass of {m} g and a volume of {vol} cm3. Does it float?", f"Density of {m} g in {vol} mL, float or sink?",
            f"Will a {m} g object with a volume of {vol} cm³ sink in water?", f"density = mass / volume, {m} g and {vol} cm3", f"Does an object of {round(m / 100, 1)} kg and {vol} mL float?")
        V, R = rnd.choice([1.5, 3, 4.5, 6, 9, 12, 24]), rnd.randint(1, 20)
        add("circuit", f"A {V} V battery and a {R} ohm resistor: what is the current?", f"Resistors of {R} ohms and {rnd.randint(1, 10)} ohms in series with {V} V. Current?",
            f"A current of {rnd.randint(1, 5)} A flows through {R} ohms. What is the voltage?", f"V = {V} V, I = {rnd.randint(1, 4)} A, find R", f"Ohm's law: {V} V across {R} Ω")
        sub, (lo, hi) = rnd.choice(SUBSTANCES)
        T = rnd.randint(lo, hi)
        add("states", f"{sub} at {T} °C: solid, liquid or gas?", f"What state is {sub} at {T}°C?", f"Is {sub} a solid or a liquid at {T} °C?", f"{sub} heated to {T} °C", f"What happens to {sub} at {T} °C?")
        ch = rnd.choice(CHAINS)
        add("food_chain", " -> ".join(ch), "food chain: " + " → ".join(ch), f"The {ch[-1]} eats the {ch[-2]} and the {ch[-2]} eats {ch[0] if len(ch) == 3 else 'the ' + ch[-3]}.",
            f"Draw a food chain with {', '.join(ch)}", f"Which is the producer: {', '.join(reversed(ch))}?")
    return out


# Held-out checks (different words and numbers from above), used by decide/eval.py
DOMAIN_CASES = [
    ("How many syllables in hippopotamus?", "syllables"), ("Split pineapple into syllables", "syllables"),
    ("sound out flight", "phonics"), ("How many sounds in sheep?", "phonics"),
    ("tomorow -> tomorrow", "spelling"), ("How do you spell rhythm?", "spelling"),
    ("plural of puppy", "plural"), ("one goose, two ...", "plural"),
    ("Punctuate: my brother plays the piano", "sentence"), ("correct the sentence: are you coming to my party", "sentence"),
    ("Convert 4.2 kg to g", "units"), ("How many millilitres in 2.5 litres?", "units"),
    ("A train travels 300 km in 3 hours. What is its speed?", "speed"), ("How far does a bike go in 2 h at 15 km/h?", "speed"),
    ("A stone of 300 g has a volume of 120 cm3. Float or sink?", "density"), ("A 12 V battery drives a 4 ohm lamp. Current?", "circuit"),
    ("Water at 50 °C: solid, liquid or gas?", "states"), ("What state is oxygen at -200 °C?", "states"),
    ("grass -> grasshopper -> frog -> snake", "food_chain"), ("Owls eat mice and mice eat seeds. Draw the food chain.", "food_chain"),
]
