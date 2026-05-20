import asyncio
import pytest
from app.game.room_manager import room_manager

def test_create_and_join_room():
    room, host_token = room_manager.create_room("Alice")
    assert room is not None
    assert host_token is not None
    assert room.seats[0].type == "human"
    assert room.seats[0].display_name == "Alice"
    assert room.seats[0].token == host_token

    # Join Bob
    success = room.join_human("bob_token", "Bob")
    assert success is True
    assert room.seats[1].type == "human"
    assert room.seats[1].display_name == "Bob"
    
def test_configure_room():
    room, host_token = room_manager.create_room("Charlie")
    
    # Charlie configures seat 1 as bot
    from app.models.schemas import SeatModel
    
    room.seats[1].type = "bot"
    room.seats[1].bot_difficulty = "easy"
    
    assert room.seats[1].type == "bot"
    assert room.seats[1].bot_difficulty == "easy"

def test_start_game_and_trump_phase():
    room, host_token = room_manager.create_room("Dave")
    room.seats[1].type = "bot"
    room.seats[2].type = "bot"
    room.seats[3].type = "bot"
    
    assert room.phase == "lobby"
    room.start_game()
    assert room.phase == "playing"
    assert room.env.stage == "trump"
    
    state = room.get_public_state(viewer_token=host_token)
    assert state.phase == "declare_trump"
    assert state.viewer_seat_id == 0

    # Dave (Seat 0) has to declare trump.
    # Action mask should only allow actions 32, 33, 34, 35
    assert state.action_mask is not None
    assert sum(state.action_mask[:32]) == 0
    assert sum(state.action_mask[32:36]) == 4
    
    # Try invalid action
    with pytest.raises(ValueError):
        asyncio.run(room.process_action(host_token, 0)) # Playing a card is invalid here

    # Declare Spades (action 35, where 32=C, 33=D, 34=H, 35=S)
    asyncio.run(room.process_action(host_token, 35))
    
    assert room.env.stage == "play"
    assert room.env.trump_suit == "S"

def test_completed_hand_updates_match_score_and_redeals():
    room, host_token = room_manager.create_room("Eve")
    room.phase = "playing"
    room.env.start_player = 1
    room.env.trump_declarer = 0
    room.env.trump_suit = "S"
    room.env.tricks_won = (5, 3)
    room.env._terminated = True

    room._handle_completed_hand()

    assert room.phase == "playing"
    assert room.match_scores == (1, 0)
    assert room.env._terminated is False
    assert room.env.tricks_won == (0, 0)
    assert room.env.trump_declarer == 1

    state = room.get_public_state(viewer_token=host_token)
    assert state.phase == "declare_trump"
    assert state.scores == (1, 0)
    assert state.tricks_won == (0, 0)
    assert state.last_hand_result is not None
    assert state.last_hand_result.hand_number == 0
    assert state.last_hand_result.winner_team == 0
    assert state.last_hand_result.scoring_team == 0
    assert state.last_hand_result.points_awarded == 1
    assert state.last_hand_result.tricks_won == (5, 3)

def test_trick_number_counts_completed_tricks():
    room, host_token = room_manager.create_room("Counter")
    room.phase = "playing"
    room.env.history = []
    assert room.get_public_state(viewer_token=host_token).trick_number == 0

    room.env.history = [
        (0, 0, "C", "S"),
        (1, 1, "C", "S"),
        (2, 2, "C", "S"),
    ]
    assert room.get_public_state(viewer_token=host_token).trick_number == 0

    room.env.history.append((3, 3, "C", "S"))
    assert room.get_public_state(viewer_token=host_token).trick_number == 1

def test_public_state_includes_completed_trick_for_animation():
    room, host_token = room_manager.create_room("Animator")
    room.phase = "playing"
    room.completed_trick_for_display = [(0, 0), (1, 1), (2, 2), (3, 3)]
    room.trick_winner_for_display = 2

    state = room.get_public_state(viewer_token=host_token)

    assert state.completed_trick == [(0, 0), (1, 1), (2, 2), (3, 3)]
    assert state.trick_winner_display == 2

def test_challengers_get_two_points_when_trump_team_loses():
    room, _ = room_manager.create_room("Frank")
    room.env.trump_declarer = 0
    room.env.tricks_won = (3, 5)

    room._score_completed_hand()

    assert room.match_scores == (0, 2)

def test_tied_hand_scores_nothing_and_sets_next_hand_bonus():
    room, _ = room_manager.create_room("Frank")
    room.env.trump_declarer = 0
    room.env.tricks_won = (4, 4)

    room._score_completed_hand()

    assert room.match_scores == (0, 0)
    assert room.pending_tie_bonus is True

def test_next_winner_after_tied_hand_gets_two_points():
    room, _ = room_manager.create_room("Helen")
    room.pending_tie_bonus = True
    room.env.trump_declarer = 0
    room.env.tricks_won = (5, 3)

    room._score_completed_hand()

    assert room.match_scores == (2, 0)
    assert room.pending_tie_bonus is False

def test_match_finishes_at_ten_points():
    room, _ = room_manager.create_room("Grace")
    room.phase = "playing"
    room.match_scores = (9, 0)
    room.env.trump_declarer = 0
    room.env.trump_suit = "H"
    room.env.tricks_won = (6, 2)
    room.env._terminated = True

    room._handle_completed_hand()

    assert room.phase == "finished"
    assert room.match_scores == (10, 0)
    assert room.match_winner_team == 0
    assert room.last_hand_result_for_display is not None
    assert room.last_hand_result_for_display.winner_team == 0

def test_trump_declaration_clears_previous_hand_result():
    room, host_token = room_manager.create_room("Ivy")
    room.phase = "playing"
    room.env.start_player = 0
    room.env.trump_declarer = 0
    room.env.trump_suit = "S"
    room.env.tricks_won = (5, 2)
    room.env._terminated = True

    room._handle_completed_hand()
    assert room.get_public_state(viewer_token=host_token).last_hand_result is not None

    asyncio.run(room.process_action(host_token, 32))

    assert room.get_public_state(viewer_token=host_token).last_hand_result is None

def test_public_state_hides_secret_tokens():
    room, host_token = room_manager.create_room("Host")
    room.join_human("guest_token", "Guest")

    host_state = room.get_public_state(viewer_token=host_token)
    guest_state = room.get_public_state(viewer_token="guest_token")

    assert host_state.is_host is True
    assert guest_state.is_host is False
    assert host_state.viewer_seat_id == 0
    assert guest_state.viewer_seat_id == 1
    assert all(seat.token is None for seat in host_state.seats)
    assert all(seat.token is None for seat in guest_state.seats)
    assert all(seat.user_id is None for seat in host_state.seats)
    assert host_state.seats[0].peer_id is not None
    assert host_state.seats[1].peer_id is not None
    assert host_state.seats[0].peer_id == guest_state.seats[0].peer_id
