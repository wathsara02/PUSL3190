import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameState } from '../hooks/useGameState';
import { useGameStore } from '../store/gameStore';
import { configureRoom, startGame } from '../lib/api';
import { AnimatePresence, motion } from 'framer-motion';
import ModernBackground from '../components/ModernBackground';
import ErrorBanner from '../components/ErrorBanner';
import { ArrowLeft, Play, KeyRound, UserPlus } from 'lucide-react';
import PlayerAvatar from '../components/PlayerAvatar';

type ConnectionNotice = {
    id: number;
    kind: 'disconnect' | 'reconnect';
    message: string;
};

export default function Room() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem(`token_${roomId}`);
    useGameState(roomId!, token);
    const { state, error, connected } = useGameStore();

    useEffect(() => {
        if (roomId && token) {
            localStorage.setItem('last_room_id', roomId.toUpperCase());
        }
    }, [roomId, token]);
    const [configError, setConfigError] = useState('');
    const [connectionNotice, setConnectionNotice] = useState<ConnectionNotice | null>(null);
    const previousSeatStatusRef = useRef<Record<number, { isDisconnected: boolean; type: string; displayName: string | null }> | null>(null);
    const connectionNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (state && state.phase !== 'lobby' && state.phase !== 'finished') {
            navigate(`/game/${roomId}`);
        }
    }, [state, navigate, roomId]);

    useEffect(() => {
        if (!state || state.room_id !== roomId) return;

        const nextStatus = Object.fromEntries(
            state.seats.map((seat) => [
                seat.seat_id,
                {
                    isDisconnected: seat.is_disconnected,
                    type: seat.type,
                    displayName: seat.display_name,
                },
            ])
        );
        const previousStatus = previousSeatStatusRef.current;
        previousSeatStatusRef.current = nextStatus;

        if (!previousStatus) return;

        const changedSeat = state.seats.find((seat) => {
            const previous = previousStatus[seat.seat_id];
            if (!previous) return false;
            if (previous.isDisconnected !== seat.is_disconnected) return true;
            return state.phase !== 'lobby' && previous.type === 'bot' && seat.type === 'human';
        });
        if (!changedSeat) return;

        const reconnected = !changedSeat.is_disconnected;
        const playerName = changedSeat.display_name || `Player ${changedSeat.seat_id + 1}`;

        if (connectionNoticeTimerRef.current) clearTimeout(connectionNoticeTimerRef.current);
        setConnectionNotice({
            id: Date.now(),
            kind: reconnected ? 'reconnect' : 'disconnect',
            message: `${playerName} ${reconnected ? 'reconnected' : 'disconnected'}`,
        });
        connectionNoticeTimerRef.current = setTimeout(() => {
            setConnectionNotice(null);
            connectionNoticeTimerRef.current = null;
        }, 3200);
    }, [state, roomId]);

    useEffect(() => {
        return () => {
            if (connectionNoticeTimerRef.current) clearTimeout(connectionNoticeTimerRef.current);
        };
    }, []);

    if (!state || !connected || state.room_id !== roomId) {
        if (error) {
            return (
                <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-6" style={{ color: '#f0e8d0' }}>
                    <ModernBackground />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative z-10 flex flex-col items-center gap-6 text-center max-w-sm"
                    >
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                            style={{ background: 'rgba(180,50,50,0.15)', border: '1px solid rgba(180,50,50,0.35)' }}>
                            🃏
                        </div>
                        <div>
                            <h2 className="text-xl font-black mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#f0e8d0' }}>
                                Can't Enter Room
                            </h2>
                            <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,232,208,0.55)' }}>{error}</p>
                        </div>
                        <button
                            onClick={() => navigate('/play')}
                            className="px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all hover:-translate-y-0.5"
                            style={{
                                background: 'linear-gradient(135deg, #B8860B, #D4AF37)',
                                color: '#0a1f0d',
                                boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
                            }}
                        >
                            Back to Lobby
                        </button>
                    </motion.div>
                </div>
            );
        }
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ color: '#f0e8d0' }}>
                <ModernBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                    <p className="font-medium tracking-widest uppercase text-sm animate-pulse" style={{ color: 'rgba(212,175,55,0.7)' }}>Entering Room...</p>
                </div>
            </div>
        );
    }

    const isHost = state.is_host;

    const handleToggleBot = async (seatIndex: number, currentType: string) => {
        if (!isHost) return;
        try {
            setConfigError('');
            const newSeats = [...state.seats];
            if (currentType === 'bot') {
                newSeats[seatIndex] = { ...newSeats[seatIndex], type: 'open', bot_difficulty: null, display_name: null };
            } else {
                newSeats[seatIndex] = { ...newSeats[seatIndex], type: 'bot', bot_difficulty: 'easy', display_name: `Bot ${seatIndex + 1}` };
            }
            await configureRoom(roomId!, token!, newSeats);
        } catch (err: unknown) {
            setConfigError(err instanceof Error ? err.message : 'Failed to configure room');
        }
    };

    const handleStart = async () => {
        try {
            setConfigError('');
            await startGame(roomId!, token!);
        } catch (err: unknown) {
            setConfigError(err instanceof Error ? err.message : 'Failed to start game');
        }
    };

    return (
        <div className="min-h-screen p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />

            <AnimatePresence>
                {connectionNotice && (
                    <motion.div
                        key={connectionNotice.id}
                        initial={{ opacity: 0, x: 24, y: -8 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, x: 24, y: -8 }}
                        className="fixed top-8 right-5 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
                        style={{
                            background: connectionNotice.kind === 'reconnect'
                                ? 'rgba(6, 78, 59, 0.94)'
                                : 'rgba(127, 29, 29, 0.94)',
                            border: connectionNotice.kind === 'reconnect'
                                ? '1px solid rgba(52,211,153,0.42)'
                                : '1px solid rgba(248,113,113,0.42)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                                background: connectionNotice.kind === 'reconnect' ? '#34d399' : '#f87171',
                                boxShadow: connectionNotice.kind === 'reconnect' ? '0 0 10px #34d399' : '0 0 10px #f87171',
                            }}
                        />
                        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#f8fafc' }}>
                            {connectionNotice.message}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="relative z-10 max-w-5xl mx-auto pt-8 flex flex-col">
                <button
                    onClick={() => navigate('/play')}
                    className="flex items-center gap-2 uppercase tracking-wider text-sm font-semibold group mb-6 transition-colors self-start"
                    style={{ color: 'rgba(212,175,55,0.6)' }}
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
                </button>

                <div className="w-full flex flex-col md:flex-row justify-between items-center mb-10 gap-6 felt-panel p-6 rounded-2xl">
                    <h1 className="text-3xl font-black" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                        Waiting Room
                    </h1>
                    <div className="px-6 py-3 rounded-xl flex items-center gap-4" style={{ background: 'rgba(10,40,15,0.7)', border: '1px solid rgba(212,175,55,0.25)' }}>
                        <KeyRound className="w-5 h-5" style={{ color: '#D4AF37' }} />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(212,175,55,0.5)' }}>Room Code</span>
                            <span className="text-xl font-mono font-bold tracking-widest" style={{ color: '#D4AF37', fontFamily: "'Courier Prime', monospace" }}>{roomId}</span>
                        </div>
                    </div>
                </div>

                {(error || configError) && <ErrorBanner message={(error || configError)!} />}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mb-12">
                    {state.seats.map((seat, i) => {
                        const isHuman = seat.type === 'human';
                        const isBot = seat.type === 'bot';
                        const isOpen = seat.type === 'open';
                        return (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.1 }}
                                key={i}
                                className="felt-panel p-6 rounded-2xl flex flex-col justify-between items-start transition-all"
                                style={{ borderLeft: `4px solid ${isHuman ? '#D4AF37' : isBot ? '#D4AF37' : 'rgba(212,175,55,0.15)'}`, opacity: isOpen ? 0.7 : 1 }}
                            >
                                <div className="flex flex-col w-full mb-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                                            style={{ color: 'rgba(212,175,55,0.6)', background: 'rgba(212,175,55,0.08)' }}>
                                            Seat {i + 1}
                                        </span>
                                        {seat.is_viewer && (
                                            <span className="px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider"
                                                style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>You</span>
                                        )}
                                        {isBot && (
                                            <span className="px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider"
                                                style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>AI Bot</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {isOpen ? (
                                            <div className="w-14 h-14 rounded-full flex items-center justify-center"
                                                style={{ background: 'rgba(30,60,30,0.4)', color: 'rgba(212,175,55,0.3)' }}>
                                                <UserPlus className="w-7 h-7" />
                                            </div>
                                        ) : (
                                            <PlayerAvatar avatarId={seat.avatar_id} isBot={isBot} size="lg" showRing />
                                        )}
                                        <span className="text-xl font-bold tracking-wide truncate"
                                            style={{ color: isHuman ? '#f0e8d0' : isBot ? 'rgba(212,175,55,0.7)' : 'rgba(212,175,55,0.3)', fontStyle: isOpen ? 'italic' : 'normal' }}>
                                            {isOpen ? 'Waiting for player...' : seat.display_name}
                                        </span>
                                    </div>
                                </div>

                                {isHost && !isHuman && (
                                    <button onClick={() => handleToggleBot(i, seat.type)}
                                        className="mt-2 w-full py-3 px-4 font-semibold text-sm rounded-xl transition-all"
                                        style={{
                                            background: 'rgba(212,175,55,0.08)',
                                            color: '#D4AF37',
                                            border: '1px solid rgba(212,175,55,0.25)',
                                        }}>
                                        {isBot ? 'Remove Bot' : '+ Add Bot Player'}
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {isHost ? (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        className="w-full flex justify-center mt-4 mb-12">
                        <button onClick={handleStart}
                            disabled={state.seats.some(s => s.type === 'open')}
                            className="flex items-center gap-3 font-bold py-5 px-14 rounded-full text-xl tracking-wider uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-1"
                            style={{
                                background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)',
                                color: '#0a1f0d',
                                boxShadow: '0 4px 30px rgba(212,175,55,0.35)',
                                fontFamily: "'Playfair Display', serif",
                            }}>
                            <Play className="w-6 h-6 fill-current" /> Start Match
                        </button>
                    </motion.div>
                ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 flex justify-center">
                        <div className="felt-panel py-4 px-8 rounded-full flex items-center gap-4">
                            <div className="w-4 h-4 border-2 rounded-full" style={{ borderColor: 'rgba(212,175,55,0.3)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                            <span className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#D4AF37' }}>Waiting for Host...</span>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
