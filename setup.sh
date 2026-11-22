#!/usr/bin/env bash
# Glimpse: set everything up on this computer, in one go. Run it again any time: it only does
# what is missing, and it can switch between local and cloud models.
#
#   ./setup.sh                 asks which models to use
#   ./setup.sh --local         everything on this computer with Ollama (glm-ocr + qwen3.5): free, private
#   ./setup.sh --openrouter    the models in the cloud, through OpenRouter: no Ollama or GPU, needs a key
#   ./setup.sh --hybrid        reading on this computer (glm-ocr), the tutor in the cloud (OpenRouter)
#
#   --no-laya     skip Laya, the animation decision model (the engine's rules decide instead)
#   --test        run the unit tests at the end
#   --yes         ask nothing: local models unless a mode is given; the OpenRouter key then comes
#                 from OPENROUTER_API_KEY or from .env.local
#
# Cloud model choice (OpenRouter ids), optional:
#   OCR_MODEL=google/gemini-3.8-flash TUTOR_MODEL=anthropic/claude-haiku-5.5 ./setup.sh --openrouter
#
# Settings are written to .env.local (never committed). Then: npm run dev -> http://localhost:5173
# Windows: run it in WSL or Git Bash.
set -euo pipefail
cd "$(dirname "$0")"

MODE=""
LAYA=1
TESTS=0
ASK=1
for arg in "$@"; do
  case "$arg" in
    --local) MODE=local ;;
    --openrouter | --cloud) MODE=openrouter ;;
    --hybrid) MODE=hybrid ;;
    --no-laya) LAYA=0 ;;
    --test) TESTS=1 ;;
    --yes | -y) ASK=0 ;;
    -h | --help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see ./setup.sh --help)"; exit 1 ;;
  esac
done
[ -t 0 ] || ASK=0 # not a terminal: nothing to ask

OPENROUTER_URL="${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
CLOUD_OCR="${OCR_MODEL:-qwen/qwen3.8-flash}"
CLOUD_TUTOR="${TUTOR_MODEL:-anthropic/claude-haiku-5.5}"
LOCAL_OCR="glm-ocr"
LOCAL_TUTOR="qwen3.5"
OLLAMA="${OLLAMA_URL:-http://127.0.0.1:11434}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
note() { printf '  · %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
yes_no() { # yes_no "question" default(y/n)
  local d="$2" a
  [ "$ASK" = 1 ] || { [ "$d" = y ]; return; }
  read -r -p "  $1 [$([ "$d" = y ] && echo Y/n || echo y/N)] " a || true
  a="${a:-$d}"
  [[ "$a" =~ ^[Yy] ]]
}

# .env.local: one setting per line. Values go through the environment (not the command line),
# so the key never shows in the process list.
env_set() { # env_set NAME VALUE
  ENV_NAME="$1" ENV_VALUE="$2" node -e '
    const fs = require("fs"), f = ".env.local", { ENV_NAME: k, ENV_VALUE: v } = process.env
    let lines = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n") : ["# Glimpse settings, written by setup.sh. Keep this file private: it can hold your API key."]
    lines = lines.filter((l) => !new RegExp(`^\\s*${k}\\s*=`).test(l))
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    lines.push(`${k}=${/[\s#"{]/.test(v) ? `'"'"'${v}'"'"'` : v}`)
    fs.writeFileSync(f, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 })'
}
env_del() { # env_del NAME...
  [ -f .env.local ] || return 0
  ENV_NAMES="$*" node -e '
    const fs = require("fs"), f = ".env.local", names = process.env.ENV_NAMES.split(" ")
    const lines = fs.readFileSync(f, "utf8").split("\n").filter((l) => !names.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(l)))
    fs.writeFileSync(f, lines.join("\n").replace(/\n*$/, "\n"))'
}
env_get() { # env_get NAME -> its value in .env.local, or nothing
  [ -f .env.local ] || return 0
  ENV_NAME="$1" node -e '
    const fs = require("fs"), m = fs.readFileSync(".env.local", "utf8").match(new RegExp(`^\\s*${process.env.ENV_NAME}\\s*=\\s*(.*)$`, "m"))
    if (m) process.stdout.write(m[1].trim().replace(/^(["'"'"'])(.*)\1$/, "$2"))'
}

# ---------------------------------------------------------------- 1. Node and the packages
bold "1. Node.js and the packages"
command -v node >/dev/null || fail "Node.js is missing. Install Node 20 or newer: https://nodejs.org (or: brew install node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node $(node -v) is too old: Glimpse needs Node 20 or newer (https://nodejs.org)"
ok "Node $(node -v)"
npm install --no-audit --no-fund --loglevel=error
ok "engine packages"
npm --prefix web install --no-audit --no-fund --loglevel=error
ok "app packages (web/)"

# ---------------------------------------------------------------- 2. which models
bold "2. The AI models"
if [ -z "$MODE" ]; then
  if [ "$ASK" = 1 ]; then
    echo "  Where should the models run?"
    echo "    1) On this computer, with Ollama (free, private; downloads about 9 GB once)   [default]"
    echo "    2) In the cloud, with OpenRouter (no download; needs an OpenRouter key, pay per use)"
    echo "    3) Both: reading on this computer, the tutor in the cloud"
    read -r -p "  Choose 1, 2 or 3: " choice || true
    case "${choice:-1}" in 2) MODE=openrouter ;; 3) MODE=hybrid ;; *) MODE=local ;; esac
  else
    MODE=local
  fi
fi
note "mode: $MODE"

need_ollama() {
  if ! command -v ollama >/dev/null; then
    if [ "$(uname)" = Darwin ] && command -v brew >/dev/null && yes_no "Ollama is not installed. Install it with Homebrew now?" y; then
      brew install ollama
    else
      fail "Ollama is missing. Install it from https://ollama.com/download, then run ./setup.sh again (or use ./setup.sh --openrouter)"
    fi
  fi
  ok "Ollama $(ollama --version 2>/dev/null | grep -oE '[0-9]+\.[0-9.]+' | head -1)"
  if ! curl -s -m 3 "$OLLAMA/api/tags" >/dev/null; then
    note "starting Ollama..."
    if [ "$(uname)" = Darwin ] && [ -d /Applications/Ollama.app ]; then open -a Ollama; else (nohup ollama serve >/dev/null 2>&1 &); fi
    for _ in $(seq 1 30); do curl -s -m 2 "$OLLAMA/api/tags" >/dev/null && break; sleep 1; done
    curl -s -m 3 "$OLLAMA/api/tags" >/dev/null || fail "Ollama doesn't answer on $OLLAMA. Start it (ollama serve), then run ./setup.sh again"
  fi
  ok "Ollama answers on $OLLAMA"
}
pull() { # pull MODEL: only downloads what changed
  note "ollama pull $1 (the first time downloads a few GB)"
  ollama pull "$1" || fail "could not download $1 with Ollama"
  ok "model $1"
}
openrouter_key() {
  local key="${OPENROUTER_API_KEY:-}"
  local saved
  saved="$(env_get AI_API_KEY)"
  if [ -n "$key" ] && { [ -z "$saved" ] || yes_no "Use the key in OPENROUTER_API_KEY?" y; }; then :
  elif [ -n "$saved" ] && [ "$PREV_BASE_URL" = "$OPENROUTER_URL" ] && yes_no "Keep the OpenRouter key already saved in .env.local?" y; then key="$saved"
  elif [ "$ASK" = 1 ]; then
    echo "  An OpenRouter key: https://openrouter.ai/keys (it is saved only in .env.local, on this computer)."
    read -r -s -p "  Paste it here (hidden): " key || true
    echo
  fi
  [ -n "$key" ] || fail "no OpenRouter key: set OPENROUTER_API_KEY, or run ./setup.sh without --yes to paste it"
  [[ "$key" =~ ^[[:graph:]]+$ ]] || fail "that key has spaces or line breaks in it: paste it again"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 -H "Authorization: Bearer $key" "$OPENROUTER_URL/key" || true)"
  case "$code" in
    200) ok "OpenRouter key works" ;;
    401 | 403) fail "OpenRouter refused this key (HTTP $code). Check it at https://openrouter.ai/keys" ;;
    *) warn "couldn't check the key with OpenRouter (HTTP ${code:-none}); saving it anyway" ;;
  esac
  KEY="$key"
}
use_cloud() { # the OpenRouter settings shared by --openrouter and --hybrid
  env_set AI_API_KEY "$KEY"
  env_set AI_BASE_URL "$OPENROUTER_URL"
  env_set AI_THINK_OFF '{"reasoning":{"enabled":false}}'
  env_set TUTOR_MODEL "$CLOUD_TUTOR"
}

# Everything is checked first (Ollama, the models, the key); only then are the settings this
# script manages replaced, so switching modes leaves nothing behind and a failed run changes
# nothing. The key stays in local mode: switching back to the cloud doesn't need it again.
PREV_BASE_URL="$(env_get AI_BASE_URL)"
KEY=""
case "$MODE" in
  local) need_ollama; pull "$LOCAL_OCR"; pull "$LOCAL_TUTOR" ;;
  openrouter) openrouter_key ;;
  hybrid) need_ollama; pull "$LOCAL_OCR"; openrouter_key ;;
esac
env_del AI_PROVIDER AI_BASE_URL AI_THINK_OFF AI_MODEL OCR_PROVIDER OCR_BASE_URL OCR_API_KEY OCR_MODEL TUTOR_PROVIDER TUTOR_BASE_URL TUTOR_API_KEY TUTOR_MODEL
case "$MODE" in
  openrouter)
    use_cloud
    env_set OCR_MODEL "$CLOUD_OCR"
    ;;
  hybrid)
    use_cloud
    env_set OCR_PROVIDER ollama
    env_set OCR_MODEL "$LOCAL_OCR"
    ;;
esac
# what the engine will use, read back the way the engine reads it
node --input-type=module -e '
  import { existsSync } from "node:fs"
  if (existsSync(".env.local")) process.loadEnvFile(".env.local")
  const { roleConfig } = await import("./server/llm.js")
  for (const role of ["ocr", "tutor"]) {
    const c = roleConfig(role)
    console.log(`  \x1b[32m✓\x1b[0m ${role === "ocr" ? "reading the paper" : "the tutor"}: ${c.model} (${c.provider === "ollama" ? "Ollama, this computer" : c.baseUrl})`)
  }'

# ---------------------------------------------------------------- 3. Laya (optional)
bold "3. Laya, the animation decision model (optional)"
if [ "$LAYA" = 0 ]; then
  note "skipped (--no-laya): the engine's rules pick the animations"
else
  PY=""
  for p in python3.15 python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$p" >/dev/null && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then PY="$p"; break; fi
  done
  if [ -z "$PY" ]; then
    warn "Python 3.10+ not found: Laya is skipped (the engine's rules pick the animations). Install Python, then run ./setup.sh again"
  else
    [ -x decide/.venv/bin/python ] || "$PY" -m venv decide/.venv
    note "installing Laya's packages (about 1 GB the first time)"
    decide/.venv/bin/python -m pip install --quiet --upgrade pip
    decide/.venv/bin/python -m pip install --quiet -r decide/requirements.txt
    ok "Laya ready ($("$PY" --version)); its weights download on the first npm run dev"
  fi
fi

# ---------------------------------------------------------------- 4. check
if [ "$TESTS" = 1 ]; then
  bold "4. Tests"
  npm test --silent 2>&1 | grep -E '^ℹ (tests|pass|fail)' || true
fi

bold "Done."
echo "  Start everything:  npm run dev     then open http://localhost:5173"
echo "  Settings:          .env.local      (switch models any time: ./setup.sh --local | --openrouter | --hybrid)"
echo "  Test the pipeline: npm run e2e     (while npm run dev runs)"
