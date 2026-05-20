import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import type { GameHistoryItem } from '../lib/api';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import ModernBackground from '../components/ModernBackground';
import { ArrowLeft, Trophy, XCircle, MinusCircle, RotateCcw } from 'lucide-react';

export default function History() {
    const navigate = useNavigate();
    const [history, setHistory] = useState<GameHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { navigate('/login'); return; }
            api.getHistory(session.access_token)
                .then(data => { setHistory(data); setLoading(false); })
                .catch(() => { setError('Failed to load history.'); setLoading(false); });
        });
    }, [navigate]);

    return (
        <div className="min-h-screen p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />
            <div className="relative z-10 max-w-4xl mx-auto pt-8 pb-24">
                <button onClick={() => navigate('/')} className="flex items-center gap-2 uppercase tracking-wider text-sm font-semibold group mb-8 transition-colors" style={{ color: 'rgba(212,175,55,0.6)' }}>
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
                </button>
                <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-black mb-12 text-center" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                    Match History
                </motion.h1>
                {error && <div className="p-4 rounded-lg mb-8 text-sm text-center max-w-md mx-auto" style={{ background: 'rgba(180,50,50,0.15)', border: '1px solid rgba(180,50,50,0.4)', color: '#ff9999' }}>{error}</div>}
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <div className="w-10 h-10 border-4 rounded-full" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : (
                    <div className="grid gap-4 max-w-3xl mx-auto">
                        {history.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="felt-panel p-10 rounded-2xl text-center flex flex-col items-center gap-4">
                                <Trophy className="w-12 h-12 opacity-20" style={{ color: '#D4AF37' }} />
                                <p style={{ color: 'rgba(212,175,55,0.6)' }}>No matches played yet.</p>
                                <button onClick={() => navigate('/play')} className="mt-2 font-semibold transition-colors" style={{ color: '#D4AF37' }}>Play your first game →</button>
                            </motion.div>
                        ) : history.map((match, i) => {
                            const isWin = match.status === 'win', isLoss = match.status === 'loss', isInProgress = match.status === 'in_progress';
                            const log = (() => { try { return match.game_log ? JSON.parse(match.game_log) : null; } catch { return null; } })();
                            const players: { seat_id: number; display_name: string; type: string; team: number }[] = log?.players ?? [];
                            const team0 = players.filter(p => p.team === 0);
                            const team1 = players.filter(p => p.team === 1);
                            return (
                                <motion.div key={match.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                    className="felt-panel p-5 md:p-6 rounded-2xl flex flex-col transition-all hover:-translate-y-1"
                                    style={{ borderLeft: `4px solid ${isWin ? '#D4AF37' : isLoss ? 'rgba(180,50,50,0.6)' : isInProgress ? '#67e8f9' : 'rgba(212,175,55,0.2)'}` }}>

                                    {/* Top row: result + score + date + actions */}
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                                                style={{ background: isWin ? 'rgba(212,175,55,0.15)' : isLoss ? 'rgba(180,50,50,0.15)' : isInProgress ? 'rgba(34,211,238,0.12)' : 'rgba(212,175,55,0.07)', color: isWin ? '#D4AF37' : isLoss ? '#ff9999' : isInProgress ? '#67e8f9' : 'rgba(212,175,55,0.4)' }}>
                                                {isWin ? <Trophy className="w-6 h-6" /> : isLoss ? <XCircle className="w-6 h-6" /> : isInProgress ? <RotateCcw className="w-6 h-6" /> : <MinusCircle className="w-6 h-6" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-lg font-bold uppercase tracking-wider" style={{ color: isWin ? '#D4AF37' : isLoss ? '#ff9999' : isInProgress ? '#67e8f9' : 'rgba(212,175,55,0.5)', fontFamily: "'Playfair Display', serif" }}>
                                                        {isWin ? 'Victory' : isLoss ? 'Defeat' : isInProgress ? 'In Progress' : 'Draw'}
                                                    </span>
                                                    <span style={{ color: 'rgba(212,175,55,0.3)' }}>·</span>
                                                    <span className="text-sm font-medium" style={{ color: 'rgba(240,232,208,0.7)' }}>{match.score_us} – {match.score_them}</span>
                                                </div>
                                                <p className="text-xs" style={{ color: 'rgba(212,175,55,0.4)' }}>
                                                    {new Date(match.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(match.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            {isInProgress && match.room_id && (
                                                <button onClick={() => navigate(`/game/${match.room_id}`)}
                                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                                    style={{ background: 'rgba(34,211,238,0.1)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.24)' }}>
                                                    Continue
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Players — shown when log includes player data */}
                                    {players.length === 4 && (
                                        <div className="mt-4 pt-4 grid grid-cols-2 gap-x-6 gap-y-1" style={{ borderTop: '1px solid rgba(212,175,55,0.1)' }}>
                                            {[{ team: team0, label: 'Team A' }, { team: team1, label: 'Team B' }].map(({ team, label }) => (
                                                <div key={label}>
                                                    <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(212,175,55,0.35)' }}>{label}</p>
                                                    {team.map(p => (
                                                        <div key={p.seat_id} className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs w-5 h-5 rounded flex items-center justify-center shrink-0"
                                                                style={{ background: 'rgba(212,175,55,0.08)', color: 'rgba(212,175,55,0.4)' }}>
                                                                {p.seat_id + 1}
                                                            </span>
                                                            <span className="text-sm truncate" style={{ color: p.type === 'bot' ? 'rgba(212,175,55,0.4)' : 'rgba(240,232,208,0.85)' }}>
                                                                {p.display_name ?? '—'}
                                                                {p.type === 'bot' && <span className="ml-1 text-xs" style={{ color: 'rgba(212,175,55,0.3)' }}>· bot</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
