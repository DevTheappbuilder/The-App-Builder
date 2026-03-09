from hyper_bet.database.economy import (
    TARGET_RTP,
    get_user,
    change_balance,
    record_bet,
    get_dynamic_rtp_factor,
)
from hyper_bet.fairness.provably_fair import get_roll


def ensure_bankroll(user_id: int, amount: int) -> bool:
    user = get_user(user_id)
    if int(user["balance"]) < amount:
        return False
    return change_balance(user_id, -amount) is not None


def settle_game(user_id: int, wager: float, payout: float) -> None:
    if payout > 0:
        change_balance(user_id, int(payout))
    record_bet(user_id, wager, payout)


def rtp_adjusted(base: float) -> float:
    return base * get_dynamic_rtp_factor()


__all__ = ["TARGET_RTP", "ensure_bankroll", "settle_game", "rtp_adjusted", "get_roll"]
