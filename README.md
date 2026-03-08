# Hyper Bet (Python)

Hyper Bet is a Discord casino bot implemented in **Python** using **discord.py 2.x**.

## Features
- Provably-fair HMAC-SHA256 RNG (server seed + client seed + nonce)
- SQLite persistence (users, balances, stats, house, fairness)
- 96% target RTP tracking + 1% jackpot contribution
- Games: coinflip, dice, limbo, blackjack (+ hit/stand/double/split)
- Economy: balance, daily, leaderboard, tip, stats
- Admin: mint, removepoints, setpoints, rotateseed

## Install
1. `python -m venv .venv`
2. `source .venv/bin/activate` (Linux/macOS) or `.venv\\Scripts\\activate` (Windows)
3. `pip install -r requirements.txt`
4. `cp .env.example .env`
5. Fill `DISCORD_TOKEN`
6. Run: `python bot.py`

## Commands
- `/balance`, `/daily`, `/leaderboard`, `/tip`, `/stats`
- `/seed`, `/setseed`, `/rotateseed`
- `/cf`, `/dice`, `/limbo`, `/blackjack`, `/hit`, `/stand`, `/double`, `/split`
- `/mint`, `/removepoints`, `/setpoints`

## Notes
- Python 3.13+: `audioop` was removed from stdlib, so this project includes `audioop-lts` in requirements for compatibility.
- Slash commands are synced automatically at startup.
- Bot status is set to: `🎰 Hyper Bet | Casino`
