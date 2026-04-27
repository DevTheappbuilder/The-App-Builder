from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen
import asyncio
import json

from cachetools import TTLCache

_rates_cache: TTLCache[str, dict] = TTLCache(maxsize=16, ttl=45)


def _http_get_json(url: str, params: dict | None = None, timeout: int = 12) -> dict:
    full_url = f"{url}?{urlencode(params)}" if params else url
    with urlopen(full_url, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


async def fetch_rates() -> dict:
    cached = _rates_cache.get('rates')
    if cached:
        return cached

    cg_task = asyncio.to_thread(
        _http_get_json,
        'https://api.coingecko.com/api/v3/simple/price',
        {'ids': 'litecoin,tether', 'vs_currencies': 'usd,inr'},
        12,
    )
    fx_task = asyncio.to_thread(_http_get_json, 'https://open.er-api.com/v6/latest/USD', None, 12)
    cg, fx = await asyncio.gather(cg_task, fx_task)

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
