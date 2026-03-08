from .db import get_conn, get_or_create_user

TARGET_RTP = 0.96
JACKPOT_RATE = 0.01


def get_user(user_id: int):
    return get_or_create_user(user_id)


def change_balance(user_id: int, amount: int) -> int | None:
    user = get_or_create_user(user_id)
    next_balance = int(user["balance"]) + amount
    if next_balance < 0:
        return None
    with get_conn() as conn:
        conn.execute("UPDATE users SET balance = ? WHERE user_id = ?", (next_balance, str(user_id)))
    return next_balance


def set_balance(user_id: int, amount: int) -> None:
    get_or_create_user(user_id)
    with get_conn() as conn:
        conn.execute("UPDATE users SET balance = ? WHERE user_id = ?", (amount, str(user_id)))


def record_bet(user_id: int, wager: float, payout: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE house SET total_wagered = total_wagered + ?, total_paid = total_paid + ?, jackpot = jackpot + ? WHERE id = 1",
            (wager, payout, wager * JACKPOT_RATE),
        )
        conn.execute(
            """
            UPDATE users
            SET total_wagered = total_wagered + ?,
                total_won = total_won + ?,
                wins = wins + ?,
                losses = losses + ?
            WHERE user_id = ?
            """,
            (wager, payout, 1 if payout > 0 else 0, 0 if payout > 0 else 1, str(user_id)),
        )


def get_house():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM house WHERE id = 1").fetchone()


def get_dynamic_rtp_factor() -> float:
    house = get_house()
    total_wagered = float(house["total_wagered"])
    if total_wagered <= 0:
        return 1.0
    current_rtp = float(house["total_paid"]) / total_wagered
    drift = TARGET_RTP - current_rtp
    return 1 + max(-0.03, min(0.03, drift))
