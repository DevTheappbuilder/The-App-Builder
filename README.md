# Hyper Bet (Python)

Hyper Bet is a Discord casino bot implemented in **Python** using **discord.py 2.x**.

## Features
- Provably-fair HMAC-SHA256 RNG (server seed + client seed + nonce)
- SQLite persistence (users, balances, stats, house, fairness)
- 96% target RTP tracking
- Games: coinflip, dice, limbo, blackjack (+ hit/stand/double/split)
- Economy: balance, daily, leaderboard, tip, stats
- Admin: mint, removepoints, setpoints, rotateseed
- Prefix command system with `.` and custom `.help`

## Install
1. `python -m venv .venv`
2. `source .venv/bin/activate` (Linux/macOS) or `.venv\\Scripts\\activate` (Windows)
3. `pip install -r requirements.txt`
4. `cp .env.example .env`
5. Fill `DISCORD_TOKEN`
6. Run: `python bot.py`

## Commands (prefix: `.`)
- `.help`
- `.balance`, `.daily`, `.leaderboard`, `.tip @user amount`, `.stats`
- `.seed`, `.setseed <seed>`, `.rotateseed`
- `.cf <amount> <heads/tails>`, `.dice <amount> <target>`, `.limbo <amount> <multiplier>`
- `.blackjack <amount>`, `.hit`, `.stand`, `.double`, `.split`
- `.mint @user <amount>`, `.removepoints @user <amount>`, `.setpoints @user <amount>`

## Notes
- Python 3.13+: `audioop` was removed from stdlib, so this project includes `audioop-lts` in requirements for compatibility.
- Bot status is set to: `🎰 Hyper Bet | Casino`
