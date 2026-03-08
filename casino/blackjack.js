const { getRoll } = require('../fairness/provablyFair');

const sessions = new Map();

function createDeck() {
  const cards = [];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (let d = 0; d < 6; d += 1) {
    for (const rank of ranks) {
      for (let i = 0; i < 4; i += 1) {
        cards.push(rank);
      }
    }
  }
  return cards;
}

function cardValue(card) {
  if (card === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card)) return 10;
  return Number(card);
}

function handValue(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = hand.filter((c) => c === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

function drawCard(state, userId) {
  if (state.deck.length === 0) state.deck = createDeck();
  const roll = getRoll(userId);
  const idx = Math.floor(roll.randomFloat * state.deck.length);
  return state.deck.splice(idx, 1)[0];
}

function dealerPlay(state, userId) {
  while (true) {
    const value = handValue(state.dealer);
    if (value.total > 21) break;
    if (value.total > 17) break;
    if (value.total === 17 && !value.soft) break;
    state.dealer.push(drawCard(state, userId));
  }
}

function getCurrentHand(state) {
  return state.hands[state.activeHand];
}

function canSplit(hand) {
  return hand.cards.length === 2 && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
}

function startGame(userId, wager) {
  const state = {
    wager,
    deck: createDeck(),
    dealer: [],
    hands: [{ cards: [], wager, done: false, isDoubled: false, splitCount: 0 }],
    activeHand: 0,
    finished: false,
  };

  const hand = state.hands[0];
  hand.cards.push(drawCard(state, userId), drawCard(state, userId));
  state.dealer.push(drawCard(state, userId), drawCard(state, userId));

  sessions.set(userId, state);
  return state;
}

function advanceHand(state) {
  while (state.activeHand < state.hands.length && state.hands[state.activeHand].done) {
    state.activeHand += 1;
  }
}

function action(userId, type) {
  const state = sessions.get(userId);
  if (!state || state.finished) return { error: 'No active blackjack game.' };

  const hand = getCurrentHand(state);
  if (!hand) return { error: 'No active hand.' };

  if (type === 'hit') {
    hand.cards.push(drawCard(state, userId));
    if (handValue(hand.cards).total >= 21) hand.done = true;
  } else if (type === 'stand') {
    hand.done = true;
  } else if (type === 'double') {
    if (hand.cards.length !== 2) return { error: 'Double is only allowed on first two cards.' };
    hand.wager *= 2;
    hand.isDoubled = true;
    hand.cards.push(drawCard(state, userId));
    hand.done = true;
  } else if (type === 'split') {
    if (hand.cards.length !== 2 || !canSplit(hand)) return { error: 'You cannot split this hand.' };
    if (hand.splitCount >= 3) return { error: 'Maximum re-split limit reached.' };
    const c1 = hand.cards[0];
    const c2 = hand.cards[1];
    hand.cards = [c1, drawCard(state, userId)];
    hand.splitCount += 1;

    const newHand = { cards: [c2, drawCard(state, userId)], wager: hand.wager, done: false, isDoubled: false, splitCount: hand.splitCount };
    state.hands.splice(state.activeHand + 1, 0, newHand);
  }

  if (handValue(hand.cards).total > 21) hand.done = true;
  advanceHand(state);

  if (state.activeHand >= state.hands.length) {
    dealerPlay(state, userId);
    state.finished = true;
  }

  return { state };
}

function settle(userId) {
  const state = sessions.get(userId);
  if (!state || !state.finished) return null;

  const dealerTotal = handValue(state.dealer).total;
  let payout = 0;
  const outcomes = [];

  for (const hand of state.hands) {
    const hv = handValue(hand.cards).total;
    const isNatural = hand.cards.length === 2 && hv === 21;

    if (hv > 21) {
      outcomes.push('Bust');
      continue;
    }

    if (dealerTotal > 21 || hv > dealerTotal) {
      const winAmount = isNatural ? hand.wager * 2.5 : hand.wager * 2;
      payout += winAmount;
      outcomes.push(isNatural ? 'Blackjack' : 'Win');
    } else if (hv === dealerTotal) {
      payout += hand.wager;
      outcomes.push('Push');
    } else {
      outcomes.push('Lose');
    }
  }

  sessions.delete(userId);
  return { payout, totalWager: state.hands.reduce((sum, h) => sum + h.wager, 0), outcomes, state };
}

function getState(userId) {
  return sessions.get(userId);
}

module.exports = { startGame, action, settle, getState, handValue, canSplit };
