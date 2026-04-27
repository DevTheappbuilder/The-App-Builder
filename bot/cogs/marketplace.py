from __future__ import annotations

from typing import Literal

import discord
from discord import app_commands
from discord.ext import commands

from bot.services import deal_service
from bot.services.price_service import fetch_rates
from bot.utils.embeds import deal_embed
from bot.utils.validators import sanitize_text, is_valid_ltc, is_valid_upi, is_valid_usdt
from bot.views.deal_view import DealView


class MarketplaceCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name='setwallet', description='Set your UPI/LTC/USDT wallet details')
    async def setwallet(self, interaction: discord.Interaction, upi: str | None = None, ltc: str | None = None, usdt: str | None = None):
        if not is_valid_upi(upi) or not is_valid_ltc(ltc) or not is_valid_usdt(usdt):
            await interaction.response.send_message('Invalid wallet format.', ephemeral=True)
            return

        update = {}
        if upi is not None:
            update['upi_id'] = upi
        if ltc is not None:
            update['ltc_address'] = ltc
        if usdt is not None:
            update['usdt_address'] = usdt
        if not update:
            await interaction.response.send_message('No updates provided.', ephemeral=True)
            return

        await self.bot.db.users.update_one({'user_id': interaction.user.id}, {'$set': update, '$setOnInsert': {'rating_score': 5}}, upsert=True)
        await interaction.response.send_message('Wallet info saved.', ephemeral=True)

    @app_commands.command(name='wallet', description='View your wallet profile')
    async def wallet(self, interaction: discord.Interaction):
        profile = await self.bot.db.users.find_one({'user_id': interaction.user.id})
        if not profile:
            await interaction.response.send_message('No wallet profile. Use /setwallet.', ephemeral=True)
            return

        embed = discord.Embed(title='Wallet & Reputation', color=discord.Color.blurple())
        embed.add_field(name='UPI', value=profile.get('upi_id') or 'Not set', inline=False)
        embed.add_field(name='LTC', value=profile.get('ltc_address') or 'Not set', inline=False)
        embed.add_field(name='USDT', value=profile.get('usdt_address') or 'Not set', inline=False)
        embed.add_field(name='Rating', value=f"⭐ {float(profile.get('rating_score', 5)):.1f}")
        embed.add_field(name='Completed Deals', value=str(profile.get('completed_deals', 0)))
        embed.add_field(name='Disputes', value=str(profile.get('disputes', 0)))
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name='buy', description='Create a new step-by-step deal with a seller')
    @app_commands.describe(seller='Seller user', product='Product details', amount='Amount', method='UPI/LTC/USDT', currency='INR/USD')
    async def buy(self, interaction: discord.Interaction, seller: discord.User, product: str, amount: app_commands.Range[float, 0.01, 1_000_000.0], method: Literal['UPI', 'LTC', 'USDT'], currency: Literal['USD', 'INR']):
        if seller.bot or seller.id == interaction.user.id:
            await interaction.response.send_message('Seller must be another human user.', ephemeral=True)
            return

        deal = await deal_service.create_deal(
            self.bot.db,
            self.bot.settings,
            buyer_id=interaction.user.id,
            seller_id=seller.id,
            product=sanitize_text(product, 300),
            amount=float(amount),
            method=method,
            currency=currency,
        )

        seller_profile = await self.bot.db.users.find_one({'user_id': seller.id})
        embed = deal_embed(
            deal,
            'Step 1: both buyer and seller must confirm deal terms first. Then price confirmation will appear automatically.',
            'Step 1/6 • Deal Confirmation',
            seller_profile,
        )
        view = DealView(self.bot, deal['deal_id'], stage='deal_confirm')

        if interaction.guild and isinstance(interaction.channel, discord.TextChannel):
            thread = await interaction.channel.create_thread(name=f"deal-{deal['deal_id'].lower()}", type=discord.ChannelType.private_thread, invitable=False)
            await thread.add_user(interaction.user)
            await thread.add_user(seller)
            msg = await thread.send(embed=embed, view=view)
            deal['thread_channel_id'] = thread.id
        else:
            dm = await seller.create_dm()
            msg = await dm.send(content=f"Deal requested by <@{interaction.user.id}>", embed=embed, view=view)

        deal['message_id'] = msg.id
        await deal_service.save_deal(self.bot.db, deal)
        await interaction.response.send_message(f"Deal created: **{deal['deal_id']}**. Continue all steps inside the deal channel/buttons.", ephemeral=True)

    @app_commands.command(name='ltc', description='Show live LTC prices in USD and INR')
    async def ltc(self, interaction: discord.Interaction):
        rates = await fetch_rates()
        embed = discord.Embed(title='Litecoin Price', color=discord.Color.blurple())
        embed.add_field(name='USD', value=f"${rates['ltc_usd']}")
        embed.add_field(name='INR', value=f"₹{rates['ltc_inr']}")
        embed.add_field(name='Updated', value=str(rates['updated_at']), inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MarketplaceCog(bot))
