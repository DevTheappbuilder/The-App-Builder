from __future__ import annotations

import discord

PENDING = discord.Color.yellow()
ACTIVE = discord.Color.blurple()
DONE = discord.Color.green()
FAIL = discord.Color.red()


def _status_color(status: str) -> discord.Color:
    if status in {'INITIATED', 'PAYMENT_PENDING'}:
        return PENDING
    if status in {'PAID', 'DELIVERED'}:
        return ACTIVE
    if status == 'COMPLETED':
        return DONE
    return FAIL


def seller_rep_line(user: dict | None) -> str:
    user = user or {}
    return f"⭐ {float(user.get('rating_score', 5)):.1f} ({int(user.get('completed_deals', 0))} deals)"


def deal_embed(deal: dict, instruction: str, title: str | None = None, seller_profile: dict | None = None) -> discord.Embed:
    embed = discord.Embed(
        title=title or f"Deal {deal['deal_id']}",
        description=instruction,
        color=_status_color(deal['status']),
    )
    embed.add_field(name='Deal ID', value=f"`{deal['deal_id']}`", inline=True)
    embed.add_field(name='Status', value=deal['status'], inline=True)
    embed.add_field(name='Stage', value=deal['stage'], inline=True)
    embed.add_field(name='Buyer', value=f"<@{deal['buyer_id']}>", inline=True)
    embed.add_field(name='Seller', value=f"<@{deal['seller_id']}>", inline=True)
    embed.add_field(name='Amount', value=f"{deal['amount']} {deal['currency']}", inline=True)
    embed.add_field(name='Product', value=deal['product'], inline=False)
    embed.add_field(name='Seller Reputation', value=seller_rep_line(seller_profile), inline=False)
    embed.add_field(name='Unique Note', value=f"`{deal['unique_note']}`", inline=False)
    embed.set_footer(text=f"Locked: {'Yes' if deal.get('is_locked') else 'No'}")
    return embed


def dispute_embed(deal: dict) -> discord.Embed:
    embed = discord.Embed(
        title=f"Dispute Opened • {deal['deal_id']}",
        description='Deal is frozen and requires moderator action.',
        color=FAIL,
    )
    embed.add_field(name='Buyer', value=f"<@{deal['buyer_id']}>", inline=True)
    embed.add_field(name='Seller', value=f"<@{deal['seller_id']}>", inline=True)
    embed.add_field(name='Amount', value=f"{deal['amount']} {deal['currency']} ({deal['method']})", inline=True)
    activity = '\n'.join(
        f"• <@{x['actor_id']}> {x['action']}" for x in deal.get('activity_log', [])[-8:]
    ) or 'No activity'
    embed.add_field(name='Recent Activity', value=activity[:1024], inline=False)
    return embed
