import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import ModernBackground from '../components/ModernBackground';
import ErrorBanner from '../components/ErrorBanner';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setError('');
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });
        setLoading(false);
        if (error) {
            setError(error.message);
        } else {
            navigate('/', { replace: true });
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-md z-10"
            >
                <div className="felt-panel p-8 md:p-10 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

                    <div className="flex justify-center gap-3 mb-6 text-xl opacity-50">
                        <span style={{ color: '#D4AF37' }}>♠</span>
                        <span style={{ color: '#c0392b' }}>♥</span>
                        <span style={{ color: '#c0392b' }}>♦</span>
                        <span style={{ color: '#D4AF37' }}>♣</span>
                    </div>

                    <h2 className="text-3xl font-bold text-center mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                        New Password
                    </h2>
                    <p className="text-center text-sm mb-8" style={{ color: 'rgba(212,175,55,0.5)' }}>
                        Choose a new password for your account.
                    </p>

                    {error && <ErrorBanner message={error} />}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium ml-1" style={{ color: 'rgba(212,175,55,0.7)', letterSpacing: '0.1em' }}>New Password</label>
                            <input
                                type="password"
                                style={inputStyle}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                                onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.25)')}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium ml-1" style={{ color: 'rgba(212,175,55,0.7)', letterSpacing: '0.1em' }}>Confirm Password</label>
                            <input
                                type="password"
                                style={inputStyle}
                                placeholder="••••••••"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                                onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                                onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.25)')}
                            />
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={loading}
                            className="mt-2 w-full py-4 rounded-xl font-bold text-base uppercase tracking-widest transition-all"
                            style={{
                                background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)',
                                color: '#0a1f0d',
                                opacity: loading ? 0.6 : 1,
                                fontFamily: "'Playfair Display', serif",
                                boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
                            }}
                        >
                            {loading ? 'Saving...' : 'Set New Password'}
                        </motion.button>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
