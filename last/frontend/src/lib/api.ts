import type { AuthResponse, RoomStateSnapshot, SeatModel } from '../types/game';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export interface GameHistoryItem {
    id: number;
    room_id?: string | null;
    date: string;
    score_us: number;
    score_them: number;
    status: 'in_progress' | 'win' | 'loss' | 'tie';
    game_log?: string;
}

class ApiClient {
    private base: string;

    constructor(base: string) {
        this.base = base;
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.base}${path}`, options);
        if (response.ok) return response.json() as Promise<T>;
        let message = `Request failed with status ${response.status}`;
        try {
            const body = await response.json();
            message = body.detail || body.message || message;
        } catch { /* keep status message */ }
        throw new Error(message);
    }

    post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
        return this.request<T>(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });
    }

    get<T>(path: string, headers?: Record<string, string>): Promise<T> {
        return this.request<T>(path, { headers });
    }
}

const client = new ApiClient(BASE);

export function createRoom(displayName: string, authToken: string | null, avatarId?: string): Promise<AuthResponse> {
    return client.post('/api/lobby/create-room', { display_name: displayName, auth_token: authToken, avatar_id: avatarId ?? 'frog' });
}

export function joinRoom(roomId: string, displayName: string, authToken: string | null, avatarId?: string): Promise<AuthResponse> {
    return client.post('/api/lobby/join-room', { room_id: roomId, display_name: displayName, auth_token: authToken, avatar_id: avatarId ?? 'frog' });
}

export function configureRoom(roomId: string, token: string, seats: SeatModel[]): Promise<{ status: string }> {
    return client.post(`/api/room/${roomId}/configure`, { seats }, { 'X-Room-Token': token });
}

export function swapSeats(roomId: string, token: string, seat1: number, seat2: number): Promise<{ status: string }> {
    return client.post(`/api/room/${roomId}/swap-seats`, { seat1, seat2 }, { 'X-Room-Token': token });
}

export function startGame(roomId: string, token: string): Promise<{ status: string }> {
    return client.post(`/api/room/${roomId}/start`, null, { 'X-Room-Token': token });
}

export function getRoom(roomId: string, token: string): Promise<RoomStateSnapshot> {
    return client.get(`/api/room/${roomId}`, { 'X-Room-Token': token });
}

export function getHistory(token: string, limit = 50, offset = 0): Promise<GameHistoryItem[]> {
    return client.get(`/api/auth/history?limit=${limit}&offset=${offset}`, { Authorization: `Bearer ${token}` });
}

export function registerUser(email: string, password: string): Promise<{ message: string }> {
    return client.post('/api/auth/register', { email, password });
}
