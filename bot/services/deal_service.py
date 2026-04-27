from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from bot.services.payment_service import generate_note

TRANSITIONS = {
    'INIT': {'LOCKED', 'CANCELLED', 'DISPUTE'},
    'LOCKED': {'PAYMENT', 'CANCELLED', 'DISPUTE'},
    'PAYMENT': {'DELIVERY', 'CANCELLED', 'DISPUTE'},
    'DELIVERY': {'FINAL', 'DISPUTE'},
    'FINAL': {'COMPLETE', 'DISPUTE'},
    'COMPLETE': set(),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _activity(actor_id: int | str, action: str, detail: str = '') -> dict:
    return {'actor_id': int(actor_id) if str(actor_id).isdigit() else actor_id, 'action': action, 'detail': detail, 'at': _now()}


def validate_role(deal: dict, user_id: int, role: str | None = None) -> bool:
    if role == 'buyer':
        return deal['buyer_id'] == user_id
    if role == 'seller':
        return deal['seller_id'] == user_id
    return user_id in {deal['buyer_id'], deal['seller_id']}


async def create_deal(db, settings, *, buyer_id: int, seller_id: int, product: str, amount: float, method: str, currency: str) -> dict:
    cutoff = _now() - timedelta(minutes=10)
    duplicate = await db.deals.find_one(
        {
            'buyer_id': buyer_id,
            'seller_id': seller_id,
            'product': product,
            'amount': amount,
            'method': method,
            'created_at': {'$gte': cutoff},
            'status': {'$nin': ['CANCELLED', 'COMPLETED']},
        }
    )
    if duplicate:
        raise ValueError(f"Duplicate deal detected: {duplicate['deal_id']}")

    created = _now()
    deal = {
        'deal_id': f"D-{uuid4().hex[:8].upper()}",
        'buyer_id': buyer_id,
        'seller_id': seller_id,
        'product': product,
        'amount': float(amount),
        'currency': currency,
        'method': method,
        'status': 'INITIATED',
        'stage': 'INIT',
        'is_locked': False,
        'payment_proof': None,
        'unique_note': generate_note(),
        'expires_at': created + timedelta(minutes=settings.deal_timeout_minutes),
        'auto_release_at': created + timedelta(minutes=settings.auto_release_minutes),
        'buyer_confirmed_final': False,
        'seller_confirmed_final': False,
        'payment_confirmed_by_seller': False,
        'delivery_confirmed_by_seller': False,
        'delivery_confirmed_by_buyer': False,
        'thread_channel_id': None,
        'message_id': None,
        'activity_log': [_activity(buyer_id, 'DEAL_CREATED', 'Buyer started deal')],
        'created_at': created,
        'updated_at': created,
    }
    await db.deals.insert_one(deal)
    return deal


async def get_deal(db, deal_id: str) -> dict | None:
    return await db.deals.find_one({'deal_id': deal_id})


async def save_deal(db, deal: dict) -> None:
    deal['updated_at'] = _now()
    await db.deals.update_one({'deal_id': deal['deal_id']}, {'$set': deal})


async def progress_stage(db, settings, deal: dict, *, actor_id: int, next_stage: str, status: str, detail: str = '') -> dict:
    allowed = TRANSITIONS.get(deal['stage'], set())
    if next_stage not in allowed:
        raise ValueError(f"Invalid stage transition {deal['stage']} -> {next_stage}")

    deal['stage'] = next_stage
    deal['status'] = status

    if next_stage == 'LOCKED':
        deal['is_locked'] = True
        deal['locked_at'] = _now()
        deal['expires_at'] = _now() + timedelta(minutes=settings.payment_timeout_minutes)

    if next_stage == 'FINAL':
        deal['expires_at'] = _now() + timedelta(minutes=settings.finalization_timeout_minutes)

    deal['activity_log'].append(_activity(actor_id, f'STAGE_{next_stage}', detail))
    await save_deal(db, deal)
    return deal


async def complete_deal(db, deal: dict, actor_id: int, role: str) -> dict:
    if deal['stage'] != 'FINAL':
        raise ValueError('Deal is not in FINAL stage')

    if role == 'buyer':
        deal['buyer_confirmed_final'] = True
    if role == 'seller':
        deal['seller_confirmed_final'] = True

    deal['activity_log'].append(_activity(actor_id, 'FINAL_CONFIRM', role))

    if deal['buyer_confirmed_final'] and deal['seller_confirmed_final']:
        deal['stage'] = 'COMPLETE'
        deal['status'] = 'COMPLETED'
        deal['activity_log'].append(_activity(actor_id, 'DEAL_COMPLETED', 'Mutual final confirmation'))

        await db.users.update_one(
            {'user_id': deal['buyer_id']},
            {'$inc': {'total_deals': 1, 'completed_deals': 1, 'reputation': 1}, '$setOnInsert': {'rating_score': 5}},
            upsert=True,
        )
        await db.users.update_one(
            {'user_id': deal['seller_id']},
            {'$inc': {'total_deals': 1, 'completed_deals': 1, 'reputation': 1}, '$setOnInsert': {'rating_score': 5}},
            upsert=True,
        )

    await save_deal(db, deal)
    return deal


async def cancel_deal(db, deal: dict, actor_id: int | str, reason: str) -> dict:
    if deal['status'] in {'CANCELLED', 'COMPLETED'}:
        return deal
    deal['status'] = 'CANCELLED'
    deal['activity_log'].append(_activity(actor_id, 'DEAL_CANCELLED', reason))
    await db.users.update_many({'user_id': {'$in': [deal['buyer_id'], deal['seller_id']]}}, {'$inc': {'cancelled_deals': 1}})
    await save_deal(db, deal)
    return deal


async def open_dispute(db, deal: dict, actor_id: int, reason: str) -> dict:
    deal['status'] = 'DISPUTE'
    deal['is_locked'] = True
    deal['activity_log'].append(_activity(actor_id, 'DISPUTE_OPENED', reason))
    await db.users.update_many({'user_id': {'$in': [deal['buyer_id'], deal['seller_id']]}}, {'$inc': {'disputes': 1}})
    await save_deal(db, deal)
    return deal


async def process_timeouts(db) -> dict:
    now = _now()
    expired = 0
    async for deal in db.deals.find({'status': {'$in': ['INITIATED', 'PAYMENT_PENDING', 'PAID', 'DELIVERED']}, 'expires_at': {'$lte': now}}):
        await cancel_deal(db, deal, 'system', 'Expired by timeout')
        expired += 1

    auto_released = 0
    async for deal in db.deals.find({'stage': 'FINAL', 'status': {'$nin': ['COMPLETED', 'CANCELLED', 'DISPUTE']}, 'auto_release_at': {'$lte': now}}):
        deal['seller_confirmed_final'] = True
        deal['buyer_confirmed_final'] = True
        deal['stage'] = 'COMPLETE'
        deal['status'] = 'COMPLETED'
        deal['activity_log'].append(_activity('system', 'AUTO_RELEASE', 'Finalized by inactivity timer'))
        await save_deal(db, deal)
        auto_released += 1

    return {'expired_cancelled': expired, 'auto_released': auto_released}


async def admin_action(db, deal: dict, actor_id: int, action: str) -> dict:
    if action in {'resolve', 'refund'}:
        deal['status'] = 'CANCELLED'
        deal['activity_log'].append(_activity(actor_id, f'ADMIN_{action.upper()}', 'Admin closed deal'))
    elif action == 'force_complete':
        deal['status'] = 'COMPLETED'
        deal['stage'] = 'COMPLETE'
        deal['seller_confirmed_final'] = True
        deal['buyer_confirmed_final'] = True
        deal['activity_log'].append(_activity(actor_id, 'ADMIN_FORCE_COMPLETE', 'Admin forced completion'))
    await save_deal(db, deal)
    return deal


async def stats(db) -> dict:
    total = await db.deals.count_documents({})
    completed = await db.deals.count_documents({'status': 'COMPLETED'})
    cancelled = await db.deals.count_documents({'status': 'CANCELLED'})
    disputes = await db.deals.count_documents({'status': 'DISPUTE'})
    pipeline = [{'$group': {'_id': '$method', 'count': {'$sum': 1}}}, {'$sort': {'count': -1}}, {'$limit': 1}]
    rows = await db.deals.aggregate(pipeline).to_list(1)
    top_method = rows[0]['_id'] if rows else 'N/A'
    success_rate = round((completed / total) * 100, 2) if total else 0.0
    return {
        'total': total,
        'completed': completed,
        'cancelled': cancelled,
        'disputes': disputes,
        'success_rate': success_rate,
        'top_method': top_method,
    }
