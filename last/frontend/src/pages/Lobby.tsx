import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createRoom, joinRoom } from '../lib/api';
import { supabase } from '../lib/supabase';
import ModernBackground from '../components/ModernBackground';
import ErrorBanner from '../components/ErrorBanner';
import { ArrowLeft, Plus, DoorOpen } from 'lucide-react';

export default function Lobby() {
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            const meta = user.user_metadata;
            const saved = meta?.display_name || meta?.full_name || user.email?.split('@')[0] || '';
            if (saved) setDisplayName(saved);
        });
    }, []);

    const getSessionData = async () => {
        const [{ data: { session } }, { data: { user } }] = await Promise.all([
            supabase.auth.getSession(),
            supabase.auth.getUser(),
        ]);
        return {
            token: session?.access_token ?? null,
            avatarId: (user?.user_metadata?.avatar_id as string | undefined) ?? 'frog',
        };
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName.trim()) return setError('Display name required');
        setIsLoading(true);
        try {
            const { token, avatarId } = await getSessionData();
            const res = await createRoom(displayName, token, avatarId);
            localStorage.setItem(`token_${res.room_id}`, res.token);
            localStorage.setItem('last_room_id', res.room_id);
            navigate(`/room/${res.room_id}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create room');
        } finally { setIsLoading(false); }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName.trim() || !roomId.trim()) return setError('Display name and Room ID required');
        setIsLoading(true);
        try {
            const { token, avatarId } = await getSessionData();
            const res = await joinRoom(roomId.toUpperCase(), displayName, token, avatarId);
            localStorage.setItem(`token_${res.room_id}`, res.token);
            localStorage.setItem('last_room_id', res.room_id);
            navigate(`/room/${res.room_id}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to join room');
        } finally { setIsLoading(false); }
    };

    const inputStyle = {
        background: 'rgba(10, 40, 15, 0.6)',
        border: '1px solid rgba(212,175,55,0.25)',
        color: '#f0e8d0',
        borderRadius: '8px',
        padding: '14px 16px',
        width: '100%',
        outline: 'none',
        fontFamily: "'Lato', sans-serif",
        transition: 'border-color 0.2s',
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />

            <button onClick={() => navigate('/')}
                className="absolute top-8 left-8 flex items-center gap-2 uppercase tracking-wider text-sm font-semibold group z-10 transition-colors"
                style={{ color: 'rgba(212,175,55,0.6)', fontFamily: "'Lato', sans-serif" }}>
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
            </button>

            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10 w-full max-w-md">
                <div className="felt-panel p-8 md:p-10 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

                    <h1 className="text-3xl font-black text-center mb-8" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                        Game Lobby
                    </h1>

                    {error && <ErrorBanner message={error} />}

                    <div className="space-y-8">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium ml-1" style={{ color: 'rgba(212,175,55,0.7)', letterSpacing: '0.1em' }}>Your Display Name</label>
                            <input type="text" style={inputStyle} placeholder="Enter your name" value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                                onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.25)')} />
                        </div>

                        <div className="space-y-5 pt-2">
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={handleCreate} disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-widest transition-all"
                                style={{
                                    background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)',
                                    color: '#0a1f0d',
                                    opacity: isLoading ? 0.6 : 1,
                                    fontFamily: "'Playfair Display', serif",
                                    boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
                                }}>
                                <Plus className="w-5 h-5" /> Deal New Room
                            </motion.button>

                            <div className="relative flex items-center py-2">
                                <div className="flex-grow h-px" style={{ background: 'rgba(212,175,55,0.2)' }} />
                                <span className="flex-shrink-0 mx-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(212,175,55,0.5)' }}>or join existing</span>
                                <div className="flex-grow h-px" style={{ background: 'rgba(212,175,55,0.2)' }} />
                            </div>

                            <div className="flex flex-col gap-4">
                                <input type="text"
                                    style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: "'Courier Prime', monospace", textTransform: 'uppercase', fontSize: '1.1rem' }}
                                    placeholder="ROOM CODE"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                                    onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.25)')} />
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={handleJoin} disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-widest transition-all"
                                    style={{
                                        background: 'rgba(10, 40, 15, 0.6)',
                                        color: '#D4AF37',
                                        border: '1px solid rgba(212,175,55,0.4)',
                                        opacity: isLoading ? 0.6 : 1,
                                        fontFamily: "'Lato', sans-serif",
                                    }}>
                                    <DoorOpen className="w-5 h-5" /> Take a Seat
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
