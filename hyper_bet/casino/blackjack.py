from dataclasses import dataclass, field
from typing import List, Dict
from hyper_bet.fairness.provably_fair import get_roll


@dataclass
class Hand:
    cards: List[str] = field(default_factory=list)
    wager: int = 0
    done: bool = False
    split_count: int = 0


@dataclass
class GameState:
    wager: int
    deck: List[str]
    dealer: List[str] = field(default_factory=list)
    hands: List[Hand] = field(default_factory=list)
    active_hand: int = 0
    finished: bool = False


SESSIONS: Dict[int, GameState] = {}


def create_deck() -> List[str]:
    cards = []
    ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
    for _ in range(6):
        for r in ranks:
            cards.extend([r] * 4)
    return cards


def card_value(card: str) -> int:
    if card == "A":
        return 11
    if card in {"K", "Q", "J"}:
        return 10
    return int(card)


def hand_value(cards: List[str]) -> tuple[int, bool]:
    total = sum(card_value(c) for c in cards)
    aces = sum(1 for c in cards if c == "A")
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    return total, aces > 0


def draw_card(state: GameState, user_id: int) -> str:
    if not state.deck:
        state.deck = create_deck()
    roll = get_roll(user_id)
    idx = int(roll["random_float"] * len(state.deck))
    return state.deck.pop(min(idx, len(state.deck) - 1))


def dealer_play(state: GameState, user_id: int) -> None:
    while True:
        total, soft = hand_value(state.dealer)
        if total > 21 or total > 17 or (total == 17 and not soft):
            break
        state.dealer.append(draw_card(state, user_id))


def can_split(hand: Hand) -> bool:
    return len(hand.cards) == 2 and card_value(hand.cards[0]) == card_value(hand.cards[1])


def start_game(user_id: int, wager: int) -> GameState:
    state = GameState(wager=wager, deck=create_deck(), hands=[Hand(wager=wager)])
    state.hands[0].cards = [draw_card(state, user_id), draw_card(state, user_id)]
    state.dealer = [draw_card(state, user_id), draw_card(state, user_id)]
    SESSIONS[user_id] = state
    return state


def advance_hand(state: GameState) -> None:
    while state.active_hand < len(state.hands) and state.hands[state.active_hand].done:
        state.active_hand += 1


def action(user_id: int, kind: str):
    state = SESSIONS.get(user_id)
    if not state or state.finished:
        return {"error": "No active blackjack game."}
    if state.active_hand >= len(state.hands):
        return {"error": "No active hand."}

    hand = state.hands[state.active_hand]

    if kind == "hit":
        hand.cards.append(draw_card(state, user_id))
        if hand_value(hand.cards)[0] >= 21:
            hand.done = True
    elif kind == "stand":
        hand.done = True
    elif kind == "double":
        if len(hand.cards) != 2:
            return {"error": "Double only allowed on first two cards."}
        hand.wager *= 2
        hand.cards.append(draw_card(state, user_id))
        hand.done = True
    elif kind == "split":
        if not can_split(hand):
            return {"error": "You cannot split this hand."}
        if hand.split_count >= 3:
            return {"error": "Maximum re-split limit reached."}
        c1, c2 = hand.cards
        hand.cards = [c1, draw_card(state, user_id)]
        hand.split_count += 1
        state.hands.insert(
            state.active_hand + 1,
            Hand(cards=[c2, draw_card(state, user_id)], wager=hand.wager, split_count=hand.split_count),
        )

    if hand_value(hand.cards)[0] > 21:
        hand.done = True

    advance_hand(state)
    if state.active_hand >= len(state.hands):
        dealer_play(state, user_id)
        state.finished = True

    return {"state": state}


def settle(user_id: int):
    state = SESSIONS.get(user_id)
    if not state or not state.finished:
        return None

    dealer_total, _ = hand_value(state.dealer)
    payout = 0.0
    outcomes = []

    for hand in state.hands:
        total, _ = hand_value(hand.cards)
        is_natural = len(hand.cards) == 2 and total == 21

        if total > 21:
            outcomes.append("Bust")
            continue

        if dealer_total > 21 or total > dealer_total:
            win = hand.wager * (2.5 if is_natural else 2.0)
            payout += win
            outcomes.append("Blackjack" if is_natural else "Win")
        elif total == dealer_total:
            payout += hand.wager
            outcomes.append("Push")
        else:
            outcomes.append("Lose")

    del SESSIONS[user_id]
    total_wager = sum(h.wager for h in state.hands)
    return {"payout": payout, "total_wager": total_wager, "outcomes": outcomes, "state": state}


def get_state(user_id: int):
    return SESSIONS.get(user_id)
