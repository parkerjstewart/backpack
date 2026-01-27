// This script runs before React hydration to prevent theme flash
// Light mode only for now - dark mode temporarily disabled
export const themeScript = `
(function() {
  // Force light mode
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add('light');
  document.documentElement.setAttribute('data-theme', 'light');
})();
`