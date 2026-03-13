'use client';
import { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: React.ReactNode;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
}

export default function CustomSelect({ value, onChange, options, placeholder = "Vyberte...", className = "", style }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`custom-select-container ${className}`} style={style} ref={dropdownRef}>
            <div
                className={`input custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '6px 12px', fontSize: '0.9rem' }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
            </div>

            {isOpen && (
                <div className="custom-select-dropdown animate-fade-in" style={{ animationDuration: '0.15s' }}>
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            className={`custom-select-option ${value === opt.value ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
