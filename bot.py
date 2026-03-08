import os
import asyncio

try:
    import audioop  # Python <=3.12 stdlib or provided by audioop-lts on 3.13+
except ModuleNotFoundError as exc:
    raise SystemExit(
        "Missing 'audioop' module. On Python 3.13+, install requirements including audioop-lts."
    ) from exc

import discord
from discord.ext import commands
from dotenv import load_dotenv

from hyper_bet.database.db import init_db


def looks_like_token(token: str | None) -> bool:
    if not token or token.strip() == "":
        return False
    if any(x in token.lower() for x in ["your_", "token_here", "example"]):
        return False
    return token.count(".") == 2


class HyperBetBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.none()
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        await self.load_extension("hyper_bet.cogs.casino_bot")
        await self.tree.sync()


async def main():
    load_dotenv()
    init_db()

    token = os.getenv("DISCORD_TOKEN")
    if not looks_like_token(token):
        raise SystemExit("DISCORD_TOKEN is missing or invalid. Set your real bot token.")

    bot = HyperBetBot()

    @bot.event
    async def on_ready():
        if bot.user:
            await bot.change_presence(activity=discord.Game(name="🎰 Hyper Bet | Casino"))
            print(f"Logged in as {bot.user}.")

    async with bot:
        await bot.start(token)


if __name__ == "__main__":
    asyncio.run(main())
