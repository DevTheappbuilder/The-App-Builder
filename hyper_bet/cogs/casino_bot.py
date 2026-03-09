import time
import discord
from discord.ext import commands

from hyper_bet.database.db import get_conn
from hyper_bet.database.economy import get_user, change_balance, set_balance, get_house, TARGET_RTP
from hyper_bet.casino.games import ensure_bankroll, settle_game, get_roll, rtp_adjusted
from hyper_bet.casino.blackjack import start_game, action, settle, get_state, hand_value
from hyper_bet.fairness.provably_fair import get_server_seed_state, set_client_seed, rotate_server_seed


def hand_render(state, reveal_dealer=False):
    dealer = f"[{', '.join(state.dealer)}]" if reveal_dealer else f"[{state.dealer[0]}, ?]"
    lines = [f"Dealer: {dealer}"]
    for idx, h in enumerate(state.hands):
        total = hand_value(h.cards)[0]
        marker = "👉 " if idx == state.active_hand and not state.finished else ""
        lines.append(f"{marker}Hand {idx + 1}: {h.cards} = {total} ({h.wager}) {'✅' if h.done else ''}")
    return "\n".join(lines)


class BlackjackView(discord.ui.View):
    def __init__(self, cog: "HyperBetCog", user_id: int, timeout: float = 120):
        super().__init__(timeout=timeout)
        self.cog = cog
        self.user_id = user_id

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("This is not your blackjack session.", ephemeral=True)
            return False
        return True

    async def _finish_if_done(self, interaction: discord.Interaction, result_state) -> None:
        if not result_state.finished:
            await interaction.response.edit_message(
                content=f"🃏 Blackjack in progress\n{hand_render(result_state)}",
                view=self,
            )
            return

        done = settle(self.user_id)
        settle_game(self.user_id, done["total_wager"], done["payout"])
        for item in self.children:
            item.disabled = True
        await interaction.response.edit_message(
            content=(
                f"🃏 Blackjack finished\n{hand_render(done['state'], True)}\n"
                f"Outcomes: {', '.join(done['outcomes'])}\nPayout: {int(done['payout'])}"
            ),
            view=self,
        )
        self.stop()

    @discord.ui.button(label="Hit", style=discord.ButtonStyle.primary)
    async def hit_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        result = action(self.user_id, "hit")
        if "error" in result:
            for item in self.children:
                item.disabled = True
            await interaction.response.edit_message(content=result["error"], view=self)
            self.stop()
            return
        await self._finish_if_done(interaction, result["state"])

    @discord.ui.button(label="Stand", style=discord.ButtonStyle.secondary)
    async def stand_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        result = action(self.user_id, "stand")
        if "error" in result:
            for item in self.children:
                item.disabled = True
            await interaction.response.edit_message(content=result["error"], view=self)
            self.stop()
            return
        await self._finish_if_done(interaction, result["state"])

    async def on_timeout(self):
        for item in self.children:
            item.disabled = True


class HyperBetCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.cooldowns = {}

    def on_cooldown(self, user_id: int, command: str, ms: int = 1500):
        key = f"{user_id}:{command}"
        now = int(time.time() * 1000)
        last = self.cooldowns.get(key, 0)
        if now - last < ms:
            return max(1, (ms - (now - last)) // 1000)
        self.cooldowns[key] = now
        return 0

    @commands.command(name="help")
    async def help_cmd(self, ctx: commands.Context):
        await ctx.send(
            "**Hyper Bet Commands (. prefix)**\n"
            "Economy: `.balance`, `.daily`, `.leaderboard`, `.tip @user amount`, `.stats`\n"
            "Fairness: `.seed`, `.setseed <seed>`, `.rotateseed` (admin)\n"
            "Casino: `.cf <amount> <heads/tails>`, `.dice <amount> <target>`, `.limbo <amount> <multiplier>`, `.blackjack <amount>`\n"
            "Admin: `.mint @user <amount>`, `.removepoints @user <amount>`, `.setpoints @user <amount>`"
        )

    @commands.command()
    async def balance(self, ctx: commands.Context):
        user = get_user(ctx.author.id)
        await ctx.send(f"💰 You have **{int(user['balance'])} Points**.")

    @commands.command()
    async def daily(self, ctx: commands.Context):
        user = get_user(ctx.author.id)
        now = int(time.time())
        if now - int(user["last_daily"]) < 86400:
            hours = (86400 - (now - int(user["last_daily"]))) // 3600
            return await ctx.send(f"Try again in {hours}h.")
        change_balance(ctx.author.id, 500)
        with get_conn() as conn:
            conn.execute("UPDATE users SET last_daily = ? WHERE user_id = ?", (now, str(ctx.author.id)))
        await ctx.send("✅ Claimed 500 Points.")

    @commands.command()
    async def leaderboard(self, ctx: commands.Context):
        with get_conn() as conn:
            rows = conn.execute("SELECT user_id, balance FROM users ORDER BY balance DESC LIMIT 10").fetchall()
        if not rows:
            return await ctx.send("No players yet.")
        msg = "\n".join([f"**{i+1}.** <@{r['user_id']}> — {int(r['balance'])} Points" for i, r in enumerate(rows)])
        await ctx.send(f"🏆 **Leaderboard**\n{msg}")

    @commands.command()
    async def tip(self, ctx: commands.Context, user: discord.Member, amount: int):
        if amount <= 0 or user.bot or user.id == ctx.author.id:
            return await ctx.send("Invalid tip usage.")
        sender = get_user(ctx.author.id)
        if int(sender["balance"]) < amount:
            return await ctx.send("Insufficient balance.")
        change_balance(ctx.author.id, -amount)
        change_balance(user.id, amount)
        await ctx.send(f"✅ Sent {amount} Points to {user.mention}.")

    @commands.command()
    async def stats(self, ctx: commands.Context):
        user = get_user(ctx.author.id)
        house = get_house()
        user_rtp = (float(user["total_won"]) / float(user["total_wagered"]) * 100) if float(user["total_wagered"]) else 0
        global_rtp = (float(house["total_paid"]) / float(house["total_wagered"]) * 100) if float(house["total_wagered"]) else 0
        await ctx.send(
            f"Wins: {user['wins']} | Losses: {user['losses']}\n"
            f"Total Wagered: {float(user['total_wagered']):.2f}\n"
            f"Total Won: {float(user['total_won']):.2f}\n"
            f"Your RTP: {user_rtp:.2f}% | Global RTP: {global_rtp:.2f}%"
        )

    @commands.command()
    async def seed(self, ctx: commands.Context):
        fair = get_server_seed_state()
        user = get_user(ctx.author.id)
        await ctx.send(
            f"Server Seed Hash: `{fair['server_seed_hash']}`\nClient Seed: `{user['client_seed']}`\nNonce: {user['nonce']}"
        )

    @commands.command()
    async def setseed(self, ctx: commands.Context, *, seed_value: str):
        if not seed_value or len(seed_value) > 64:
            return await ctx.send("Seed must be 1-64 characters.")
        set_client_seed(ctx.author.id, seed_value)
        await ctx.send("✅ Client seed updated and nonce reset.")

    @commands.command()
    @commands.has_permissions(administrator=True)
    async def rotateseed(self, ctx: commands.Context):
        rotated = rotate_server_seed()
        await ctx.send(f"Old seed: `{rotated['old_server_seed']}`\nNew hash: `{rotated['new_server_seed_hash']}`")

    @commands.command()
    async def cf(self, ctx: commands.Context, amount: int, side: str):
        side = side.lower()
        if amount <= 0 or side not in {"heads", "tails"}:
            return await ctx.send("Usage: `.cf <amount> <heads/tails>`")
        cd = self.on_cooldown(ctx.author.id, "cf")
        if cd:
            return await ctx.send(f"Cooldown: {cd}s")
        if not ensure_bankroll(ctx.author.id, amount):
            return await ctx.send("Insufficient points.")
        roll = get_roll(ctx.author.id)
        result = "heads" if roll["random_float"] < 0.5 else "tails"
        won = side == result
        payout = int(amount * rtp_adjusted(2 * TARGET_RTP)) if won else 0
        settle_game(ctx.author.id, amount, payout)
        await ctx.send(
            f"🪙 Result: {result.upper()}\n{'✅ Win' if won else '❌ Loss'}\nPayout: {payout}\nHash: `{roll['hash']}` | Nonce: {roll['nonce_used']}"
        )

    @commands.command()
    async def dice(self, ctx: commands.Context, amount: int, target: float):
        if amount <= 0 or not (5.0 <= target <= 95.0):
            return await ctx.send("Usage: `.dice <amount> <target 5-95>`")
        cd = self.on_cooldown(ctx.author.id, "dice")
        if cd:
            return await ctx.send(f"Cooldown: {cd}s")
        if not ensure_bankroll(ctx.author.id, amount):
            return await ctx.send("Insufficient points.")
        chance = (100 - target) / 100
        multiplier = rtp_adjusted(TARGET_RTP / chance)
        roll = get_roll(ctx.author.id)
        value = round(roll["random_float"] * 100, 2)
        won = value > target
        payout = int(amount * multiplier) if won else 0
        settle_game(ctx.author.id, amount, payout)
        await ctx.send(f"🎲 Rolled {value} > {target}\n{'✅ Win' if won else '❌ Loss'}\nPayout: {payout}\nHash: `{roll['hash']}`")

    @commands.command()
    async def limbo(self, ctx: commands.Context, amount: int, multiplier: float):
        if amount <= 0 or not (1.01 <= multiplier <= 1000.0):
            return await ctx.send("Usage: `.limbo <amount> <multiplier 1.01-1000>`")
        cd = self.on_cooldown(ctx.author.id, "limbo")
        if cd:
            return await ctx.send(f"Cooldown: {cd}s")
        if not ensure_bankroll(ctx.author.id, amount):
            return await ctx.send("Insufficient points.")
        roll = get_roll(ctx.author.id)
        crash = max(1.0, round(TARGET_RTP / (1 - min(0.999999, roll["random_float"])), 2))
        won = crash >= multiplier
        payout = int(amount * multiplier) if won else 0
        settle_game(ctx.author.id, amount, payout)
        await ctx.send(
            f"🚀 Crash: {crash}x | Target: {multiplier}x\n{'✅ Win' if won else '❌ Loss'}\nPayout: {payout}\nHash: `{roll['hash']}`"
        )

    @commands.command()
    async def blackjack(self, ctx: commands.Context, amount: int):
        if amount <= 0:
            return await ctx.send("Usage: `.blackjack <amount>`")
        if not ensure_bankroll(ctx.author.id, amount):
            return await ctx.send("Insufficient points.")
        state = start_game(ctx.author.id, amount)
        view = BlackjackView(self, ctx.author.id)
        await ctx.send(f"🃏 Blackjack started\n{hand_render(state)}\nUse buttons: Hit / Stand", view=view)

    @commands.command()
    @commands.has_permissions(administrator=True)
    async def mint(self, ctx: commands.Context, user: discord.Member, amount: int):
        if amount <= 0:
            return await ctx.send("Amount must be > 0")
        change_balance(user.id, amount)
        await ctx.send(f"Minted {amount} Points to {user.mention}")

    @commands.command()
    @commands.has_permissions(administrator=True)
    async def removepoints(self, ctx: commands.Context, user: discord.Member, amount: int):
        if amount <= 0:
            return await ctx.send("Amount must be > 0")
        u = get_user(user.id)
        if int(u["balance"]) < amount:
            return await ctx.send("User balance too low.")
        change_balance(user.id, -amount)
        await ctx.send(f"Removed {amount} Points from {user.mention}")

    @commands.command()
    @commands.has_permissions(administrator=True)
    async def setpoints(self, ctx: commands.Context, user: discord.Member, amount: int):
        if amount < 0:
            return await ctx.send("Amount must be >= 0")
        set_balance(user.id, amount)
        await ctx.send(f"Set {user.mention} balance to {amount}")


async def setup(bot: commands.Bot):
    await bot.add_cog(HyperBetCog(bot))
