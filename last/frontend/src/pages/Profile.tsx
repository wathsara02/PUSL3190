import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { AVATARS, getAvatar } from '../lib/avatars';
import ModernBackground from '../components/ModernBackground';
import ErrorBanner from '../components/ErrorBanner';
import { ArrowLeft, Check, LogOut } from 'lucide-react';

export default function Profile() {
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('frog');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) { navigate('/login'); return; }
            const meta = session.user.user_metadata;
            setDisplayName(meta?.display_name || meta?.full_name || session.user.email?.split('@')[0] || '');
            setSelectedAvatar(meta?.avatar_id || 'frog');
        });
    }, [navigate]);

    const handleSave = async () => {
        if (!displayName.trim()) { setError('Name cannot be empty'); return; }
        setSaving(true);
        setError('');
        const { error } = await supabase.auth.updateUser({
            data: { display_name: displayName.trim(), avatar_id: selectedAvatar },
        });
        if (error) { setSaving(false); setError(error.message); return; }
        await supabase.auth.refreshSession();
        setSaving(false);
        setSaved(true);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const currentAv = getAvatar(selectedAvatar);

    return (
        <div className="min-h-screen p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />

            <div className="relative z-10 max-w-xl mx-auto pt-8">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 uppercase tracking-wider text-sm font-semibold group mb-8 transition-colors self-start"
                    style={{ color: 'rgba(212,175,55,0.6)' }}
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
                </button>

                <div className="felt-panel p-8 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

                    {/* Current avatar preview */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="relative">
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-3"
                                style={{ background: `${currentAv.color}22`, border: `3px solid ${currentAv.color}88` }}
                            >
                                {currentAv.emoji}
                            </div>
                        </div>
                        <h1 className="text-2xl font-black" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                            {displayName || 'Your Profile'}
                        </h1>
                    </div>

                    {/* Display name */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(212,175,55,0.6)' }}>
                            Display Name
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            maxLength={30}
                            placeholder="How you appear in game"
                            onInput={() => setSaved(false)}
                            className="w-full px-4 py-3 rounded-xl text-base font-medium"
                            style={{
                                background: 'rgba(10,40,15,0.7)',
                                border: '1px solid rgba(212,175,55,0.3)',
                                color: '#f0e8d0',
                                outline: 'none',
                                fontFamily: "'Lato', sans-serif",
                            }}
                            onFocus={e => (e.target.style.borderColor = 'rgba(212,175,55,0.7)')}
                            onBlur={e => (e.target.style.borderColor = 'rgba(212,175,55,0.3)')}
                        />
                    </div>

                    {/* Avatar grid */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(212,175,55,0.6)' }}>
                            Pick Your Avatar
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                            {AVATARS.map(av => (
                                <button
                                    key={av.id}
                                    onClick={() => { setSelectedAvatar(av.id); setSaved(false); }}
                                    className="relative aspect-square rounded-xl flex items-center justify-center text-2xl transition-all"
                                    style={{
                                        background: selectedAvatar === av.id ? `${av.color}33` : 'rgba(10,40,15,0.5)',
                                        border: selectedAvatar === av.id ? `2px solid ${av.color}` : '2px solid rgba(212,175,55,0.12)',
                                        transform: selectedAvatar === av.id ? 'scale(1.1)' : 'scale(1)',
                                    }}
                                    title={av.id}
                                >
                                    {av.emoji}
                                    {selectedAvatar === av.id && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                                            style={{ background: av.color }}>
                                            <Check className="w-2.5 h-2.5 text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-4 rounded-xl font-bold text-base uppercase tracking-widest mb-4"
                        style={{
                            background: saved
                                ? 'rgba(74,222,128,0.2)'
                                : 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)',
                            color: saved ? '#4ade80' : '#0a1f0d',
                            border: saved ? '1px solid rgba(74,222,128,0.4)' : 'none',
                            opacity: saving ? 0.7 : 1,
                            fontFamily: "'Playfair Display', serif",
                        }}
                    >
                        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Profile'}
                    </motion.button>

                    <button
                        onClick={handleSignOut}
                        className="w-full py-3 rounded-xl font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                        style={{ color: 'rgba(220,80,80,0.8)', background: 'rgba(220,80,80,0.06)', border: '1px solid rgba(220,80,80,0.2)' }}
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}
