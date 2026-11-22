"""LoRA fine-tune of GLM-OCR (zai-org/GLM-OCR, 0.9B) on reviewed photos of handwritten work.

Works with PyTorch on Apple Silicon (MPS), NVIDIA (CUDA) or CPU (slow). Only small adapter
matrices are trained (LoRA on every linear layer), so a Mac with 16 GB is enough.

    decide/.venv/bin/python -m pip install -r models/glm-ocr/requirements.txt   # or any venv with torch
    python3 models/glm-ocr/build_dataset.py --split          # after reviewing with review.py
    decide/.venv/bin/python models/glm-ocr/finetune_lora.py --dry-run
    decide/.venv/bin/python models/glm-ocr/finetune_lora.py --epochs 3
    decide/.venv/bin/python models/glm-ocr/finetune_lora.py --eval-only --adapter models/glm-ocr/out/adapter

It prints the character error rate (CER) on valid.jsonl before and after, and saves the adapter
(out/adapter) and the merged model (out/merged). The engine reads with Ollama's glm-ocr: to use
the fine-tuned one, serve out/merged with an OpenAI-compatible server (e.g. vLLM or
mlx_vlm.server) and point OCR_BASE_URL / OCR_MODEL at it (see models/README.md).
The functions below are what models/train_small_models.ipynb calls, one step at a time.
"""
import argparse
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "out")
BASE = "zai-org/GLM-OCR"
PROMPT = "Text Recognition:"  # what the engine asks GLM-OCR (server/engine/reader.js)
# LoRA on the language model only: the vision encoder stays frozen (training it too would keep
# every activation of a ~7,000-patch photo for the backward pass)
LORA_TARGETS = r".*language_model.*\.(q_proj|k_proj|v_proj|o_proj|gate_up_proj|down_proj)"
TRAIN_SIDE = 1024  # training photos are scaled to this longest side (memory); reading uses them as they are


def read(name, data=DATA):
    path = os.path.join(data, name)
    if not os.path.exists(path):
        raise SystemExit(f"{path} is missing: run build_dataset.py --split (after review.py)")
    return [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]


def cer(ref, hyp):
    """Character error rate: edit distance / length. Spaces, $ and braces are ignored
    (\\int_{0}^{1} and \\int_0^1 are the same reading)."""
    norm = lambda t: "".join(ch for ch in t if ch not in "${} \t\n")  # noqa: E731
    a, b = norm(ref), norm(hyp)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / max(1, len(a))


def device_and_dtype():
    import torch

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    return device, (torch.bfloat16 if device != "cpu" else torch.float32)


def load(base=BASE):
    """The processor and the model (downloads it the first time, ~2.2 GB)."""
    from transformers import AutoModelForImageTextToText, AutoProcessor

    device, dtype = device_and_dtype()
    processor = AutoProcessor.from_pretrained(base)
    model = AutoModelForImageTextToText.from_pretrained(base, dtype=dtype).to(device)
    print(f"{base} on {device}, {sum(p.numel() for p in model.parameters()) / 1e9:.2f}B parameters")
    return model, processor


def inputs_for(model, processor, image_path, answer=None, max_side=None):
    """The model's inputs for one photo; with the answer, labels that learn the answer only."""
    from PIL import Image

    image = Image.open(image_path).convert("RGB")
    if max_side and max(image.size) > max_side:
        image.thumbnail((max_side, max_side))
    msgs = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
    prompt = processor.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False)
    if answer is None:
        return processor(images=[image], text=[prompt], return_tensors="pt").to(model.device)
    # the answer ends the way GLM-OCR ends a turn: with the next turn's <|user|> (not <|endoftext|>)
    vocab = processor.tokenizer.get_vocab()
    end = "<|user|>" if "<|user|>" in vocab else (processor.tokenizer.eos_token or "")
    inputs = processor(images=[image], text=[prompt + answer + end], return_tensors="pt").to(model.device)
    n_prompt = processor(images=[image], text=[prompt], return_tensors="pt")["input_ids"].shape[1]
    labels = inputs["input_ids"].clone()
    labels[:, :n_prompt] = -100  # not the prompt or the picture
    inputs["labels"] = labels
    return inputs


def loss_of(model, inputs):
    """The training loss on the answer's tokens only, in float32. (Passing labels= to the model
    computes it over every position of the long image prompt in bf16, which crashes PyTorch's
    Apple GPU backend; the answer is a few tokens, so this is also much lighter.)"""
    import torch

    labels = inputs["labels"]
    logits = model(**{k: v for k, v in inputs.items() if k != "labels"}).logits
    target = labels[:, 1:]
    keep = target != -100
    picked = logits[:, :-1][keep].float()  # (answer tokens, vocabulary)
    return torch.nn.functional.cross_entropy(picked, target[keep])


def transcribe(model, processor, image_path, max_new_tokens=256):
    import torch

    inputs = inputs_for(model, processor, image_path)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    return processor.decode(out[0, inputs["input_ids"].shape[1] :], skip_special_tokens=True).strip()


def evaluate(model, processor, rows, data=DATA, show=0):
    """Mean CER on rows of {images: [path], messages: [prompt, answer]}."""
    model.eval()
    scores = []
    for i, ex in enumerate(rows):
        ref = ex["messages"][1]["content"]
        hyp = transcribe(model, processor, os.path.join(data, ex["images"][0]))
        scores.append(cer(ref, hyp))
        if i < show:
            print(f"  expected: {ref!r}\n  read:     {hyp!r}  (CER {scores[-1]:.2f})")
    return sum(scores) / max(1, len(scores))


def add_lora(model, rank=16):
    """Freezes the model and adds small trainable adapters to the language model's layers."""
    from peft import LoraConfig, get_peft_model

    lora = get_peft_model(model, LoraConfig(r=rank, lora_alpha=2 * rank, lora_dropout=0.05, target_modules=LORA_TARGETS))
    lora.print_trainable_parameters()
    return lora


def check_step(model, processor, ex, rank=16, data=DATA):
    """Adds LoRA and runs one forward + backward pass on one example, without changing the weights.
    Returns (loss, the model with its adapters)."""
    lora = add_lora(model, rank)
    inputs = inputs_for(lora, processor, os.path.join(data, ex["images"][0]), ex["messages"][1]["content"], TRAIN_SIDE)
    loss = loss_of(lora, inputs)
    loss.backward()
    grads = [p.grad for p in lora.parameters() if p.grad is not None]
    print(f"{inputs['input_ids'].shape[1]} tokens, {len(grads)} adapter tensors got a gradient")
    lora.zero_grad()
    return loss.item(), lora


def train(model, processor, rows, epochs=3, lr=1e-4, data=DATA, log=print):
    import torch

    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=lr)
    for epoch in range(1, epochs + 1):
        model.train()
        random.Random(epoch).shuffle(rows)
        total = 0.0
        for i, ex in enumerate(rows, 1):
            loss = loss_of(model, inputs_for(model, processor, os.path.join(data, ex["images"][0]), ex["messages"][1]["content"], TRAIN_SIDE))
            loss.backward()
            opt.step()
            opt.zero_grad()
            total += loss.item()
            if log and i % 20 == 0:
                log(f"  epoch {epoch} step {i}/{len(rows)} loss {total / i:.4f}")
        log(f"epoch {epoch}: mean loss {total / max(1, len(rows)):.4f}")
    return model


def save(model, processor, out=OUT):
    os.makedirs(out, exist_ok=True)
    model.save_pretrained(os.path.join(out, "adapter"))
    model.merge_and_unload().save_pretrained(os.path.join(out, "merged"))
    processor.save_pretrained(os.path.join(out, "merged"))
    print(f"saved {os.path.join(out, 'adapter')} and {os.path.join(out, 'merged')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--dry-run", action="store_true", help="load, one forward pass, no training")
    ap.add_argument("--eval-only", action="store_true")
    ap.add_argument("--adapter", help="an adapter to load (for --eval-only)")
    a = ap.parse_args()

    model, processor = load(a.base)
    train_rows, valid_rows = read("train.jsonl"), read("valid.jsonl")
    if a.dry_run:
        print(f"one training step works, loss {check_step(model, processor, train_rows[0], a.rank)[0]:.3f}")
        return
    if a.eval_only:
        if a.adapter:
            from peft import PeftModel

            model = PeftModel.from_pretrained(model, a.adapter)
        print(f"CER on valid: {evaluate(model, processor, valid_rows, show=3):.3f}")
        return
    print(f"CER on valid before: {evaluate(model, processor, valid_rows):.3f}")
    model = train(add_lora(model, a.rank), processor, train_rows, a.epochs, a.lr)
    print(f"CER on valid after: {evaluate(model, processor, valid_rows, show=3):.3f}")
    save(model, processor)


if __name__ == "__main__":
    main()
