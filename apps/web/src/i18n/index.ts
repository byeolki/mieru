import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ko } from './ko.js';

void i18n.use(initReactI18next).init({
  lng: 'ko',
  fallbackLng: 'ko',
  resources: { ko: { translation: ko } },
  interpolation: { escapeValue: false },
});

export { i18n };
