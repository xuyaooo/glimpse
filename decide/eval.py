# How well Laya picks the animation, on exercises it was not taught with.
import time
from examples_domains import DOMAIN_CASES
from laya_service import Decider

CASES = [
    ("3 + 4 =", "count"), ("27 + 15 =", "number_line"), ("4 \\times 6 =", "groups"), ("\\frac{1}{2} + \\frac{1}{3} =", "fractions"),
    ("3x + 5 = 20", "balance"), ("1 + 2 + ... + 100 =", "pairs"), ("\\int_{0}^{1} \\frac{1}{1+x} dx =", "area"), ("y = x^2 - 4", "graph"),
    ("Solve the Riemann hypothesis", "none"), ("\\int_0^4 x^2 dx = [x^3/3]_0^4", "area"), ("2 + 2 = 8", "count"), ("$1 \\times 100 = 100$", "groups"),
    # never seen, OCR-style
    ("$5+3=$", "count"), ("$12 - 7 =$", "count"), ("$345 + 78 =$", "number_line"), ("$7 \\times 8 = 54$", "groups"),
    ("$\\frac{3}{4} + \\frac{1}{2} = \\frac{4}{6}$", "fractions"), ("$\\frac{2}{5} - \\frac{1}{10} =$", "fractions"), ("$2x - 3 = 11$", "balance"),
    ("$4x + 1 = 2x + 9$", "balance"), ("$1 + 2 + 3 + \\cdots + 30 =$", "pairs"), ("$\\int_{1}^{2} \\frac{1}{x} dx$", "area"),
    ("$\\int_{0}^{\\pi} \\sin x \\, dx =$", "area"), ("$f(x) = x^2 + 1$", "graph"), ("$y = 3x - 2$", "graph"),
    # the new kinds, never seen (different numbers and wording from the examples)
    ("$4523 + 1389 =$", "columns"), ("$7001 - 2456 =$", "columns"), ("$47 \\times 36 =$", "area_model"), ("$123 \\times 45 =$", "area_model"),
    ("$56 \\div 7 =$", "sharing"), ("$31 : 5 =$", "sharing"), ("$35\\%$ of $80$", "percent"), ("$12 - 3 \\times 2 + 1 =$", "order_ops"),
    ("$(7 - 2) \\times (3 + 1) =$", "order_ops"), ("$3^4 =$", "powers"), ("$\\log_3 81$", "powers"), ("mean of 12, 15, 9, 20", "mean"),
    ("$5x - 4 \\geq 11$", "inequality"), ("$9^2 + 12^2 = c^2$", "pythagoras"), ("$x^2 - 7x + 10 = 0$", "quadratic"), ("$3x + 2y = 12, x - y = -1$", "system"),
    ("$\\cos 45^\\circ$", "trig"), ("$\\tan(60°)$", "trig"), ("$\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}$", "limit"), ("$\\lim_{x \\to \\infty} \\frac{3x}{x+1}$", "limit"),
    ("$\\frac{d}{dx} x^4$", "derivative"), ("$f(x) = x^3 - x, f'(2) =$", "derivative"), ("P(rolling a 3) with a die", "chance"), ("bag with 2 red and 6 blue balls, P(blue)", "chance"),
    ("$\\binom{6}{3}$", "combinations"), ("$6! =$", "combinations"), ("P(A) = 0.4, P(B) = 0.25, P(A and B) independent", "tree"), ("Exercise 2", "none"), ("Name: Noor", "none"), ("$\\lim_{x \\to \\infty} \\frac{1}{x}$", "limit"), ("$\\frac{d}{dx}(x^3)$", "derivative"), ("Find the area of the triangle", "none"),
]
# Regressions, scored apart so the number above stays comparable: lines with nothing to explain (no animation, not a
# confident wrong kind) and the same exercise written another way (the OCR's braces and spaces, typed symbols).
EDGE_CASES = [
    ("", "none"), ("$ $", "none"), ("\\quad", "none"), ("...", "none"), ("0", "none"), ("= 0", "none"), ("= 0.5", "none"), ("= \\frac{1}{2}", "none"),
    ("Convert 3 km to metres", "units"), ("Is 17 a prime number?", "none"), ("Homework due Friday 28th", "none"), ("What time is it?", "none"),
    ("Factors of 12: 1, 2, 3, 4, 6, 12", "none"), ("Find the perimeter of a rectangle 5 cm by 3 cm", "none"), ("21/11/2026", "none"),
    ("\\lim_{x \\to 1} \\frac{x^{2} - 1}{x - 1}", "limit"), ("\\lim_{x \\to \\infty} \\frac{x^{2} + 1}{2x^{2}}", "limit"),
    ("\\frac {1}{2} + \\frac {1}{3} =", "fractions"), ("\\frac{2^{2}}{3} + \\frac{1}{3} =", "fractions"), ("c = \\sqrt{6^{2} + 8^{2}}", "pythagoras"),
    ("2³ =", "powers"), ("6 * 7 =", "groups"), ("6·7 =", "groups"), ("sin 30° =", "trig"), ("½ + ¼ =", "fractions"), ("c = √(3² + 4²)", "pythagoras"),
]


def score(d, cases):
    ok, times, wrong = 0, [], []
    for text, want in cases:
        r = d.decide(text)
        times.append(r["ms"])
        if r["kind"] == want:
            ok += 1
        else:
            wrong.append(f"  {text!r}: got {r['kind']} ({r['probability']}), want {want}; nearest: {r['nearest']!r}")
    return ok, sorted(times)[len(times) // 2], wrong


if __name__ == "__main__":
    d = Decider()
    ok, median, wrong = score(d, CASES)
    print(f"{ok}/{len(CASES)} right, median {median} ms per decision")
    print("\n".join(wrong))
    ok, _, wrong = score(d, EDGE_CASES)
    print(f"edge cases: {ok}/{len(EDGE_CASES)} right")
    print("\n".join(wrong))
    ok, _, wrong = score(d, DOMAIN_CASES)
    print(f"reading and science: {ok}/{len(DOMAIN_CASES)} right")
    print("\n".join(wrong))
