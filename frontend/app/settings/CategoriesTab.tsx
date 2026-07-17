'use client';

import { useState, useEffect, useCallback } from 'react';
import CustomSelect from '@/components/CustomSelect';
import { type ToastMessage } from '@/components/Toast';
import { apiFetch, Tag, getTags, createTag, deleteTag } from '@/lib/api';
import { getCategoryIcon } from '@/lib/category-icons';
import { Icons } from '@/lib/icons';
import CategoryManager from './CategoryManager';
import { SurfaceCard, SearchIcon, CloseIcon, TrashIcon, CATEGORY_PALETTE, type Category } from './shared';

interface CategoryRule { id: number; pattern: string; category: string; is_user_defined: boolean; is_builtin: boolean; match_count: number; }

export default function CategoriesTab({ setToast }: { setToast: (t: ToastMessage) => void }) {
    const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
    const [ruleCategories, setRuleCategories] = useState<Category[]>([]);

    // Tagy — volné štítky napříč kategoriemi
    const [tagsList, setTagsList] = useState<Tag[]>([]);
    const [newTagText, setNewTagText] = useState('');
    const [savingTag, setSavingTag] = useState(false);

    const [newPattern, setNewPattern] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState('Food');
    const [ruleSearch, setRuleSearch] = useState('');
    const [savingRule, setSavingRule] = useState(false);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [detailRule, setDetailRule] = useState<CategoryRule | null>(null);
    const [editingRule, setEditingRule] = useState(false);
    const [editRulePattern, setEditRulePattern] = useState('');
    const [editRuleCategory, setEditRuleCategory] = useState('');
    const [savingRuleEdit, setSavingRuleEdit] = useState(false);
    const [recategorizing, setRecategorizing] = useState(false);

    const loadCategoryRules = useCallback(async () => {
        try {
            const r = await apiFetch(`/settings/category-rules`);
            if (r.ok) {
                const data = await r.json();
                setCategoryRules(data.rules || []);
            }
            const c = await apiFetch(`/categories/`);
            const cd = await c.json();
            setRuleCategories(Array.isArray(cd) ? cd : []);
        } catch (err) { console.error(err); }
    }, []);

    const loadTags = useCallback(async () => {
        try {
            const d = await getTags();
            setTagsList(d.tags);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        loadCategoryRules();
        loadTags();
    }, [loadCategoryRules, loadTags]);

    const handleAddTag = async () => {
        const name = newTagText.trim();
        if (!name) return;
        setSavingTag(true);
        try {
            await createTag(name, CATEGORY_PALETTE[tagsList.length % CATEGORY_PALETTE.length]);
            setNewTagText('');
            await loadTags();
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Tag se nepodařilo vytvořit');
        } finally { setSavingTag(false); }
    };

    const handleDeleteTag = async (tag: Tag) => {
        if ((tag.usage_count ?? 0) > 0 && !confirm(`Tag „${tag.name}" je na ${tag.usage_count} transakcích. Opravdu smazat?`)) return;
        try {
            await deleteTag(tag.id);
            setTagsList(prev => prev.filter(t => t.id !== tag.id));
        } catch (err) { console.error(err); }
    };

    const handleAddRule = async () => {
        if (!newPattern.trim()) return;
        setSavingRule(true);
        try {
            const r = await apiFetch(`/settings/category-rules`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: newPattern, category: newRuleCategory }),
            });
            if (r.ok) { setNewPattern(''); setShowRuleForm(false); loadCategoryRules(); }
        } finally { setSavingRule(false); }
    };

    const handleDeleteRule = async (id: number) => {
        await apiFetch(`/settings/category-rules/${id}`, { method: 'DELETE' });
        setCategoryRules(categoryRules.filter(r => r.id !== id));
    };

    const handleUpdateRule = async () => {
        if (!detailRule || !editRulePattern.trim()) return;
        setSavingRuleEdit(true);
        try {
            const r = await apiFetch(`/settings/category-rules/${detailRule.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: editRulePattern, category: editRuleCategory }),
            });
            if (r.ok) { setEditingRule(false); setDetailRule(null); loadCategoryRules(); }
        } finally { setSavingRuleEdit(false); }
    };

    const handleRecategorize = async () => {
        setRecategorizing(true);
        try {
            const r = await apiFetch(`/sync/recategorize`, { method: 'POST' });
            if (!r.ok) throw new Error(`recategorize ${r.status}`);
            const data = await r.json();
            const n: number = data.updated ?? 0;
            setToast({
                text: n === 0
                    ? 'Hotovo — všechny transakce už byly zařazené správně.'
                    : `Hotovo — překategorizováno ${n} ${n === 1 ? 'transakce' : n < 5 ? 'transakce' : 'transakcí'}.`,
            });
        } catch (err) {
            console.error(err);
            setToast({ text: 'Rekategorizace selhala.', kind: 'error' });
        } finally { setRecategorizing(false); }
    };

    return (
        <>
            <div className="settings-categories-grid">

                <SurfaceCard
                    title="Kategorie"
                    sub="Přidej, uprav nebo skryj kategorie pro třídění transakcí."
                    action={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span className="set-count-chip">{ruleCategories.filter(c => c.is_active).length} kategorií</span>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowAddCategory(true)}>{Icons.action.add} Kategorie</button>
                        </div>
                    }
                    className="settings-category-card"
                >
                    <CategoryManager onCategoriesChange={loadCategoryRules} showAdd={showAddCategory} setShowAdd={setShowAddCategory} />
                </SurfaceCard>

                <div className="settings-rules-column" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                    <SurfaceCard
                        title="Pravidla"
                        sub="Když popis transakce obsahuje text, automaticky se přiřadí kategorie."
                        action={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <span className="set-count-chip">{categoryRules.length} pravidel</span>
                                <button className="btn btn-sm" onClick={handleRecategorize} disabled={recategorizing} title="Překategorizovat všechny transakce">
                                    {recategorizing ? '…' : <>{Icons.action.sync} Sync</>}
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowRuleForm(true)}>{Icons.action.add} Pravidlo</button>
                            </div>
                        }
                        className="settings-rules-card"
                    >
                        {categoryRules.length === 0 ? (
                            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                Zatím žádná pravidla. Přidej přes „+ Pravidlo“ nebo změň kategorii u transakce.
                            </div>
                        ) : (
                            <>
                                <div className="set-search" style={{ marginBottom: 8 }}>
                                    {SearchIcon}
                                    <input
                                        className="input"
                                        placeholder="Hledat v pravidlech…"
                                        value={ruleSearch}
                                        onChange={e => setRuleSearch(e.target.value)}
                                    />
                                </div>
                                {(() => {
                                    const q = ruleSearch.trim().toLowerCase();
                                    const visibleRules = q
                                        ? categoryRules.filter(r => r.pattern.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
                                        : categoryRules;
                                    if (visibleRules.length === 0) {
                                        return (
                                            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
                                                Žádné pravidlo neodpovídá hledání „{ruleSearch}“.
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="settings-scroll-list settings-rules-list">
                                            {visibleRules.map(rule => {
                                                const catColor = ruleCategories.find(c => c.name === rule.category)?.color ?? 'var(--text-3)';
                                                return (
                                                    <button key={rule.id} type="button" className="set-rule-row" onClick={() => { setDetailRule(rule); setEditingRule(false); setEditRulePattern(rule.pattern); setEditRuleCategory(rule.category); }}>
                                                        <span className="set-rule-pattern">„{rule.pattern}“</span>
                                                        <span className="set-rule-arrow">→</span>
                                                        <span className="set-rule-dot" style={{ background: catColor }} />
                                                        <span className="set-rule-cat">{rule.category}</span>
                                                        <span className="set-rule-chevron">›</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </SurfaceCard>

                    <SurfaceCard
                        title="Tagy"
                        sub="Volné štítky napříč kategoriemi — „dovolená 2026“, „rekonstrukce“…"
                        action={<span className="set-count-chip">{tagsList.length} tagů</span>}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {tagsList.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {tagsList.map(tag => (
                                        <span key={tag.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <span className="set-rule-dot" style={{ background: tag.color ?? 'var(--text-3)' }} />
                                            #{tag.name}
                                            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{tag.usage_count ?? 0}×</span>
                                            <button
                                                onClick={() => handleDeleteTag(tag)}
                                                title="Smazat tag"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 12, lineHeight: 1 }}
                                            >✕</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    className="input"
                                    placeholder="Nový tag (např. dovolená 2026)"
                                    value={newTagText}
                                    onChange={e => setNewTagText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); }}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleAddTag} disabled={savingTag || !newTagText.trim()}>
                                    {savingTag ? '…' : 'Přidat'}
                                </button>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                Tagy přiřadíš transakci v jejím detailu; součet za tag najdeš ve filtru transakcí.
                            </div>
                        </div>
                    </SurfaceCard>
                </div>
            </div>

            {/* New rule modal */}
            {showRuleForm && (
                <div className="set-modal-overlay" onClick={() => setShowRuleForm(false)}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <div>
                                <h3 style={{ margin: 0 }}>Nové pravidlo</h3>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Když popis transakce obsahuje text, automaticky se přiřadí kategorie.</div>
                            </div>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => setShowRuleForm(false)}>{CloseIcon}</button>
                        </div>
                        <div>
                            <label className="set-field-label">Obsahuje text</label>
                            <div className="set-search">
                                {SearchIcon}
                                <input className="input" autoFocus placeholder='např. „billa" nebo „uber"' value={newPattern} onChange={e => setNewPattern(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newPattern.trim()) handleAddRule(); }} />
                            </div>
                        </div>
                        <div>
                            <label className="set-field-label">Přiřadit kategorii</label>
                            <CustomSelect
                                value={newRuleCategory}
                                onChange={setNewRuleCategory}
                                options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: getCategoryIcon(c.icon, 15) }))}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={handleAddRule} disabled={savingRule || !newPattern.trim()}>
                            {savingRule ? 'Ukládám...' : <>{Icons.action.add} Přidat pravidlo</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Rule detail modal */}
            {detailRule && (
                <div className="set-modal-overlay" onClick={() => setDetailRule(null)}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <h3 style={{ margin: 0 }}>{editingRule ? 'Upravit pravidlo' : 'Detail pravidla'}</h3>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => setDetailRule(null)}>{CloseIcon}</button>
                        </div>
                        {editingRule ? (
                            <>
                                <div>
                                    <label className="set-field-label">Obsahuje text</label>
                                    <div className="set-search">
                                        {SearchIcon}
                                        <input className="input" autoFocus value={editRulePattern} onChange={e => setEditRulePattern(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editRulePattern.trim()) handleUpdateRule(); }} />
                                    </div>
                                </div>
                                <div>
                                    <label className="set-field-label">Přiřadit kategorii</label>
                                    <CustomSelect
                                        value={editRuleCategory}
                                        onChange={setEditRuleCategory}
                                        options={ruleCategories.filter(c => c.is_active).map(c => ({ value: c.name, label: c.name, icon: getCategoryIcon(c.icon, 15) }))}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn" style={{ flex: 1 }} onClick={() => setEditingRule(false)}>Zrušit</button>
                                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleUpdateRule} disabled={savingRuleEdit || !editRulePattern.trim()}>
                                        {savingRuleEdit ? 'Ukládám...' : 'Uložit'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="set-field-label">Obsahuje text</label>
                                    <div className="set-modal-value">„{detailRule.pattern}“</div>
                                </div>
                                <div>
                                    <label className="set-field-label">Přiřadí kategorii</label>
                                    <div className="set-modal-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="set-rule-dot" style={{ background: ruleCategories.find(c => c.name === detailRule.category)?.color ?? 'var(--text-3)' }} />
                                        {detailRule.category}
                                    </div>
                                </div>
                                <div>
                                    <label className="set-field-label">Původ</label>
                                    <div className="set-modal-value">{detailRule.is_user_defined ? 'Vlastní pravidlo' : detailRule.is_builtin ? 'Výchozí pravidlo' : 'Naučené'} · {detailRule.match_count}× použito</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn" style={{ flex: 1 }} onClick={() => setEditingRule(true)}>{Icons.action.edit} Upravit</button>
                                    <button className="btn" style={{ flex: 1, color: 'var(--neg)' }} onClick={() => { handleDeleteRule(detailRule.id); setDetailRule(null); }}>
                                        {TrashIcon} Smazat
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
