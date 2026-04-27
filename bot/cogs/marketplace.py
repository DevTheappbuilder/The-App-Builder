from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4
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

    async def _is_admin(self, interaction: discord.Interaction) -> bool:
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            return False
        return bool({role.id for role in interaction.user.roles} & self.bot.settings.admin_role_ids)

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

    @app_commands.command(name='buy', description='Create a new deal with a seller')
    @app_commands.describe(seller='Seller user', product='Product details', amount='Amount', method='UPI/LTC/USDT', currency='INR/USD')
    async def buy(self, interaction: discord.Interaction, seller: discord.User, product: str, amount: app_commands.Range[float, 0.01, 1_000_000], method: Literal['UPI', 'LTC', 'USDT'], currency: Literal['USD', 'INR']):
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
        embed = deal_embed(deal, 'Seller should confirm to lock deal and begin payment.', 'Awaiting Seller Confirmation', seller_profile)
        view = DealView(self.bot, deal['deal_id'], stage='init')

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
        await interaction.response.send_message(f"Deal created: **{deal['deal_id']}**", ephemeral=True)

    @app_commands.command(name='confirm', description='Final confirmation for a deal in FINAL stage')
    async def confirm(self, interaction: discord.Interaction, dealid: str):
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if interaction.user.id == deal['seller_id']:
            await deal_service.complete_deal(self.bot.db, deal, interaction.user.id, 'seller')
        elif interaction.user.id == deal['buyer_id']:
            await deal_service.complete_deal(self.bot.db, deal, interaction.user.id, 'buyer')
        else:
            await interaction.response.send_message('You are not a participant in this deal.', ephemeral=True)
            return
        await interaction.response.send_message(f"Confirmation saved for {deal['deal_id']}.", ephemeral=True)

    @app_commands.command(name='cancel', description='Cancel a deal')
    async def cancel(self, interaction: discord.Interaction, dealid: str):
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id):
            await interaction.response.send_message('You are not part of this deal.', ephemeral=True)
            return
        await deal_service.cancel_deal(self.bot.db, deal, interaction.user.id, 'Cancelled by command')
        await interaction.response.send_message(f"Deal {deal['deal_id']} cancelled.", ephemeral=True)

    @app_commands.command(name='ltc', description='Show live LTC prices in USD and INR')
    async def ltc(self, interaction: discord.Interaction):
        rates = await fetch_rates()
        embed = discord.Embed(title='Litecoin Price', color=discord.Color.blurple())
        embed.add_field(name='USD', value=f"${rates['ltc_usd']}")
        embed.add_field(name='INR', value=f"₹{rates['ltc_inr']}")
        embed.add_field(name='Updated', value=str(rates['updated_at']), inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name='invoice-create', description='Create invoice for an existing deal')
    async def invoice_create(self, interaction: discord.Interaction, dealid: str):
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id):
            await interaction.response.send_message('Not authorized for this deal.', ephemeral=True)
            return

        invoice_id = f"INV-{uuid4().hex[:8].upper()}"
        content = (
            f"Invoice {invoice_id}\nDeal: {deal['deal_id']}\nBuyer: {deal['buyer_id']}\nSeller: {deal['seller_id']}\n"
            f"Amount: {deal['amount']} {deal['currency']}\nMethod: {deal['method']}\nStatus: {deal['status']}/{deal['stage']}"
        )
        await self.bot.db.invoices.insert_one(
            {
                'invoice_id': invoice_id,
                'deal_id': deal['deal_id'],
                'created_by': interaction.user.id,
                'buyer_id': deal['buyer_id'],
                'seller_id': deal['seller_id'],
                'amount': deal['amount'],
                'currency': deal['currency'],
                'method': deal['method'],
                'status_snapshot': deal['status'],
                'stage_snapshot': deal['stage'],
                'content': content,
                'created_at': datetime.now(timezone.utc),
            }
        )
        await interaction.response.send_message(f"Invoice created:\n```\n{content}\n```", ephemeral=True)

    @app_commands.command(name='invoice-list', description='List latest invoices you created')
    async def invoice_list(self, interaction: discord.Interaction):
        rows = await self.bot.db.invoices.find({'created_by': interaction.user.id}).sort('created_at', -1).to_list(10)
        if not rows:
            await interaction.response.send_message('No invoices found.', ephemeral=True)
            return
        lines = [f"• **{x['invoice_id']}** — Deal {x['deal_id']} — {x['amount']} {x['currency']}" for x in rows]
        embed = discord.Embed(title='Recent Invoices', description='\n'.join(lines), color=discord.Color.blurple())
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name='stats', description='Marketplace analytics')
    async def stats_cmd(self, interaction: discord.Interaction):
        s = await deal_service.stats(self.bot.db)
        embed = discord.Embed(title='Marketplace Stats', color=discord.Color.blurple())
        embed.add_field(name='Total', value=str(s['total']), inline=True)
        embed.add_field(name='Completed', value=str(s['completed']), inline=True)
        embed.add_field(name='Cancelled', value=str(s['cancelled']), inline=True)
        embed.add_field(name='Disputes', value=str(s['disputes']), inline=True)
        embed.add_field(name='Success Rate', value=f"{s['success_rate']}%", inline=True)
        embed.add_field(name='Top Method', value=s['top_method'], inline=True)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name='resolve', description='Admin: resolve/cancel a deal')
    async def resolve(self, interaction: discord.Interaction, dealid: str):
        if not await self._is_admin(interaction):
            await interaction.response.send_message('Admin only command.', ephemeral=True)
            return
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        await deal_service.admin_action(self.bot.db, deal, interaction.user.id, 'resolve')
        await interaction.response.send_message(f"Deal {deal['deal_id']} resolved.", ephemeral=True)

    @app_commands.command(name='refund', description='Admin: issue refund/cancel deal')
    async def refund(self, interaction: discord.Interaction, dealid: str):
        if not await self._is_admin(interaction):
            await interaction.response.send_message('Admin only command.', ephemeral=True)
            return
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        await deal_service.admin_action(self.bot.db, deal, interaction.user.id, 'refund')
        await interaction.response.send_message(f"Refund recorded for {deal['deal_id']}.", ephemeral=True)

    @app_commands.command(name='force-complete', description='Admin: force complete a deal')
    async def force_complete(self, interaction: discord.Interaction, dealid: str):
        if not await self._is_admin(interaction):
            await interaction.response.send_message('Admin only command.', ephemeral=True)
            return
        deal = await deal_service.get_deal(self.bot.db, dealid.upper())
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        await deal_service.admin_action(self.bot.db, deal, interaction.user.id, 'force_complete')
        await interaction.response.send_message(f"Deal {deal['deal_id']} force-completed.", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MarketplaceCog(bot))
