# Labelled examples of each kind of exercise, for teaching Laya which animation fits.
# Generated with varied numbers and both ways an exercise reaches the decision model: as LaTeX
# from the OCR (\frac{1}{2}) and as plain text (1/2).
import random

from examples_domains import READING_KINDS, SCIENCE_KINDS, generate_domains

KINDS = ["count", "number_line", "columns", "groups", "area_model", "sharing", "fractions", "percent", "order_ops", "powers", "mean", "balance", "inequality", "pythagoras", "pairs", "quadratic", "system", "graph", "trig", "limit", "derivative", "area", "chance", "combinations", "tree", *READING_KINDS, *SCIENCE_KINDS, "none"]


def generate(seed=7, per_kind=40):
    rnd = random.Random(seed)
    out = []

    def add(kind, *texts):
        for t in texts:
            out.append((t, kind))

    for _ in range(per_kind):
        a, b = rnd.randint(1, 10), rnd.randint(1, 10)
        hi = max(a, b)
        lo = min(a, b)
        add("count", f"{a} + {b} =", f"${a}+{b}=$", f"{a} + {b} = {a + b}", f"{hi} - {lo} =", f"{hi}-{lo}={hi - lo}")
        a, b = rnd.randint(12, 950), rnd.randint(11, 99)
        add("number_line", f"{a} + {b} =", f"${a}+{b}=$", f"{a + b} - {b} =", f"{a} - {b} = {a - b}", f"{a}+{b}={a + b + rnd.choice([0, 10])}")
        a, b = rnd.randint(2, 12), rnd.randint(2, 12)
        add("groups", f"{a} \\times {b} =", f"{a} x {b} =", f"{a} \\times {b} = {a * b}", f"{a} \\cdot {b} =", f"{a}*{b}={a * b}")
        n1, d1, n2, d2 = rnd.randint(1, 5), rnd.randint(2, 9), rnd.randint(1, 5), rnd.randint(2, 9)
        add("fractions", f"\\frac{{{n1}}}{{{d1}}} + \\frac{{{n2}}}{{{d2}}} =", f"{n1}/{d1} + {n2}/{d2} =", f"\\frac{{{n1}}}{{{d1}}} - \\frac{{{n2}}}{{{d2}}} =", f"{n1}/{d1} + {n2}/{d2} = {n1 + n2}/{d1 + d2}")
        a, b, x = rnd.randint(2, 9), rnd.randint(1, 20), rnd.randint(1, 12)
        c, d = rnd.randint(1, 5), rnd.randint(1, 9)
        add("balance", f"{a}x + {b} = {a * x + b}", f"{a}x - {b} = {a * x - b}", f"x + {b} = {x + b}", f"{a}x = {a * x}", f"{a}x + {b} = {c}x + {d}", f"\\frac{{x}}{{{a}}} + {b} = {b + x}")
        n = rnd.choice([10, 20, 50, 100, 200, 1000, rnd.randint(5, 500)])
        add("pairs", f"1 + 2 + ... + {n} =", f"1+2+3+\\ldots+{n}=", f"1 + 2 + 3 + \\dots + {n}", f"1+2+\\cdots+{n}")
        lo, hi = rnd.choice([(0, 1), (0, 2), (1, 2), (0, 4), (1, 3), (-1, 1), (0, "\\pi"), (1, "e")])
        f = rnd.choice(["x^2", "x^{3}", "\\frac{1}{1+x}", "\\frac{1}{x}", "\\sin x", "e^{x}", "3x^2 + 1", "\\sqrt{x}", "2x"])
        add("area", f"\\int_{{{lo}}}^{{{hi}}} {f} dx =", f"\\int_{lo}^{hi} {f}\\,dx", f"\\int_{{{lo}}}^{{{hi}}} {f} dx = [F(x)]_{{{lo}}}^{{{hi}}}")
        g = rnd.choice(["x^2 - 4", "2x + 1", "x^3 - x", "\\sin x", "\\frac{1}{x}", "x^2 + 3x - 2", "3 - x", "e^x"])
        add("graph", f"y = {g}", f"f(x) = {g}", f"y={g}")
    for _ in range(per_kind // 2):
        a, b = rnd.randint(100, 9999), rnd.randint(100, 999)
        add("columns", f"{a} + {b} =", f"${a}+{b}=$", f"{max(a, b)} - {min(a, b)} =", f"{a} + {b} = {a + b}")
        a, b = rnd.randint(13, 99), rnd.randint(11, 99)
        add("area_model", f"{a} \\times {b} =", f"{a} x {b} =", f"{a}*{b}=", f"{a * 10 + 5} \\times {b} =")
        d = rnd.randint(2, 12)
        q = rnd.randint(2, 12)
        add("sharing", f"{d * q} \\div {d} =", f"{d * q + rnd.randint(1, d - 1) if d > 1 else d * q} : {d} =", f"{d * q} ÷ {d} = {q}", f"{d * q}/{d}=")
        p, n = rnd.choice([5, 10, 15, 20, 25, 30, 40, 50, 75]), rnd.choice([20, 40, 50, 60, 80, 120, 200, 360])
        add("percent", f"{p}\\% of {n}", f"{p}% of {n} =", f"{p} percent of {n}", f"Find {p}% of {n}")
        x, y, z = rnd.randint(2, 9), rnd.randint(2, 9), rnd.randint(2, 9)
        add("order_ops", f"{x} + {y} \\times {z} =", f"({x} + {y}) \\times {z} - {x} =", f"{x * z} \\div {z} + {y} \\times 2 =", f"{x} \\times ({y} + {z}) =")
        b_, e_ = rnd.randint(2, 6), rnd.randint(2, 6)
        add("powers", f"{b_}^{e_} =", f"{b_}^{{{e_}}} =", f"\\log_{b_} {b_ ** e_}", f"\\log_{{{b_}}}({b_ ** e_}) =")
        vals = [rnd.randint(1, 20) for _ in range(rnd.randint(3, 6))]
        add("mean", f"mean of {', '.join(map(str, vals))}", f"Find the average of {', '.join(map(str, vals))}", f"\\text{{mean}}: {', '.join(map(str, vals))}")
        a, b, c = rnd.randint(2, 9), rnd.randint(1, 9), rnd.randint(10, 40)
        add("inequality", f"{a}x + {b} > {c}", f"{a}x - {b} \\le {c}", f"-{a}x + {b} < {c}", f"{a}x \\geq {c}")
        legs = rnd.choice([(3, 4, 5), (5, 12, 13), (6, 8, 10), (8, 15, 17), (7, 24, 25)])
        add("pythagoras", f"{legs[0]}^2 + {legs[1]}^2 = c^2", f"{legs[0]}^2 + b^2 = {legs[2]}^2", f"c = \\sqrt{{{legs[0]}^2 + {legs[1]}^2}}", f"hypotenuse of a right triangle with sides {legs[0]} and {legs[1]}")
        r1, r2 = rnd.randint(-5, 5), rnd.randint(-5, 5)
        add("quadratic", f"x^2 {'-' if r1 + r2 > 0 else '+'} {abs(r1 + r2)}x {'+' if r1 * r2 >= 0 else '-'} {abs(r1 * r2)} = 0", f"x^2 = {rnd.randint(1, 49)}", f"2x^2 + {rnd.randint(1, 9)}x - {rnd.randint(1, 9)} = 0", f"x^{{2}} - {rnd.randint(1, 9)}x = 0")
        a1, b1, a2, b2 = rnd.randint(1, 5), rnd.randint(1, 5), rnd.randint(1, 5), rnd.randint(1, 5)
        add("system", f"{a1}x + {b1}y = {rnd.randint(1, 20)}, {a2}x - {b2}y = {rnd.randint(-9, 9)}", f"x + y = {rnd.randint(2, 20)}, x - y = {rnd.randint(0, 9)}", f"\\begin{{cases}} {a1}x + y = {rnd.randint(1, 9)} \\\\ x - {b2}y = {rnd.randint(1, 9)} \\end{{cases}}")
        ang = rnd.choice([0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 270, 300])
        fn = rnd.choice(["sin", "cos", "tan"])
        add("trig", f"\\{fn} {ang}^\\circ", f"{fn}({ang}°) =", f"\\{fn}({ang}^{{\\circ}}) =", f"{fn} {ang} degrees", f"{fn}({ang} degrees) =")
        fx = rnd.choice(["\\frac{\\sin x}{x}", "\\frac{x^2 - 1}{x - 1}", "\\frac{1}{x}", "x^2 + 1", "\\frac{2x+1}{x}", "(1 + 1/x)^x"])
        to = rnd.choice(["0", "1", "2", "\\infty"])
        add("limit", f"\\lim_{{x \\to {to}}} {fx}", f"lim x->{to} {fx}", f"\\lim_{{x \\to {to}}} {fx} =")
        g = rnd.choice(["x^3", "x^2 + 3x", "\\sin x", "e^x", "\\ln x", "5x^4 - 2x", "\\sqrt{x}"])
        add("derivative", f"\\frac{{d}}{{dx}} {g}", f"d/dx ({g})", f"f(x) = {g}, f'({rnd.randint(1, 4)}) =", f"\\frac{{d}}{{dx}}\\left({g}\\right) =")
        add("chance", f"P(rolling a {rnd.randint(1, 6)}) with a die", f"roll a die: P(even)", f"sum of {rnd.randint(2, 12)} with two dice", f"{rnd.choice(['two', 'three'])} coins: P({rnd.choice(['one', 'two'])} heads)", f"bag with {rnd.randint(1, 9)} red and {rnd.randint(1, 9)} blue balls, P(red)")
        n_ = rnd.randint(4, 10)
        add("combinations", f"\\binom{{{n_}}}{{{rnd.randint(1, n_ - 1)}}}", f"C({n_},{rnd.randint(1, n_ - 1)})", f"{n_}C{rnd.randint(1, n_ - 1)}", f"{n_}! =")
        pa, pb = rnd.choice(["0.5", "0.2", "0.3", "1/4", "\\frac{1}{3}"]), rnd.choice(["0.5", "0.6", "0.1", "1/2", "\\frac{2}{5}"])
        add("tree", f"P(A) = {pa}, P(B) = {pb}, P(A and B) independent", f"P(A) = {pa}, P(B) = {pb}, find P(A \\cap B)", f"independent events: P(A) = {pa} and P(B) = {pb}, both?")
    add(
        "none",
        "Solve the Riemann hypothesis", "Name: Amara", "Exercise 3", "Homework, page 12", "Date: 21 November",
        "Prove that \\sqrt{2} is irrational", "Find the angle ABC", "The mean of 3, 5 and 7", "Draw a triangle",
        "\\lim_{x \\to 0} \\frac{\\sin x}{x}", "\\frac{d}{dx} x^2", "\\int x^2 dx", "Chapter 4: Geometry",
        "Hello", "My favourite colour is blue", "Fractions worksheet", "Show your working", "Answers:",
        "\\sum_{n=1}^{\\infty} \\frac{1}{n^2}", "P(A \\cap B)", "\\vec{v} = (1, 2)", "\\det A", "x^2 + y^2 = r^2",
        "Write a story about a cat", "Lesson 5", "Total:", "Good job!", "\\binom{5}{2}", "\\log_2 8",
        "\\frac{d}{dx} \\sin x", "\\frac{dy}{dx} = 3x^2", "f'(x) = 2x", "\\lim_{n \\to \\infty} (1 + 1/n)^n", "\\lim_{x \\to 2} x^2",
        "Find the perimeter of the square", "What is the volume of the cube?", "Measure the line in cm", "Class: 4B", "Student: Luca",
        "Question 7", "Round 3.46 to one decimal place", "Which is bigger?", "Colour the shapes", "Tuesday",
    )
    # lines on a page that no animation explains (headings, names, dates, instructions, feedback, answers),
    # and maths topics without an animation (units, primes and factors, rounding, place value, shapes, proofs)
    add(
        "none",
        "Name: Priya", "Name: Oliver", "Class 5C", "Year 4", "Mr Jones", "Group: Blue", "Date: 14/10/2025", "12/03/2024",
        "Thursday 5th June", "Due: Monday", "Homework due Wednesday 12th", "Page 23", "p. 8", "Exercise 6", "Exercise 2.4",
        "Question 3b", "Chapter 7: Measures", "Unit 3: Shape", "Worksheet 2", "Section B", "Starter", "Extension task",
        "Learning objective: to multiply by 10", "Times tables test", "Mental maths", "Show your method", "Write your answer in the box",
        "Use a ruler", "Tick the correct answer", "Fill in the missing numbers", "Answer all the questions", "Do not use a calculator",
        "Marks: 3", "Great work!", "Excellent!", "Try again", "See me", "Score: 7/10", "8 out of 10", "Total: 25 marks",
        "= 12 cm", "Answer: 42", "x = 75°", "x = 130°", "y = 110°", "a = 35°", "Angle ABC = 40°", "Area = 8 x 2 = 16 cm²",
        
        "It is half past four",
        "What time does the train leave?", "3:45 pm",
        "Is 21 a prime number?", "23 is a prime number", "List the prime numbers up to 30", "Factors of 18",
        "The factors of 20 are 1, 2, 4, 5, 10, 20", "Multiples of 6: 6, 12, 18, 24", "Write the first five multiples of 9",
        "HCF of 24 and 36", "LCM of 3 and 5", "Is 45 even or odd?", "Square numbers: 1, 4, 9, 16", "Prime factors of 60",
        "Factors of 15: 1, 3, 5, 15", "The factors of 8 are 1, 2, 4 and 8", "Is 9 prime?", "41 is prime", "Round 3,752 to the nearest thousand",
        
        "Round 456 to the nearest ten", "Round 2.718 to 1 decimal place", "Write 0.4 as a fraction", "Write 3/5 as a decimal",
        "What is the value of the 7 in 4721?", "Write 6305 in words", "Order these numbers: 0.5, 0.05, 0.55", "Simplify 10/15",
        "Find the perimeter of the rectangle", "Perimeter of a square with side 6 cm", "Area of a rectangle 7 cm by 4 cm",
        "Volume of a cuboid 2 cm by 3 cm by 4 cm", "Measure angle ABC", "The angles on a straight line add up to 180°",
        "Draw a right angle", "How many sides does a hexagon have?", "Name this shape", "Plot the point (3, 5)",
        "Draw the line of symmetry", "Prove that the sum of two odd numbers is even", "Show that n^2 + n is always even",
        "Expand 3(x + 4)", "Factorise 6x + 9", "Simplify 3a + 2b + 5a", "What is the mode of 2, 3, 3, 5?",
        "Find the range of 12, 5, 9, 20", "Draw a tally chart", "Complete the table",
        "Ben has 2 red balloons and 4 green balloons. How many balloons are there?", "Ali buys 4 pencils at 30p each. How much does he spend?",
        "Once upon a time", "I like football", "Read pages 4 to 6", "Bring your PE kit",
    )
    add("units", "Convert 250 cm to metres", "How many grams are in 2 kg?", "How many minutes are in 3 hours?", "Change 4.5 litres to millilitres", "1.2 km in metres", "Convert 90 seconds to minutes")
    # Reading and Science (examples_domains.py)
    out += generate_domains(random.Random(seed + 4), per_kind)
    return out
