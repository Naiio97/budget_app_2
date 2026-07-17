'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import CustomSelect from '@/components/CustomSelect';
import { apiFetch } from '@/lib/api';
import { getCategoryIcon, categoryIconKey } from '@/lib/category-icons';
import { queryKeys } from '@/lib/queryKeys';
import { Icons } from '@/lib/icons';
import { CATEGORY_PALETTE, ICON_OPTIONS, EditIcon, TrashIcon, CloseIcon, type Category } from './shared';

// ── Category manager ──────────────────────────────────────────
export default function CategoryManager({ onCategoriesChange, showAdd, setShowAdd }: { onCategoriesChange?: () => void; showAdd: boolean; setShowAdd: (v: boolean) => void }) {
    const queryClient = useQueryClient();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCategory, setNewCategory] = useState({ name: '', icon: 'box', color: CATEGORY_PALETTE[0], is_income: false });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState({ name: '', icon: '', color: '', is_income: false });

    const loadCategories = useCallback(async () => {
        try {
            const res = await apiFetch(`/categories/`);
            const data = await res.json();
            setCategories(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const invalidate = () => { queryClient.invalidateQueries({ queryKey: queryKeys.categories }); onCategoriesChange?.(); };

    const handleAdd = async () => {
        if (!newCategory.name.trim()) return;
        await apiFetch(`/categories/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCategory) });
        setNewCategory({ name: '', icon: 'box', color: CATEGORY_PALETTE[0], is_income: false });
        setShowAdd(false);
        loadCategories();
        invalidate();
    };

    const handleUpdate = async (id: number) => {
        await apiFetch(`/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editData) });
        setEditingId(null);
        loadCategories();
        invalidate();
    };

    const handleDelete = async (id: number) => {
        await apiFetch(`/categories/${id}`, { method: 'DELETE' });
        loadCategories();
        invalidate();
    };

    if (loading) return <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Načítám kategorie...</div>;

    const ColorSwatches = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CATEGORY_PALETTE.map(c => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    aria-label={c}
                    style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: c,
                        border: value === c ? '2px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer', padding: 0,
                    }}
                />
            ))}
        </div>
    );

    const activeCategories = categories.filter(c => c.is_active);

    return (
        <div className="settings-category-manager">
            <div className="settings-scroll-list settings-category-list">
                {activeCategories.map(cat => (
                    <div key={cat.id} className="set-cat-row">
                        {editingId === cat.id ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <CustomSelect
                                        value={editData.icon}
                                        onChange={(val) => setEditData({ ...editData, icon: val })}
                                        style={{ width: 150 }}
                                        options={ICON_OPTIONS}
                                    />
                                    <input
                                        className="input"
                                        value={editData.name}
                                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                                <ColorSwatches value={editData.color} onChange={(c) => setEditData({ ...editData, color: c })} />
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(cat.id)}>Uložit</button>
                                    <button className="btn btn-sm" onClick={() => setEditingId(null)}>Zrušit</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="set-cat-accent" style={{ background: cat.color }} />
                                <span className="set-cat-emoji">{getCategoryIcon(cat.icon, 17)}</span>
                                <span className="set-cat-name">{cat.name}</span>
                                <span className={`set-tag ${cat.is_income ? 'income' : ''}`}>{cat.is_income ? 'Příjem' : 'Výdaj'}</span>
                                <div className="set-row-actions">
                                    <button className="set-icon-btn" title="Upravit" onClick={() => { setEditingId(cat.id); setEditData({ name: cat.name, icon: categoryIconKey(cat.icon), color: cat.color, is_income: cat.is_income }); }}>{EditIcon}</button>
                                    <button className="set-icon-btn danger" title="Smazat" onClick={() => handleDelete(cat.id)}>{TrashIcon}</button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {showAdd && (
                <div className="set-modal-overlay" onClick={() => setShowAdd(false)}>
                    <div className="set-modal" onClick={e => e.stopPropagation()}>
                        <div className="set-modal-head">
                            <h3 style={{ margin: 0 }}>Nová kategorie</h3>
                            <button className="set-icon-btn" title="Zavřít" onClick={() => setShowAdd(false)}>{CloseIcon}</button>
                        </div>
                        <div>
                            <label className="set-field-label">Ikona a název</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <CustomSelect
                                    value={newCategory.icon}
                                    onChange={(val) => setNewCategory({ ...newCategory, icon: val })}
                                    style={{ width: 150 }}
                                    options={ICON_OPTIONS}
                                />
                                <input
                                    className="input"
                                    autoFocus
                                    placeholder="Název kategorie"
                                    value={newCategory.name}
                                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && newCategory.name.trim()) handleAdd(); }}
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="set-field-label">Barva</label>
                            <ColorSwatches value={newCategory.color} onChange={(c) => setNewCategory({ ...newCategory, color: c })} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={newCategory.is_income} onChange={(e) => setNewCategory({ ...newCategory, is_income: e.target.checked })} />
                            Je to příjem
                        </label>
                        <button className="btn btn-primary" onClick={handleAdd} disabled={!newCategory.name.trim()}>{Icons.action.add} Přidat kategorii</button>
                    </div>
                </div>
            )}
        </div>
    );
}
