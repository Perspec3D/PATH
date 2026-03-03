
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from './translations/pt-BR.json';
import enUS from './translations/en-US.json';
import esES from './translations/es-ES.json';
import frFR from './translations/fr-FR.json';
import deDE from './translations/de-DE.json';
import itIT from './translations/it-IT.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            'pt-BR': { translation: ptBR },
            'en-US': { translation: enUS },
            'es-ES': { translation: esES },
            'fr-FR': { translation: frFR },
            'de-DE': { translation: deDE },
            'it-IT': { translation: itIT },
        },
        fallbackLng: 'pt-BR',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        },
    });

export default i18n;
