from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    discord_token: str
    discord_client_id: int
    mongo_uri: str
    mongo_db_name: str
    support_invite: str
    support_channel_id: int | None
    admin_role_ids: set[int]
    deal_timeout_minutes: int
    payment_timeout_minutes: int
    finalization_timeout_minutes: int
    auto_release_minutes: int
    command_cooldown_seconds: int
    price_buffer_percent: float


def _parse_int_set(value: str) -> set[int]:
    if not value:
        return set()
    return {int(x.strip()) for x in value.split(',') if x.strip().isdigit()}


def get_settings() -> Settings:
    token = os.getenv('DISCORD_TOKEN', '')
    client_id = os.getenv('DISCORD_CLIENT_ID', '')
    mongo_uri = os.getenv('MONGO_URI', '')

    missing = [
        key
        for key, raw in [('DISCORD_TOKEN', token), ('DISCORD_CLIENT_ID', client_id), ('MONGO_URI', mongo_uri)]
        if not raw
    ]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    return Settings(
        discord_token=token,
        discord_client_id=int(client_id),
        mongo_uri=mongo_uri,
        mongo_db_name=os.getenv('MONGO_DB_NAME', 'escrow_bot'),
        support_invite=os.getenv('SUPPORT_SERVER_INVITE', 'https://discord.gg/support'),
        support_channel_id=int(os.getenv('SUPPORT_CHANNEL_ID')) if os.getenv('SUPPORT_CHANNEL_ID') else None,
        admin_role_ids=_parse_int_set(os.getenv('ADMIN_ROLE_IDS', '')),
        deal_timeout_minutes=int(os.getenv('DEAL_TIMEOUT_MINUTES', '20')),
        payment_timeout_minutes=int(os.getenv('PAYMENT_TIMEOUT_MINUTES', '30')),
        finalization_timeout_minutes=int(os.getenv('FINALIZATION_TIMEOUT_MINUTES', '120')),
        auto_release_minutes=int(os.getenv('AUTO_RELEASE_MINUTES', '180')),
        command_cooldown_seconds=int(os.getenv('COMMAND_COOLDOWN_SECONDS', '3')),
        price_buffer_percent=float(os.getenv('PRICE_BUFFER_PERCENT', '2.0')),
    )
