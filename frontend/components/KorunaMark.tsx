// Značka Koruna (3 sloupce + základna). Barva = currentColor, velikost přes size/CSS.
export default function KorunaMark({ size = 18, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 400 400" fill="currentColor" className={className} aria-hidden="true">
            <path d="M46 159A41 41 0 0 1 128 159V255A41 41 0 0 1 46 255ZM159 78A41 41 0 0 1 241 78V255A41 41 0 0 1 159 255ZM272 159A41 41 0 0 1 354 159V255A41 41 0 0 1 272 255ZM56 310H344A27 27 0 0 1 344 364H56A27 27 0 0 1 56 310Z" />
        </svg>
    );
}
