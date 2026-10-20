'use client';

import { NAV_PAGES, NavPlacement, setNavPlacement, useNavPlacements } from '@/lib/nav-preferences';
import { SurfaceCard, NAV_ICONS } from './shared';

export default function MenuTab() {
    const navPlacements = useNavPlacements();
    // Náhled mobilu: první 4 položky menu do spodní lišty, zbytek do draweru
    const inMenu = NAV_PAGES.filter(p => navPlacements[p.href] === 'menu');
    const bottomBar = inMenu.slice(0, 4);
    const drawer = [...inMenu.slice(4), ...NAV_PAGES.filter(p => navPlacements[p.href] === 'quick')];
    return (
        <div className="set-2col menu">
            <SurfaceCard title="Menu a navigace" sub="Vyber, které stránky chceš v hlavním menu" className="set-main-card">
                <div className="set-menu-list">
                    {NAV_PAGES.map(page => {
                        const locked = page.href === '/';
                        const placement = navPlacements[page.href];
                        return (
                            <div key={page.href} className="set-menu-row">
                                <span className="set-menu-icon">{NAV_ICONS[page.href]}</span>
                                <span className="set-menu-name">{page.href === '/' ? 'Dashboard' : page.label}</span>
                                {locked ? (
                                    <span className="set-menu-locked">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                                        vždy v menu
                                    </span>
                                ) : (
                                    <div className="seg set-menu-seg">
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
                </div>
            </SurfaceCard>

            <SurfaceCard title="Na mobilu" sub="První 4 položky menu jsou ve spodní liště, zbytek v menu draweru." className="set-side-card">
                <div className="set-phone-bar">
                    {bottomBar.map(p => (
                        <span key={p.href} className="set-phone-item">{NAV_ICONS[p.href]}<em>{p.href === '/' ? 'Dashboard' : p.label}</em></span>
                    ))}
                    <span className="set-phone-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                        <em>Další</em>
                    </span>
                </div>
                <div className="set-drawer-label">V draweru</div>
                <div className="set-drawer-chips">
                    {drawer.length === 0
                        ? <span className="muted small">Nic navíc.</span>
                        : drawer.map(p => <span key={p.href} className="set-drawer-chip">{p.label}</span>)}
                </div>
                <div className="set-drawer-note">Skryté stránky zůstávají dostupné přes přímý odkaz.</div>
            </SurfaceCard>
        </div>
    );
}
