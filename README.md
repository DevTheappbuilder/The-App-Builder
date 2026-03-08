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

## Deployment Notes
- If your deploy platform starts the bot from a different working directory, set:
  - `COMMANDS_DIR=/absolute/path/to/commands`
- The bot and command registrar both auto-check these command paths in order:
  1. `COMMANDS_DIR`
  2. `<project>/commands` (relative to script location)
  3. `<cwd>/commands`


## Pterodactyl / Panel Startup Tips
- Ensure startup `MAIN_FILE` is `index.js` for runtime (and run `node register-commands.js` manually when needed).
- Add environment variables in the panel:
  - `DISCORD_TOKEN` = your real bot token
  - `CLIENT_ID` = your bot application/client ID
  - optional `COMMANDS_DIR` if your panel uses a different working directory
- Do **not** leave `DISCORD_TOKEN` as placeholder text (the bot now validates token format and exits with a clear message).

## Commands
Economy:
- `/balance`, `/daily`, `/leaderboard`, `/tip`, `/stats`

Fairness:
- `/seed`, `/setseed`, `/rotateseed`

Casino:
- `/cf`, `/dice`, `/limbo`, `/blackjack`, `/hit`, `/stand`, `/double`, `/split`

Admin:
- `/mint`, `/removepoints`, `/setpoints`
