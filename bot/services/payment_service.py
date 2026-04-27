from __future__ import annotations

from uuid import uuid4
from cachetools import TTLCache
from bot.services.price_service import convert_amount

wallet_cache: TTLCache[str, str] = TTLCache(maxsize=512, ttl=60)


def generate_note() -> str:
    return f"DRX-{uuid4().hex[:6].upper()}"


async def get_wallet(db, user_id: int, method: str) -> str | None:
    key = f'{user_id}:{method}'
    cached = wallet_cache.get(key)
    if cached:
        return cached

    profile = await db.users.find_one({'user_id': user_id})
    if not profile:
        return None

    field = 'upi_id' if method == 'UPI' else 'ltc_address' if method == 'LTC' else 'usdt_address'
    wallet = profile.get(field)
    if wallet:
        wallet_cache[key] = wallet
    return wallet


async def quote_payment(amount: float, currency: str, method: str, buffer_percent: float) -> dict:
    if method == 'UPI':
        return {
            'pay_amount': amount,
            'pay_currency': currency,
            'fiat_equivalent': f'{amount} {currency}',
            'updated_at': 'local',
            'buffered': False,
        }

    target = 'LTC' if method == 'LTC' else 'USDT'
    converted = await convert_amount(amount, currency, target, buffer_percent)
    return {
        'pay_amount': converted['amount'],
        'pay_currency': target,
        'raw_amount': converted['raw_amount'],
        'fiat_equivalent': f'{amount} {currency}',
        'updated_at': converted['updated_at'],
        'buffered': True,
        'buffer_percent': buffer_percent,
    }
