# Python Discord Escrow Bot

This repository is Python-first and runs on `discord.py` with MongoDB (Motor).

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

If you get `ModuleNotFoundError: No module named 'motor'`, it means dependencies were not installed in your active Python environment. Re-run:

```bat
py -m pip install -r requirements.txt
```

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
