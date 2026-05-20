import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ModernBackground from '../components/ModernBackground';

export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                navigate('/reset-password', { replace: true });
            } else if (session) {
                navigate('/', { replace: true });
            } else {
                navigate('/login', { replace: true });
            }
        });
        return () => subscription.unsubscribe();
    }, [navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />
            <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4" style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'spin 1s linear infinite' }} />
                <p className="font-medium tracking-widest uppercase text-sm animate-pulse" style={{ color: 'rgba(212,175,55,0.7)' }}>Signing in...</p>
            </div>
        </div>
    );
}
