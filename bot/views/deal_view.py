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

        await deal_service.mark_payment_paid(self.bot.db, deal, interaction.user.id, proof)
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, 'UPI payment marked as paid. Seller must confirm payment, otherwise click Support.', 'UPI Payment Pending Seller Confirmation', seller_profile)
        await interaction.response.send_message(embed=embed, view=DealView(self.bot, self.deal_id, stage='upi_wait_seller'))


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

    async def _refresh(self, interaction: discord.Interaction, deal: dict, stage: str, instruction: str, title: str):
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        embed = deal_embed(deal, instruction, title, seller_profile)
        await interaction.response.edit_message(embed=embed, view=DealView(self.bot, self.deal_id, stage=stage))

    @discord.ui.button(label='✅ Buyer Confirm Deal', style=discord.ButtonStyle.success, custom_id='deal_buyer_confirm')
    async def buyer_confirm_deal(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'deal_confirm':
            await interaction.response.send_message('Not in deal confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can use this button.', ephemeral=True)
            return

        await deal_service.mark_deal_confirmation(self.bot.db, deal, interaction.user.id, 'buyer')
        if deal['stage'] == 'PRICE_CONFIRM':
            await self._refresh(interaction, deal, 'price_confirm', 'Both sides confirmed deal terms. Next both must confirm the exact price.', 'Step 2/6 • Price Confirmation')
        else:
            await self._refresh(interaction, deal, 'deal_confirm', 'Waiting for both buyer and seller to confirm deal terms.', 'Step 1/6 • Deal Confirmation')

    @discord.ui.button(label='✅ Seller Confirm Deal', style=discord.ButtonStyle.success, custom_id='deal_seller_confirm')
    async def seller_confirm_deal(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'deal_confirm':
            await interaction.response.send_message('Not in deal confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can use this button.', ephemeral=True)
            return

        await deal_service.mark_deal_confirmation(self.bot.db, deal, interaction.user.id, 'seller')
        if deal['stage'] == 'PRICE_CONFIRM':
            await self._refresh(interaction, deal, 'price_confirm', 'Both sides confirmed deal terms. Next both must confirm the exact price.', 'Step 2/6 • Price Confirmation')
        else:
            await self._refresh(interaction, deal, 'deal_confirm', 'Waiting for both buyer and seller to confirm deal terms.', 'Step 1/6 • Deal Confirmation')

    @discord.ui.button(label='💲 Buyer Confirm Price', style=discord.ButtonStyle.primary, custom_id='price_buyer_confirm')
    async def buyer_confirm_price(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'price_confirm':
            await interaction.response.send_message('Not in price confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can use this button.', ephemeral=True)
            return

        await deal_service.mark_price_confirmation(self.bot.db, self.bot.settings, deal, interaction.user.id, 'buyer')
        if deal['stage'] == 'PAYMENT':
            wallet = await get_wallet(self.bot.db, deal['seller_id'], deal['method'])
            quote = await quote_payment(deal['amount'], deal['currency'], deal['method'], self.bot.settings.price_buffer_percent)
            instruction = (
                f"Pay **{quote['pay_amount']} {quote['pay_currency']}** to seller wallet `{wallet or 'NOT SET'}`. "
                f"If method is crypto, buyer click **Crypto Paid (Auto Verify)**. If UPI, buyer click **UPI Paid** and seller confirms manually."
            )
            await self._refresh(interaction, deal, 'payment', instruction, 'Step 3/6 • Payment Stage')
        else:
            await self._refresh(interaction, deal, 'price_confirm', 'Waiting for both sides to confirm price.', 'Step 2/6 • Price Confirmation')

    @discord.ui.button(label='💲 Seller Confirm Price', style=discord.ButtonStyle.primary, custom_id='price_seller_confirm')
    async def seller_confirm_price(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'price_confirm':
            await interaction.response.send_message('Not in price confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can use this button.', ephemeral=True)
            return

        await deal_service.mark_price_confirmation(self.bot.db, self.bot.settings, deal, interaction.user.id, 'seller')
        if deal['stage'] == 'PAYMENT':
            wallet = await get_wallet(self.bot.db, deal['seller_id'], deal['method'])
            quote = await quote_payment(deal['amount'], deal['currency'], deal['method'], self.bot.settings.price_buffer_percent)
            instruction = (
                f"Pay **{quote['pay_amount']} {quote['pay_currency']}** to seller wallet `{wallet or 'NOT SET'}`. "
                f"If method is crypto, buyer click **Crypto Paid (Auto Verify)**. If UPI, buyer click **UPI Paid** and seller confirms manually."
            )
            await self._refresh(interaction, deal, 'payment', instruction, 'Step 3/6 • Payment Stage')
        else:
            await self._refresh(interaction, deal, 'price_confirm', 'Waiting for both sides to confirm price.', 'Step 2/6 • Price Confirmation')

    @discord.ui.button(label='🪙 Crypto Paid (Auto Verify)', style=discord.ButtonStyle.success, custom_id='payment_crypto_paid')
    async def crypto_paid(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'payment':
            await interaction.response.send_message('Not in payment stage.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if deal['method'] not in {'LTC', 'USDT'}:
            await interaction.response.send_message('This button is only for crypto deals.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can mark payment sent.', ephemeral=True)
            return

        buyer_profile = await self.bot.db.users.find_one({'user_id': deal['buyer_id']})
        seller_profile = await self.bot.db.users.find_one({'user_id': deal['seller_id']})
        ok, reason = deal_service.verify_crypto_addresses(deal, buyer_profile, seller_profile)
        if not ok:
            await interaction.response.send_message(f'Auto verification failed: {reason}', ephemeral=True)
            return

        await deal_service.mark_payment_paid(self.bot.db, deal, interaction.user.id)
        await deal_service.confirm_payment(self.bot.db, deal, interaction.user.id, 'AUTO_CRYPTO_VERIFIED')
        await self._refresh(interaction, deal, 'delivery', f'{reason} Seller can now deliver the product.', 'Step 4/6 • Delivery Stage')

    @discord.ui.button(label='🏦 UPI Paid', style=discord.ButtonStyle.success, custom_id='payment_upi_paid')
    async def upi_paid(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'payment':
            await interaction.response.send_message('Not in payment stage.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if deal['method'] != 'UPI':
            await interaction.response.send_message('This button is only for UPI deals.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can mark payment sent.', ephemeral=True)
            return

        await interaction.response.send_modal(ProofModal(self.bot, self.deal_id))

    @discord.ui.button(label='✅ Seller Confirm Payment', style=discord.ButtonStyle.primary, custom_id='payment_seller_confirm')
    async def seller_confirm_payment(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage not in {'payment', 'upi_wait_seller'}:
            await interaction.response.send_message('Not waiting for seller payment confirmation.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if deal['method'] != 'UPI':
            await interaction.response.send_message('Seller confirmation is only needed for UPI deals.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can confirm UPI payment.', ephemeral=True)
            return
        if deal['status'] != 'PAID':
            await interaction.response.send_message('Buyer has not marked payment as paid yet.', ephemeral=True)
            return

        await deal_service.confirm_payment(self.bot.db, deal, interaction.user.id, 'UPI_SELLER_CONFIRMED')
        await self._refresh(interaction, deal, 'delivery', 'Payment confirmed. Seller should now deliver product.', 'Step 4/6 • Delivery Stage')

    @discord.ui.button(label='📦 Seller Delivered', style=discord.ButtonStyle.primary, custom_id='delivery_mark')
    async def seller_delivered(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'delivery':
            await interaction.response.send_message('Not in delivery step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can mark delivery.', ephemeral=True)
            return

        await deal_service.mark_delivered(self.bot.db, deal, interaction.user.id)
        await self._refresh(interaction, deal, 'final', 'Seller marked delivered. Now both sides must confirm completion.', 'Step 5/6 • Final Confirmation')

    @discord.ui.button(label='✅ Buyer Final Confirm', style=discord.ButtonStyle.success, custom_id='final_buyer')
    async def buyer_final(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'final':
            await interaction.response.send_message('Not in final confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'buyer'):
            await interaction.response.send_message('Only buyer can use this button.', ephemeral=True)
            return

        await deal_service.mark_final_confirmation(self.bot.db, deal, interaction.user.id, 'buyer')
        if deal['status'] == 'COMPLETED':
            await self._refresh(interaction, deal, 'completed', 'Deal completed successfully. ✅', 'Step 6/6 • Completed')
        else:
            await self._refresh(interaction, deal, 'final', 'Buyer confirmed. Waiting for seller final confirm.', 'Step 5/6 • Final Confirmation')

    @discord.ui.button(label='✅ Seller Final Confirm', style=discord.ButtonStyle.success, custom_id='final_seller')
    async def seller_final(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.stage != 'final':
            await interaction.response.send_message('Not in final confirmation step.', ephemeral=True)
            return
        deal = await self._deal()
        if not deal or await self._reject_if_frozen(interaction, deal):
            return
        if not deal_service.validate_role(deal, interaction.user.id, 'seller'):
            await interaction.response.send_message('Only seller can use this button.', ephemeral=True)
            return

        await deal_service.mark_final_confirmation(self.bot.db, deal, interaction.user.id, 'seller')
        if deal['status'] == 'COMPLETED':
            await self._refresh(interaction, deal, 'completed', 'Deal completed successfully. ✅', 'Step 6/6 • Completed')
        else:
            await self._refresh(interaction, deal, 'final', 'Seller confirmed. Waiting for buyer final confirm.', 'Step 5/6 • Final Confirmation')

    @discord.ui.button(label='🆘 Support', style=discord.ButtonStyle.danger, custom_id='deal_support')
    async def support(self, interaction: discord.Interaction, button: discord.ui.Button):
        deal = await self._deal()
        if not deal:
            await interaction.response.send_message('Deal not found.', ephemeral=True)
            return
        if not deal_service.validate_role(deal, interaction.user.id):
            await interaction.response.send_message('You are not part of this deal.', ephemeral=True)
            return

        await deal_service.open_dispute(self.bot.db, deal, interaction.user.id, 'Support requested by participant')
        embed = dispute_embed(deal)
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(embed=embed, view=self)
        await interaction.followup.send(
            'Support requested. If payment was sent but not confirmed, wait for moderator review in support server.',
            ephemeral=True,
        )

    @discord.ui.button(label='⛔ Cancel Deal', style=discord.ButtonStyle.secondary, custom_id='deal_cancel')
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
