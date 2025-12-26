interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'subtle' | 'compact';
    hover?: boolean;
    style?: React.CSSProperties;
}

export default function GlassCard({
    children,
    className = '',
    variant = 'default',
    hover = true,
    style = {}
}: GlassCardProps) {
    const baseClass = variant === 'subtle' ? 'glass-subtle' : 'glass';
    const paddingClass = variant === 'compact' ? 'glass-card-compact' : 'glass-card';
    const hoverClass = hover ? '' : 'no-hover';

    return (
        <div
            className={`${baseClass} ${paddingClass} ${hoverClass} ${className}`}
            style={{ ...(hover ? {} : { transform: 'none' }), ...style }}
        >
            {children}
        </div>
    );
}
