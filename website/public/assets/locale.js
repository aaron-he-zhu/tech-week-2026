'use strict';
(() => {
  const en = document.documentElement.lang === 'en';
  const path = (value) => (en ? value : '/zh' + value);
  const errors = /*ERROR_MESSAGES*/ {};
  window.TWLocale = { en, path, text: (value) => (en ? errors[value] || value : value) };
  const initialHash = location.hash;
  for (const link of document.querySelectorAll('[data-language]')) {
    link.addEventListener('click', () => {
      const target = new URL(link.href),
        params = new URLSearchParams(location.search);
      const maps = { format: /*FORMAT_MESSAGES*/ {}, group: /*GROUP_MESSAGES*/ {} };
      for (const [key, labels] of Object.entries(maps)) {
        const value = params.get(key);
        if (!value) continue;
        const mapped =
          link.dataset.language === 'en'
            ? labels[value]
            : Object.entries(labels).find(([, v]) => v === value)?.[0];
        if (mapped) params.set(key, mapped);
      }
      target.search = params.toString();
      target.hash =
        location.hash ||
        (document.getElementById('wish-restore-panel')?.hidden === false ? initialHash : '');
      link.href = target.href;
    });
  }
})();
