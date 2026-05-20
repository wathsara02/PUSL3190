export interface SeatModel {
    seat_id: number;
    type: "open" | "human" | "bot";
    display_name: string | null;
    peer_id: string | null;
    is_viewer: boolean;
    avatar_id: string | null;
    bot_difficulty: "easy" | "medium" | "hard" | null;
    is_muted: boolean;
    is_deafened: boolean;
    is_disconnected: boolean;
}

export interface RoomStateSnapshot {
    room_id: string;
    is_host: boolean;
    seats: SeatModel[];
    phase: "lobby" | "deal4" | "declare_trump" | "deal_rest" | "playing" | "finished";

    viewer_seat_id: number | null;
    viewer_hand: number[] | null;
    action_mask: number[] | null;

    hand_counts: number[];
    trump_suit: string | null;
    lead_suit: string | null;
    current_trick: [number, number][]; // [player_id, card_index]
    completed_trick?: [number, number][] | null;
    current_turn_player: number | null;
    hand_number: number;
    trick_number: number;
    tricks_won: [number, number];
    scores: [number, number];
    winner_team: number | null;
    trick_winner_display?: number | null;
    last_hand_result?: HandResult | null;
}

export interface HandResult {
    hand_number: number;
    winner_team: number | null;
    scoring_team: number | null;
    points_awarded: number;
    tricks_won: [number, number];
    was_tie: boolean;
}

export interface AuthResponse {
    token: string;
    room_id: string;
    seat_id: number | null;
}
