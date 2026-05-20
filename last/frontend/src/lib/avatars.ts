export const AVATARS = [
    { id: 'frog',    emoji: '🐸', color: '#16a34a' },
    { id: 'fox',     emoji: '🦊', color: '#ea580c' },
    { id: 'panda',   emoji: '🐼', color: '#475569' },
    { id: 'robot',   emoji: '🤖', color: '#2563eb' },
    { id: 'alien',   emoji: '👾', color: '#7c3aed' },
    { id: 'unicorn', emoji: '🦄', color: '#db2777' },
    { id: 'skull',   emoji: '💀', color: '#64748b' },
    { id: 'dragon',  emoji: '🐲', color: '#059669' },
    { id: 'wizard',  emoji: '🧙', color: '#6d28d9' },
    { id: 'clown',   emoji: '🤡', color: '#dc2626' },
    { id: 'lion',    emoji: '🦁', color: '#ca8a04' },
    { id: 'tiger',   emoji: '🐯', color: '#d97706' },
    { id: 'koala',   emoji: '🐨', color: '#52525b' },
    { id: 'raccoon', emoji: '🦝', color: '#57534e' },
    { id: 'lizard',  emoji: '🦎', color: '#15803d' },
    { id: 'octopus', emoji: '🐙', color: '#be185d' },
    { id: 'shark',   emoji: '🦈', color: '#0284c7' },
    { id: 'bear',    emoji: '🐻', color: '#92400e' },
    { id: 'penguin', emoji: '🐧', color: '#1d4ed8' },
    { id: 'parrot',  emoji: '🦜', color: '#b91c1c' },
    { id: 'crab',    emoji: '🦀', color: '#c2410c' },
    { id: 'cat',     emoji: '🐱', color: '#b45309' },
    { id: 'devil',   emoji: '😈', color: '#7c3aed' },
    { id: 'zombie',  emoji: '🧟', color: '#3f6212' },
] as const;

export type AvatarId = typeof AVATARS[number]['id'];

export const BOT_AVATAR = { emoji: '🤖', color: '#334155' };

export function getAvatar(id?: string | null) {
    return AVATARS.find(a => a.id === id) ?? AVATARS[0];
}
