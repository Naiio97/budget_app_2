// Tlumené barvy avatarů — přiřazují se podle názvu, aby byl účet pokaždé stejný.
export const AVATAR_COLORS = ['#3b7dd8', '#6b7586', '#24303f', '#2f9c78', '#7a67c4', '#c0794d', '#4a9db0'];

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
}

export function avatarColor(name: string): string {
    return AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
}

export function avatarInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}
