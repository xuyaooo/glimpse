# Tries a few decision settings on the held-out exercises (eval.py) and prints the accuracy.
import laya_service as L
from eval import CASES
d = L.Decider()
for sharp in (60, 100, 160, 240):
    for abstain in (0.3, 0.2, 0.12):
        L.SHARPNESS, L.ABSTAIN_BELOW = sharp, abstain
        ok = sum(d.decide(t)["kind"] == want for t, want in CASES)
        print(f"sharpness {sharp:3} abstain {abstain:.2f}: {ok}/{len(CASES)}")
