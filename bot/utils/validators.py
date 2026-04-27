from __future__ import annotations

import re

UPI_REGEX = re.compile(r'^[\w.-]{2,256}@[A-Za-z]{2,64}$')
LTC_REGEX = re.compile(r'^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$')
USDT_REGEX = re.compile(r'^[T0-9A-Za-z]{25,64}$')


def sanitize_text(text: str, max_len: int = 300) -> str:
    clean = re.sub(r'[\x00-\x1f\x7f]', ' ', str(text or ''))
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:max_len]


def is_valid_upi(value: str | None) -> bool:
    return value is None or bool(UPI_REGEX.match(value))


def is_valid_ltc(value: str | None) -> bool:
    return value is None or bool(LTC_REGEX.match(value))


def is_valid_usdt(value: str | None) -> bool:
    return value is None or bool(USDT_REGEX.match(value))


def is_http_url(value: str) -> bool:
    return value.lower().startswith('http://') or value.lower().startswith('https://')


def parse_custom_id(custom_id: str) -> tuple[str, str] | None:
    if ':' not in custom_id:
        return None
    action, deal_id = custom_id.split(':', 1)
    if not action or not deal_id:
        return None
    return action, deal_id
