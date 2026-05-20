import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

export default function ErrorBanner({ message }: { message: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl mb-5"
            style={{
                background: 'linear-gradient(135deg, rgba(180,40,40,0.18), rgba(140,20,20,0.12))',
                border: '1px solid rgba(200,60,60,0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255,100,100,0.08)',
            }}
        >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'rgba(255,120,120,0.9)' }} />
            <p className="text-sm font-medium leading-snug" style={{ color: 'rgba(255,180,180,0.95)' }}>
                {message}
            </p>
        </motion.div>
    );
}
