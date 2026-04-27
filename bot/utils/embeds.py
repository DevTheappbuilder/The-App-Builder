from __future__ import annotations

import discord

PENDING = discord.Color.yellow()
ACTIVE = discord.Color.blurple()
DONE = discord.Color.green()
FAIL = discord.Color.red()

SEPARATOR = '─' * 30


def _status_color(status: str) -> discord.Color:
    if status in {'INITIATED', 'PAYMENT_PENDING'}:
        return PENDING
    if status in {'PAID', 'DELIVERED'}:
        return ACTIVE
    if status == 'COMPLETED':
        return DONE
    return FAIL


def _status_badge(status: str) -> str:
    return {
        'INITIATED': '🟡 Pending',
        'PAYMENT_PENDING': '🟡 Payment Pending',
        'PAID': '🔵 Paid',
        'DELIVERED': '🔵 Delivered',
        'COMPLETED': '🟢 Completed',
        'DISPUTE': '🔴 Dispute',
        'CANCELLED': '🔴 Cancelled',
    }.get(status, status)


def seller_rep_line(user: dict | None) -> str:
    user = user or {}
    return f"⭐ {float(user.get('rating_score', 5)):.1f} ({int(user.get('completed_deals', 0))} deals)"


def deal_embed(deal: dict, instruction: str, title: str | None = None, seller_profile: dict | None = None) -> discord.Embed:
    pretty_title = title or f"Deal {deal['deal_id']}"

    description = (
        f"## {pretty_title}\n"
        f"`{SEPARATOR}`\n"
        f"**Deal ID:** `{deal['deal_id']}`\n"
        f"**Status:** {_status_badge(deal['status'])}\n"
        f"**Stage:** `{deal['stage']}`\n"
        f"`{SEPARATOR}`\n"
        f"> {instruction}"
    )

    embed = discord.Embed(description=description, color=_status_color(deal['status']))
    embed.add_field(name='👥 Participants', value=f"**Buyer:** <@{deal['buyer_id']}>\n**Seller:** <@{deal['seller_id']}>", inline=True)
    embed.add_field(name='💵 Deal Value', value=f"**{deal['amount']} {deal['currency']}**\nMethod: `{deal['method']}`", inline=True)
    embed.add_field(name='🧾 Trust & Note', value=f"Seller Rep: {seller_rep_line(seller_profile)}\nPayment Note: `{deal['unique_note']}`", inline=False)
    embed.add_field(name='📦 Product', value=f"```md\n{deal['product'][:900]}\n```", inline=False)
    embed.set_footer(text=f"Locked: {'Yes' if deal.get('is_locked') else 'No'} • Keep all actions inside this deal UI")
    return embed


def dispute_embed(deal: dict) -> discord.Embed:
    activity = '\n'.join(f"• <@{x['actor_id']}> `{x['action']}`" for x in deal.get('activity_log', [])[-8:]) or 'No activity'

    description = (
        f"## 🚩 Dispute Opened\n"
        f"`{SEPARATOR}`\n"
        f"**Deal:** `{deal['deal_id']}`\n"
        f"**Status:** 🔴 Dispute\n"
        f"**Action:** Deal is now frozen pending support review."
    )

    embed = discord.Embed(description=description, color=FAIL)
    embed.add_field(name='Participants', value=f"Buyer: <@{deal['buyer_id']}>\nSeller: <@{deal['seller_id']}>", inline=True)
    embed.add_field(name='Amount', value=f"{deal['amount']} {deal['currency']} ({deal['method']})", inline=True)
    embed.add_field(name='Recent Activity', value=f"```md\n{activity[:900]}\n```", inline=False)
    return embed


def component_v2_reference_payload(title: str, body: str, custom_ids: list[tuple[str, str, int]]) -> dict:
    """Reference-only payload for Discord Components V2 container/separator UX.

    This helper mirrors the JSON pattern requested by product design.
    It is kept as a reference until discord.py exposes full typed wrappers for
    container/text-display/separator in stable APIs.
    """
    button_components = [
        {
            'type': 2,
            'custom_id': custom_id,
            'label': label,
            'style': style,
        }
        for custom_id, label, style in custom_ids
    ]

    return {
        'flags': 32768,
        'components': [
            {
                'type': 17,
                'accent_color': 703487,
                'components': [
                    {'type': 10, 'content': f"# {title}"},
                    {'type': 14, 'divider': True, 'spacing': 1},
                    {'type': 10, 'content': body},
                    {'type': 1, 'components': button_components},
                ],
            }
        ],
    }
