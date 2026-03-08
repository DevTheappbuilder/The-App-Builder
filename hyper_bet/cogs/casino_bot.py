import time
from typing import Literal
import discord
from discord import app_commands
from discord.ext import commands

from hyper_bet.database.db import get_conn, get_or_create_user
from hyper_bet.database.economy import get_user, change_balance, set_balance, get_house
from hyper_bet.database.economy import TARGET_RTP
from hyper_bet.casino.games import ensure_bankroll, settle_game, get_roll, rtp_adjusted
from hyper_bet.casino.blackjack import start_game, action, settle, get_state, hand_value, can_split
from hyper_bet.fairness.provably_fair import get_server_seed_state, set_client_seed, rotate_server_seed


def hand_render(state, reveal_dealer=False):
    dealer = f"[{', '.join(state.dealer)}]" if reveal_dealer else f"[{state.dealer[0]}, ?]"
    lines = [f"Dealer: {dealer}"]
    for idx, h in enumerate(state.hands):
        total = hand_value(h.cards)[0]
        marker = "👉 " if idx == state.active_hand and not state.finished else ""
        lines.append(f"{marker}Hand {idx+1}: {h.cards} = {total} ({h.wager}) {'✅' if h.done else ''}")
    return "\n".join(lines)


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

    @app_commands.command(name="balance", description="Show your points balance")
    async def balance(self, interaction: discord.Interaction):
        user = get_user(interaction.user.id)
        await interaction.response.send_message(f"💰 You have **{int(user['balance'])} Points**.")

    @app_commands.command(name="daily", description="Claim daily reward")
    async def daily(self, interaction: discord.Interaction):
        user = get_user(interaction.user.id)
        now = int(time.time())
        if now - int(user["last_daily"]) < 86400:
            hours = (86400 - (now - int(user["last_daily"]))) // 3600
            return await interaction.response.send_message(f"Try again in {hours}h.", ephemeral=True)
        change_balance(interaction.user.id, 500)
        with get_conn() as conn:
            conn.execute("UPDATE users SET last_daily = ? WHERE user_id = ?", (now, str(interaction.user.id)))
        await interaction.response.send_message("✅ Claimed 500 Points.")

    @app_commands.command(name="leaderboard", description="View richest players")
    async def leaderboard(self, interaction: discord.Interaction):
        with get_conn() as conn:
            rows = conn.execute("SELECT user_id, balance FROM users ORDER BY balance DESC LIMIT 10").fetchall()
        if not rows:
            return await interaction.response.send_message("No players yet.")
        msg = "\n".join([f"**{i+1}.** <@{r['user_id']}> — {int(r['balance'])} Points" for i, r in enumerate(rows)])
        await interaction.response.send_message(f"🏆 **Leaderboard**\n{msg}")

    @app_commands.command(name="tip", description="Send points")
    async def tip(self, interaction: discord.Interaction, user: discord.User, amount: app_commands.Range[int, 1, None]):
        if user.bot or user.id == interaction.user.id:
            return await interaction.response.send_message("Invalid target.", ephemeral=True)
        sender = get_user(interaction.user.id)
        if int(sender["balance"]) < amount:
            return await interaction.response.send_message("Insufficient balance.", ephemeral=True)
        change_balance(interaction.user.id, -amount)
        change_balance(user.id, amount)
        await interaction.response.send_message(f"✅ Sent {amount} Points to {user.mention}.")

    @app_commands.command(name="stats", description="Show stats")
    async def stats(self, interaction: discord.Interaction):
        user = get_user(interaction.user.id)
        house = get_house()
        user_rtp = (float(user["total_won"]) / float(user["total_wagered"]) * 100) if float(user["total_wagered"]) else 0
        global_rtp = (float(house["total_paid"]) / float(house["total_wagered"]) * 100) if float(house["total_wagered"]) else 0
        await interaction.response.send_message(
            f"Wins: {user['wins']} | Losses: {user['losses']}\n"
            f"Total Wagered: {float(user['total_wagered']):.2f}\n"
            f"Total Won: {float(user['total_won']):.2f}\n"
            f"Your RTP: {user_rtp:.2f}% | Global RTP: {global_rtp:.2f}%\n"
            f"Jackpot: {float(house['jackpot']):.2f} Points"
        )

    @app_commands.command(name="seed", description="Show fairness seeds")
    async def seed(self, interaction: discord.Interaction):
        fair = get_server_seed_state()
        user = get_user(interaction.user.id)
        await interaction.response.send_message(
            f"Server Seed Hash: `{fair['server_seed_hash']}`\nClient Seed: `{user['client_seed']}`\nNonce: {user['nonce']}"
        )

    @app_commands.command(name="setseed", description="Set your client seed")
    async def setseed(self, interaction: discord.Interaction, seed: app_commands.Range[str, 1, 64]):
        set_client_seed(interaction.user.id, seed)
        await interaction.response.send_message("✅ Client seed updated and nonce reset.")

    @app_commands.command(name="rotateseed", description="Rotate server seed (admin)")
    @app_commands.checks.has_permissions(administrator=True)
    async def rotateseed(self, interaction: discord.Interaction):
        rotated = rotate_server_seed()
        await interaction.response.send_message(
            f"Old seed: `{rotated['old_server_seed']}`\nNew hash: `{rotated['new_server_seed_hash']}`"
        )

    @app_commands.command(name="cf", description="Coinflip")
    async def cf(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, None], side: Literal["heads", "tails"]):
        cd = self.on_cooldown(interaction.user.id, "cf")
        if cd:
            return await interaction.response.send_message(f"Cooldown: {cd}s", ephemeral=True)
        if not ensure_bankroll(interaction.user.id, amount):
            return await interaction.response.send_message("Insufficient points.", ephemeral=True)
        roll = get_roll(interaction.user.id)
        result = "heads" if roll["random_float"] < 0.5 else "tails"
        won = side == result
        payout = int(amount * rtp_adjusted(2 * TARGET_RTP)) if won else 0
        settle_game(interaction.user.id, amount, payout)
        status = "✅ Win" if won else "❌ Loss"
        await interaction.response.send_message(
            f"🪙 Result: {result.upper()}\n{status}\nPayout: {payout}\nHash: `{roll['hash']}` | Nonce: {roll['nonce_used']}"
        )

    @app_commands.command(name="dice", description="Roll > target")
    async def dice(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, None], target: app_commands.Range[float, 5, 95]):
        cd = self.on_cooldown(interaction.user.id, "dice")
        if cd:
            return await interaction.response.send_message(f"Cooldown: {cd}s", ephemeral=True)
        if not ensure_bankroll(interaction.user.id, amount):
            return await interaction.response.send_message("Insufficient points.", ephemeral=True)
        chance = (100 - target) / 100
        multiplier = rtp_adjusted(TARGET_RTP / chance)
        roll = get_roll(interaction.user.id)
        value = round(roll["random_float"] * 100, 2)
        won = value > target
        payout = int(amount * multiplier) if won else 0
        settle_game(interaction.user.id, amount, payout)
        await interaction.response.send_message(
            f"🎲 Rolled {value} > {target}\n{'✅ Win' if won else '❌ Loss'}\nPayout: {payout}\nHash: `{roll['hash']}`"
        )

    @app_commands.command(name="limbo", description="Limbo crash game")
    async def limbo(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, None], multiplier: app_commands.Range[float, 1.01, 1000]):
        cd = self.on_cooldown(interaction.user.id, "limbo")
        if cd:
            return await interaction.response.send_message(f"Cooldown: {cd}s", ephemeral=True)
        if not ensure_bankroll(interaction.user.id, amount):
            return await interaction.response.send_message("Insufficient points.", ephemeral=True)
        roll = get_roll(interaction.user.id)
        crash = max(1.0, round(TARGET_RTP / (1 - min(0.999999, roll["random_float"])), 2))
        won = crash >= multiplier
        payout = int(amount * multiplier) if won else 0
        settle_game(interaction.user.id, amount, payout)
        await interaction.response.send_message(
            f"🚀 Crash: {crash}x | Target: {multiplier}x\n{'✅ Win' if won else '❌ Loss'}\nPayout: {payout}\nHash: `{roll['hash']}`"
        )

    @app_commands.command(name="blackjack", description="Start blackjack")
    async def blackjack(self, interaction: discord.Interaction, amount: app_commands.Range[int, 1, None]):
        if not ensure_bankroll(interaction.user.id, amount):
            return await interaction.response.send_message("Insufficient points.", ephemeral=True)
        state = start_game(interaction.user.id, amount)
        await interaction.response.send_message(f"🃏 Blackjack started\n{hand_render(state)}\nUse /hit /stand /double /split")

    async def _bj_action(self, interaction: discord.Interaction, kind: str):
        state = get_state(interaction.user.id)
        if not state:
            return await interaction.response.send_message("No active blackjack game.", ephemeral=True)
        hand = state.hands[state.active_hand]
        if kind in {"double", "split"} and not ensure_bankroll(interaction.user.id, hand.wager):
            return await interaction.response.send_message("Not enough points.", ephemeral=True)
        if kind == "split" and not can_split(hand):
            return await interaction.response.send_message("Cannot split this hand.", ephemeral=True)
        result = action(interaction.user.id, kind)
        if "error" in result:
            return await interaction.response.send_message(result["error"], ephemeral=True)
        if not result["state"].finished:
            return await interaction.response.send_message(f"Action: {kind}\n{hand_render(result['state'])}")
        done = settle(interaction.user.id)
        settle_game(interaction.user.id, done["total_wager"], done["payout"])
        await interaction.response.send_message(
            f"Finished\n{hand_render(done['state'], True)}\nOutcomes: {', '.join(done['outcomes'])}\nPayout: {int(done['payout'])}"
        )

    @app_commands.command(name="hit", description="Blackjack hit")
    async def hit(self, interaction: discord.Interaction):
        await self._bj_action(interaction, "hit")

    @app_commands.command(name="stand", description="Blackjack stand")
    async def stand(self, interaction: discord.Interaction):
        await self._bj_action(interaction, "stand")

    @app_commands.command(name="double", description="Blackjack double")
    async def double(self, interaction: discord.Interaction):
        await self._bj_action(interaction, "double")

    @app_commands.command(name="split", description="Blackjack split")
    async def split(self, interaction: discord.Interaction):
        await self._bj_action(interaction, "split")

    @app_commands.command(name="mint", description="Admin add points")
    @app_commands.checks.has_permissions(administrator=True)
    async def mint(self, interaction: discord.Interaction, user: discord.User, amount: app_commands.Range[int, 1, None]):
        change_balance(user.id, amount)
        await interaction.response.send_message(f"Minted {amount} Points to {user.mention}")

    @app_commands.command(name="removepoints", description="Admin remove points")
    @app_commands.checks.has_permissions(administrator=True)
    async def removepoints(self, interaction: discord.Interaction, user: discord.User, amount: app_commands.Range[int, 1, None]):
        u = get_user(user.id)
        if int(u["balance"]) < amount:
            return await interaction.response.send_message("User balance too low.", ephemeral=True)
        change_balance(user.id, -amount)
        await interaction.response.send_message(f"Removed {amount} Points from {user.mention}")

    @app_commands.command(name="setpoints", description="Admin set balance")
    @app_commands.checks.has_permissions(administrator=True)
    async def setpoints(self, interaction: discord.Interaction, user: discord.User, amount: app_commands.Range[int, 0, None]):
        set_balance(user.id, amount)
        await interaction.response.send_message(f"Set {user.mention} balance to {amount}")


async def setup(bot: commands.Bot):
    await bot.add_cog(HyperBetCog(bot))
