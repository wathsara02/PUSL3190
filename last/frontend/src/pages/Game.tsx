import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameState } from '../hooks/useGameState';
import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { playCardFlip, playWin, playLoss } from '../lib/sounds';
import ModernBackground from '../components/ModernBackground';
import PlayerAvatar from '../components/PlayerAvatar';
import { ArrowLeft, Crown, Flag, HelpCircle } from 'lucide-react';
import type { HandResult } from '../types/game';

const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Helpers mapping to rule engine definitions
const getSuitColor = (suit: string) => (suit === 'H' || suit === 'D' ? 'text-red-600' : 'text-green-950');
const getSuitSymbol = (suit: string) => ({ 'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠' }[suit]);

const getSuitName = (suit: string) => ({ C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[suit] ?? suit);
const getTeamLabel = (seatId: number) => (seatId % 2 === 0 ? 'Team A' : 'Team B');
const getTeamName = (team: number) => (team === 0 ? 'Team 1' : 'Team 2');
const getTeamColors = (seatId: number) => (
    seatId % 2 === 0
        ? { text: '#67e8f9', bg: 'rgba(34,211,238,0.12)', border: 'rgba(34,211,238,0.28)' }
        : { text: '#f9a8d4', bg: 'rgba(244,114,182,0.12)', border: 'rgba(244,114,182,0.28)' }
);

type ConnectionNotice = {
    id: number;
    kind: 'disconnect' | 'reconnect';
    message: string;
};

const indexToCard = (idx: number) => {
    const suitIdx = Math.floor(idx / RANKS.length);
    const rankIdx = idx % RANKS.length;
    return { suit: SUITS[suitIdx], rank: RANKS[rankIdx] };
};

export default function Game() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const token = localStorage.getItem(`token_${roomId}`);

    const { sendAction } = useGameState(roomId!, token);
    const { state, error, reconnecting } = useGameStore();

    useEffect(() => {
        if (roomId && token) {
            localStorage.setItem('last_room_id', roomId.toUpperCase());
        }
    }, [roomId, token]);

    const [connectionNotice, setConnectionNotice] = useState<ConnectionNotice | null>(null);
    const previousSeatStatusRef = useRef<Record<number, { isDisconnected: boolean; type: string; displayName: string | null }> | null>(null);
    const connectionNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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


    const soundPlayedRef = useRef(false);
    // Reset sound guard when a new match starts so sound plays again
    useEffect(() => {
        if (state?.phase === 'playing') soundPlayedRef.current = false;
    }, [state?.phase]);
    // Play Win/Loss sounds — guarded so it fires only once per finished game
    useEffect(() => {
        if (!state || state.phase !== 'finished' || soundPlayedRef.current) return;
        // Clear saved room token so home page doesn't show a stale "Continue" button
        if (roomId) {
            localStorage.removeItem(`token_${roomId}`);
            if (localStorage.getItem('last_room_id') === roomId) {
                localStorage.removeItem('last_room_id');
            }
        }
        const mySeat = state.viewer_seat_id !== null ? state.seats[state.viewer_seat_id] : null;
        if (mySeat && state.winner_team !== null) {
            soundPlayedRef.current = true;
            const myTeam = mySeat.seat_id % 2;
            if (state.winner_team === myTeam) playWin();
            else playLoss();
        }
    }, [state]);

    useEffect(() => {
        if (state && state.phase === 'lobby') {
            navigate(`/room/${roomId}`);
        }
    }, [state, navigate, roomId]);

    const [frozenTrick, setFrozenTrick] = useState<Array<[number, number]> | null>(null);
    const [frozenWinner, setFrozenWinner] = useState<number | null>(null);
    const [collectingTrick, setCollectingTrick] = useState(false);
    const [showTrickWinnerBanner, setShowTrickWinnerBanner] = useState(false);
    const lastCompletedTrickRef = useRef<string | null>(null);
    const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const collectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [roundIntroSuit, setRoundIntroSuit] = useState<string | null>(null);
    const roundIntroKeyRef = useRef<string | null>(null);
    const roundIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [handResultIntro, setHandResultIntro] = useState<HandResult | null>(null);
    const [showDealIntro, setShowDealIntro] = useState(false);
    const [handResultPending, setHandResultPending] = useState(false);
    const TURN_TIME_LIMIT = 15;
    const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);
    const turnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const handResultKeyRef = useRef<string | null>(null);
    const handResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handResultClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dealIntroClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!state?.completed_trick || state.completed_trick.length !== 4 || state.trick_winner_display === null || state.trick_winner_display === undefined) {
            return;
        }

        const trickKey = `${state.trick_number}:${state.trick_winner_display}:${state.completed_trick.map(([pid, cardIdx]) => `${pid}-${cardIdx}`).join('|')}`;
        if (lastCompletedTrickRef.current === trickKey) return;
        lastCompletedTrickRef.current = trickKey;

        setFrozenTrick([...state.completed_trick]);
        setFrozenWinner(state.trick_winner_display);
        setCollectingTrick(false);
        setShowTrickWinnerBanner(false);

        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

        bannerTimerRef.current = setTimeout(() => {
            setShowTrickWinnerBanner(true);
        }, 850);
        collectTimerRef.current = setTimeout(() => {
            setCollectingTrick(true);
        }, 1700);
        clearTimerRef.current = setTimeout(() => {
            setFrozenTrick(null);
            setFrozenWinner(null);
            setCollectingTrick(false);
            setShowTrickWinnerBanner(false);
            bannerTimerRef.current = null;
            collectTimerRef.current = null;
            clearTimerRef.current = null;
        }, 3100);
    }, [state]);

    useEffect(() => {
        return () => {
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
            if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
            if (handResultTimerRef.current) clearTimeout(handResultTimerRef.current);
            if (handResultClearTimerRef.current) clearTimeout(handResultClearTimerRef.current);
            if (dealIntroClearTimerRef.current) clearTimeout(dealIntroClearTimerRef.current);
            if (connectionNoticeTimerRef.current) clearTimeout(connectionNoticeTimerRef.current);
            if (turnIntervalRef.current) clearInterval(turnIntervalRef.current);
        };
    }, []);

    // Auto-play timer: starts when it's the viewer's turn, auto-plays on expiry
    const isMyTurnNow = !!(
        state && state.room_id === roomId &&
        state.viewer_seat_id !== null &&
        state.viewer_seat_id === state.current_turn_player &&
        state.action_mask !== null &&
        state.phase === 'playing' &&
        !handResultIntro && !showDealIntro && !roundIntroSuit
    );

    useEffect(() => {
        if (turnIntervalRef.current) clearInterval(turnIntervalRef.current);
        if (!isMyTurnNow) { setTurnTimeLeft(null); return; }
        setTurnTimeLeft(TURN_TIME_LIMIT);
        turnIntervalRef.current = setInterval(() => {
            setTurnTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => { if (turnIntervalRef.current) clearInterval(turnIntervalRef.current); };
    }, [isMyTurnNow]);

    useEffect(() => {
        if (turnTimeLeft !== 0 || !state?.action_mask) return;
        const legal = state.action_mask.map((v: number, i: number) => v === 1 ? i : -1).filter((i: number) => i !== -1);
        if (legal.length > 0) sendAction(legal[Math.floor(Math.random() * legal.length)]);
    }, [turnTimeLeft, state?.action_mask, sendAction]);

    useEffect(() => {
        if (!state?.last_hand_result || state.phase === 'finished') {
            return;
        }

        const result = state.last_hand_result;
        const resultKey = `${result.hand_number}:${result.winner_team ?? 'tie'}:${result.tricks_won.join('-')}:${state.hand_number}`;
        if (handResultKeyRef.current === resultKey) return;
        handResultKeyRef.current = resultKey;

        if (handResultTimerRef.current) clearTimeout(handResultTimerRef.current);
        if (handResultClearTimerRef.current) clearTimeout(handResultClearTimerRef.current);
        if (dealIntroClearTimerRef.current) clearTimeout(dealIntroClearTimerRef.current);

        setHandResultIntro(null);
        setShowDealIntro(false);
        setHandResultPending(true);

        handResultTimerRef.current = setTimeout(() => {
            setHandResultIntro(result);
            handResultClearTimerRef.current = setTimeout(() => {
                setHandResultIntro(null);
                setShowDealIntro(true);
                dealIntroClearTimerRef.current = setTimeout(() => {
                    setShowDealIntro(false);
                    setHandResultPending(false);
                    dealIntroClearTimerRef.current = null;
                }, 1450);
            }, 1900);
        }, state.completed_trick ? 3000 : 250);
    }, [state]);

    useEffect(() => {
        if (
            !state?.trump_suit ||
            state.phase !== 'playing' ||
            state.trick_number !== 0 ||
            state.current_trick.length > 0 ||
            !state.hand_counts.every((count) => count === 8) ||
            handResultIntro ||
            showDealIntro
        ) {
            return;
        }

        const introKey = `${state.hand_number}:${state.trump_suit}`;
        if (roundIntroKeyRef.current === introKey) return;
        roundIntroKeyRef.current = introKey;
        setRoundIntroSuit(state.trump_suit);

        if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
        roundIntroTimerRef.current = setTimeout(() => {
            setRoundIntroSuit(null);
            roundIntroTimerRef.current = null;
        }, 2200);
    }, [state, handResultIntro, showDealIntro]);

    const handleLeaveUnavailableGame = () => {
        if (roomId) {
            localStorage.removeItem(`token_${roomId}`);
            if (localStorage.getItem('last_room_id') === roomId) {
                localStorage.removeItem('last_room_id');
            }
        }
        navigate('/');
    };

    if (!state || state.room_id !== roomId) {
        if (error) {
            return (
                <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-6" style={{ color: '#f0e8d0' }}>
                    <ModernBackground />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative z-10 flex flex-col items-center gap-5 text-center max-w-md rounded-3xl px-8 py-9"
                        style={{
                            background: 'rgba(6, 28, 12, 0.78)',
                            border: '1px solid rgba(248,113,113,0.28)',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
                            backdropFilter: 'blur(16px)',
                        }}
                    >
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: 'rgba(180,50,50,0.15)', border: '1px solid rgba(180,50,50,0.38)' }}>
                            <HelpCircle className="w-7 h-7" style={{ color: '#fca5a5' }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#f0e8d0' }}>
                                Could Not Reconnect
                            </h2>
                            <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,232,208,0.68)' }}>
                                {error}
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <button
                                onClick={() => window.location.reload()}
                                className="flex-1 px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all hover:-translate-y-0.5"
                                style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.24)' }}
                            >
                                Retry
                            </button>
                            <button
                                onClick={handleLeaveUnavailableGame}
                                className="flex-1 px-5 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all hover:-translate-y-0.5"
                                style={{ background: 'linear-gradient(135deg, #B8860B, #D4AF37)', color: '#0a1f0d' }}
                            >
                                Back Home
                            </button>
                        </div>
                    </motion.div>
                </div>
            );
        }

        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ color: '#f0e8d0' }}>
                <ModernBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 rounded-full" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                    <p className="font-medium tracking-widest uppercase text-sm animate-pulse" style={{ color: 'rgba(212,175,55,0.7)' }}>
                        {reconnecting ? 'Reconnecting...' : 'Loading Table...'}
                    </p>
                </div>
            </div>
        );
    }

    const { viewer_seat_id, current_turn_player, viewer_hand, action_mask, current_trick, phase, trump_suit } = state;
    const isMyTurn = viewer_seat_id === current_turn_player && action_mask !== null;
    const sortedViewerHand = viewer_hand
        ? [...viewer_hand].sort((a, b) => {
            const cardA = indexToCard(a);
            const cardB = indexToCard(b);
            const suitDiff = SUITS.indexOf(cardA.suit) - SUITS.indexOf(cardB.suit);
            if (suitDiff !== 0) return suitDiff;
            return RANKS.indexOf(cardB.rank) - RANKS.indexOf(cardA.rank);
        })
        : null;

    // Order seats to put viewer at bottom: bottom, left, top, right
    const reorderedSeats: number[] = [];
    if (viewer_seat_id !== null) {
        for (let i = 0; i < 4; i++) {
            reorderedSeats.push((viewer_seat_id + i) % 4);
        }
    } else {
        reorderedSeats.push(0, 1, 2, 3); // Spectator view
    }

    // getSeatInfo must be defined before any call site
    const getSeatInfo = (relativeIndex: number) => {
        const absoluteIndex = reorderedSeats[relativeIndex];
        return {
            seat: state.seats[absoluteIndex],
            absIndex: absoluteIndex,
            isTurn: current_turn_player === absoluteIndex,
            cardsLeft: state.hand_counts[absoluteIndex]
        };
    };

    const viewerInfo = getSeatInfo(0);
    const isRoundTransitionActive = Boolean(handResultIntro || showDealIntro);

    const handleCardClick = (cardIdx: number) => {
        if (roundIntroSuit || isRoundTransitionActive || !isMyTurn || !action_mask || action_mask[cardIdx] === 0) return;
        playCardFlip();
        sendAction(cardIdx);
    };

    const handleDeclareTrump = (suitIdx: number) => {
        const action = 32 + suitIdx;
        if (isRoundTransitionActive || !isMyTurn || !action_mask || action_mask[action] === 0) return;
        sendAction(action);
    };

    return (
        <div className="min-h-screen flex flex-col relative overflow-hidden select-none" style={{ color: '#f0e8d0', fontFamily: "'Lato', sans-serif" }}>
            <ModernBackground />

            {/* Header */}
            <header className="p-4 flex flex-col md:flex-row justify-between items-center z-10 gap-4" style={{ background: 'rgba(10,40,15,0.9)', borderBottom: '1px solid rgba(212,175,55,0.2)', backdropFilter: 'blur(12px)' }}>
                <div className="text-center md:text-left flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:-translate-x-0.5"
                        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}
                        title="Back to Home"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg text-xl" style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                        ♠
                    </div>
                    <div>
                        <h1 className="text-lg md:text-xl font-black tracking-tight leading-none" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>OMI</h1>
                        <p className="text-[10px] mt-1 uppercase tracking-widest font-semibold" style={{ color: 'rgba(212,175,55,0.5)' }}>ROOM: <span style={{ color: '#D4AF37' }}>{roomId}</span></p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {([
                        { label: 'Tricks', a: state.tricks_won[0], b: state.tricks_won[1] },
                        { label: 'Score',  a: state.scores[0],     b: state.scores[1]     },
                    ] as const).map(({ label, a, b }) => (
                        <div key={label} className="flex flex-col items-center px-5 py-2.5 rounded-xl gap-1.5"
                            style={{ background: 'rgba(10,40,15,0.7)', border: '1px solid rgba(212,175,55,0.2)' }}>
                            <span className="text-[8px] font-black uppercase tracking-[0.22em]" style={{ color: 'rgba(212,175,55,0.5)' }}>{label}</span>
                            <div className="flex items-center gap-2.5">
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#67e8f9', boxShadow: '0 0 5px #67e8f9' }} />
                                    <span className="text-2xl font-black font-mono leading-none" style={{ color: '#67e8f9' }}>{a}</span>
                                </div>
                                <span className="text-xs font-bold pb-1" style={{ color: 'rgba(212,175,55,0.3)' }}>—</span>
                                <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f9a8d4', boxShadow: '0 0 5px #f9a8d4' }} />
                                    <span className="text-2xl font-black font-mono leading-none" style={{ color: '#f9a8d4' }}>{b}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 items-center">
                    {trump_suit ? (
                        <div className="px-4 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl flex items-center gap-3 shadow-inner">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trump</p>
                            <div className={`w-7 h-7 rounded-lg bg-white flex items-center justify-center text-lg font-bold shadow-md ${getSuitColor(trump_suit)}`}>
                                {getSuitSymbol(trump_suit)}
                            </div>
                        </div>
                    ) : (
                        <div className="px-4 py-2 bg-slate-900/60 border border-slate-700/50 rounded-xl flex items-center gap-3 shadow-inner opacity-50">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trump</p>
                            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 text-sm">
                                <HelpCircle className="w-4 h-4" />
                            </div>
                        </div>
                    )}

                </div>
            </header>


            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -16, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, x: '-50%' }}
                    className="absolute top-24 left-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
                    style={{
                        background: 'linear-gradient(135deg, rgba(160,30,30,0.92), rgba(120,15,15,0.88))',
                        border: '1px solid rgba(220,80,80,0.4)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,120,120,0.1)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <span className="text-base">⚠️</span>
                    <span className="text-sm font-semibold" style={{ color: 'rgba(255,200,200,0.95)' }}>{error}</span>
                </motion.div>
            )}

            <AnimatePresence>
                {connectionNotice && (
                    <motion.div
                        key={connectionNotice.id}
                        initial={{ opacity: 0, x: 24, y: -8 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, x: 24, y: -8 }}
                        className="fixed top-24 right-5 z-[60] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl"
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

            <AnimatePresence>
                {handResultIntro && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm pointer-events-auto"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.76, y: 24, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.9, y: -12, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
                            className="relative overflow-hidden rounded-3xl px-8 py-7 md:px-12 md:py-9 text-center shadow-2xl max-w-md w-[min(92vw,28rem)]"
                            style={{
                                background: 'rgba(5, 34, 16, 0.94)',
                                border: '1px solid rgba(212,175,55,0.36)',
                                boxShadow: '0 28px 80px rgba(0,0,0,0.46), 0 0 45px rgba(212,175,55,0.18)',
                            }}
                        >
                            <motion.div
                                className="absolute inset-x-8 top-0 h-px"
                                style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.9), transparent)' }}
                                animate={{ opacity: [0.35, 1, 0.35] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                            />
                            {handResultIntro.was_tie || handResultIntro.winner_team === null ? (
                                <>
                                    <Flag className="w-12 h-12 mx-auto mb-4" style={{ color: '#D4AF37' }} />
                                    <p className="text-[10px] uppercase tracking-[0.28em] font-black mb-2" style={{ color: 'rgba(212,175,55,0.72)' }}>Hand Complete</p>
                                    <h2 className="text-3xl md:text-4xl font-black mb-5" style={{ color: '#f0e8d0', fontFamily: "'Playfair Display', serif" }}>Drawn</h2>
                                </>
                            ) : (
                                <>
                                    <Crown className="w-12 h-12 mx-auto mb-4" style={{ color: getTeamColors(handResultIntro.winner_team).text }} />
                                    <p className="text-[10px] uppercase tracking-[0.28em] font-black mb-2" style={{ color: 'rgba(212,175,55,0.72)' }}>Hand Winner</p>
                                    <h2 className="text-3xl md:text-4xl font-black mb-5" style={{ color: getTeamColors(handResultIntro.winner_team).text, fontFamily: "'Playfair Display', serif" }}>
                                        {getTeamName(handResultIntro.winner_team)} Wins
                                    </h2>
                                </>
                            )}

                            <div className="flex items-center justify-center gap-5 mb-5">
                                <div className="text-center">
                                    <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: '#67e8f9', boxShadow: '0 0 8px #67e8f9' }} />
                                    <p className="text-4xl font-black font-mono leading-none" style={{ color: '#67e8f9' }}>{handResultIntro.tricks_won[0]}</p>
                                </div>
                                <span className="text-xl font-black" style={{ color: 'rgba(212,175,55,0.36)' }}>-</span>
                                <div className="text-center">
                                    <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ background: '#f9a8d4', boxShadow: '0 0 8px #f9a8d4' }} />
                                    <p className="text-4xl font-black font-mono leading-none" style={{ color: '#f9a8d4' }}>{handResultIntro.tricks_won[1]}</p>
                                </div>
                            </div>

                            {handResultIntro.scoring_team !== null && handResultIntro.points_awarded > 0 && (
                                <p className="text-sm font-bold uppercase tracking-wider" style={{ color: 'rgba(240,232,208,0.86)' }}>
                                    {getTeamName(handResultIntro.scoring_team)} +{handResultIntro.points_awarded}
                                </p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDealIntro && (
                    <motion.div
                        className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-slate-950/25 backdrop-blur-[2px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative z-20 px-7 py-4 rounded-2xl text-center shadow-2xl"
                            style={{
                                background: 'rgba(5, 34, 16, 0.9)',
                                border: '1px solid rgba(212,175,55,0.34)',
                                boxShadow: '0 22px 60px rgba(0,0,0,0.35), 0 0 35px rgba(212,175,55,0.16)',
                            }}
                        >
                            <p className="text-[10px] uppercase tracking-[0.28em] font-black mb-1" style={{ color: 'rgba(212,175,55,0.72)' }}>Next Hand</p>
                            <p className="text-2xl font-black" style={{ color: '#f0e8d0', fontFamily: "'Playfair Display', serif" }}>Dealing Cards</p>
                        </motion.div>

                        {Array.from({ length: 16 }).map((_, i) => {
                            const seat = i % 4;
                            const lane = Math.floor(i / 4);
                            const target =
                                seat === 0 ? { x: (lane - 1.5) * 42, y: 285, rotate: (lane - 1.5) * 4 } :
                                    seat === 1 ? { x: 360, y: (lane - 1.5) * 36, rotate: 18 } :
                                        seat === 2 ? { x: (lane - 1.5) * 42, y: -245, rotate: (lane - 1.5) * -4 } :
                                            { x: -360, y: (lane - 1.5) * 36, rotate: -18 };

                            return (
                                <motion.div
                                    key={`deal-${i}`}
                                    className="absolute left-1/2 top-1/2 w-11 h-16 md:w-14 md:h-20 rounded-lg"
                                    style={{
                                        marginLeft: -22,
                                        marginTop: -32,
                                        background: 'linear-gradient(135deg, #123f21, #071d10)',
                                        border: '1px solid rgba(212,175,55,0.55)',
                                        boxShadow: '0 12px 22px rgba(0,0,0,0.28)',
                                    }}
                                    initial={{ x: 0, y: 0, rotate: 0, scale: 0.58, opacity: 0 }}
                                    animate={{ x: target.x, y: target.y, rotate: target.rotate, scale: 1, opacity: [0, 1, 1, 0] }}
                                    transition={{ delay: 0.08 + i * 0.035, duration: 1.05, ease: 'easeOut' }}
                                />
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {roundIntroSuit && (
                    <motion.div
                        className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.82, y: 16, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.92, y: -12, opacity: 0 }}
                            transition={{ duration: 0.28 }}
                            className="relative z-20 px-8 py-5 rounded-2xl text-center shadow-2xl"
                            style={{
                                background: 'rgba(5, 34, 16, 0.9)',
                                border: '1px solid rgba(212,175,55,0.35)',
                                boxShadow: '0 22px 60px rgba(0,0,0,0.35), 0 0 35px rgba(212,175,55,0.18)',
                            }}
                        >
                            <div className={`mx-auto mb-2 w-14 h-14 rounded-xl bg-white flex items-center justify-center text-4xl font-bold ${getSuitColor(roundIntroSuit)}`}>
                                {getSuitSymbol(roundIntroSuit)}
                            </div>
                            <p className="text-[10px] uppercase tracking-[0.28em] font-bold mb-1" style={{ color: 'rgba(212,175,55,0.7)' }}>Trump Suit</p>
                            <p className="text-2xl font-black" style={{ color: '#f0e8d0', fontFamily: "'Playfair Display', serif" }}>{getSuitName(roundIntroSuit)}</p>
                        </motion.div>

                        {Array.from({ length: 16 }).map((_, i) => {
                            const seat = i % 4;
                            const lane = Math.floor(i / 4);
                            const target =
                                seat === 0 ? { x: (lane - 1.5) * 42, y: 285, rotate: (lane - 1.5) * 4 } :
                                    seat === 1 ? { x: 360, y: (lane - 1.5) * 36, rotate: 18 } :
                                        seat === 2 ? { x: (lane - 1.5) * 42, y: -245, rotate: (lane - 1.5) * -4 } :
                                            { x: -360, y: (lane - 1.5) * 36, rotate: -18 };

                            return (
                                <motion.div
                                    key={i}
                                    className="absolute left-1/2 top-1/2 w-11 h-16 md:w-14 md:h-20 rounded-lg"
                                    style={{
                                        marginLeft: -22,
                                        marginTop: -32,
                                        background: 'linear-gradient(135deg, #123f21, #071d10)',
                                        border: '1px solid rgba(212,175,55,0.55)',
                                        boxShadow: '0 12px 22px rgba(0,0,0,0.28)',
                                    }}
                                    initial={{ x: 0, y: 0, rotate: 0, scale: 0.6, opacity: 0 }}
                                    animate={{ x: target.x, y: target.y, rotate: target.rotate, scale: 1, opacity: [0, 1, 1, 0] }}
                                    transition={{ delay: 0.18 + i * 0.035, duration: 1.15, ease: 'easeOut' }}
                                />
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Phase Overlays */}
            {phase === 'declare_trump' && isMyTurn && !isRoundTransitionActive && (
                <div className="absolute inset-x-0 top-24 bottom-48 md:bottom-56 z-40 flex flex-col items-center justify-center p-4 pointer-events-none">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="glass-panel p-8 md:p-10 rounded-3xl max-w-lg w-full text-center relative overflow-hidden pointer-events-auto"
                        style={{
                            background: 'rgba(4, 45, 20, 0.92)',
                            border: '1px solid rgba(84, 211, 150, 0.18)',
                            boxShadow: '0 24px 70px rgba(0, 0, 0, 0.35)',
                        }}
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 to-orange-500" />

                        <Crown className="w-12 h-12 text-yellow-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                        <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 mb-2 tracking-tight">Declare Trump</h2>
                        <p className="text-slate-400 text-sm mb-8 font-medium">Choose a suit based on the 4 cards in your hand.</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {SUITS.map((suit, idx) => {
                                const actionIdx = 32 + idx;
                                const isValid = action_mask && action_mask[actionIdx] === 1;
                                return (
                                    <button
                                        key={suit}
                                        onClick={() => handleDeclareTrump(idx)}
                                        disabled={!isValid}
                                        className={`h-24 rounded-2xl bg-white transition-all transform flex flex-col items-center justify-center shadow-lg
                                         ${isValid ? 'hover:scale-105 hover:-translate-y-1 cursor-pointer border-2 border-transparent hover:border-cyan-400 hover:shadow-cyan-500/30' : 'opacity-30 cursor-not-allowed grayscale border border-slate-200'}
                                     `}
                                    >
                                        <span className={`text-4xl ${getSuitColor(suit)} drop-shadow-sm`}>{getSuitSymbol(suit)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>
            )}

            {phase === 'finished' && (
                <div className="absolute inset-0 z-40 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                        className="text-center p-10 md:p-14 glass-panel rounded-3xl relative overflow-hidden max-w-xl w-full"
                    >
                        {state.winner_team === 0 || state.winner_team === 1 ? (
                            <div className="absolute -top-24 -left-24 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-[60px]" />
                        ) : null}

                        <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">Game Over</h2>

                        <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 px-8 mb-10 inline-block shadow-inner">
                            <p className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-1">Final Score</p>
                            <p className="text-3xl font-mono font-bold text-white"><span className="text-cyan-400">{state.scores[0]}</span> <span className="text-slate-600 mx-2">-</span> <span className="text-fuchsia-400">{state.scores[1]}</span></p>
                        </div>

                        <div className="text-2xl md:text-3xl font-bold mb-12">
                            {state.winner_team === 0 ? <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">Team 1 Wins!</span> :
                                state.winner_team === 1 ? <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-500 drop-shadow-[0_0_15px_rgba(232,121,249,0.4)]">Team 2 Wins!</span> :
                                    <span className="text-slate-300">It's a Tie!</span>}
                        </div>

                        <button
                            onClick={() => navigate('/')}
                            className="bg-white text-slate-900 hover:bg-slate-200 font-bold text-base py-4 px-10 rounded-full shadow-xl transition-all hover:scale-105"
                        >
                            Return to Lobby
                        </button>
                    </motion.div>
                </div>
            )}

            {/* Game Layout */}
            <div className="flex-1 relative flex items-center justify-center p-4 md:p-8 overflow-hidden z-0">

                {/* Table central area - Green Felt */}
                <div className="absolute inset-x-4 top-32 bottom-48 md:inset-x-24 md:top-32 md:bottom-56 rounded-[3rem] flex items-center justify-center" style={{ background: 'radial-gradient(ellipse, #1a5c26 0%, #0f3d18 60%, #0a2a10 100%)', border: '8px solid #3d2200', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5), 0 20px 40px rgba(0,0,0,0.6), 0 0 0 4px rgba(212,175,55,0.2)' }}>

                    {/* Inner circle with felt pattern */}
                    <div className="w-64 h-64 md:w-80 md:h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)', border: '2px solid rgba(212,175,55,0.15)' }}></div>

                    {/* Current Trick Cards */}
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                        {frozenWinner !== null && frozenTrick && showTrickWinnerBanner && (
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                                animate={{ scale: collectingTrick ? 0.96 : 1, opacity: 1, y: collectingTrick ? -6 : 0 }}
                                className="absolute z-20 bg-gradient-to-r from-emerald-500/90 to-teal-600/90 backdrop-blur-md border border-emerald-400/50 px-6 py-2.5 rounded-full text-white font-bold text-sm shadow-[0_10px_25px_rgba(16,185,129,0.3)] text-center flex items-center gap-2"
                            >
                                <Flag className="w-4 h-4" /> {state.seats[frozenWinner]?.display_name} won the trick
                            </motion.div>
                        )}
                        <AnimatePresence>
                            {(frozenTrick ?? current_trick).map(([pid, cardIdx], i) => {
                                const card = indexToCard(cardIdx);
                                const relIdx = reorderedSeats.indexOf(pid);

                                let translate = { x: 0, y: 0, rotate: 0 };
                                if (relIdx === 0) translate = { y: 65, x: 0, rotate: 0 }; // bottom
                                if (relIdx === 1) translate = { x: 65, y: 0, rotate: 15 }; // right
                                if (relIdx === 2) translate = { y: -65, x: 0, rotate: 0 }; // top
                                if (relIdx === 3) translate = { x: -65, y: 0, rotate: -15 }; // left

                                const winnerRelIdx = frozenWinner !== null ? reorderedSeats.indexOf(frozenWinner) : -1;
                                let collectTarget = translate;
                                if (winnerRelIdx === 0) collectTarget = { x: 0, y: 155, rotate: 0 };
                                if (winnerRelIdx === 1) collectTarget = { x: 175, y: 0, rotate: 18 };
                                if (winnerRelIdx === 2) collectTarget = { x: 0, y: -155, rotate: 0 };
                                if (winnerRelIdx === 3) collectTarget = { x: -175, y: 0, rotate: -18 };
                                const collectToWinner = frozenTrick !== null && collectingTrick && frozenWinner !== null;

                                return (
                                    <motion.div
                                        key={`trick-${pid}-${cardIdx}`}
                                        layout
                                        initial={{ scale: 0, opacity: 0, x: translate.x * 2, y: translate.y * 2, rotate: translate.rotate }}
                                        animate={{
                                            scale: collectToWinner ? 0.58 : 1,
                                            opacity: collectToWinner ? 0.35 : 1,
                                            x: collectToWinner ? collectTarget.x : translate.x,
                                            y: collectToWinner ? collectTarget.y : translate.y,
                                            rotate: collectToWinner ? collectTarget.rotate : translate.rotate,
                                        }}
                                        transition={{ type: 'spring', stiffness: collectToWinner ? 130 : 260, damping: collectToWinner ? 22 : 20 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        className="absolute bg-white rounded-xl border border-slate-200 shadow-xl w-20 h-28 md:w-24 md:h-36 flex flex-col justify-between p-2"
                                        style={{ zIndex: 10 + i }}
                                    >
                                        <div className={`text-sm md:text-lg font-bold leading-none ${getSuitColor(card.suit)}`}>
                                            {card.rank}<br />{getSuitSymbol(card.suit)}
                                        </div>
                                        <div className={`text-4xl md:text-5xl self-center ${getSuitColor(card.suit)} opacity-20`}>
                                            {getSuitSymbol(card.suit)}
                                        </div>
                                        <div className={`text-sm md:text-lg font-bold leading-none rotate-180 self-end ${getSuitColor(card.suit)}`}>
                                            {card.rank}<br />{getSuitSymbol(card.suit)}
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Players (Top, Left, Right) */}
                {[2, 1, 3].map(relIndex => {
                    const info = getSeatInfo(relIndex);
                    if (!info.seat) return null;

                    let positionClasses = '';
                    if (relIndex === 2) positionClasses = 'top-6 left-1/2 -translate-x-1/2 flex-col'; // Top
                    if (relIndex === 1) positionClasses = 'right-6 top-1/2 -translate-y-1/2 flex-col'; // Right (next player, anti-clockwise)
                    if (relIndex === 3) positionClasses = 'left-6 top-1/2 -translate-y-1/2 flex-col'; // Left

                    const isTrickWinner = state.trick_winner_display === info.absIndex;
                    const teamColors = getTeamColors(info.absIndex);

                    return (
                        <div key={relIndex} className={`absolute ${positionClasses} flex items-center gap-4 z-20 scale-75 md:scale-90 lg:scale-100 origin-center`}>
                            <motion.div
                                animate={info.isTurn ? { scale: 1.05 } : { scale: 1 }}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    backdropFilter: 'blur(8px)',
                                    border: info.isTurn ? '1px solid rgba(212,175,55,0.6)' : isTrickWinner ? '1px solid rgba(100,200,100,0.5)' : '1px solid rgba(212,175,55,0.15)',
                                    background: info.isTurn ? 'rgba(212,175,55,0.15)' : isTrickWinner ? 'rgba(40,120,50,0.3)' : 'rgba(10,40,15,0.7)',
                                    color: info.isTurn ? '#D4AF37' : isTrickWinner ? '#90ee90' : 'rgba(240,232,208,0.8)',
                                    boxShadow: info.isTurn ? '0 0 30px rgba(212,175,55,0.2)' : 'none',
                                    transition: 'all 0.3s',
                                }}
                            >
                                <PlayerAvatar
                                    avatarId={info.seat.avatar_id}
                                    isBot={info.seat.type === 'bot'}
                                    size="sm"
                                    isActive={info.isTurn}
                                />
                                <p className="font-bold text-center tracking-wide text-xs uppercase truncate max-w-[100px] mt-1 mb-1">{info.seat.display_name}</p>
                                <div
                                    className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full mb-2"
                                    style={{ color: teamColors.text, background: teamColors.bg, border: `1px solid ${teamColors.border}` }}
                                >
                                    {getTeamLabel(info.absIndex)}
                                </div>
                                {info.seat.is_disconnected && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full mb-1.5"
                                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}>
                                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#f87171' }} />
                                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#f87171' }}>Disconnected</span>
                                    </div>
                                )}
                                {isTrickWinner && (
                                    <div className="absolute -bottom-3 text-[9px] text-emerald-100 font-bold bg-emerald-500 px-2 py-0.5 rounded-full whitespace-nowrap z-50 uppercase tracking-wider shadow-md">
                                        Trick Winner
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    )
                })}

                {/* Viewer (Bottom) */}
                <div className="fixed bottom-4 md:bottom-8 left-0 right-0 w-full flex flex-col items-center gap-4 z-50 pointer-events-auto">
                    {/* Viewer Info */}
                    <div className="px-6 py-2.5 rounded-full pointer-events-auto transition-all" style={{
                        backdropFilter: 'blur(8px)',
                        background: viewerInfo.isTurn && phase === 'playing' ? 'rgba(212,175,55,0.2)' : state.trick_winner_display === viewerInfo.absIndex ? 'rgba(40,120,50,0.3)' : 'rgba(10,40,15,0.8)',
                        border: viewerInfo.isTurn && phase === 'playing' ? '1px solid rgba(212,175,55,0.5)' : state.trick_winner_display === viewerInfo.absIndex ? '1px solid rgba(100,200,100,0.4)' : '1px solid rgba(212,175,55,0.2)',
                    }}>
                        <p className="font-semibold tracking-wide text-sm flex items-center gap-3 flex-wrap justify-center" style={{ color: '#f0e8d0' }}>
                            <span className="flex items-center gap-2">
                                <PlayerAvatar avatarId={viewerInfo.seat.avatar_id} isBot={false} size="sm" isActive={viewerInfo.isTurn} />
                                <span>{viewerInfo.seat.display_name}</span>
                            </span>
                            <span
                                className="font-bold text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
                                style={{
                                    color: getTeamColors(viewerInfo.absIndex).text,
                                    background: getTeamColors(viewerInfo.absIndex).bg,
                                    border: `1px solid ${getTeamColors(viewerInfo.absIndex).border}`,
                                }}
                            >
                                {getTeamLabel(viewerInfo.absIndex)}
                            </span>
                            {viewerInfo.isTurn && phase === 'playing' && (
                                <span className="font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1.5" style={{ color: '#D4AF37', background: 'rgba(212,175,55,0.12)' }}>
                                    Your Turn
                                    {turnTimeLeft !== null && (
                                        <span className="font-mono font-black text-sm tabular-nums" style={{ color: turnTimeLeft <= 5 ? '#f87171' : '#D4AF37' }}>
                                            {turnTimeLeft}s
                                        </span>
                                    )}
                                </span>
                            )}
                            {state.trick_winner_display === viewerInfo.absIndex && (
                                <span className="font-bold text-xs uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ color: '#90ee90', background: 'rgba(40,120,50,0.2)' }}>Won Trick</span>
                            )}
                        </p>
                    </div>

                    {/* Hand */}
                    <div className="flex justify-center transition-all h-28 md:h-36 items-end pointer-events-auto" style={{ perspective: '1000px' }}>
                        <AnimatePresence>
                            {sortedViewerHand && !handResultPending && sortedViewerHand.map((cardIdx, i) => {
                                const card = indexToCard(cardIdx);
                                const isValid = action_mask && action_mask[cardIdx] === 1;
                                const isTrumpPhase = phase === 'declare_trump';

                                // Calculate an arc effect for the hand
                                const totalCards = sortedViewerHand.length;
                                const midIndex = (totalCards - 1) / 2;
                                const distanceFromMid = i - midIndex;
                                const rotation = (isTrumpPhase && totalCards <= 4) ? distanceFromMid * 1.5 : distanceFromMid * 3;
                                const yOffset = (isTrumpPhase && totalCards <= 4) ? Math.abs(distanceFromMid) * 1 : Math.abs(distanceFromMid) * 2;
                                const overlapOffset = totalCards <= 4 && isTrumpPhase ? '-0.75rem' : '-2rem';

                                const isTrump = trump_suit !== null && card.suit === trump_suit;
                                const baseY = isValid && isMyTurn ? -20 : yOffset;

                                return (
                                    <motion.div
                                        key={cardIdx}
                                        layout
                                        initial={{ y: 130, opacity: 0, scale: 0.82 }}
                                        animate={{
                                            y: baseY,
                                            rotate: rotation,
                                            opacity: 1,
                                            scale: 1,
                                        }}
                                        exit={{ y: 130, opacity: 0, scale: 0.75, transition: { duration: 0.22 } }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 260,
                                            damping: 22,
                                            delay: i * 0.045,
                                        }}
                                        whileHover={
                                            isValid && isMyTurn
                                                ? { y: baseY - 22, scale: 1.07, transition: { type: 'spring', stiffness: 380, damping: 22 } }
                                                : isMyTurn
                                                    ? undefined
                                                    : { y: baseY - 10, scale: 1.04, transition: { type: 'spring', stiffness: 340, damping: 20 } }
                                        }
                                        whileTap={
                                            isValid && isMyTurn
                                                ? { scale: 0.93, y: baseY - 8, transition: { type: 'spring', stiffness: 400, damping: 18 } }
                                                : undefined
                                        }
                                        onClick={() => handleCardClick(cardIdx)}
                                        className="relative w-16 h-28 md:w-24 md:h-36 rounded-xl flex flex-col justify-between p-2 origin-bottom"
                                        style={{
                                            background: 'linear-gradient(135deg, #fffef8 0%, #f5f0e0 100%)',
                                            border: isValid && isMyTurn
                                                ? '2px solid #D4AF37'
                                                : isTrump
                                                    ? '1.5px solid rgba(220,60,60,0.55)'
                                                    : '1px solid #d4c8a8',
                                            boxShadow: isValid && isMyTurn
                                                ? '0 -10px 30px rgba(212,175,55,0.5), 0 4px 16px rgba(0,0,0,0.3)'
                                                : isTrump
                                                    ? '0 4px 14px rgba(0,0,0,0.3), 0 0 10px rgba(220,60,60,0.18)'
                                                    : '0 4px 12px rgba(0,0,0,0.3)',
                                            opacity: !isValid && isMyTurn && !isTrumpPhase ? 0.42 : 1,
                                            cursor: !isValid && isMyTurn && !isTrumpPhase ? 'not-allowed' : 'pointer',
                                            marginLeft: i === 0 ? 0 : overlapOffset,
                                            zIndex: isValid && isMyTurn ? 50 + i : i,
                                        }}
                                    >
                                        <div className={`text-sm md:text-lg font-bold leading-none ${getSuitColor(card.suit)}`}>
                                            {card.rank}<br />{getSuitSymbol(card.suit)}
                                        </div>
                                        {isTrump && (
                                            <motion.div
                                                className="absolute inset-0 rounded-xl pointer-events-none"
                                                animate={{ opacity: [0, 0.18, 0] }}
                                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                                style={{ background: 'radial-gradient(circle at 50% 50%, rgba(220,60,60,0.45), transparent 70%)' }}
                                            />
                                        )}
                                        <div className={`text-sm md:text-lg font-bold leading-none rotate-180 self-end ${getSuitColor(card.suit)}`}>
                                            {card.rank}<br />{getSuitSymbol(card.suit)}
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                </div>

            </div>

            {/* Reconnecting overlay — shows on transient disconnect while preserving game UI */}
            <AnimatePresence>
                {reconnecting && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none"
                    >
                        <div className="flex flex-col items-center gap-3 px-8 py-5 rounded-2xl"
                            style={{ background: 'rgba(10,40,15,0.9)', border: '1px solid rgba(212,175,55,0.3)' }}>
                            <div className="w-10 h-10 border-4 rounded-full" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                            <p className="text-sm font-semibold uppercase tracking-widest animate-pulse" style={{ color: 'rgba(212,175,55,0.8)' }}>Reconnecting…</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
