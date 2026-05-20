from omi_env import rules


def test_must_follow_suit_mask():
    hand = [
        rules.card_to_index(rules.Card("H", "A")),
        rules.card_to_index(rules.Card("S", "K")),
        rules.card_to_index(rules.Card("H", "7")),
    ]
    mask = rules.legal_card_mask(hand, lead_suit="H")
    assert mask[rules.card_to_index(rules.Card("H", "A"))] == 1
    assert mask[rules.card_to_index(rules.Card("H", "7"))] == 1
    assert mask[rules.card_to_index(rules.Card("S", "K"))] == 0


def test_trick_resolution_with_trump():
    lead = "H"
    trump = "S"
    trick = [
        (0, rules.card_to_index(rules.Card("H", "8"))),
        (1, rules.card_to_index(rules.Card("H", "K"))),
        (2, rules.card_to_index(rules.Card("S", "7"))),
        (3, rules.card_to_index(rules.Card("D", "A"))),
    ]
    winner = rules.resolve_trick(trick, lead_suit=lead, trump_suit=trump)
    assert winner == 2  # trump wins even though low rank


def test_deterministic_deck_with_seed():
    import random

    rng_a = random.Random(42)
    rng_b = random.Random(42)
    deck1 = rules.shuffle_deck(rng_a)
    deck2 = rules.shuffle_deck(rng_b)
    assert deck1 == deck2


def test_hand_ends_when_team_reaches_five_tricks():
    assert rules.is_terminal((5, 0), cards_remaining=12) is True
    assert rules.is_terminal((2, 5), cards_remaining=4) is True


def test_hand_continues_until_five_tricks_or_no_cards():
    assert rules.is_terminal((4, 3), cards_remaining=4) is False
    assert rules.is_terminal((4, 4), cards_remaining=0) is True
