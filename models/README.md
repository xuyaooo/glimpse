# Models: what Glimpse uses, what we tuned, and how to specialise them

Glimpse runs three models. Each one can be made better at our job (children's handwritten maths) with the data the app already saves. This folder holds the tools to do that.

| Model | Job in Glimpse | Runs | What we did | Ready to specialise |
|---|---|---|---|---|
| **Laya** (`convaiinnovations/laya`, 421M encoder, Apache-2.0) | picks which of the 36 animations (maths, reading, science) explains an exercise | `decide/` service, :8091 | taught by examples (no weight changes) + **a trained classification head** (`laya/`) | yes: `laya/train_head.py` (run, results below) |
| **GLM-OCR** (`zai-org/GLM-OCR`, 0.9B) | reads the whole camera photo | Ollama `glm-ocr` | used as is | dataset + review tool + LoRA script (`glm-ocr/`) |
| **Qwen3.5-9B** (`Qwen/Qwen3.5-9B`) | the tutor: verdicts, hints, answers, worked steps, summaries | Ollama `qwen3.5` | used as is, with prompts and JSON schemas (`server/engine/session.js`) | dataset + MLX LoRA script (`qwen/`) |

The data stays on this computer: every `data/` and `out/` folder below is git-ignored, except Laya's small trained head. It's children's work: only train on it with their parents' consent, and never publish the datasets.

## Laya: what we did

Laya decides with no training at all (`decide/laya_service.py`):

1. **Examples instead of training.** `decide/examples.py` and `decide/examples_domains.py` generate about 5,100 labelled exercises, for each of the 37 kinds (36 animations + "none"). It writes each one both as LaTeX, as the OCR returns it, and as plain text. Laya embeds them once at start-up. A new exercise is embedded, and its 9 closest examples vote.
2. **Laya's own answer.** `decide/questions.py` asks Laya the typed question "which animation fits?", with a description of each kind. The final probability mixes the example vote (80%) with that answer (20%).
3. **Calibration.** `decide/tune.py` searched for how sharply the closest kind wins (`SHARPNESS = 160`) and when to abstain (`ABSTAIN_BELOW = 0.2`). The search scored each setting on `decide/eval.py`, 57 exercises the examples never contain, plus 26 edge cases.
4. **Learning while it runs.** When Laya had no answer and the engine's rules found the kind, the pair is saved in `decide/learned.jsonl` and joins the examples. Test sessions never teach it.

### Fine-tuning Laya: the trained head (`laya/train_head.py`)

This trains one weight per (embedding dimension, kind): a logistic-regression head on Laya's 1024-dimension embeddings of the same examples. The decision becomes one matrix product instead of a search, and it improves as data grows (teachers' corrections can be added with `--extra file.jsonl`).

```bash
decide/.venv/bin/python models/laya/train_head.py       # ~1 minute on a Mac (MPS)
# or step by step, with explanations and results: models/train_small_models.ipynb
```

Results on exercises the training never saw (`laya/out/report.json`, also in the notebook):

| | held-out maths exercises | edge cases (non-maths lines, notation variants) | reading and science |
|---|---|---|---|
| trained head | **56/57** | **24/26** | 20/20 |
| nearest examples (what the service does, without Laya's typed answer) | 54/57 | 22/26 | 20/20 |

The head is better at saying "no animation" for lines like "What time is it?" or "Factors of 12: …". Its weights are `laya/out/head.npz`. To use it in the service, load the head next to the bank and mix its probabilities in the same place as the k-NN vote (a few lines in `Decider.decide`), then check with `decide/eval.py`.

## GLM-OCR: making the reader better at children's handwriting

```bash
python3 models/glm-ocr/build_dataset.py         # camera frames + GLM-OCR's readings -> data/ocr.jsonl
python3 models/glm-ocr/review.py                # correct the readings, photo by photo
python3 models/glm-ocr/build_dataset.py --split # reviewed pairs -> data/train.jsonl, valid.jsonl
python3 -m venv models/.venv && models/.venv/bin/pip install -r models/glm-ocr/requirements.txt
models/.venv/bin/python models/glm-ocr/finetune_lora.py --dry-run   # loads it, one forward pass
models/.venv/bin/python models/glm-ocr/finetune_lora.py --epochs 3  # LoRA, prints the error rate before/after
```

- **Where the data comes from.** When the engine runs locally, it keeps each camera frame with GLM-OCR's reading (`debug-frames/engine/`). That's 225 photos so far. The readings are only drafts: a model trained on its own mistakes learns them. Review first. Even 100–200 corrected photos of real children's writing should help.
- **Training.** `finetune_lora.py` trains LoRA adapters on every linear layer with PyTorch: Apple MPS, CUDA or CPU. It scores the character error rate on `valid.jsonl` before and after. **Status: prepared, not run yet:** start with `--dry-run`.
- **Using it.** The engine reads with Ollama's `glm-ocr`. Serve `out/merged` with any OpenAI-compatible server, for example vLLM, or `mlx_vlm.server` with the MLX build `mlx-community/GLM-OCR-bf16`. Then set `OCR_BASE_URL` and `OCR_MODEL` in `.env.local` (`server/llm.js` lets the reader use its own provider).

## Qwen: a tutor that talks like a good teacher

```bash
python3 models/qwen/build_dataset.py            # saved sessions -> data/train.jsonl + valid.jsonl (chat format)
models/qwen/finetune_mlx.sh                     # MLX LoRA on a Mac, then `ollama create glimpse-tutor`
# then in .env.local: TUTOR_MODEL=glimpse-tutor
```

- **Where the data comes from.** `build_dataset.py` reads the engine's history (`GET /api/history`) and skips test students. It makes three kinds of example: a written line → Glim's hint, a question asked by pointing → the answer, and an exercise → the worked steps (the JSON the app shows). That's 231 examples from the sessions saved so far.
- **Fix the answers first.** Training qwen3.5 on qwen3.5's own answers changes nothing. Make the targets better than the model:
  - by hand: some saved hints are vague, and some talk about an older line;
  - or with a stronger model as the teacher: rerun the same inputs through the OpenRouter tutor (`./setup.sh --openrouter`, Claude Haiku 5.5), keep the good answers, and train the local model on them (distillation).

  Mark the good ones `"reviewed": true` in the history data and use `--only-reviewed`.
- **Training.** `finetune_mlx.sh` uses `mlx-lm` with `mlx-community/Qwen3.5-9B-MLX-4bit` and learns only the answers (`--mask-prompt`). It compares the validation loss, fuses the adapter, and imports the result into Ollama (or explains the GGUF route). **Status: prepared, not run yet:** check the flags with `mlx_lm.lora --help`. This trains the text side. To train on the photos too, use `mlx-vlm`'s LoRA with `mlx-community/Qwen3.5-9B-4bit`.

## What to do next, in order

1. Collect real sessions (with consent), review 100+ OCR photos and 200+ tutor answers.
2. Laya: train the head on the reviewed exercises and wire it into the service. It's cheap and the gain is measured.
3. GLM-OCR: LoRA on reviewed photos; keep it only if the error rate on `valid.jsonl` drops.
4. Qwen: distil from a stronger cloud tutor, then compare with the e2e test (`npm run e2e`) and by reading answers side by side.
