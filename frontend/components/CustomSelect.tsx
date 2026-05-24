'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface Option {
    value: string;
    label: string;
    icon?: string;
}

interface CustomSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    compact?: boolean;
}

export default function CustomSelect({
    options,
    value,
    onChange,
    placeholder = 'Vyberte...',
    searchable = false,
    searchPlaceholder = '🔍 Hledat...',
    disabled = false,
    style,
    compact = false,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 100, left: 100, width: 200 });
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // useSyncExternalStore: server returns false, client returns true — no effect needed
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );

    const updateDropdownPosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) return;
        updateDropdownPosition();
    }, [isOpen, updateDropdownPosition]);

    const selectedOption = options.find(o => o.value === value);
    const filteredOptions = searchable && search
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const close = useCallback(() => { setIsOpen(false); setSearch(''); }, []);

    const handleOpen = () => {
        if (disabled) return;
        if (!isOpen) updateDropdownPosition();
        setIsOpen(prev => !prev);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
        };
        document.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('resize', updateDropdownPosition);
        window.addEventListener('scroll', updateDropdownPosition, true);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('resize', updateDropdownPosition);
            window.removeEventListener('scroll', updateDropdownPosition, true);
        };
    }, [isOpen, close, updateDropdownPosition]);

    useEffect(() => {
        if (isOpen && searchable && searchRef.current) searchRef.current.focus();
    }, [isOpen, searchable]);

    // Clicking the already-selected option deselects it (resets to '')
    const handleSelect = (optValue: string) => {
        onChange(optValue === value ? '' : optValue);
        close();
    };

    const dropdownEl = isOpen ? (
        <div style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 999999,
            background: 'var(--surface-strong)',
            border: '0.5px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
        }}>
            {searchable && (
                <div style={{ padding: '8px', borderBottom: '0.5px solid var(--border)' }}>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        style={{
                            width: '100%', padding: '8px 12px',
                            background: 'var(--surface-sunken)',
                            border: '0.5px solid var(--border)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                            fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                    />
                </div>
            )}
            <div style={{ overflowY: 'auto', maxHeight: searchable ? '224px' : '280px', padding: '4px' }}>
                {filteredOptions.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                        Žádné výsledky
                    </div>
                ) : filteredOptions.map((option) => {
                    const isSelected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
                            style={{
                                width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                                background: isSelected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                                border: 'none', borderRadius: 'var(--radius-sm)',
                                color: isSelected ? 'var(--accent)' : 'var(--text)',
                                fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left',
                                transition: 'background 0.1s ease',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-sunken)'; }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                            {option.icon && <span style={{ fontSize: '1rem', flexShrink: 0 }}>{option.icon}</span>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {option.label}
                            </span>
                            {isSelected && (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                    <path d="M2 7L5.5 10.5L12 3.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <div ref={containerRef} className="custom-select-container" style={{ position: 'relative', ...style }}>
            <button
                ref={buttonRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                style={{
                    width: '100%', padding: compact ? '4px 8px' : '10px 16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '8px',
                    background: 'var(--surface-sunken)',
                    border: `0.5px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: selectedOption ? 'var(--text)' : 'var(--text-3)',
                    fontSize: compact ? '0.875rem' : '0.9rem', cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease-out', outline: 'none',
                    opacity: disabled ? 0.5 : 1,
                    boxShadow: isOpen ? '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)' : 'none',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOption ? (
                        <>{selectedOption.icon && <span style={{ marginRight: '6px' }}>{selectedOption.icon}</span>}{selectedOption.label}</>
                    ) : placeholder}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {mounted && createPortal(dropdownEl, document.body)}
        </div>
    );
}
