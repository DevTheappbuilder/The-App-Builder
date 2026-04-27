from __future__ import annotations

import discord

from bot.services import deal_service
from bot.services.payment_service import get_wallet, quote_payment
from bot.utils.embeds import deal_embed, dispute_embed
from bot.utils.validators import is_http_url


class ProofModal(discord.ui.Modal, title='Submit Payment Proof'):
    proof_url = discord.ui.TextInput(label='Payment proof URL', required=True, max_length=500)

    def __init__(self, bot, deal_id: str):
        super().__init__(timeout=300)
        self.bot = bot
        self.deal_id = deal_id

    async def on_submit(self, interaction: discord.Interaction) -> None:
        deal = await deal_service.get_deal(self.bot.db, self.deal_id)
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return

        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can submit payment proof.', ephemeral=True)
            return

        proof = str(self.proof_url.value).strip()
        if not is_http_url(proof):
            await interaction.response.send_message('Provide a valid http/https URL.', ephemeral=True)
            return

        deal['payment_proof'] = proof
        deal['status'] = 'PAID'
        deal['activity_log'].append({'actor_id': interaction.user.id, 'action': 'PAYMENT_PROOF', 'detail': proof})
        await deal_service.save_deal(self.bot.db, deal)

        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'Seller: verify payment and confirm receipt.', 'Payment Submitted', seller_profile)
        view = DealView(self.bot, deal['deal_id'], stage='paid')
        await interaction.response.send_message(embed=embed, view=view)


class DealView(discord.ui.View):
    def __init__(self, bot, deal_id: str, stage: str):
        super().__init__(timeout=None)
        self.bot = bot
        self.deal_id = deal_id
        self.stage = stage

    async def _deal(self):
        return await deal_service.get_deal(self.bot.db, self.deal_id)

    async def _reject_if_frozen(self, interaction: discord.Interaction, deal: dict) -> bool:
        if deal['status'] in {'DISPUTE', 'CANCELLED', 'COMPLETED'}:
            await interaction.response.send_message(f"Deal is locked ({deal['status']}).", ephemeral=True)
            return True
        return False

    @discord.ui.button(label='✅ Confirm Deal', style=discord.ButtonStyle.success, custom_id='persistent_confirm')
    async def confirm_deal(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'init':
            await interaction.response.send_message('This action is no longer valid.', ephemeral=True)
            return

        deal = await self._deal()
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can confirm.', ephemeral=True)
            return

        await deal_service.progress_stage(self.bot.db, self.bot.settings, deal, actor_id=interaction.user.id, next_stage='LOCKED', status='PAYMENT_PENDING', detail='Seller confirmed')
        await deal_service.progress_stage(self.bot.db, self.bot.settings, deal, actor_id=interaction.user.id, next_stage='PAYMENT', status='PAYMENT_PENDING', detail='Waiting for payment')

        wallet = await get_wallet(self.bot.db, deal['seller_id'], deal['method'])
        quote = await quote_payment(deal['amount'], deal['currency'], deal['method'], self.bot.settings.price_buffer_percent)
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})

        instruction = (
            f"Buyer pays **{quote['pay_amount']} {quote['pay_currency']}** ({quote['fiat_equivalent']}). "
            f"Buffer: {quote.get('buffer_percent', 0)}%. Wallet: {wallet or 'Seller has not configured wallet'} "
            f"Rates updated: {quote['updated_at']}"
        )
        embed = deal_embed(deal, instruction, 'Payment Stage', seller_profile)

        for child in self.children:
            child.disabled = True

        await interaction.response.edit_message(embed=embed, view=DealView(self.bot, self.deal_id, stage='payment'))

    @discord.ui.button(label='💸 I Paid', style=discord.ButtonStyle.success, custom_id='persistent_paid')
    async def paid(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'payment':
            await interaction.response.send_message('This action is not valid right now.', ephemeral=True)
            return

        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can click I Paid.', ephemeral=True)
            return

        await interaction.response.send_modal(ProofModal(self.bot, self.deal_id))

    @discord.ui.button(label='✅ Payment Received', style=discord.ButtonStyle.success, custom_id='persistent_confirm_payment')
    async def confirm_payment(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'paid':
            await interaction.response.send_message('This action is not valid right now.', ephemeral=True)
            return

        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can confirm payment.', ephemeral=True)
            return

        await deal_service.progress_stage(self.bot.db, self.bot.settings, deal, actor_id=interaction.user.id, next_stage='DELIVERY', status='DELIVERED', detail='Payment confirmed')
        deal['payment_confirmed_by_seller'] = True
        await deal_service.save_deal(self.bot.db, deal)
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'Seller should deliver and then click Delivered.', 'Delivery Stage', seller_profile)

        await interaction.response.edit_message(embed=embed, view=DealView(self.bot, self.deal_id, stage='delivery'))

    @discord.ui.button(label='📦 Delivered', style=discord.ButtonStyle.primary, custom_id='persistent_delivered')
    async def delivered(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'delivery':
            await interaction.response.send_message('This action is not valid right now.', ephemeral=True)
            return

        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can mark delivered.', ephemeral=True)
            return

        deal['delivery_confirmed_by_seller'] = True
        await deal_service.save_deal(self.bot.db, deal)
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'Buyer: click Confirm Received if correct.', 'Buyer Confirmation', seller_profile)
        await interaction.response.edit_message(embed=embed, view=DealView(self.bot, self.deal_id, stage='confirm_received'))

    @discord.ui.button(label='🎉 Confirm Received', style=discord.ButtonStyle.success, custom_id='persistent_confirm_received')
    async def confirm_received(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'confirm_received':
            await interaction.response.send_message('This action is not valid right now.', ephemeral=True)
            return

        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can confirm receipt.', ephemeral=True)
            return

        deal['delivery_confirmed_by_buyer'] = True
        await deal_service.progress_stage(self.bot.db, self.bot.settings, deal, actor_id=interaction.user.id, next_stage='FINAL', status='DELIVERED', detail='Buyer confirmed delivery')
        await deal_service.complete_deal(self.bot.db, deal, interaction.user.id, 'buyer')

        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'Seller must run /confirm to finalize deal.', 'Final Confirmation', seller_profile)
        await interaction.response.edit_message(embed=embed, view=DealView(self.bot, self.deal_id, stage='final'))

    @discord.ui.button(label='⛔ Cancel', style=discord.ButtonStyle.danger, custom_id='persistent_cancel')
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        deal = await self._deal()
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id):
            await interaction.response.send_message('You are not part of this deal.', ephemeral=True)
            return
        await deal_service.cancel_deal(self.bot.db, deal, interaction.user.id, 'Cancelled by participant')
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'Deal has been cancelled.', 'Cancelled', seller_profile)

        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label='🆘 Request Support', style=discord.ButtonStyle.secondary, custom_id='persistent_dispute')
    async def dispute(self, interaction: discord.Interaction, button: discord.ui.Button):
        deal = await self._deal()
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id):
            await interaction.response.send_message('You are not part of this deal.', ephemeral=True)
            return

        await deal_service.open_dispute(self.bot.db, deal, interaction.user.id, 'Support requested')
        embed = dispute_embed(deal)

        for child in self.children:
            child.disabled = True

        if self.bot.settings.support_channel_id:
            channel = self.bot.get_channel(self.bot.settings.support_channel_id)
            if channel and isinstance(channel, discord.abc.Messageable):
                await channel.send(embed=embed)

        await interaction.response.edit_message(embed=embed, view=self)
        await interaction.followup.send(f"Support requested. Join support server: {self.bot.settings.support_invite}", ephemeral=True)
