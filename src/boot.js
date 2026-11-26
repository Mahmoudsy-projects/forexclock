// runs before first paint: view, theme and zoom are known so the transparent window never flashes the wrong look
(function () {
  const q = new URLSearchParams(location.search), d = document.documentElement;
  const view = q.get('view') === 'compact' ? 'compact' : 'full';
  d.dataset.view = view;
  d.dataset.theme = q.get('theme') === 'light' ? 'light' : 'dark';
  d.style.zoom = String(window.innerWidth / (view === 'compact' ? 380 : 390));
})();
