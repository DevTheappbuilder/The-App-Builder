from __future__ import annotations

from datetime import datetime, timezone
import aiohttp
from cachetools import TTLCache

_rates_cache: TTLCache[str, dict] = TTLCache(maxsize=16, ttl=45)


async def fetch_rates() -> dict:
    cached = _rates_cache.get('rates')
    if cached:
        return cached

    async with aiohttp.ClientSession() as session:
        async with session.get(
            'https://api.coingecko.com/api/v3/simple/price',
            params={'ids': 'litecoin,tether', 'vs_currencies': 'usd,inr'},
            timeout=12,
        ) as cg_resp:
            cg = await cg_resp.json()

        async with session.get('https://open.er-api.com/v6/latest/USD', timeout=12) as fx_resp:
            fx = await fx_resp.json()

    rates = {
        'ltc_usd': cg['litecoin']['usd'],
        'ltc_inr': cg['litecoin']['inr'],
        'usdt_usd': cg.get('tether', {}).get('usd', 1),
        'usd_inr': fx['rates']['INR'],
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    _rates_cache['rates'] = rates
    return rates


async def convert_amount(amount: float, from_currency: str, to_currency: str, buffer_percent: float = 0.0) -> dict:
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    if from_currency == to_currency:
        return {'amount': amount, 'raw_amount': amount, 'updated_at': datetime.now(timezone.utc).isoformat()}

    rates = await fetch_rates()

    def to_usd(value: float, currency: str) -> float:
        if currency == 'USD':
            return value
        if currency == 'INR':
            return value / rates['usd_inr']
        if currency == 'LTC':
            return value * rates['ltc_usd']
        if currency == 'USDT':
            return value * rates['usdt_usd']
        raise ValueError(f'Unsupported currency: {currency}')

    def from_usd(value: float, currency: str) -> float:
        if currency == 'USD':
            return value
        if currency == 'INR':
            return value * rates['usd_inr']
        if currency == 'LTC':
            return value / rates['ltc_usd']
        if currency == 'USDT':
            return value / rates['usdt_usd']
        raise ValueError(f'Unsupported currency: {currency}')

    usd = to_usd(amount, from_currency)
    raw = from_usd(usd, to_currency)
    buffered = raw * (1 + (buffer_percent / 100.0))

    return {
        'amount': round(buffered, 8 if to_currency == 'LTC' else 2),
        'raw_amount': round(raw, 8 if to_currency == 'LTC' else 2),
        'updated_at': rates['updated_at'],
        'rates': rates,
    }
