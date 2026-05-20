import pytest
from app.game.omi_env.rules import (
    Card,
    index_to_card,
    card_to_index,
    is_terminal,
    legal_card_mask,
    resolve_trick,
    ACTION_DIM,
    NUM_CARDS
)

def test_card_conversion():
    card = Card(suit="S", rank="A")
    idx = card_to_index(card)
    assert index_to_card(idx) == card

    # Spades (S) is the last suit in ("C", "D", "H", "S"), A is the last rank in ("7", "8", "9", "10", "J", "Q", "K", "A")
    assert idx == 31 
    
    card2 = Card(suit="C", rank="7")
    idx2 = card_to_index(card2)
    assert idx2 == 0

def test_legal_card_mask_no_lead():
    hand = [0, 5, 10, 15]
    mask = legal_card_mask(hand, lead_suit=None)
    assert sum(mask) == 4
    for idx in hand:
        assert mask[idx] == 1

def test_legal_card_mask_must_follow_suit():
    # 0="C", 7="C" A
    # 8="D" 7
    hand = [0, 7, 8, 15]
    
    # Lead suit is Clubs (C)
    mask = legal_card_mask(hand, lead_suit="C")
    
    assert mask[0] == 1
    assert mask[7] == 1
    assert mask[8] == 0
    assert mask[15] == 0
    assert sum(mask) == 2

def test_legal_card_mask_cannot_follow_suit():
    hand = [8, 15, 20] # No Clubs
    mask = legal_card_mask(hand, lead_suit="C")
    
    # Should be allowed to play anything
    assert sum(mask) == 3
    for idx in hand:
        assert mask[idx] == 1

def test_resolve_trick_no_trump():
    # Player 0 leads with "C" rank "8" (value 3, index 1)
    # Player 1 plays "C" rank "10" (value 5, index 3)
    # Player 2 plays "D" rank "A" (value 9, index 15) -> off-suit
    # Player 3 plays "C" rank "7" (value 2, index 0)
    trick = [
        (0, 1),
        (1, 3),
        (2, 15),
        (3, 0)
    ]
    
    # Player 1 played the highest Club
    winner = resolve_trick(trick, lead_suit="C", trump_suit=None)
    assert winner == 1

def test_resolve_trick_with_trump():
    # Player 0 leads with "C" rank "A" (value 9, index 7)
    # Player 1 plays "C" rank "K" (value 8, index 6)
    # Player 2 plays "H" rank "7" (value 2, index 16) -> trump!
    # Player 3 plays "H" rank "8" (value 3, index 17) -> higher trump!
    trick = [
        (0, 7),
        (1, 6),
        (2, 16),
        (3, 17)
    ]
    
    # Player 3 played the highest Heart (Trump)
    winner = resolve_trick(trick, lead_suit="C", trump_suit="H")
    assert winner == 3

def test_hand_ends_when_team_reaches_five_tricks():
    assert is_terminal((5, 0), cards_remaining=12) is True
    assert is_terminal((2, 5), cards_remaining=4) is True

def test_hand_continues_until_five_tricks_or_no_cards():
    assert is_terminal((4, 3), cards_remaining=4) is False
    assert is_terminal((4, 4), cards_remaining=0) is True
