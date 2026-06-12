import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { getAvatar } from '../lib/avatars';
import { getRoom } from '../lib/api';
import ModernBackground from '../components/ModernBackground';
import type { User } from '@supabase/supabase-js';

const SUIT_COLOR = (s: string) => (s === 'H' || s === 'D' ? '#c0392b' : '#0a1f0d');
const SUIT_SYM   = (s: string) => ({ S: '♠', H: '♥', D: '♦', C: '♣' }[s] ?? s);

// Scattered background cards — fixed positions/rotations for a natural look
const BG_CARDS = [
    { rank: 'A',  suit: 'S', top: '8%',  left: '6%',  rotate: -28, scale: 1.0 },
    { rank: 'K',  suit: 'H', top: '5%',  left: '78%', rotate:  18, scale: 0.9 },
    { rank: '7',  suit: 'D', top: '68%', left: '4%',  rotate:  14, scale: 0.85 },
    { rank: 'J',  suit: 'C', top: '58%', left: '87%', rotate: -20, scale: 0.9 },
    { rank: 'Q',  suit: 'H', top: '80%', left: '14%', rotate:  38, scale: 0.8 },
    { rank: '9',  suit: 'S', top: '74%', left: '80%', rotate: -32, scale: 0.85 },
    { rank: '8',  suit: 'D', top: '14%', left: '70%', rotate:  22, scale: 0.75 },
    { rank: 'A',  suit: 'C', top: '18%', left: '22%', rotate: -12, scale: 0.8 },
    { rank: '10', suit: 'H', top: '3%',  left: '45%', rotate: -24, scale: 0.75 },
    { rank: 'K',  suit: 'S', top: '86%', left: '52%', rotate:  10, scale: 0.8 },
    { rank: 'J',  suit: 'H', top: '40%', left: '2%',  rotate: -40, scale: 0.7 },
    { rank: '9',  suit: 'D', top: '30%', left: '90%', rotate:  28, scale: 0.75 },
];

export default function Home() {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [resumeRoomId, setResumeRoomId] = useState<string | null>(null);
    const [resumeError, setResumeError] = useState('');
    const [checkingResume, setCheckingResume] = useState(false);

    const clearResumeRoom = (roomId: string) => {
        localStorage.removeItem(`token_${roomId}`);
        if (localStorage.getItem('last_room_id') === roomId) {
            localStorage.removeItem('last_room_id');
        }
        setResumeRoomId(null);
    };

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        const lastRoomId = localStorage.getItem('last_room_id');
        const candidateRoomId = (lastRoomId && localStorage.getItem(`token_${lastRoomId}`))
            ? lastRoomId
            : Object.keys(localStorage)
                .filter((key) => key.startsWith('token_'))
                .map((key) => key.replace(/^token_/, ''))
                .find(Boolean) ?? null;

        if (candidateRoomId) {
            const token = localStorage.getItem(`token_${candidateRoomId}`);
            if (token) {
                getRoom(candidateRoomId, token)
                    .then(() => setResumeRoomId(candidateRoomId))
                    .catch(() => {
                        localStorage.removeItem(`token_${candidateRoomId}`);
                        if (localStorage.getItem('last_room_id') === candidateRoomId) {
                            localStorage.removeItem('last_room_id');
                        }
                    });
            }
        }

        return () => subscription.unsubscribe();
    }, []);

    const avatarId = user?.user_metadata?.avatar_id;
    const av = getAvatar(avatarId);

    const handleContinueGame = async () => {
        if (!resumeRoomId) return;
        const savedToken = localStorage.getItem(`token_${resumeRoomId}`);
        if (!savedToken) {
            clearResumeRoom(resumeRoomId);
            setResumeError('Saved game session was not found.');
            return;
        }

        setCheckingResume(true);
        setResumeError('');
        try {
            const room = await getRoom(resumeRoomId, savedToken);
            navigate(room.phase === 'lobby' ? `/room/${resumeRoomId}` : `/game/${resumeRoomId}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            const isMissingRoom = /404|not found|401|403|expired/i.test(message);
            if (isMissingRoom) {
                clearResumeRoom(resumeRoomId);
                setResumeError('That saved room is no longer available.');
            } else {
                setResumeError('Could not reach the game server. Try again in a moment.');
            }
        } finally {
            setCheckingResume(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />

            {/* Scattered background cards */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                {BG_CARDS.map((card, i) => {
                    const duration = 18 + i * 2.5;
                    const direction = i % 2 === 0 ? 1 : -1;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: card.scale * 0.7 }}
                            animate={{ opacity: 0.13, scale: card.scale }}
                            transition={{ delay: i * 0.06, duration: 0.8, ease: 'easeOut' }}
                            className="absolute"
                            style={{ top: card.top, left: card.left }}
                        >
                            <motion.div
                                animate={{ rotate: [card.rotate, card.rotate + 360 * direction] }}
                                transition={{
                                    delay: i * 0.06 + 0.8,
                                    duration,
                                    ease: 'linear',
                                    repeat: Infinity,
                                }}
                                className="w-16 h-24 rounded-xl flex flex-col justify-between p-1.5"
                                style={{
                                    background: '#fff',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                }}
                            >
                                <div className="font-black text-xs leading-none" style={{ color: SUIT_COLOR(card.suit) }}>
                                    {card.rank}<br />{SUIT_SYM(card.suit)}
                                </div>
                                <div className="text-2xl text-center font-bold opacity-25" style={{ color: SUIT_COLOR(card.suit) }}>
                                    {SUIT_SYM(card.suit)}
                                </div>
                                <div className="font-black text-xs leading-none rotate-180 self-end" style={{ color: SUIT_COLOR(card.suit) }}>
                                    {card.rank}<br />{SUIT_SYM(card.suit)}
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>


            {/* Glass hero panel */}
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="relative z-10 flex flex-col items-center px-12 py-12 rounded-3xl"
                style={{
                    background: 'rgba(6, 28, 12, 0.52)',
                    backdropFilter: 'blur(22px)',
                    WebkitBackdropFilter: 'blur(22px)',
                    border: '1px solid rgba(212,175,55,0.14)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(212,175,55,0.1)',
                    minWidth: 'min(560px, 92vw)',
                    padding: '3.5rem 4rem',
                }}
            >
                {/* Suit row */}
                <div className="flex justify-center gap-4 mb-5 text-2xl">
                    <span style={{ color: 'rgba(212,175,55,0.55)' }}>♠</span>
                    <span style={{ color: 'rgba(180,60,60,0.65)' }}>♥</span>
                    <span style={{ color: 'rgba(180,60,60,0.65)' }}>♦</span>
                    <span style={{ color: 'rgba(212,175,55,0.55)' }}>♣</span>
                </div>

                <h1
                    className="font-black tracking-tight gold-shimmer mb-3"
                    style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: 'clamp(6rem, 16vw, 10rem)',
                        lineHeight: 0.9,
                        letterSpacing: '-0.02em',
                    }}
                >
                    OMI
                </h1>

                <div className="w-32 h-px my-4" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

                <p className="text-xs font-light tracking-[0.32em] uppercase mb-10" style={{ color: 'rgba(212,175,55,0.6)' }}>
                    The Classic Card Game
                </p>

                {/* Buttons */}
                <div className="flex flex-col gap-4 w-full">
                    {resumeRoomId && (
                        <motion.button
                            whileHover={{ scale: 1.03, y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleContinueGame}
                            disabled={checkingResume}
                            className="w-full py-4 rounded-xl font-bold text-base uppercase tracking-widest"
                            style={{
                                background: 'rgba(34,211,238,0.12)',
                                border: '1px solid rgba(34,211,238,0.34)',
                                color: '#67e8f9',
                                boxShadow: '0 4px 24px rgba(34,211,238,0.18)',
                                opacity: checkingResume ? 0.65 : 1,
                            }}
                        >
                            {checkingResume ? 'Checking Game...' : 'Continue Game'}
                        </motion.button>
                    )}

                    {resumeError && (
                        <p className="text-center text-xs font-semibold uppercase tracking-wider" style={{ color: '#fca5a5' }}>
                            {resumeError}
                        </p>
                    )}

                    <motion.button
                        whileHover={{ scale: 1.03, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/play')}
                        className="w-full py-5 rounded-xl font-bold text-xl uppercase tracking-widest"
                        style={{
                            background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)',
                            color: '#0a1f0d',
                            boxShadow: '0 4px 28px rgba(212,175,55,0.4)',
                            fontFamily: "'Playfair Display', serif",
                            letterSpacing: '0.2em',
                        }}
                    >
                        ♠ Play Now ♠
                    </motion.button>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => navigate('/how-to-play')}
                            className="py-4 rounded-xl font-semibold uppercase tracking-wider text-sm transition-all hover:brightness-125"
                            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                            Rules
                        </button>
                        <button onClick={() => navigate(user ? '/history' : '/login')}
                            className="py-4 rounded-xl font-semibold uppercase tracking-wider text-sm transition-all hover:brightness-125"
                            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                            History
                        </button>
                    </div>

                </div>
            </motion.div>

            <div className="absolute bottom-5 w-full text-center z-10">
                <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'rgba(212,175,55,0.2)' }}>A Game by Wathsara © 2026</p>
            </div>
        </div>
    );
}
