import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ModernBackground from '../components/ModernBackground';
import { ArrowLeft, Play } from 'lucide-react';

const sections = [
    { title: "The Deck & Players", content: "Omi is played with 4 players in two fixed partnerships. It uses a stripped 32-card deck containing only the 7, 8, 9, 10, Jack, Queen, King, and Ace of all four suits." },
    { title: "The Deal & Trump", content: ["The dealer gives 4 cards to each player.", "The player to the right of the dealer declares the Trump suit based on their 4 cards.", "The remaining 16 cards are then dealt, giving each player 8 cards total."] },
    { title: "Gameplay Rules", content: ["The player who declared trump leads the first trick.", "Players must follow suit if possible.", "If you cannot follow suit, you may play any card including Trump.", "The highest card of the led suit wins, unless a Trump card is played.", "Card rank from high to low: A, K, Q, J, 10, 9, 8, 7."] },
    { title: "Winning", content: "Each hand has 8 tricks. After all 8 tricks, the trump chooser's team scores 1 point if it wins more tricks, while the other team scores 2 points if it wins. A 4-4 hand scores no points, and the next team to win a hand gets 2 points. The match continues with a new deal and rotating trump chooser until one team reaches 10 points." }
];

export default function Rules() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen p-6 relative overflow-hidden" style={{ color: '#f0e8d0' }}>
            <ModernBackground />
            <div className="relative z-10 max-w-4xl mx-auto pt-8 pb-24">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 uppercase tracking-wider text-sm font-semibold group mb-8 transition-colors"
                    style={{ color: 'rgba(212,175,55,0.6)', fontFamily: "'Lato', sans-serif" }}
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
                </button>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="felt-panel p-8 md:p-12 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />
                    <div className="flex justify-center gap-4 mb-6 text-3xl opacity-40">
                        <span style={{ color: '#D4AF37' }}>♠</span>
                        <span style={{ color: '#c0392b' }}>♥</span>
                        <span style={{ color: '#c0392b' }}>♦</span>
                        <span style={{ color: '#D4AF37' }}>♣</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black mb-12 text-center" style={{ fontFamily: "'Playfair Display', serif", color: '#D4AF37' }}>
                        How to Play OMI
                    </h1>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {sections.map((section, idx) => (
                            <motion.section
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="p-6 rounded-xl transition-colors"
                                style={{ background: 'rgba(10,40,15,0.5)', border: '1px solid rgba(212,175,55,0.15)' }}
                            >
                                <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: '#D4AF37', fontFamily: "'Playfair Display', serif" }}>
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>{idx + 1}</span>
                                    {section.title}
                                </h2>
                                {Array.isArray(section.content) ? (
                                    <ul className="space-y-3" style={{ color: 'rgba(240,232,208,0.8)' }}>
                                        {section.content.map((item, i) => (
                                            <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-x-3">
                                                <span className="shrink-0 leading-relaxed text-sm" style={{ color: '#D4AF37' }}>♦</span>
                                                <span className="leading-relaxed text-sm">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="leading-relaxed text-sm" style={{ color: 'rgba(240,232,208,0.8)' }}>{section.content}</p>
                                )}
                            </motion.section>
                        ))}
                    </div>
                    <div className="mt-16 text-center">
                        <button
                            onClick={() => navigate('/play')}
                            className="inline-flex items-center gap-3 font-bold text-lg py-4 px-10 rounded-full transition-all hover:-translate-y-1"
                            style={{ background: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #B8860B 100%)', color: '#0a1f0d', boxShadow: '0 4px 20px rgba(212,175,55,0.3)', fontFamily: "'Playfair Display', serif" }}
                        >
                            <Play className="w-5 h-5 fill-current" /> Play Now
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
