from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone

try:
    import discord
    from discord.ext import commands, tasks
except ModuleNotFoundError as exc:
    missing = exc.name or 'dependency'
    print(
        f"[startup error] Missing Python package: {missing}\n"
        "Install dependencies first:\n"
        "  py -m pip install -r requirements.txt\n"
        "Then run:\n"
        "  py main.py"
    )
    sys.exit(1)

try:
    from bot.config import get_settings
    from bot.database import Database
    from bot.services.deal_service import process_timeouts
    from bot.utils.logger import build_logger
except ModuleNotFoundError as exc:
    missing = exc.name or 'dependency'
    print(
        f"[startup error] Missing Python package: {missing}\n"
        "Install dependencies first:\n"
        "  py -m pip install -r requirements.txt\n"
        "Then run:\n"
        "  py main.py"
    )
    sys.exit(1)

logger = build_logger()


class EscrowBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.guilds = True
        intents.messages = True
        intents.dm_messages = True
        intents.message_content = True

        super().__init__(command_prefix='.', intents=intents)
        self.settings = get_settings()
        self.db = Database(self.settings.mongo_uri, self.settings.mongo_db_name)
        self.cooldowns: dict[tuple[int, str], datetime] = {}

    async def setup_hook(self) -> None:
        await self.db.ensure_indexes()
        await self.load_extension('bot.cogs.marketplace')
        await self.load_extension('bot.cogs.prefix_tools')
        synced = await self.tree.sync()
        logger.info('synced %s app commands', len(synced))

        self.timeout_task.start()

    async def on_ready(self):
        logger.info('Logged in as %s (%s)', self.user, self.user.id if self.user else 'unknown')

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if not interaction.command:
            return True
        key = (interaction.user.id, interaction.command.name)
        now = datetime.now(timezone.utc)
        expires = self.cooldowns.get(key)
        if expires and expires > now:
            wait_sec = int((expires - now).total_seconds()) + 1
            await interaction.response.send_message(f'Slow down. Retry in {wait_sec}s.', ephemeral=True)
            return False

        self.cooldowns[key] = now + timedelta(seconds=self.settings.command_cooldown_seconds)
        return True

    @tasks.loop(minutes=1)
    async def timeout_task(self):
        report = await process_timeouts(self.db)
        if report['expired_cancelled'] or report['auto_released']:
            logger.info('timeouts report: %s', report)


async def main() -> None:
    bot = EscrowBot()
    await bot.start(bot.settings.discord_token)


if __name__ == '__main__':
    asyncio.run(main())
