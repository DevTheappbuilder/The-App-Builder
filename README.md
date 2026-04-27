# Python Discord Escrow Bot

This repository is Python-first and runs on `discord.py` with MongoDB (Motor). HTTP price requests use Python stdlib (no `aiohttp` build step).

## Quick start (Windows)

Open **Command Prompt** in the project directory:

```bat
py -m venv .venv
.venv\Scripts\activate
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
copy .env.example .env
py main.py
```

If you get `ModuleNotFoundError: No module named 'motor'`, dependencies were not installed in your active Python environment. Re-run:

```bat
py -m pip install -r requirements.txt
```

If you get `ConfigurationError: No default database name defined or provided`, either:

1. Put database name in URI (example `mongodb://127.0.0.1:27017/escrow_bot`), or
2. Set `MONGO_DB_NAME=escrow_bot` in `.env`.

This bot now safely falls back to `MONGO_DB_NAME` if URI has no DB name.

## Quick start (macOS/Linux)

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
python main.py
```

## Required env vars

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `MONGO_URI`

## Features

- Advanced escrow lifecycle with stages
- Button + modal based flow (no message commands)
- Dispute freeze + support escalation
- Timeouts and auto-release processing
- Price conversion and buffered crypto quotes
- Reputation, invoices, analytics
- Admin controls: resolve/refund/force-complete


## Deal UX

All deal lifecycle actions are button-driven inside the deal thread/channel. Slash commands are kept minimal (`/buy`, `/setwallet`, `/wallet`, `/ltc`).
