'use client';

import { NAV_PAGES, NavPlacement, setNavPlacement, useNavPlacements } from '@/lib/nav-preferences';
import { SurfaceCard } from './shared';

export default function MenuTab() {
    const navPlacements = useNavPlacements();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--spacing-lg)' }}>
            <SurfaceCard title="Menu a navigace" sub="Vyber, které stránky chceš v hlavním menu">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {NAV_PAGES.map(page => {
                        const locked = page.href === '/';
                        const placement = navPlacements[page.href];
                        return (
                            <div key={page.href} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                                <span style={{ fontSize: 14, fontWeight: 500 }}>{page.label}</span>
                                {locked ? (
                                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>vždy v menu</span>
                                ) : (
                                    <div className="seg">
                                        {([['menu', 'Menu'], ['quick', 'Rychlé akce'], ['hidden', 'Skrýt']] as [NavPlacement, string][]).map(([val, label]) => (
                                            <button
                                                key={val}
                                                type="button"
                                                className={`seg-item ${placement === val ? 'active' : ''}`}
                                                onClick={() => setNavPlacement(page.href, val)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        Na mobilu jsou první 4 položky menu ve spodní liště, zbytek v menu draweru. Skryté stránky zůstávají dostupné přes přímý odkaz.
                    </div>
                </div>
            </SurfaceCard>
        </div>
    );
}
