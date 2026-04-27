from __future__ import annotations

from io import BytesIO
from urllib.parse import quote

import discord
import qrcode
from discord.ext import commands


class AddressSlotView(discord.ui.View):
    def __init__(self, owner_id: int, profile: dict):
        super().__init__(timeout=120)
        self.owner_id = owner_id
        self.profile = profile
        self.selected_label: str | None = None
        self.selected_value: str | None = None

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.owner_id:
            await interaction.response.send_message('Only the command author can use these buttons.', ephemeral=True)
            return False
        return True

    async def _select_slot(self, interaction: discord.Interaction, label: str, value: str | None):
        self.selected_label = label
        self.selected_value = value

        if not value:
            embed = discord.Embed(title=f'{label} not configured', description='Use /setwallet to configure it first.', color=discord.Color.red())
            await interaction.response.edit_message(embed=embed, view=self)
            return

        embed = discord.Embed(
            title=f'{label} Selected',
            description=f'```\n{value}\n```\nClick **Send to Chat** to post it in this channel.',
            color=discord.Color.blurple(),
        )
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label='Slot 1 • UPI', style=discord.ButtonStyle.primary)
    async def slot1(self, interaction: discord.Interaction, _: discord.ui.Button):
        await self._select_slot(interaction, 'UPI ID', self.profile.get('upi_id'))

    @discord.ui.button(label='Slot 2 • LTC', style=discord.ButtonStyle.primary)
    async def slot2(self, interaction: discord.Interaction, _: discord.ui.Button):
        await self._select_slot(interaction, 'LTC Address', self.profile.get('ltc_address'))

    @discord.ui.button(label='Slot 3 • USDT', style=discord.ButtonStyle.primary)
    async def slot3(self, interaction: discord.Interaction, _: discord.ui.Button):
        await self._select_slot(interaction, 'USDT Address', self.profile.get('usdt_address'))

    @discord.ui.button(label='Send to Chat', style=discord.ButtonStyle.success)
    async def send_to_chat(self, interaction: discord.Interaction, _: discord.ui.Button):
        if not self.selected_value:
            await interaction.response.send_message('Select slot 1/2/3 first.', ephemeral=True)
            return
        await interaction.channel.send(f"{self.selected_label}: `{self.selected_value}`")
        await interaction.response.send_message('Address posted to chat.', ephemeral=True)


class PrefixToolsCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.command(name='rating')
    async def rating(self, ctx: commands.Context, member: discord.Member | None = None):
        target = member or ctx.author
        profile = await self.bot.db.users.find_one({'user_id': target.id}) or {}
        embed = discord.Embed(title=f'Rating • {target.display_name}', color=discord.Color.blurple())
        embed.add_field(name='⭐ Rating', value=f"{float(profile.get('rating_score', 5)):.1f}")
        embed.add_field(name='✅ Completed Deals', value=str(profile.get('completed_deals', 0)))
        embed.add_field(name='⚠️ Disputes', value=str(profile.get('disputes', 0)))
        embed.add_field(name='📦 Total Deals', value=str(profile.get('total_deals', 0)))
        await ctx.send(embed=embed)

    @commands.command(name='history')
    async def history(self, ctx: commands.Context, member: discord.Member | None = None):
        target = member or ctx.author
        rows = (
            await self.bot.db.deals.find({'$or': [{'buyer_id': target.id}, {'seller_id': target.id}]})
            .sort('created_at', -1)
            .limit(10)
            .to_list(10)
        )
        if not rows:
            await ctx.send('No deal history found.')
            return

        lines = [
            f"• `{d['deal_id']}` — {d['status']} / {d['stage']} — {d['amount']} {d['currency']} ({d['method']})"
            for d in rows
        ]
        embed = discord.Embed(title=f'Deal History • {target.display_name}', description='\n'.join(lines), color=discord.Color.blurple())
        await ctx.send(embed=embed)

    async def _show_address_selector(self, ctx: commands.Context):
        profile = await self.bot.db.users.find_one({'user_id': ctx.author.id})
        if not profile:
            await ctx.send('No wallet profile found. Use /setwallet first.')
            return

        embed = discord.Embed(
            title='Address Selector',
            description=(
                'Choose slot to reveal:\n'
                '1️⃣ UPI ID\n'
                '2️⃣ LTC Address\n'
                '3️⃣ USDT Address\n\n'
                'After selecting, use **Send to Chat** button.'
            ),
            color=discord.Color.blurple(),
        )
        await ctx.send(embed=embed, view=AddressSlotView(ctx.author.id, profile))

    @commands.command(name='upi')
    async def upi(self, ctx: commands.Context):
        await self._show_address_selector(ctx)

    @commands.command(name='ltcaddy')
    async def ltcaddy(self, ctx: commands.Context):
        await self._show_address_selector(ctx)

    @commands.command(name='usdt')
    async def usdt(self, ctx: commands.Context):
        await self._show_address_selector(ctx)

    @commands.command(name='qr')
    async def qr(self, ctx: commands.Context, method: str, amount: float, *, note: str = ''):
        method = method.lower().strip()
        if method not in {'upi', 'ltc', 'usdt'}:
            await ctx.send('Usage: `.qr [upi/ltc/usdt] [amount] [note]`')
            return

        profile = await self.bot.db.users.find_one({'user_id': ctx.author.id})
        if not profile:
            await ctx.send('No wallet profile found. Use /setwallet first.')
            return

        if method == 'upi':
            addr = profile.get('upi_id')
            if not addr:
                await ctx.send('UPI not configured. Use /setwallet.')
                return
            payload = f"upi://pay?pa={quote(addr)}&am={amount}&tn={quote(note)}"
        elif method == 'ltc':
            addr = profile.get('ltc_address')
            if not addr:
                await ctx.send('LTC address not configured. Use /setwallet.')
                return
            payload = f"litecoin:{addr}?amount={amount}&message={quote(note)}"
        else:
            addr = profile.get('usdt_address')
            if not addr:
                await ctx.send('USDT address not configured. Use /setwallet.')
                return
            payload = f"ethereum:{addr}?value={amount}&message={quote(note)}"

        img = qrcode.make(payload)
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)

        embed = discord.Embed(title='Payment QR', description=f"Method: **{method.upper()}**\nAmount: **{amount}**\nNote: `{note or 'N/A'}`", color=discord.Color.green())
        embed.add_field(name='Target', value=f'`{addr}`', inline=False)
        file = discord.File(buf, filename='payment_qr.png')
        embed.set_image(url='attachment://payment_qr.png')
        await ctx.send(embed=embed, file=file)


async def setup(bot: commands.Bot):
    await bot.add_cog(PrefixToolsCog(bot))
