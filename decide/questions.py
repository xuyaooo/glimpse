# The typed questions Laya answers about a maths exercise (shared by the service and its tests).
ANIMATION = {
    "type": "choice",
    "instructions": "Which animation best explains this maths exercise?",
    "criteria": {
        "count": "adding or taking away small whole numbers, like 3 + 4 or 9 - 2",
        "number_line": "adding or subtracting two-digit whole numbers, like 27 + 15 or 83 - 38",
        "columns": "adding or subtracting big whole numbers in columns, like 345 + 278 or 602 - 348",
        "groups": "times tables, multiplying two small whole numbers, like 4 x 6",
        "area_model": "multiplying big whole numbers, like 68 x 74 or 125 x 12",
        "sharing": "dividing whole numbers, sharing out, like 24 ÷ 6 or 25 : 4",
        "fractions": "adding or subtracting fractions, like 1/2 + 1/3",
        "percent": "a percentage of an amount, like 20% of 50",
        "order_ops": "several operations with brackets, order of operations, like 3 + 4 x 2 or (5 + 3) x 2 - 4",
        "powers": "powers, exponents or logarithms, like 2^5 or log_2 32",
        "mean": "the mean or average of a list of numbers",
        "balance": "solving a linear equation for x, like 3x + 5 = 20",
        "inequality": "solving a linear inequality, like 2x + 3 > 7",
        "pythagoras": "Pythagoras, the sides of a right triangle, like 3^2 + 4^2 = c^2",
        "pairs": "the sum of all numbers from 1 to n, like 1 + 2 + ... + 100",
        "quadratic": "solving a quadratic equation with x squared, like x^2 - 5x + 6 = 0",
        "system": "two equations with x and y at the same time, like 2x + y = 5, x - y = 1",
        "graph": "a function to draw, like y = x^2 - 4 or f(x) = 2x + 1",
        "trig": "sine, cosine or tangent of an angle, like sin 30°",
        "limit": "a limit, like lim x->0 of sin(x)/x",
        "derivative": "a derivative or slope, like d/dx x^3 or f'(2)",
        "area": "a definite integral, the area under a curve, like the integral from 0 to 1 of 1/(1+x) dx",
        "chance": "probability with dice, coins or coloured balls in a bag",
        "combinations": "combinations or factorials, choosing r out of n, like C(5,2) or 5!",
        "tree": "probability of two independent events both happening, a tree diagram",
        "none": "anything else: words, proofs, geometry, names, dates, or not maths",
    },
}
LEVEL = {
    "type": "score",
    "instructions": "How advanced is this maths?",
    "criteria": ["early primary school (ages 5 to 8)", "primary school (ages 8 to 11)", "secondary school (ages 11 to 16)", "university or advanced (16 and over)"],
}
QUESTIONS = {"animation": ANIMATION, "level": LEVEL}
