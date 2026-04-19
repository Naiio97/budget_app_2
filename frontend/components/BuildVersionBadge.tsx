'use client';

const SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || '';

export default function BuildVersionBadge() {
    const shortSha = SHA.slice(0, 7);
    const tooltip = BUILD_TIME ? `${SHA}\n${BUILD_TIME}` : SHA;

    return (
        <div
            title={tooltip}
            style={{
                marginTop: 'auto',
                paddingTop: 'var(--spacing-md)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                fontSize: '0.7rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'rgba(255,255,255,0.3)',
                textAlign: 'center',
                userSelect: 'all',
            }}
        >
            build {shortSha}
        </div>
    );
}
