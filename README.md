# Hyper Bet

Professional Discord casino bot built with Node.js + discord.js v14.

## Features
- Provably fair HMAC-SHA256 RNG (server seed + client seed + nonce)
- 96% target RTP with house-edge aware dynamic adjustment
- Games: Coinflip, Dice, Limbo, Blackjack (6 decks, soft 17 stand, splits, doubles)
- Economy: balance, daily, tip, leaderboard, stats
- Admin controls: mint, removepoints, setpoints
- Jackpot pool (1% of all wagers)
- SQLite persistence

## Setup
1. `cp .env.example .env`
2. Fill in `DISCORD_TOKEN` and `CLIENT_ID`
3. `npm install`
4. `npm run register`
5. `npm start`

## Commands
Economy:
- `/balance`, `/daily`, `/leaderboard`, `/tip`, `/stats`

Fairness:
- `/seed`, `/setseed`, `/rotateseed`

Casino:
- `/cf`, `/dice`, `/limbo`, `/blackjack`, `/hit`, `/stand`, `/double`, `/split`

Admin:
- `/mint`, `/removepoints`, `/setpoints`
