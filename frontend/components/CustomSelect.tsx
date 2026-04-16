'use client';

import { useState, useRef, useEffect } from 'react';
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
}

export default function CustomSelect({
    options,
    value,
    onChange,
    placeholder = 'Vyberte...',
    searchable = false,
    searchPlaceholder = '🔍 Hledat...',
    disabled = false,
    style
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(o => o.value === value);

    const filteredOptions = searchable && search
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    // Calculate dropdown position from trigger button
    const updateDropdownPosition = () => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = Math.min(288, filteredOptions.length * 42 + (searchable ? 56 : 0) + 8);

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            // Open upward
            setDropdownStyle({
                position: 'fixed',
                bottom: window.innerHeight - rect.top + 6,
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
            });
        } else {
            // Open downward
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 6,
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
            });
        }
    };

    const handleOpen = () => {
        if (disabled) return;
        updateDropdownPosition();
        setIsOpen(prev => !prev);
    };

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target)
            ) {
                setIsOpen(false);
                setSearch('');
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', () => { setIsOpen(false); }, { passive: true, capture: true });
            window.addEventListener('resize', () => { setIsOpen(false); }, { passive: true });
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Focus search when opened
    useEffect(() => {
        if (isOpen && searchable && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isOpen, searchable]);

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        setIsOpen(false);
        setSearch('');
    };

    const dropdown = isOpen ? (
        <div
            style={{
                ...dropdownStyle,
                background: 'rgba(18, 22, 36, 0.97)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
                maxHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                animation: 'selectDropdownFadeIn 0.15s ease-out',
                overflow: 'hidden',
            }}
        >
            {searchable && (
                <div style={{
                    padding: '8px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    flexShrink: 0,
                }}>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = 'var(--accent-primary)';
                            e.target.style.boxShadow = '0 0 0 2px rgba(0, 122, 255, 0.15)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>
            )}

            <div className="custom-select-dropdown" style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
                {filteredOptions.length === 0 ? (
                    <div style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: 'var(--text-tertiary)',
                        fontSize: '0.85rem',
                    }}>
                        Žádné výsledky
                    </div>
                ) : (
                    filteredOptions.map((option) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); handleSelect(option.value); }}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: isSelected ? 'rgba(0, 122, 255, 0.15)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.1s ease',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                {option.icon && (
                                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{option.icon}</span>
                                )}
                                <span style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1,
                                }}>
                                    {option.label}
                                </span>
                                {isSelected && (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                        <path d="M2 7L5.5 10.5L12 3.5" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={containerRef} style={{ position: 'relative', ...style }}>
            <button
                ref={buttonRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: `1px solid ${isOpen ? 'var(--accent-primary)' : 'var(--glass-border-light)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: '0.9rem',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    transition: 'all 0.15s ease-out',
                    outline: 'none',
                    opacity: disabled ? 0.5 : 1,
                    boxShadow: isOpen ? '0 0 0 3px rgba(0, 122, 255, 0.2)' : 'none',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOption ? (
                        <>
                            {selectedOption.icon && <span style={{ marginRight: '6px' }}>{selectedOption.icon}</span>}
                            {selectedOption.label}
                        </>
                    ) : placeholder}
                </span>
                <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                    <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
        </div>
    );
}
