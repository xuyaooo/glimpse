#!/usr/bin/env bash
# LoRA fine-tune of the tutor (Qwen3.5-9B) on a Mac with MLX, then use it in Glimpse via Ollama.
#
# Status: prepared, not run yet in this project. Needs Apple Silicon and about 16 GB of free
# memory (4-bit base). Check the flags of your mlx-lm version with: models/.venv/bin/mlx_lm.lora --help
#
#   python3 models/qwen/build_dataset.py        # data/train.jsonl + valid.jsonl, from saved sessions
#   (review them: fix vague or wrong answers; see models/README.md)
#   models/qwen/finetune_mlx.sh                 # ITERS=600 BASE=mlx-community/Qwen3.5-9B-MLX-4bit by default
#
# Then in .env.local:  TUTOR_MODEL=glimpse-tutor   (and restart npm run dev)
set -euo pipefail
cd "$(dirname "$0")"

BASE="${BASE:-mlx-community/Qwen3.5-9B-MLX-4bit}" # the text model Ollama's qwen3.5 comes from, for MLX
ITERS="${ITERS:-600}"
NAME="${NAME:-glimpse-tutor}"
VENV=../.venv

[ -s data/train.jsonl ] || { echo "No data/train.jsonl: run python3 models/qwen/build_dataset.py first"; exit 1; }
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade mlx-lm

echo "1. LoRA training ($ITERS steps): only the tutor's answers are learned (--mask-prompt)"
"$VENV/bin/mlx_lm.lora" --model "$BASE" --train --data data --iters "$ITERS" --batch-size 1 \
  --num-layers 16 --learning-rate 1e-5 --mask-prompt --adapter-path out/adapters

echo "2. Loss on the held-out examples (data/valid.jsonl), base vs fine-tuned"
"$VENV/bin/mlx_lm.lora" --model "$BASE" --data data --test --adapter-path out/adapters

echo "3. Merge the adapter into the model"
"$VENV/bin/mlx_lm.fuse" --model "$BASE" --adapter-path out/adapters --save-path out/fused --dequantize

echo "4. Into Ollama as $NAME"
cat >out/Modelfile <<EOF
FROM ./fused
PARAMETER temperature 0.3
EOF
if ollama create "$NAME" -f out/Modelfile; then
  echo "Done: set TUTOR_MODEL=$NAME in .env.local and restart npm run dev."
else
  echo "Ollama could not import out/fused directly. Convert it to GGUF with llama.cpp"
  echo "(python convert_hf_to_gguf.py out/fused --outfile out/$NAME.gguf), put FROM ./$NAME.gguf in out/Modelfile, and run ollama create again."
fi
