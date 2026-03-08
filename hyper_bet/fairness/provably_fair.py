import hmac
import hashlib
import secrets
import time
from hyper_bet.database.db import get_conn, get_or_create_user


def get_server_seed_state():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM fairness WHERE id = 1").fetchone()


def get_roll(user_id: int) -> dict:
    user = get_or_create_user(user_id)
    fair = get_server_seed_state()
    message = f"{user['client_seed']}:{user['nonce']}".encode()
    digest = hmac.new(fair["server_seed"].encode(), message, hashlib.sha256).hexdigest()
    integer = int(digest[:13], 16)
    rand = integer / float(0x1FFFFFFFFFFFFF)

    with get_conn() as conn:
        conn.execute("UPDATE users SET nonce = nonce + 1 WHERE user_id = ?", (str(user_id),))

    return {
        "random_float": rand,
        "hash": digest,
        "nonce_used": int(user["nonce"]),
        "client_seed": user["client_seed"],
        "server_seed_hash": fair["server_seed_hash"],
    }


def set_client_seed(user_id: int, client_seed: str) -> None:
    get_or_create_user(user_id)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET client_seed = ?, nonce = 0 WHERE user_id = ?",
            (client_seed, str(user_id)),
        )


def rotate_server_seed() -> dict:
    current = get_server_seed_state()
    new_seed = secrets.token_hex(32)
    new_hash = hashlib.sha256(new_seed.encode()).hexdigest()

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE fairness
            SET previous_server_seed = ?, server_seed = ?, server_seed_hash = ?, rotated_at = ?
            WHERE id = 1
            """,
            (current["server_seed"], new_seed, new_hash, int(time.time())),
        )

    return {"old_server_seed": current["server_seed"], "new_server_seed_hash": new_hash}
