
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const languages = [
    { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Español', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italiano', flag: '🇮🇹' },
];

export const LanguageSwitcher: React.FC<{ light?: boolean }> = ({ light = false }) => {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLanguageChange = (code: string) => {
        i18n.changeLanguage(code);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all duration-300 active:scale-95 ${light
                        ? 'bg-white/10 border-white/20 hover:bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 text-slate-700 dark:text-slate-300'
                    }`}
            >
                <span className="text-lg leading-none">{currentLanguage.flag}</span>
                <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{currentLanguage.code.split('-')[0]}</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[200] animate-in fade-in zoom-in duration-200">
                    <div className="p-2 space-y-1">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-colors ${i18n.language === lang.code
                                        ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 font-bold'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                <span className="text-xl leading-none">{lang.flag}</span>
                                <div className="flex flex-col items-start">
                                    <span className="text-xs font-bold leading-tight">{lang.name}</span>
                                    <span className="text-[10px] opacity-60 font-medium tracking-wider uppercase leading-tight">{lang.code}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
