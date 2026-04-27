# Python Discord Escrow Bot

This repository is now Python-first and runs on `discord.py` with MongoDB (Motor).

## Run

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
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
