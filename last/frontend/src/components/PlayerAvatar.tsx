import { getAvatar, BOT_AVATAR } from '../lib/avatars';

interface PlayerAvatarProps {
    avatarId?: string | null;
    isBot?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showRing?: boolean;
    isActive?: boolean;
}

const SIZES = {
    sm:  { outer: 42, emoji: '1.35rem', ring: 2 },
    md:  { outer: 56, emoji: '1.8rem', ring: 3 },
    lg:  { outer: 72, emoji: '2.35rem', ring: 3 },
    xl:  { outer: 88, emoji: '2.9rem', ring: 4 },
};

export default function PlayerAvatar({ avatarId, isBot = false, size = 'md', showRing = false, isActive = false }: PlayerAvatarProps) {
    const { outer, emoji: fontSize, ring } = SIZES[size];
    const av = isBot ? BOT_AVATAR : getAvatar(avatarId);

    return (
        <div
            style={{
                width: outer,
                height: outer,
                borderRadius: '50%',
                background: `${av.color}22`,
                border: `${ring}px solid ${isActive ? '#D4AF37' : showRing ? av.color + '88' : av.color + '44'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize,
                flexShrink: 0,
                boxShadow: isActive ? `0 0 14px ${av.color}55` : 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                userSelect: 'none',
            }}
        >
            {av.emoji}
        </div>
    );
}
