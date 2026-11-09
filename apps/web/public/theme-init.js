// Runs before the app paints so the saved theme never flashes the other one. Kept in sync with
// src/lib/theme.ts (same storage key and values).
(function () {
  var preference = null;
  try {
    preference = localStorage.getItem('mieru.theme');
  } catch {
    // Storage can be blocked (private mode, policies); fall back to the system setting.
    preference = null;
  }
  var isDark =
    preference === 'dark' ||
    (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
})();
