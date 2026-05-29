import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';

export interface GameStateActions {
    sendAction: (action: number) => void;
    wsRef: React.MutableRefObject<WebSocket | null>;
}

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];

export function useGameState(roomId: string, token: string | null): GameStateActions {
    const { setState, setError, setConnected, setReconnecting, reset } = useGameStore.getState();

    const ws = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unmounted = useRef(false);

    const connect = useCallback(() => {
        if (!roomId || unmounted.current) return;

        const backendUrl = new URL(import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000');
        backendUrl.protocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        backendUrl.pathname = `/ws/${roomId}`;
        backendUrl.search = '';

        ws.current?.close(1000);
        ws.current = new WebSocket(backendUrl.toString());

        // Capture instance so stale handlers from old connections don't interfere
        const thisWs = ws.current;

        thisWs.onopen = () => {
            if (unmounted.current || thisWs !== ws.current) return;
            thisWs.send(JSON.stringify({ type: 'auth', token: token ?? null }));
            setConnected(true);
            setReconnecting(false);
            setError(null);
            reconnectAttempts.current = 0;
        };

        thisWs.addEventListener('message', (event: MessageEvent) => {
            if (unmounted.current || thisWs !== ws.current) return;
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'snapshot') setState(msg.payload);
                else if (msg.type === 'error') setError(msg.message);
            } catch (e) {
                console.error('Failed to parse WS message', e);
            }
        });

        thisWs.onclose = (event) => {
            if (unmounted.current) return;
            // Ignore close events from old connections (we already moved on)
            if (thisWs !== ws.current) return;

            setConnected(false);

            // Terminal errors — don't reconnect
            if (event.code === 4004) {
                localStorage.removeItem(`token_${roomId}`);
                if (localStorage.getItem('last_room_id') === roomId) {
                    localStorage.removeItem('last_room_id');
                }
                setError('Room not found. It may have expired or the code is wrong.');
                setReconnecting(false);
                return;
            }
            if (event.code === 4001) {
                localStorage.removeItem(`token_${roomId}`);
                if (localStorage.getItem('last_room_id') === roomId) {
                    localStorage.removeItem('last_room_id');
                }
                setError('Could not join — your session may have expired. Try rejoining.');
                setReconnecting(false);
                return;
            }

            // All other close codes (including server-side 1000 from Railway proxy) — reconnect
            const attempt = reconnectAttempts.current;
            if (attempt >= RECONNECT_DELAYS.length) {
                setError('Connection lost. Please refresh the page.');
                setReconnecting(false);
                return;
            }

            setReconnecting(true);
            reconnectAttempts.current++;
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAYS[attempt]);
        };

        thisWs.onerror = () => {
            if (thisWs !== ws.current) return;
        };
    }, [roomId, token, setState, setError, setConnected, setReconnecting]);

    // Reset store before first paint so stale error/state never flashes
    useLayoutEffect(() => {
        reset();
    }, [roomId, reset]);

    useEffect(() => {
        unmounted.current = false;
        connect();
        return () => {
            unmounted.current = true;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            ws.current?.close(1000);
        };
    }, [connect]);

    const sendAction = useCallback((action: number) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'action', action }));
            setError(null);
        } else {
            setError('Not connected');
        }
    }, [setError]);

    return { sendAction, wsRef: ws };
}
