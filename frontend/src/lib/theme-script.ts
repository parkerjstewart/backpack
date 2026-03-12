// Runs before React hydration to set light mode class
export const themeScript = `
(function() {
  document.documentElement.classList.add('light');
})();
`
