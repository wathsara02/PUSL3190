import React from 'react';

const ClassicBackground: React.FC = () => {
    return (
        <>
            {/* Deep forest base */}
            <div className="fixed inset-0 z-[-3]" style={{ background: 'radial-gradient(ellipse at 50% 110%, #1a4a1e 0%, #0d2e12 40%, #0a1f0d 100%)' }} />
            
            {/* Subtle wood-grain texture overlay */}
            <div className="fixed inset-0 z-[-2] opacity-10" style={{
                backgroundImage: `repeating-linear-gradient(
                    88deg,
                    rgba(139, 90, 43, 0.3) 0px,
                    transparent 1px,
                    transparent 40px,
                    rgba(139, 90, 43, 0.15) 41px,
                    transparent 42px
                ),
                repeating-linear-gradient(
                    2deg,
                    rgba(139, 90, 43, 0.1) 0px,
                    transparent 1px,
                    transparent 80px
                )`
            }} />

            {/* Felt texture vignette */}
            <div className="fixed inset-0 z-[-1] pointer-events-none" style={{
                background: 'radial-gradient(ellipse 120% 80% at 50% 50%, transparent 30%, rgba(5, 15, 7, 0.7) 100%)'
            }} />

            {/* Gold light glow from top */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-64 z-[-1] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(212,175,55,0.08) 0%, transparent 70%)' }} />

            {/* Corner card suit watermarks */}
            <div className="fixed top-8 left-8 text-8xl text-green-900/20 select-none pointer-events-none z-[-1] font-serif">♣</div>
            <div className="fixed top-8 right-8 text-8xl text-red-900/20 select-none pointer-events-none z-[-1] font-serif">♥</div>
            <div className="fixed bottom-8 left-8 text-8xl text-red-900/20 select-none pointer-events-none z-[-1] font-serif">♦</div>
            <div className="fixed bottom-8 right-8 text-8xl text-green-900/20 select-none pointer-events-none z-[-1] font-serif">♠</div>
        </>
    );
};

export default ClassicBackground;
