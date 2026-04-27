from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase


class Database:
    def __init__(self, mongo_uri: str):
        self.client = AsyncIOMotorClient(mongo_uri)
        self.db: AsyncIOMotorDatabase = self.client.get_default_database() or self.client['escrow_bot']

    @property
    def users(self):
        return self.db['users']

    @property
    def deals(self):
        return self.db['deals']

    @property
    def invoices(self):
        return self.db['invoices']

    async def ensure_indexes(self) -> None:
        await self.users.create_index('user_id', unique=True)
        await self.deals.create_index('deal_id', unique=True)
        await self.deals.create_index([('buyer_id', 1), ('seller_id', 1), ('created_at', -1)])
        await self.deals.create_index([('expires_at', 1), ('status', 1)])
        await self.invoices.create_index('invoice_id', unique=True)
        await self.invoices.create_index([('created_by', 1), ('created_at', -1)])
